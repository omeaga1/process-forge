import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { CASE_PACKER_CONTRACT, executeValidateUnitOp, validateProcessGraph, type ProcessEdge, type ProcessGraph, type ProcessNode, type UnitOpContract } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/** Designed cycle units that take and make different numbers of items, on different ports. */

type Port = { id: string; dir: 'INLET' | 'OUTLET' };

function contract(id: string, ports: Port[], behavior: Record<string, unknown>): UnitOpContract {
  return {
    contractVersion: 1,
    id,
    name: id,
    description: '',
    ports: ports.map((p) => ({ id: p.id, name: p.id, direction: p.dir, role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true })),
    parameters: [],
    derived: [],
    constraints: [],
    behavior: { mode: 'DISCRETE_CYCLE', ...behavior },
    provenance: { authoredBy: 'ENGINEER', engineerConfirmed: [] }
  } as unknown as UnitOpContract;
}

function unit(id: string, c: UnitOpContract, config: Record<string, unknown> = {}): ProcessNode {
  const port = (p: UnitOpContract['ports'][number]) => ({
    id: p.id,
    name: p.name,
    type: p.direction === 'INLET' ? 'CONTAINER_INPUT' : 'CONTAINER_OUTPUT',
    flowDimension: 'DISCRETE_CONTAINER'
  });
  return {
    id,
    name: id,
    kind: 'CUSTOM_UNIT_OP',
    position: { x: 0, y: 0 },
    inputs: c.ports.filter((p) => p.direction === 'INLET').map(port),
    outputs: c.ports.filter((p) => p.direction === 'OUTLET').map(port),
    config: { contract: c, ...config }
  } as unknown as ProcessNode;
}

const link = (from: string, fromPort: string, to: string, toPort: string): ProcessEdge =>
  ({
    id: `${from}:${fromPort}->${to}:${toPort}`,
    sourceNodeId: from,
    sourcePortId: fromPort,
    targetNodeId: to,
    targetPortId: toPort,
    stream: { type: 'DISCRETE_CONTAINER_STREAM', targetPiecesPerMinute: 60, containerVolumeGallons: 1, containerType: 'BOTTLE_1_LITER' }
  }) as unknown as ProcessEdge;

const line = (nodes: ProcessNode[], edges: ProcessEdge[]): ProcessGraph =>
  ({ id: 'assembly', name: 'assembly', version: '1.0.0', metadata: {}, nodes, edges }) as unknown as ProcessGraph;

/** A source that makes one item every `seconds`. */
const source = (id: string, seconds: number) =>
  unit(id, contract(id, [{ id: 'out', dir: 'OUTLET' }], { cycleSeconds: String(seconds), unitsPerCycle: '1' }));

describe('Designed units: N in, M out', () => {
  const packer = contract('packer', [{ id: 'bottles', dir: 'INLET' }, { id: 'cases', dir: 'OUTLET' }], {
    cycleSeconds: '6',
    unitsPerCycle: '1',
    inputs: [{ port: 'bottles', perCycle: '12' }],
    outputs: [{ port: 'cases', perCycle: '1' }]
  });

  it('a case packer is accepted, and turns 12 bottles into one case', () => {
    assert.equal(executeValidateUnitOp({ contract: packer }).verdict, 'ACCEPTED');
    // 60 bottles a minute is 5 cases a minute, though the packer could do 10.
    const r = simulateProcess(line([source('bottler', 1), unit('packer', packer)], [link('bottler', 'out', 'packer', 'bottles')]), 10);
    const cases = r.nodeReports['packer']!.unitsProduced;
    const bottles = r.nodeReports['bottler']!.unitsProduced;
    assert.ok(cases >= 48 && cases <= 50, `cases ${cases}`);
    assert.ok(bottles - cases * 12 >= 0 && bottles - cases * 12 < 12 + 1, `bottles ${bottles} for ${cases} cases`);
    assert.equal(r.totalUnitsPackaged, cases, 'cases, not bottles, leave the line');
  });

  it('the static analysis counts in cases: 60 bottles a minute is 5 cases, so the bottler limits the line', () => {
    const g = line([source('bottler', 1), unit('packer', packer)], [link('bottler', 'out', 'packer', 'bottles')]);
    const b = validateProcessGraph(g).bottlenecks;
    assert.equal(b.bottleneckNodeId, 'bottler');
    assert.ok(Math.abs(b.maximumSystemThroughputUnitsPerMin - 5) < 1e-9, `${b.maximumSystemThroughputUnitsPerMin}`);
    // A faster bottler moves the limit to the packer, at its 10 cases a minute.
    const fast = validateProcessGraph(line([source('bottler', 0.25), unit('packer', packer)], [link('bottler', 'out', 'packer', 'bottles')])).bottlenecks;
    assert.equal(fast.bottleneckNodeId, 'packer');
    assert.ok(Math.abs(fast.maximumSystemThroughputUnitsPerMin - 10) < 1e-9);
  });

  it('waits for a whole kit even when its queue is smaller than the kit', () => {
    const r = simulateProcess(
      line([source('bottler', 1), unit('packer', packer, { bufferCapacity: 5 })], [link('bottler', 'out', 'packer', 'bottles')]),
      10
    );
    assert.ok(r.nodeReports['packer']!.unitsProduced >= 48, 'no deadlock');
  });
});

