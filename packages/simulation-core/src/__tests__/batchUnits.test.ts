import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  CRYSTALLISER_CONTRACT,
  executeValidateUnitOp,
  validateProcessGraph,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type UnitOpContract
} from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/** Designed BATCH units: phases in order, each worked out from the batch as it starts. */

const L = 'CONTINUOUS_VOLUME';

const node = (id: string, kind: ProcessNode['kind'], config: Record<string, unknown>, inputs: string[] = [], outputs: string[] = [], ids?: { in?: string[]; out?: string[] }): ProcessNode =>
  ({
    id,
    name: id,
    kind,
    position: { x: 0, y: 0 },
    inputs: inputs.map((d, i) => ({ id: ids?.in?.[i] ?? `in-${i}`, name: `in ${i}`, type: 'FLUID_INPUT', flowDimension: d })),
    outputs: outputs.map((d, i) => ({ id: ids?.out?.[i] ?? `out-${i}`, name: `out ${i}`, type: 'FLUID_OUTPUT', flowDimension: d })),
    config
  }) as unknown as ProcessNode;

const pipe = (from: string, to: string, fromPort = 'out-0', toPort = 'in-0', t = 20): ProcessEdge =>
  ({
    id: `${from}:${fromPort}->${to}`,
    sourceNodeId: from,
    targetNodeId: to,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 200, operatingPressurePsi: 30, pipeDiameterInches: 3, fluid: { name: 'Brine', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: t, specificHeatKjPerKgK: 4.186 } }
  }) as unknown as ProcessEdge;

const line = (nodes: ProcessNode[], edges: ProcessEdge[]): ProcessGraph =>
  ({ id: 'batch', name: 'batch', version: '1.0.0', metadata: {}, nodes, edges }) as unknown as ProcessGraph;

const batchUnit = (phases: unknown[], extra: Partial<UnitOpContract> = {}, outlets = ['product']): UnitOpContract =>
  ({
    contractVersion: 1,
    id: 'vessel',
    name: 'Batch vessel',
    description: '',
    ports: [
      { id: 'feed', name: 'Feed', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: false },
      ...outlets.map((id) => ({ id, name: id, direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }))
    ],
    parameters: [{ name: 'volume', label: 'Volume', unit: 'gal', value: 500, min: 1 }],
    derived: [],
    constraints: [],
    behavior: { mode: 'BATCH', batchGallons: 'volume', phases },
    provenance: { authoredBy: 'ENGINEER', engineerConfirmed: [] },
    ...extra
  }) as unknown as UnitOpContract;

const sink = (id: string) => node(id, 'SURGE_TANK', { capacityGallons: 1e6, initialLevelGallons: 0 }, [L], []);

describe('Designed batch units: phases', () => {
  const simple = batchUnit([
    { name: 'Charge', kind: 'FILL', rateGpm: '100' },
    { name: 'Hold', kind: 'HOLD', seconds: '600' },
    { name: 'Empty', kind: 'DRAIN', rateGpm: '100' }
  ]);

  it('runs fill, hold and drain in order: 5 + 10 + 5 minutes a batch', () => {
    assert.equal(executeValidateUnitOp({ contract: simple }).verdict, 'ACCEPTED');
    const g = line(
      [node('vessel', 'CUSTOM_UNIT_OP', { contract: simple }, [L], [L], { in: ['feed'], out: ['product'] }), sink('out')],
      [pipe('vessel', 'out', 'product')]
    );
    const r = simulateProcess(g, 60);
    const v = r.nodeReports['vessel']!;
    assert.equal(v.fluid!.batches, 3);
    assert.ok(Math.abs(r.nodeReports['out']!.fluid!.receivedGallons - 1500) < 2);
    const by = v.designedUnit!.secondsByPhase!;
    assert.ok(Math.abs(by['Charge']! - 900) <= 3 && Math.abs(by['Hold']! - 1800) <= 3 && Math.abs(by['Empty']! - 900) <= 3, JSON.stringify(by));
    const names = new Set(r.telemetryLog.filter((t) => t.nodeId === 'vessel').map((t) => t.phaseName));
    assert.ok(names.has('Hold'), 'telemetry names the phase');
    assert.equal(r.nodeReports['vessel']!.unitsProduced, 3, 'a batch is a unit made');
  });

  it('waits for a slow feed while filling', () => {
    // The feed tank sends 25 gal/min, so a 500 gal charge takes 20 min, not 5.
    const g = line(
      [
        node('feed', 'SURGE_TANK', { capacityGallons: 1e5, initialLevelGallons: 1e5, maxDischargeRateGpm: 25 }, [L], [L]),
        node('vessel', 'CUSTOM_UNIT_OP', { contract: simple }, [L], [L], { in: ['feed'], out: ['product'] }),
        sink('out')
      ],
      [pipe('feed', 'vessel', 'out-0', 'feed'), pipe('vessel', 'out', 'product')]
    );
    // 20 + 10 + 5 = 35 min a batch: one done in the hour, the second charging for the last 20 minutes.
    const v = simulateProcess(g, 60).nodeReports['vessel']!;
    assert.equal(v.fluid!.batches, 1);
    assert.ok(Math.abs(v.designedUnit!.secondsByPhase!['Charge']! - 2 * 20 * 60) < 90, JSON.stringify(v.designedUnit!.secondsByPhase));
  });
});

