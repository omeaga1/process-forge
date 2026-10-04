import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  createDefaultProcessNode,
  effectiveContract,
  STANDARD_KINDS,
  validateUnitOpContract,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type UnitOpContract
} from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';
import { describeUnit } from '../describe.js';

/**
 * The engine runs contracts and nothing else: the built-in kinds through the
 * contracts standardKinds.ts builds for them, and the capabilities that came
 * with that (breakdowns on any unit, cycle-time variation, per-item rejects,
 * storage as a contract mode).
 */

const L = 'CONTINUOUS_VOLUME';

const node = (id: string, kind: ProcessNode['kind'], config: Record<string, unknown>, inputs: string[] = [L], outputs: string[] = [L]): ProcessNode =>
  ({
    id,
    name: id,
    kind,
    position: { x: 0, y: 0 },
    inputs: inputs.map((d, i) => ({ id: `in-${i}`, name: `in ${i}`, type: d === L ? 'FLUID_INPUT' : 'DISCRETE_INPUT', flowDimension: d })),
    outputs: outputs.map((d, i) => ({ id: `out-${i}`, name: `out ${i}`, type: d === L ? 'FLUID_OUTPUT' : 'DISCRETE_OUTPUT', flowDimension: d })),
    config
  }) as unknown as ProcessNode;

const pipe = (from: string, to: string): ProcessEdge =>
  ({
    id: `${from}->${to}`,
    sourceNodeId: from,
    targetNodeId: to,
    sourcePortId: 'out-0',
    targetPortId: 'in-0',
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 50, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: { name: 'Water', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 } }
  }) as unknown as ProcessEdge;

const line = (id: string, nodes: ProcessNode[], edges: ProcessEdge[] = []): ProcessGraph =>
  ({ id, name: id, version: '1.0.0', metadata: {}, nodes, edges }) as unknown as ProcessGraph;

const printer = (extra: Partial<UnitOpContract> = {}, behavior: Record<string, unknown> = {}): UnitOpContract =>
  ({
    contractVersion: 1,
    id: 'printer',
    name: 'Printer',
    description: '',
    ports: [{ id: 'out', name: 'Parts', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true }],
    parameters: [
      { name: 'cycle', label: 'Cycle', unit: 's', value: 10, min: 1 },
      { name: 'rejectPct', label: 'Rejects', unit: '%', value: 10, min: 0, max: 100 }
    ],
    derived: [],
    constraints: [],
    behavior: { mode: 'DISCRETE_CYCLE', cycleSeconds: 'cycle', unitsPerCycle: '1', ...behavior },
    provenance: { authoredBy: 'ENGINEER', engineerConfirmed: [] },
    ...extra
  }) as UnitOpContract;

describe('Every built-in kind is a contract', () => {
  it('builds a valid, unit-consistent contract for each kind from its default config', () => {
    for (const kind of STANDARD_KINDS) {
      const n = createDefaultProcessNode(kind);
      const c = effectiveContract(n);
      assert.ok(c, `${kind} has a contract`);
      assert.deepEqual(validateUnitOpContract(c!), [], kind);
    }
  });

  it('names its parameters after the config keys, so the config and the contract agree', () => {
    const pump = createDefaultProcessNode('PUMP', { configOverrides: { designFlowRateGpm: 37 } });
    const c = effectiveContract(pump)!;
    assert.equal(c.parameters.find((p) => p.name === 'designFlowRateGpm')?.value, 37);
  });

  it('a node that carries its own contract runs that one', () => {
    const own = printer();
    assert.equal(effectiveContract(node('p', 'ROTARY_FILLER', { contract: own }))!.id, 'printer');
  });
});

describe('Breakdowns on any unit', () => {
  const pumpLine = (reliability: Record<string, number>) =>
    line('pump-down', [
      node('tank', 'SURGE_TANK', { capacityGallons: 1e6, initialLevelGallons: 1e6, maxDischargeRateGpm: 100 }),
      node('pump', 'PUMP', { designFlowRateGpm: 40, ...reliability }),
      node('out', 'SURGE_TANK', { capacityGallons: 1e7, initialLevelGallons: 0 }, [L], [])
    ], [pipe('tank', 'pump'), pipe('pump', 'out')]);

  it('a pump that breaks down passes nothing while it is down', () => {
    const steady = simulateProcess(pumpLine({}), 600, { seed: 7 });
    const flaky = simulateProcess(pumpLine({ meanTimeBetweenFailuresMinutes: 60, meanTimeToRepairMinutes: 20 }), 600, { seed: 7 });
    const sent = (r: typeof steady) => r.nodeReports['out']!.fluid!.receivedGallons;
    assert.ok(Math.abs(sent(steady) - 40 * 600) < 50, `steady ${sent(steady)}`);
    const down = flaky.nodeReports['pump']!.downTimeSeconds;
    assert.ok(down > 0, 'it was down');
    // What it lost is what it would have pumped while down.
    assert.ok(Math.abs(sent(steady) - sent(flaky) - (40 * down) / 60) < 100, `lost ${sent(steady) - sent(flaky)} vs ${(40 * down) / 60}`);
  });
});

