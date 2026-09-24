import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { ProcessEdge, ProcessGraph, ProcessNode } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

type Dim = 'CONTINUOUS_VOLUME' | 'DISCRETE_CONTAINER';

const node = (
  id: string,
  kind: ProcessNode['kind'],
  config: Record<string, unknown>,
  inputs: Dim[] = [],
  outputs: Dim[] = []
): ProcessNode =>
  ({
    id,
    name: id,
    kind,
    position: { x: 0, y: 0 },
    inputs: inputs.map((d, i) => ({ id: `in-${i}`, name: `in ${i}`, type: d === 'DISCRETE_CONTAINER' ? 'CONTAINER_INPUT' : 'FLUID_INPUT', flowDimension: d })),
    outputs: outputs.map((d, i) => ({ id: `out-${i}`, name: `out ${i}`, type: d === 'DISCRETE_CONTAINER' ? 'CONTAINER_OUTPUT' : 'FLUID_OUTPUT', flowDimension: d })),
    config
  }) as unknown as ProcessNode;

const pipe = (from: string, to: string, fromPort = 'out-0', toPort = 'in-0'): ProcessEdge =>
  ({
    id: `${from}->${to}:${fromPort}`,
    sourceNodeId: from,
    targetNodeId: to,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 50, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: { name: 'Product', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 } }
  }) as unknown as ProcessEdge;

const line = (id: string, nodes: ProcessNode[], edges: ProcessEdge[]): ProcessGraph =>
  ({ id, name: id, version: '1.0.0', metadata: {}, nodes, edges }) as unknown as ProcessGraph;

/** Filler: 10 one-gallon nozzles on a 12 s cycle wants 50 gal/min. */
const filler = (id = 'filler', nozzles = 10, cycleSeconds = 12) =>
  node(id, 'ROTARY_FILLER', {
    nozzleCount: nozzles,
    fillTimePerCycleSeconds: cycleSeconds - 2,
    indexTimePerCycleSeconds: 2,
    rejectRatePercentage: 0,
    containerVolumeGallons: 1
  }, ['CONTINUOUS_VOLUME'], ['DISCRETE_CONTAINER']);

describe('Liquid: tanks drain and fill', () => {
  it('a tank drains into a filler, and the filler starves once it is empty', () => {
    const g = line('drain', [
      node('tank', 'SURGE_TANK', { capacityGallons: 800, initialLevelGallons: 400, maxDischargeRateGpm: 45 }, ['CONTINUOUS_VOLUME'], ['CONTINUOUS_VOLUME']),
      filler()
    ], [pipe('tank', 'filler')]);
    const r = simulateProcess(g, 30);
    const made = r.nodeReports['filler']!.unitsProduced;
    // 400 gallons make at most 400 one-gallon cans, in whole 10-can cycles.
    assert.ok(made <= 400 && made >= 380, `filler made ${made}`);
    assert.ok(r.nodeReports['tank']!.fluid!.levelGallons < 10, 'tank ends empty');
    assert.ok(r.nodeReports['filler']!.starvedTimeSeconds > 15 * 60, 'filler waits for product once the tank is empty');
    assert.equal(r.totalUnitsPackaged, made);
  });

  it('a tank level stays within its capacity and the full tank backs up what feeds it', () => {
    const g = line('backup', [
      node('reactor', 'BATCH_REACTOR', { batchVolumeGallons: 100, fillDurationMinutes: 1, reactionDurationMinutes: 1, dischargeRateGpm: 100 }, [], ['CONTINUOUS_VOLUME']),
      node('tank', 'SURGE_TANK', { capacityGallons: 150, initialLevelGallons: 0 }, ['CONTINUOUS_VOLUME'], [])
    ], [pipe('reactor', 'tank')]);
    const r = simulateProcess(g, 20);
    assert.ok(r.nodeReports['tank']!.fluid!.levelGallons <= 150 + 1e-6);
    assert.ok(r.nodeReports['reactor']!.blockedTimeSeconds > 0, 'the reactor cannot discharge into a full tank');
  });
});