describe('Designed batch units: each phase follows the batch in hand', () => {
  it('heat-up time comes from this batch\'s mass and charge temperature', () => {
    // 500 gal of 20 °C brine to 80 °C on 200 kW: m cp dT / Q.
    const heater = batchUnit(
      [
        { name: 'Charge', kind: 'FILL' },
        { name: 'Heat', kind: 'HOLD', seconds: 'batch.massKg * 4.186 * (80 - batch.temperatureC) / 200', temperatureC: '80', dutyKw: '200' },
        { name: 'Empty', kind: 'DRAIN' }
      ],
      { designInlet: { temperatureC: 20, densityGPerCm3: 1 } }
    );
    assert.equal(executeValidateUnitOp({ contract: heater }).verdict, 'ACCEPTED');
    const g = line(
      [
        node('feed', 'SURGE_TANK', { capacityGallons: 1e5, initialLevelGallons: 1e5, maxDischargeRateGpm: 200, fluid: { name: 'Brine', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 } }, [L], [L]),
        node('vessel', 'CUSTOM_UNIT_OP', { contract: heater }, [L], [L], { in: ['feed'], out: ['product'] }),
        sink('out')
      ],
      [pipe('feed', 'vessel', 'out-0', 'feed'), pipe('vessel', 'out', 'product')]
    );
    // Charge 2.5 min at 200 gpm, heat, drain 2.5 min at the pipe's 200 gpm:
    // two whole batches in 90 minutes, the third still charging.
    const heatS = (500 * 3.785411784 * 4.186 * 60) / 200;
    const r = simulateProcess(g, 90);
    const v = r.nodeReports['vessel']!;
    assert.equal(v.fluid!.batches, 2);
    const heated = v.designedUnit!.secondsByPhase!['Heat']!;
    assert.ok(Math.abs(heated - 2 * heatS) < 4, `heated ${heated} s, expected ${2 * heatS}`);
    assert.ok(Math.abs(r.nodeReports['out']!.fluid!.temperatureC - 80) < 0.01, 'it leaves at 80 °C');
    assert.ok(Math.abs(v.heat!.energyKwh - (200 * v.designedUnit!.secondsByPhase!['Heat']!) / 3600) < 1);
  });

  it('drains to the port each phase names: 65% as liquor, the rest as slurry', () => {
    assert.equal(executeValidateUnitOp({ contract: CRYSTALLISER_CONTRACT }).verdict, 'ACCEPTED');
    const g = line(
      [
        node('feed', 'SURGE_TANK', { capacityGallons: 1e5, initialLevelGallons: 1e5, maxDischargeRateGpm: 200 }, [L], [L]),
        node('cryst', 'CUSTOM_UNIT_OP', { contract: CRYSTALLISER_CONTRACT }, [L], [L, L], { in: ['feed'], out: ['liquor', 'slurry'] }),
        sink('liquor'),
        sink('slurry')
      ],
      [pipe('feed', 'cryst', 'out-0', 'feed', 25), pipe('cryst', 'liquor', 'liquor'), pipe('cryst', 'slurry', 'slurry')]
    );
    const r = simulateProcess(g, 8 * 60);
    const liquor = r.nodeReports['liquor']!.fluid!.receivedGallons;
    const slurry = r.nodeReports['slurry']!.fluid!.receivedGallons;
    assert.ok(r.nodeReports['cryst']!.fluid!.batches! >= 2);
    assert.ok(Math.abs(liquor / (liquor + slurry) - 0.65) < 0.02, `liquor share ${liquor / (liquor + slurry)}`);
    assert.ok(Math.abs(r.nodeReports['slurry']!.fluid!.temperatureC - 15) < 0.1, 'drops at the final temperature');
  });
});

describe('Designed batch units: validation and the static analysis', () => {
  it('refuses a HOLD with no time, a batch with no drain, a volume that reads the batch, and a port on a fill', () => {
    const v = (phases: unknown[], batchGallons = 'volume') =>
      executeValidateUnitOp({ contract: { ...batchUnit(phases), behavior: { mode: 'BATCH', batchGallons, phases } } as UnitOpContract }).verdict;
    const fill = { name: 'F', kind: 'FILL' };
    const drain = { name: 'D', kind: 'DRAIN' };
    assert.equal(v([fill, { name: 'H', kind: 'HOLD' }, drain]), 'REJECTED');
    assert.equal(v([fill]), 'REJECTED');
    assert.equal(v([fill, drain], 'batch.gallons'), 'REJECTED');
    assert.equal(v([{ ...fill, port: 'product' }, drain]), 'REJECTED');
    assert.equal(v([fill, drain]), 'ACCEPTED');
  });

  it('a batch unit feeding a filler is counted in its containers', () => {
    const contract = batchUnit([
      { name: 'Charge', kind: 'FILL', rateGpm: '100' },
      { name: 'Hold', kind: 'HOLD', seconds: '600' },
      { name: 'Empty', kind: 'DRAIN', rateGpm: '100' }
    ]);
    const filler = node('filler', 'ROTARY_FILLER', { nozzleCount: 10, fillTimePerCycleSeconds: 4, indexTimePerCycleSeconds: 2, containerVolumeGallons: 1 }, [L], ['DISCRETE_CONTAINER']);
    const g = line([node('vessel', 'CUSTOM_UNIT_OP', { contract }, [L], [L], { in: ['feed'], out: ['product'] }), filler], [pipe('vessel', 'filler', 'product')]);
    const b = validateProcessGraph(g).bottlenecks;
    // 500 gal every 20 min is 25 one-gallon containers a minute, below the filler's 100.
    assert.equal(b.bottleneckNodeId, 'vessel');
    assert.ok(Math.abs(b.maximumSystemThroughputUnitsPerMin - 25) < 1e-6);
  });
});
