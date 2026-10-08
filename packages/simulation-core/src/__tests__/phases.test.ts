import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  addStreamToGraph,
  createTerminalNode,
  DUST_COLLECTOR_CONTRACT,
  SPRAY_DRYER_CONTRACT,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type UnitOpContract
} from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/** Designed units that state their phases report each outlet in the units of its phase. */

const L = 'CONTINUOUS_VOLUME';
const GAL = 3.785411784e-3;

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

const sink = (id: string): ProcessNode =>
  ({ id, name: id, kind: 'SURGE_TANK', position: { x: 0, y: 0 }, inputs: [{ id: 'in-0', name: 'in', type: 'FLUID_INPUT', flowDimension: L }], outputs: [], config: { capacityGallons: 1e9, initialLevelGallons: 0 } }) as unknown as ProcessNode;

const pipe = (from: string, to: string, fromPort: string, toPort: string, densityGPerCm3: number, temperatureCelsius: number, gpm: number): ProcessEdge =>
  ({
    id: `${from}:${fromPort}->${to}:${toPort}`,
    sourceNodeId: from,
    targetNodeId: to,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: gpm, operatingPressurePsi: 15, pipeDiameterInches: 24, fluid: { name: 'Stream', densityGPerCm3, viscosityCentipoise: 0.018, temperatureCelsius } }
  }) as unknown as ProcessEdge;

describe('Phases in the simulation', () => {
  it('a dust collector reports ACFM of clean air and kg/h of powder', () => {
    // 2.245 kg/s of dusty air at 25 °C (0.42 % magnesium stearate), stated to the engine as a volume at the air's density.
    const density = 0.001172;
    const gpm = (2.245 / (density * 1000) / GAL) * 60;
    const feed = createTerminalNode('feed', { id: 'duct', material: 'Extraction air', supplyRate: gpm, composition: { air: 0.9958, lubricant: 0.0042 } });
    let g = {
      id: 'dust',
      name: 'dust',
      version: '1',
      metadata: {},
      nodes: [feed, unit('collector', DUST_COLLECTOR_CONTRACT), sink('stack'), sink('drum')],
      edges: [pipe('collector', 'stack', 'clean_air', 'in-0', density, 25, gpm), pipe('collector', 'drum', 'hopper', 'in-0', 0.5, 25, 1)]
    } as unknown as ProcessGraph;
    g = addStreamToGraph(g, pipe('duct', 'collector', feed.outputs[0]!.id, 'dirty_air', density, 25, gpm));
    const r = simulateProcess(g, 30);
    const streams = r.nodeReports['collector']!.designedUnit!.streams!;
    const clean = streams.find((s) => s.port === 'clean_air')!;
    const hopper = streams.find((s) => s.port === 'hopper')!;
    assert.equal(clean.phase, 'GAS');
    assert.equal(hopper.phase, 'SOLID');
    // 0.0042 x 2.245 kg/s = 33.9 kg/h of dust; 99.95 % to the hopper.
    assert.ok(Math.abs(hopper.kgPerHour - 33.9) < 0.5, `hopper ${hopper.kgPerHour} kg/h`);
    assert.ok(Math.abs(clean.actualCubicFeetPerMinute! - 4040) < 60, `clean air ${clean.actualCubicFeetPerMinute} ACFM`);
    assert.ok(clean.dispersedKgPerHour!.lubricant! < 0.05, 'a trace of dust leaves with the air');
    assert.equal(clean.molarMass, 29);
  });

  it('a spray dryer sends powder as a solid and its exhaust as a humid gas', () => {
    // Liquid feed and process air arrive as one stream, by component (the engine mixes what arrives).
    const density = 0.0012;
    const gpm = (0.4814 / (density * 1000) / GAL) * 60;
    const feed = createTerminalNode('feed', { id: 'in', material: 'Feed and air', supplyRate: gpm, composition: { water: 0.0421, solids: 0.02308, air: 0.93482 } });
    let g = {
      id: 'dryer',
      name: 'dryer',
      version: '1',
      metadata: {},
      nodes: [feed, unit('dryer', SPRAY_DRYER_CONTRACT), sink('bin'), sink('stack')],
      edges: [pipe('dryer', 'bin', 'powder', 'in-0', 0.6, 90, 1), pipe('dryer', 'stack', 'exhaust', 'in-0', density, 90, gpm)]
    } as unknown as ProcessGraph;
    g = addStreamToGraph(g, pipe('in', 'dryer', feed.outputs[0]!.id, 'feed', density, 25, gpm));
    const r = simulateProcess(g, 30);
    const d = r.nodeReports['dryer']!.designedUnit!;
    assert.deepEqual(d.brokenConstraints.filter((c) => c.severity === 'ERROR'), []);
    const powder = d.streams!.find((s) => s.port === 'powder')!;
    const exhaust = d.streams!.find((s) => s.port === 'exhaust')!;
    assert.equal(powder.phase, 'SOLID');
    assert.ok(Math.abs(powder.kgPerHour - 41.7) < 1, `powder ${powder.kgPerHour} kg/h`);
    assert.ok(powder.dispersedKgPerHour!.water! > 0, 'its residual moisture is reported apart');
    assert.equal(exhaust.phase, 'GAS');
    assert.ok(exhaust.molarMass! < 28.96, 'water vapour lightens the exhaust');
    assert.equal(exhaust.temperatureC, 90);
    assert.ok(exhaust.actualCubicFeetPerMinute! > exhaust.standardCubicFeetPerMinute!, 'hot gas takes more room than at standard conditions');
  });
});