describe('Liquid: batch reactors', () => {
  it('fills, reacts and discharges in batches', () => {
    // 1 min fill + 2 min react + 2 min discharge (100 gal at 50 gpm) = 5 min a batch.
    const g = line('batches', [
      node('reactor', 'BATCH_REACTOR', { batchVolumeGallons: 100, fillDurationMinutes: 1, reactionDurationMinutes: 2, dischargeRateGpm: 50 }, [], ['CONTINUOUS_VOLUME']),
      node('tank', 'SURGE_TANK', { capacityGallons: 5000, initialLevelGallons: 0 }, ['CONTINUOUS_VOLUME'], [])
    ], [pipe('reactor', 'tank')]);
    const r = simulateProcess(g, 30);
    const batches = r.nodeReports['reactor']!.fluid!.batches!;
    assert.ok(batches >= 5 && batches <= 6, `batches ${batches}`);
    const inTank = r.nodeReports['tank']!.fluid!.levelGallons;
    assert.ok(Math.abs(inTank - batches * 100) < 100, `tank holds ${inTank} gal after ${batches} batches`);
    const phases = new Set(r.telemetryLog.filter((t) => t.nodeId === 'reactor').map((t) => t.phase));
    assert.ok(phases.has('REACTING') && phases.has('DISCHARGING'), 'telemetry records the batch phase');
  });

  it('a reactor-fed line is limited by the reactor, not the filler', () => {
    // 800 gal every (20 + 45 + 16) min is under 10 gal/min; the filler wants 50.
    const g = line('reactor-limited', [
      node('reactor', 'BATCH_REACTOR', { batchVolumeGallons: 800, fillDurationMinutes: 20, reactionDurationMinutes: 45, dischargeRateGpm: 50 }, [], ['CONTINUOUS_VOLUME']),
      node('tank', 'SURGE_TANK', { capacityGallons: 1000, initialLevelGallons: 0, maxDischargeRateGpm: 60 }, ['CONTINUOUS_VOLUME'], ['CONTINUOUS_VOLUME']),
      filler()
    ], [pipe('reactor', 'tank'), pipe('tank', 'filler')]);
    const r = simulateProcess(g, 240);
    const perMin = r.totalUnitsPackaged / 240;
    assert.ok(perMin < 12, `line made ${perMin}/min; the reactor allows under 10 gal/min`);
    assert.ok(r.nodeReports['filler']!.starvedTimeSeconds > r.nodeReports['filler']!.busyTimeSeconds);
  });
});

describe('Liquid: pumps and splits', () => {
  it('a pump caps the flow to its design rate', () => {
    const g = line('pump-cap', [
      node('tank', 'SURGE_TANK', { capacityGallons: 10000, initialLevelGallons: 10000 }, ['CONTINUOUS_VOLUME'], ['CONTINUOUS_VOLUME']),
      node('pump', 'PUMP', { designFlowRateGpm: 20 }, ['CONTINUOUS_VOLUME'], ['CONTINUOUS_VOLUME']),
      filler('filler', 1, 3) // wants 20 gal/min at 1 gal / 3 s... and up to 60 with a faster cycle
    ], [pipe('tank', 'pump'), pipe('pump', 'filler')]);
    g.nodes[2]!.config = { ...(g.nodes[2]!.config as object), fillTimePerCycleSeconds: 0.5, indexTimePerCycleSeconds: 0.5 } as ProcessNode['config'];
    const r = simulateProcess(g, 10);
    const made = r.nodeReports['filler']!.unitsProduced;
    assert.ok(made <= 205 && made >= 180, `pump at 20 gpm let the filler make ${made} in 10 min`);
  });

  it('a separator splits by its vapor ratio', () => {
    const g = line('split', [
      node('tank', 'SURGE_TANK', { capacityGallons: 1000, initialLevelGallons: 1000, maxDischargeRateGpm: 100 }, ['CONTINUOUS_VOLUME'], ['CONTINUOUS_VOLUME']),
      node('sep', 'SEPARATOR', { vaporSplitRatio: 0.25 }, ['CONTINUOUS_VOLUME'], ['CONTINUOUS_VOLUME', 'CONTINUOUS_VOLUME']),
      node('vapor', 'SURGE_TANK', { capacityGallons: 5000, initialLevelGallons: 0 }, ['CONTINUOUS_VOLUME'], []),
      node('liquid', 'SURGE_TANK', { capacityGallons: 5000, initialLevelGallons: 0 }, ['CONTINUOUS_VOLUME'], [])
    ], [pipe('tank', 'sep'), pipe('sep', 'vapor', 'out-0'), pipe('sep', 'liquid', 'out-1')]);
    const r = simulateProcess(g, 20);
    const v = r.nodeReports['vapor']!.fluid!.levelGallons;
    const l = r.nodeReports['liquid']!.fluid!.levelGallons;
    assert.ok(Math.abs(v + l - 1000) < 1, `all 1000 gal arrive (${v + l})`);
    assert.ok(Math.abs(v / (v + l) - 0.25) < 0.01, `vapor share ${v / (v + l)}`);
  });
});

