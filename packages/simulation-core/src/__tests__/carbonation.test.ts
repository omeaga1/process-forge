import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { addStreamToGraph, createTerminalNode, type ProcessEdge, type ProcessGraph, type ProcessNode, type UnitOpContract } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/**
 * A gas that dissolves into a liquid (a carbonator): the gas takes none of the
 * unit's liquid rating, and what dissolves leaves in the liquid, as liquid.
 */

const L = 'CONTINUOUS_VOLUME';

const CARBONATOR: UnitOpContract = {
  contractVersion: 1,
  id: 'carbonator-test',
  name: 'Carbonator',
  description: 'CO2 dissolves into chilled beverage; what does not dissolve vents.',
  ports: [
    { id: 'beverage', name: 'Beverage', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID', carries: ['water', 'sugar'] },
    { id: 'co2', name: 'CO2', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'GAS', carries: ['co2'] },
    { id: 'carbonated', name: 'Carbonated', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID' },
    { id: 'vent', name: 'Vent', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: false, phase: 'GAS' }
  ],
  components: ['water', 'sugar', 'co2'],
  phaseChanges: [{ component: 'co2', from: 'GAS', to: 'LIQUID', mechanism: 'DISSOLUTION' }],
  parameters: [
    { name: 'targetVolumes', label: 'Target', unit: '-', value: 3.8, min: 1, max: 5 },
    { name: 'maxGpm', label: 'Rated flow', unit: 'gal/min', value: 40, min: 1, max: 500 }
  ],
  derived: [
    { name: 'neededKgPerS', label: 'CO2 needed', unit: 'kg/s', expr: 'port.beverage.volumetricFlowGpm * 3.78541 / 60 * targetVolumes * 1.977 / 1000' },
    { name: 'dissolvedShare', label: 'Dissolved', unit: '-', expr: 'if(port.co2.massFlowKgPerS > 0, min(neededKgPerS / port.co2.massFlowKgPerS, 1), 0)' }
  ],
  constraints: [],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'port.beverage.volumetricFlowGpm', capacityGpm: 'maxGpm' },
  designPorts: {
    beverage: { temperatureC: 4, volumetricFlowGpm: 22.5, massFlowKgPerS: 1.483, densityGPerCm3: 1.045, composition: { water: 0.885, sugar: 0.115 } },
    co2: { temperatureC: 10, massFlowKgPerS: 0.0125, composition: { co2: 1 } }
  },
  outlets: [
    { port: 'carbonated', recovery: { water: '1', sugar: '1', co2: 'dissolvedShare' } },
    { port: 'vent', recovery: { water: '0', sugar: '0', co2: '1 - dissolvedShare' } }
  ],
  provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] }
};

const unit = (id: string, contract: UnitOpContract): ProcessNode =>
  ({
    id,
    name: id,
    kind: 'CUSTOM_UNIT_OP',
    position: { x: 0, y: 0 },
    inputs: contract.ports.filter((p) => p.direction === 'INLET').map((p) => ({ id: p.id, name: p.name, type: 'FLUID_INPUT', flowDimension: L })),
    outputs: contract.ports.filter((p) => p.direction === 'OUTLET').map((p) => ({ id: p.id, name: p.name, type: 'FLUID_OUTPUT', flowDimension: L })),
    config: { contract }
  }) as unknown as ProcessNode;

const tank = (id: string): ProcessNode =>
  ({ id, name: id, kind: 'SURGE_TANK', position: { x: 0, y: 0 }, inputs: [{ id: 'in-0', name: 'in', type: 'FLUID_INPUT', flowDimension: L }], outputs: [], config: { capacityGallons: 1e6, initialLevelGallons: 0 } }) as unknown as ProcessNode;

const pipe = (from: string, to: string, fromPort: string, toPort: string, densityGPerCm3: number): ProcessEdge =>
  ({
    id: `${from}:${fromPort}->${to}:${toPort}`,
    sourceNodeId: from,
    targetNodeId: to,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 45, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: { name: 'Stream', densityGPerCm3, viscosityCentipoise: 1, temperatureCelsius: 4 } }
  }) as unknown as ProcessEdge;

describe('A carbonator', () => {
  // 45 kg/h of CO2 is about 100 gal/min of gas, more than the 40 gal/min the carbonator is rated for.
  const beverage = createTerminalNode('feed', { id: 'blend', material: 'Blend', supplyRate: 22.5, temperatureC: 4, densityGPerCm3: 1.045, specificHeatKjPerKgK: 3.9, composition: { water: 0.885, sugar: 0.115 } });
  const co2 = createTerminalNode('feed', { id: 'co2', material: 'CO2', phase: 'GAS', temperatureC: 10, supplyKgPerHour: 45, composition: { co2: 1 } });
  let g = {
    id: 'carb',
    name: 'carb',
    version: '1',
    metadata: {},
    nodes: [beverage, co2, unit('carbonator', CARBONATOR), tank('buffer'), tank('stack')],
    edges: [pipe('carbonator', 'buffer', 'carbonated', 'in-0', 1.045), pipe('carbonator', 'stack', 'vent', 'in-0', 0.002)]
  } as unknown as ProcessGraph;
  g = addStreamToGraph(g, pipe('blend', 'carbonator', beverage.outputs[0]!.id, 'beverage', 1.045));
  g = addStreamToGraph(g, pipe('co2', 'carbonator', co2.outputs[0]!.id, 'co2', 0.002));
  const r = simulateProcess(g, 30);

  it('passes all the beverage: the CO2 gas does not use up its liquid rating', () => {
    const received = r.nodeReports['carbonator']!.fluid!.receivedGallons;
    assert.ok(Math.abs(received - 22.5 * 30) < 5, `${received} gal of beverage in 30 min`);
  });

  it('sends the dissolved CO2 on in the liquid, as liquid volume', () => {
    const buffer = r.nodeReports['buffer']!.fluid!;
    // 3.8 volumes into 22.5 gal/min is 38.4 kg/h of the 45 fed; the rest vents.
    assert.ok(Math.abs(buffer.composition!.co2! - 0.0071) < 0.0005, JSON.stringify(buffer.composition));
    assert.ok(Math.abs(buffer.levelGallons - 22.5 * 30) < 10, `the tank holds ${buffer.levelGallons} gal: liquid, not gas volume`);
    assert.equal(buffer.receivedGasKg, undefined, 'no gas reaches the tank');
    const vented = r.nodeReports['stack']!.fluid!.receivedKg;
    assert.ok(Math.abs(vented - (45 - 38.4) / 2) < 0.5, `${vented} kg vented in 30 min`);
  });
});
