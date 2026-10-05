import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTerminalNode, defaultFluidFor, executeValidateUnitOp, LITERS_PER_GALLON, type ProcessEdge, type ProcessGraph, type ProcessNode, type UnitOpContract } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/**
 * A batch's heat-up, checked against m·cp·ΔT of what is actually in the
 * vessel, and the liquid a feed supplies.
 */

const L = 'CONTINUOUS_VOLUME';

const vessel = (contract: UnitOpContract): ProcessNode =>
  ({
    id: 'r',
    name: 'Reactor',
    kind: 'CUSTOM_UNIT_OP',
    position: { x: 0, y: 0 },
    inputs: [{ id: 'charge', name: 'Charge', type: 'FLUID_INPUT', flowDimension: L }],
    outputs: [{ id: 'out', name: 'Out', type: 'FLUID_OUTPUT', flowDimension: L }],
    config: { contract }
  }) as unknown as ProcessNode;

const tank: ProcessNode = {
  id: 't',
  name: 'Tank',
  kind: 'SURGE_TANK',
  position: { x: 0, y: 0 },
  inputs: [{ id: 'in-0', name: 'in', type: 'FLUID_INPUT', flowDimension: L }],
  outputs: [],
  config: { capacityGallons: 1e6, initialLevelGallons: 0 }
} as unknown as ProcessNode;

const pipe = (from: string, to: string, fromPort: string, toPort: string, fluid?: Record<string, unknown>): ProcessEdge =>
  ({
    id: `${from}->${to}`,
    sourceNodeId: from,
    targetNodeId: to,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 50, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: fluid ?? { name: 'Water', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 } }
  }) as unknown as ProcessEdge;

const line = (nodes: ProcessNode[], edges: ProcessEdge[]): ProcessGraph =>
  ({ id: 'g', name: 'g', version: '1.0.0', metadata: {}, nodes, edges }) as unknown as ProcessGraph;