describe('Variation', () => {
  it('cycle times vary around cycleSeconds, reproducibly', () => {
    const varied = line('cv', [node('p', 'CUSTOM_UNIT_OP', { contract: printer({ variability: { cycleTimeCv: '0.5' } }) }, [], [])]);
    const a = simulateProcess(varied, 600, { seed: 3 });
    const b = simulateProcess(varied, 600, { seed: 3 });
    const c = simulateProcess(varied, 600, { seed: 4 });
    const made = (r: typeof a) => r.nodeReports['p']!.unitsProduced;
    assert.equal(made(a), made(b), 'same seed, same run');
    assert.notEqual(made(a), made(c), 'another seed, other draws');
    // Mean cycle 10 s: about 3,600 in 600 min.
    assert.ok(Math.abs(made(a) - 3600) < 200, `made ${made(a)}`);
  });

  it('per-item rejects are drawn at random around their rate', () => {
    const g = line('rejects', [node('p', 'CUSTOM_UNIT_OP', { contract: printer({}, { scrapFraction: 'rejectPct / 100', scrapRandom: true }) }, [], [])]);
    const r = simulateProcess(g, 600, { seed: 11 }).nodeReports['p']!;
    const share = r.unitsScrapped / (r.unitsProduced + r.unitsScrapped);
    assert.ok(Math.abs(share - 0.1) < 0.02, `reject share ${share}`);
    // A fixed fraction of a one-item cycle rounds down to none.
    const fixed = simulateProcess(line('fixed', [node('p', 'CUSTOM_UNIT_OP', { contract: printer({}, { scrapFraction: 'rejectPct / 100' }) }, [], [])]), 60).nodeReports['p']!;
    assert.equal(fixed.unitsScrapped, 0);
  });
});

describe('Storage as a contract', () => {
  it('a designed tank fills, holds and backs up like the built-in one', () => {
    const tank: UnitOpContract = {
      contractVersion: 1,
      id: 'day-tank',
      name: 'Day tank',
      description: '',
      ports: [
        { id: 'in-0', name: 'In', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
        { id: 'out-0', name: 'Out', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
      ],
      parameters: [
        { name: 'volumeM3', label: 'Volume', unit: 'm3', value: 2, min: 0.1 },
        { name: 'outGpm', label: 'Outflow', unit: 'gal/min', value: 10, min: 0 }
      ],
      derived: [{ name: 'volumeGal', label: 'Volume', unit: 'gal', expr: 'volumeM3 * 264.172' }],
      constraints: [],
      behavior: { mode: 'STORAGE', capacityGallons: 'volumeGal', maxOutflowGpm: 'outGpm' },
      provenance: { authoredBy: 'ENGINEER', engineerConfirmed: [] }
    };
    assert.deepEqual(validateUnitOpContract(tank), []);
    const g = line('storage', [
      node('feed', 'SURGE_TANK', { capacityGallons: 1e6, initialLevelGallons: 1e6, maxDischargeRateGpm: 30 }),
      node('day', 'CUSTOM_UNIT_OP', { contract: tank }),
      node('out', 'SURGE_TANK', { capacityGallons: 1e7, initialLevelGallons: 0 }, [L], [])
    ], [pipe('feed', 'day'), pipe('day', 'out')]);
    const r = simulateProcess(g, 120);
    // In at 30, out at 10: it fills 20 gal/min until its 528 gal are full, then holds the feed back.
    assert.ok(Math.abs(r.nodeReports['day']!.fluid!.levelGallons - 528.3) < 1, `level ${r.nodeReports['day']!.fluid!.levelGallons}`);
    assert.ok(Math.abs(r.nodeReports['out']!.fluid!.receivedGallons - 1200) < 15);
    assert.equal(describeUnit(g.nodes[1]!, g).headline, 'Holds up to 528 gal, starting at 0 gal.');
  });
});
