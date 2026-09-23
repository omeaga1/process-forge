/**
 * Proves the engine can simulate a unit operation that did not exist when the
 * engine was compiled.
 *
 * Before contracts, the engine dispatched on `switch (node.kind)` over four
 * hardcoded machine types. An engineer who described a new unit op could get a
 * drawing out of it but never a simulation. These tests exercise the generic
 * path: a node whose entire behavior arrives as data.
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { ProcessGraph, UnitOpContract } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

type Node = ProcessGraph['nodes'][number];

const discreteOut = (id: string, name: string) => ({
  id, name, type: 'DISCRETE_OUTPUT' as const, flowDimension: 'DISCRETE_CONTAINER' as const
});
const discreteIn = (id: string, name: string) => ({
  id, name, type: 'DISCRETE_INPUT' as const, flowDimension: 'DISCRETE_CONTAINER' as const
});
const edge = (id: string, s: string, sp: string, t: string, tp: string) => ({
  id, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp,
  stream: {
    type: 'DISCRETE_CONTAINER_STREAM' as const,
    targetPiecesPerMinute: 60,
    containerVolumeGallons: 1.0,
    containerType: 'CAN_1_GAL' as const
  }
});

/**
 * A unit operation the engine has no knowledge of: a UV curing tunnel. Nothing
 * in simulation-core mentions curing, lamps, or belts. Its whole behavior is
 * the contract below.
 */
function curingTunnelContract(overrides: Partial<Record<string, number>> = {}): UnitOpContract {
  const p = (name: string, value: number, unit: string, min?: number, max?: number) => ({
    name, label: name, unit, value: overrides[name] ?? value,
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {})
  });
  return {
    contractVersion: 1,
    id: 'uv-curing-tunnel-v1',
    name: 'UV Curing Tunnel',
    description: 'Parts travel a belt under UV lamps; throughput is set by belt speed and lamp pitch.',
    ports: [
      { id: 'in', name: 'Uncured parts', direction: 'INLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true },
      { id: 'out', name: 'Cured parts', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true }
    ],
    parameters: [
      p('tunnelLengthM', 4, 'm', 0.5, 20),
      p('beltSpeedMPerMin', 2, 'm/min', 0.1, 30),
      p('partPitchM', 0.25, 'm', 0.05, 2),
      p('requiredDoseSeconds', 45, 's', 1, 600),
      p('rejectFraction', 0.02, '-', 0, 1)
    ],
    derived: [
      { name: 'dwellSeconds', label: 'Dwell under lamps', unit: 's', expr: 'tunnelLengthM / (beltSpeedMPerMin / 60)' },
      { name: 'partsPerCycle', label: 'Parts per index', unit: '-', expr: 'max(floor(tunnelLengthM / partPitchM), 1)' },
      { name: 'indexSeconds', label: 'Index time', unit: 's', expr: 'partPitchM / (beltSpeedMPerMin / 60)' }
    ],
    constraints: [
      {
        id: 'dose-met',
        expr: 'dwellSeconds >= requiredDoseSeconds',
        severity: 'ERROR',
        message: 'Belt is too fast: parts leave the tunnel before receiving the required UV dose.',
        hint: 'Slow the belt or lengthen the tunnel.'
      }
    ],
    behavior: {
      mode: 'DISCRETE_CYCLE',
      cycleSeconds: 'indexSeconds',
      unitsPerCycle: '1',
      scrapFraction: 'rejectFraction'
    },
    provenance: { authoredBy: 'SUB_AGENT', modelId: 'test-fixture', engineerConfirmed: ['requiredDoseSeconds'] }
  };
}

/** Contract-defined source -> contract-defined sink. No built-in machine kinds at all. */
function buildContractLine(sourceOverrides = {}, sinkOverrides = {}): ProcessGraph {
  const source = curingTunnelContract(sourceOverrides);
  const sink = { ...curingTunnelContract(sinkOverrides), id: 'uv-curing-tunnel-v1-b', name: 'Second Tunnel' };
  return {
    id: 'contract-line',
    name: 'Contract-only line',
    version: '1.0.0',
    metadata: {},
    nodes: [
      {
        id: 'tunnel-1', name: 'UV Tunnel 1', kind: 'CUSTOM_UNIT_OP',
        position: { x: 0, y: 0 }, inputs: [], outputs: [discreteOut('out', 'Cured')],
        config: { contract: source, bufferCapacity: 200 }
      },
      {
        id: 'tunnel-2', name: 'UV Tunnel 2', kind: 'CUSTOM_UNIT_OP',
        position: { x: 1, y: 0 }, inputs: [discreteIn('in', 'Uncured')], outputs: [],
        config: { contract: sink, bufferCapacity: 200 }
      }
    ] as unknown as Node[],
    edges: [edge('e1', 'tunnel-1', 'out', 'tunnel-2', 'in')]
  } as ProcessGraph;
}