describe('Liquid: invariants', () => {
  const plant = () =>
    line('plant', [
      node('reactor', 'BATCH_REACTOR', { batchVolumeGallons: 300, fillDurationMinutes: 5, reactionDurationMinutes: 10, dischargeRateGpm: 60 }, [], ['CONTINUOUS_VOLUME']),
      node('tank', 'SURGE_TANK', { capacityGallons: 400, initialLevelGallons: 100, maxDischargeRateGpm: 40 }, ['CONTINUOUS_VOLUME'], ['CONTINUOUS_VOLUME']),
      node('pump', 'PUMP', { designFlowRateGpm: 35 }, ['CONTINUOUS_VOLUME'], ['CONTINUOUS_VOLUME']),
      filler()
    ], [pipe('reactor', 'tank'), pipe('tank', 'pump'), pipe('pump', 'filler')]);

  it('every second of every liquid unit is in a state', () => {
    const r = simulateProcess(plant(), 60);
    for (const id of ['reactor', 'tank', 'pump', 'filler']) {
      const n = r.nodeReports[id]!;
      assert.equal(n.busyTimeSeconds + n.blockedTimeSeconds + n.starvedTimeSeconds + n.downTimeSeconds, n.totalTimeSeconds, id);
    }
  });

  it('conserves liquid: what the reactor sent is in the tank, went through the pump, or was canned', () => {
    const r = simulateProcess(plant(), 60);
    const sent = r.nodeReports['reactor']!.fluid!.deliveredGallons;
    const tank = r.nodeReports['tank']!.fluid!;
    const pump = r.nodeReports['pump']!.fluid!;
    assert.ok(Math.abs(100 + sent - tank.deliveredGallons - tank.levelGallons) < 0.5, 'tank balance');
    assert.ok(Math.abs(tank.deliveredGallons - pump.deliveredGallons - pump.levelGallons) < 0.5, 'pump balance');
    const cans = r.nodeReports['filler']!.unitsProduced;
    assert.ok(cans <= pump.deliveredGallons + 1e-6, `${cans} one-gallon cans from ${pump.deliveredGallons} gal`);
  });

  it('is deterministic', () => {
    const a = simulateProcess(plant(), 60, { seed: 7 });
    const b = simulateProcess(plant(), 60, { seed: 7 });
    assert.deepEqual(a.nodeReports, b.nodeReports);
  });

  it('a designed cycle unit fed only a liquid pipe starts on its own', () => {
    const g = line('printer', [
      node('spool', 'SURGE_TANK', { capacityGallons: 10, initialLevelGallons: 10 }, [], ['CONTINUOUS_VOLUME']),
      node('printer', 'CUSTOM_UNIT_OP', {
        contract: {
          id: 'printer',
          name: 'Printer',
          version: '1.0.0',
          description: '',
          ports: [
            { id: 'in-0', name: 'plastic', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
            { id: 'out-0', name: 'part', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true }
          ],
          parameters: [{ name: 'cycleMin', label: 'Cycle', unit: 'min', value: 5 }],
          derived: [],
          constraints: [],
          behavior: { mode: 'DISCRETE_CYCLE', cycleSeconds: 'cycleMin * 60', unitsPerCycle: '1' }
        }
      }, ['CONTINUOUS_VOLUME'], ['DISCRETE_CONTAINER'])
    ], [pipe('spool', 'printer')]);
    const r = simulateProcess(g, 30);
    assert.ok(r.nodeReports['printer']!.unitsProduced >= 5, `printer made ${r.nodeReports['printer']!.unitsProduced}`);
  });
});
