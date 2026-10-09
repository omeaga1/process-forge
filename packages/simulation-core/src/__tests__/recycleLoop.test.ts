import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  addStreamToGraph,
  createStandardUnitOp,
  findStandardUnitOp,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/**
 * A recycle loop: a pasteuriser whose heater outlet comes back through the
 * regenerator that preheats its own feed (cold side -> heater -> hot side).
 * The loop once locked at zero flow (the backward pass read the heater's room
 * before working it out) and, freed, lost the hot side (what reached the
 * regenerator after it had stepped was wiped). Hand calculations:
 *   blend 2,000 kg/h water (4.18) at 15 °C + 1,000 kg/h 65 Brix (2.66) at 25 °C
 *     -> 3,000 kg/h at 17.41 °C, cp 3.673, 21.67 % sugar, C = 3.061 kW/K;
 *   regenerator UA = 20 x 0.8 x 0.85 = 13.6 kW/K, NTU 4.44, balanced: ε = 0.816
 *     -> cold 17.41 -> 76.65 °C, hot 90 -> 30.76 °C, 181.3 kW;
 *   heater 76.65 -> 90 °C: 40.9 kW.
 */
const near = (got: number, want: number, tol: number, what: string) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got} vs ${want}`);

const place = (unit: string, id: string, options: Parameters<typeof createStandardUnitOp>[1] = {}): ProcessNode => {
  const item = findStandardUnitOp(unit);
  assert.ok(item, `catalog has "${unit}"`);
  return { ...createStandardUnitOp(item, options), id, name: id };
};

const pipe = (from: ProcessNode, to: ProcessNode, fromPort = from.outputs[0]!.id, toPort = to.inputs[0]!.id): ProcessEdge =>
  ({
    id: `${from.id}:${fromPort}->${to.id}:${toPort}`,
    sourceNodeId: from.id,
    targetNodeId: to.id,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 40, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: { name: 'Syrup', densityGPerCm3: 1.09, viscosityCentipoise: 2, temperatureCelsius: 20 } }
  }) as unknown as ProcessEdge;

const withFluid = (n: ProcessNode, fluid: Record<string, number>): ProcessNode => ({ ...n, config: { ...(n.config as object), ...fluid } }) as ProcessNode;

describe('a recycle loop (regenerative pasteuriser)', () => {
  const water = withFluid(place('feed', 'water', { supplyKgPerHour: 2000, composition: { water: 1 } }), { temperatureC: 15, densityGPerCm3: 1, specificHeatKjPerKgK: 4.18 });
  const syrup = withFluid(place('feed', 'syrup', { supplyKgPerHour: 1000, composition: { water: 0.35, sugar: 0.65 } }), { temperatureC: 25, densityGPerCm3: 1.32, specificHeatKjPerKgK: 2.66 });
  const mixer = place('mixer', 'mixer', { parameters: { ratedFlowGpm: 40 } });
  const pump = place('pump', 'pump', { parameters: { designFlowRateGpm: 20 } });
  const regen = place('two-stream-exchanger', 'regen', { parameters: { areaM2: 20, uKwPerM2K: 0.8, foulingFactor: 0.85, coldMaxC: 85 } });
  const heater = place('heater', 'heater', { parameters: { targetC: 90, ratedKw: 150, ratedFlowGpm: 40 } });
  const out = place('product', 'out');
  const edges = [
    pipe(water, mixer, undefined, 'a'),
    pipe(syrup, mixer, undefined, 'b'),
    pipe(mixer, pump),
    pipe(pump, regen, undefined, 'cold_in'),
    pipe(regen, heater, 'cold_out'),
    pipe(heater, regen, undefined, 'hot_in'),
    pipe(regen, out, 'hot_out')
  ];
  const graph = edges.reduce((g, e) => addStreamToGraph(g, e), {
    id: 'pasteuriser',
    name: 'pasteuriser',
    version: '1.0.0',
    metadata: {},
    nodes: [water, syrup, mixer, pump, regen, heater, out],
    edges: []
  } as unknown as ProcessGraph);

  it('flows, keeps every kg, and lands on the hand calculations', () => {
    const r = simulateProcess(graph, 60);
    const product = r.terminals.find((t) => t.nodeId === 'out')!;
    // All of it arrives, but for the second's worth still in the loop.
    near(product.kg, 3000, 1, 'product kg in an hour');
    near(product.componentsKg!.sugar!, 650, 0.5, 'sugar kg');
    near(product.temperatureC!, 30.76, 0.15, 'product °C (regenerator hot out)');
    const streams = r.nodeReports.regen!.designedUnit!.streams!;
    near(streams.find((s) => s.port === 'cold_out')!.temperatureC!, 76.65, 0.15, 'regenerator cold out °C');
    near(r.nodeReports.regen!.heat!.averageDutyKw!, 181.3, 0.5, 'regenerator kW');
    near(r.nodeReports.heater!.heat!.averageDutyKw!, 40.9, 0.3, 'heater kW');
    near(r.nodeReports.heater!.fluid!.averageOutletTemperatureC!, 90, 0.01, 'heater outlet °C');
  });
});