describe('Engine executes a contract-defined unit operation', () => {
  it('simulates a unit op kind the engine has no hardcoded handler for', () => {
    const result = simulateProcess(buildContractLine(), 30);

    const t1 = result.nodeReports['tunnel-1'];
    assert.ok(t1, 'tunnel-1 report missing');
    assert.ok(
      t1.unitsProduced > 0,
      'A contract-defined source produced nothing; the generic handler did not run'
    );
  });

  it('honours the cycle time the contract declares', () => {
    // 0.25 m pitch at 2 m/min = 0.125 m/s -> 7.5 s per index -> 8 units/min.
    // Over 30 min that is ~240 cycles, minus the 2% deterministic scrap
    // (floor(1 * 0.02) == 0 per cycle, so scrap is zero at one unit per cycle).
    const result = simulateProcess(buildContractLine(), 30);
    const t1 = result.nodeReports['tunnel-1']!;
    const expectedCycles = Math.floor((30 * 60) / 7.5);
    assert.ok(
      Math.abs(t1.unitsProduced - expectedCycles) <= 2,
      `Expected ~${expectedCycles} units from a 7.5 s cycle, got ${t1.unitsProduced}`
    );
  });

  it('refuses to start when the contract is not physically valid', () => {
    // 4 m tunnel at 20 m/min gives 12 s dwell against a 45 s required dose.
    // The engine must reject this rather than silently simulating nonsense.
    assert.throws(
      () => simulateProcess(buildContractLine({ beltSpeedMPerMin: 20 }), 30),
      /not physically valid[\s\S]*required UV dose/,
      'An incoherent contract should stop the run at construction time'
    );
  });

  it('propagates backpressure from a contract-defined node', () => {
    // Fast upstream, slow downstream, small buffer: upstream must block.
    const graph = buildContractLine({}, { beltSpeedMPerMin: 0.5, requiredDoseSeconds: 10 });
    (graph.nodes[1]!.config as Record<string, unknown>).bufferCapacity = 5;

    const result = simulateProcess(graph, 30);
    const t1 = result.nodeReports['tunnel-1']!;
    assert.ok(
      t1.blockedTimeSeconds > 0,
      'A contract-defined node must be able to block, or it can never be identified as a bottleneck'
    );
  });

  it('is deterministic across repeated runs', () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 25; i++) {
      outcomes.add(JSON.stringify(simulateProcess(buildContractLine(), 30).nodeReports));
    }
    assert.equal(
      outcomes.size,
      1,
      'Contract-defined nodes must not reintroduce the nondeterminism the hardcoded handlers have'
    );
  });
});

describe('Contract nodes under backpressure', () => {
  const tunnel = (id: string, contract: UnitOpContract, opts: { source?: boolean; sink?: boolean; buffer: number }) => ({
    id, name: id, kind: 'CUSTOM_UNIT_OP', position: { x: 0, y: 0 },
    inputs: opts.source ? [] : [discreteIn('in', 'In')],
    outputs: opts.sink ? [] : [discreteOut('out', 'Out')],
    config: { contract, bufferCapacity: opts.buffer }
  });

  it('a slow contract node does not leave its feeder blocked for the rest of the run', () => {
    // Was: the contract handler consumed input without telling upstream, so a
    // feeder that blocked once stayed blocked -- here after about 15 seconds.
    const graph = {
      id: 'backpressure', name: 'bp', version: '1.0.0', metadata: {},
      nodes: [
        tunnel('fast', { ...curingTunnelContract({ beltSpeedMPerMin: 5 }), id: 'fast' }, { source: true, buffer: 200 }),
        tunnel('slow', { ...curingTunnelContract({ beltSpeedMPerMin: 1 }), id: 'slow' }, { sink: true, buffer: 5 })
      ] as unknown as Node[],
      edges: [edge('e1', 'fast', 'out', 'slow', 'in')]
    } as ProcessGraph;

    const r = simulateProcess(graph, 30).nodeReports;
    // The slow tunnel indexes every 15 s: ~120 parts in 30 minutes. The feeder
    // must keep pace with it, not stop at the first five.
    assert.ok(r.slow!.unitsProduced > 100, `slow tunnel produced ${r.slow!.unitsProduced}`);
    assert.ok(r.fast!.unitsProduced >= r.slow!.unitsProduced, `feeder produced ${r.fast!.unitsProduced}`);
  });

  it('never processes the same unit twice (conservation through a blocked node)', () => {
    // The old handler put output that could not leave back into the INPUT
    // queue, so a later cycle would process -- and scrap -- it again. It never
    // showed, because a blocked contract node was "resumed" with no event
    // scheduled and never ran again: one bug hid the other. Fixing the resume
    // alone would have exposed the double count; this pins that it cannot.
    const batching = (id: string, belt: number, reject: number): UnitOpContract => ({
      ...curingTunnelContract({ beltSpeedMPerMin: belt, rejectFraction: reject }),
      id,
      behavior: { mode: 'DISCRETE_CYCLE', cycleSeconds: 'indexSeconds', unitsPerCycle: 'partsPerCycle', scrapFraction: 'rejectFraction' }
    });
    const graph = {
      id: 'conservation', name: 'c', version: '1.0.0', metadata: {},
      nodes: [
        tunnel('src', batching('src', 5, 0), { source: true, buffer: 200 }),
        tunnel('mid', batching('mid', 5, 0.5), { buffer: 64 }),
        tunnel('end', { ...curingTunnelContract({ beltSpeedMPerMin: 1 }), id: 'end' }, { sink: true, buffer: 4 })
      ] as unknown as Node[],
      edges: [edge('e1', 'src', 'out', 'mid', 'in'), edge('e2', 'mid', 'out', 'end', 'in')]
    } as ProcessGraph;

    const r = simulateProcess(graph, 30).nodeReports;
    const received = r.src!.unitsProduced;
    const accounted = r.mid!.unitsProduced + r.mid!.unitsScrapped;
    assert.ok(accounted <= received, `mid accounted for ${accounted} units but only received ${received}`);
  });
});