/** Charge 500 gal, heat to 80 °C on a 150 kW jacket for heatSeconds, drain. */
const reactor = (heatSeconds: string, parameters: UnitOpContract['parameters'] = []): UnitOpContract =>
  ({
    contractVersion: 1,
    id: 'reactor',
    name: 'Reactor',
    description: '',
    ports: [
      { id: 'charge', name: 'Charge', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: false },
      { id: 'out', name: 'Out', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
    ],
    parameters: [{ name: 'volume', label: 'Volume', unit: 'gal', value: 500, min: 1 }, { name: 'jacketKw', label: 'Jacket', unit: 'kW', value: 150, min: 1 }, ...parameters],
    derived: [{ name: 'heatSeconds', label: 'Heat-up', unit: 's', expr: heatSeconds }],
    constraints: [],
    behavior: {
      mode: 'BATCH',
      batchGallons: 'volume',
      phases: [
        { name: 'Charge', kind: 'FILL', rateGpm: '100' },
        { name: 'Heat', kind: 'HOLD', seconds: 'heatSeconds', temperatureC: '80', dutyKw: 'jacketKw' },
        { name: 'Drain', kind: 'DRAIN', rateGpm: '100' }
      ]
    },
    designInlet: { temperatureC: 25, densityGPerCm3: 0.95, specificHeatKjPerKgK: 1.9 },
    provenance: { authoredBy: 'ENGINEER', engineerConfirmed: [] }
  }) as unknown as UnitOpContract;

const massOf = (gal: number, density: number) => gal * LITERS_PER_GALLON * density;

describe('A batch heat-up against m·cp·ΔT', () => {
  it('reads the batch’s own specific heat as batch.cpKjPerKgK, so duty × time is the heat it took', () => {
    const c = reactor('batch.massKg * batch.cpKjPerKgK * (80 - batch.temperatureC) / jacketKw');
    assert.equal(executeValidateUnitOp({ contract: c }).verdict, 'ACCEPTED');
    // Water, 20 °C, in the pipe: the batch is water, whatever the design said.
    const feed = createTerminalNode('feed', { id: 'f' });
    const r = simulateProcess(line([feed, vessel(c), tank], [pipe('f', 'r', 'out', 'charge'), pipe('r', 't', 'out', 'in-0')]), 60);
    const rep = r.nodeReports['r']!;
    const kwhPerBatch = (massOf(500, 1) * 4.186 * 60) / 3600;
    // In 60 min: charge 5 min, then one heat-up of 500 gal of water from 20 to 80 °C (about 53 min).
    assert.equal(rep.designedUnit!.heatBalance, undefined, 'no mismatch to report');
    assert.ok(Math.abs(rep.heat!.energyKwh - kwhPerBatch) < 0.5, `${rep.heat!.energyKwh} kWh vs ${kwhPerBatch.toFixed(1)}`);
  });

  it('flags a heat-up timed with a specific heat of its own that the batch does not have', () => {
    const c = reactor('batch.massKg * cp * (80 - batch.temperatureC) / jacketKw', [{ name: 'cp', label: 'cp', unit: 'kJ/kg-K', value: 1.9, min: 0.1 }]);
    const feed = createTerminalNode('feed', { id: 'f' });
    const r = simulateProcess(line([feed, vessel(c), tank], [pipe('f', 'r', 'out', 'charge'), pipe('r', 't', 'out', 'in-0')]), 120);
    const hb = r.nodeReports['r']!.designedUnit!.heatBalance;
    assert.ok(hb?.length === 1 && hb[0]!.phase === 'Heat', JSON.stringify(hb));
    // Timed for cp 1.9 on water (4.186): the jacket put in 1.9/4.186 of the heat.
    const h = hb![0]!;
    assert.ok(Math.abs(h.deliveredKwh / h.neededKwh - 1.9 / 4.186) < 0.01, JSON.stringify(hb));
  });
});

describe('The liquid a feed supplies', () => {
  it('is what the feed says, over what its pipe says', () => {
    const c = reactor('batch.massKg * batch.cpKjPerKgK * (80 - batch.temperatureC) / jacketKw');
    const feed = createTerminalNode('feed', { id: 'f', temperatureC: 25, densityGPerCm3: 0.95, specificHeatKjPerKgK: 1.9 });
    const r = simulateProcess(line([feed, vessel(c), tank], [pipe('f', 'r', 'out', 'charge'), pipe('r', 't', 'out', 'in-0')]), 60);
    const rep = r.nodeReports['r']!;
    const t = r.terminals.find((x) => x.role === 'feed')!;
    assert.equal(t.temperatureC, 25);
    // One full batch charged: 500 gal at 0.95 kg/L.
    assert.ok(Math.abs(rep.fluid!.receivedKg / rep.fluid!.receivedGallons - LITERS_PER_GALLON * 0.95) < 1e-3);
    // Heat-up from 25 °C with cp 1.9: m·cp·ΔT / Q.
    const seconds = (massOf(500, 0.95) * 1.9 * 55) / 150;
    // Two batches heat in 60 min (charge 5, heat 21, drain 5, then again).
    assert.ok(Math.abs((rep.heat!.heatingTimeSeconds ?? 0) - 2 * seconds) < 4, `${rep.heat!.heatingTimeSeconds} vs 2 × ${seconds}`);
  });

  it('is, for a new pipe from a feed that says nothing, the liquid the unit it feeds was designed for', () => {
    const feed = createTerminalNode('feed', { id: 'f', material: 'Monomer' });
    assert.deepEqual(defaultFluidFor(feed, vessel(reactor('1'))), {
      name: 'Monomer',
      densityGPerCm3: 0.95,
      viscosityCentipoise: 1,
      temperatureCelsius: 25,
      specificHeatKjPerKgK: 1.9
    });
    const own = createTerminalNode('feed', { id: 'g', temperatureC: 60 });
    assert.equal(defaultFluidFor(own, vessel(reactor('1')))?.temperatureCelsius, 60, 'what the feed says wins');
    assert.equal(defaultFluidFor(tank, vessel(reactor('1'))), undefined, 'only pipes from a feed');
  });
});