describe('Designed units: assembly from several parts', () => {
  const capper = contract('capper', [{ id: 'bottle', dir: 'INLET' }, { id: 'cap', dir: 'INLET' }, { id: 'capped', dir: 'OUTLET' }], {
    cycleSeconds: '1',
    unitsPerCycle: '1',
    inputs: [
      { port: 'bottle', perCycle: '1' },
      { port: 'cap', perCycle: '1' }
    ],
    outputs: [{ port: 'capped', perCycle: '1' }]
  });

  it('needs one of each: the scarcer part sets the pace, and the other backs up', () => {
    // Bottles every 2 s, caps every 1 s: 30 capped bottles a minute.
    const r = simulateProcess(
      line(
        [source('bottles', 2), source('caps', 1), unit('capper', capper, { bufferCapacity: 20 })],
        [link('bottles', 'out', 'capper', 'bottle'), link('caps', 'out', 'capper', 'cap')]
      ),
      10
    );
    const capped = r.nodeReports['capper']!.unitsProduced;
    assert.ok(capped >= 295 && capped <= 300, `capped ${capped}`);
    assert.ok(r.nodeReports['caps']!.blockedTimeSeconds > 200, 'caps back up once the cap queue is full');
    assert.ok(r.nodeReports['capper']!.starvedTimeSeconds > 200, 'the capper waits for bottles');
  });
});

describe('Designed units: outputs by port', () => {
  const inspector = contract('inspector', [{ id: 'in', dir: 'INLET' }, { id: 'good', dir: 'OUTLET' }, { id: 'reject', dir: 'OUTLET' }], {
    cycleSeconds: '10',
    unitsPerCycle: '10',
    inputs: [{ port: 'in', perCycle: '10' }],
    outputs: [
      { port: 'good', perCycle: '9' },
      { port: 'reject', perCycle: '1', scrap: true }
    ]
  });

  it('sends good items and rejects to their own ports, and counts rejects against quality', () => {
    const sink = (id: string) => unit(id, contract(id, [{ id: 'in', dir: 'INLET' }], { cycleSeconds: '0.1', unitsPerCycle: '1' }));
    const r = simulateProcess(
      line(
        [source('maker', 1), unit('inspector', inspector), sink('packing'), sink('waste')],
        [link('maker', 'out', 'inspector', 'in'), link('inspector', 'good', 'packing', 'in'), link('inspector', 'reject', 'waste', 'in')]
      ),
      10
    );
    const rep = r.nodeReports['inspector']!;
    assert.ok(rep.unitsProduced >= 520 && rep.unitsProduced <= 540, `good ${rep.unitsProduced}`);
    assert.equal(rep.unitsScrapped * 9, rep.unitsProduced, 'one reject for every nine good');
    assert.ok(Math.abs(rep.qualityPercentage - 90) < 0.5, `quality ${rep.qualityPercentage}`);
    // Every reject reaches the waste port (the last may still be in its queue when the run ends).
    assert.ok(rep.unitsScrapped - r.nodeReports['waste']!.unitsProduced <= 1);
  });

  it('refuses outputs that do not add up to unitsPerCycle, wrong ports, and scrapFraction alongside outputs', () => {
    const verdict = (b: Record<string, unknown>) =>
      executeValidateUnitOp({ contract: contract('x', [{ id: 'in', dir: 'INLET' }, { id: 'out', dir: 'OUTLET' }], { cycleSeconds: '1', unitsPerCycle: '2', ...b }) }).verdict;
    assert.equal(verdict({ outputs: [{ port: 'out', perCycle: '3' }] }), 'REJECTED');
    assert.equal(verdict({ outputs: [{ port: 'in', perCycle: '2' }] }), 'REJECTED');
    assert.equal(verdict({ inputs: [{ port: 'out', perCycle: '1' }] }), 'REJECTED');
    assert.equal(verdict({ outputs: [{ port: 'out', perCycle: '2' }], scrapFraction: '0.1' }), 'REJECTED');
    assert.equal(verdict({ inputs: [{ port: 'in', perCycle: '1.5' }] }), 'REJECTED', 'items are whole');
    assert.equal(verdict({ inputs: [{ port: 'in', perCycle: '4' }], outputs: [{ port: 'out', perCycle: '2' }] }), 'ACCEPTED');
  });
});

describe('The case packer example', () => {
  it('is accepted, packs 12 bottles and a blank per case, and rejects exactly 1 in 50', () => {
    assert.equal(executeValidateUnitOp({ contract: CASE_PACKER_CONTRACT }).verdict, 'ACCEPTED');
    const r = simulateProcess(
      line(
        [source('bottler', 0.1), source('blanker', 0.5), unit('packer', CASE_PACKER_CONTRACT)],
        [link('bottler', 'out', 'packer', 'bottles'), link('blanker', 'out', 'packer', 'blanks')]
      ),
      60
    );
    const p = r.nodeReports['packer']!;
    // 3 s a case (12 bottles x 0.25 s), in runs of 50: 49 good and 1 reject every 150 s.
    assert.ok(p.unitsProduced >= 49 * 23 && p.unitsProduced <= 49 * 24, `good ${p.unitsProduced}`);
    assert.equal(p.unitsScrapped * 49, p.unitsProduced);
  });
});
