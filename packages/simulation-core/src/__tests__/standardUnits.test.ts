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

/** The designed standard units, placed from the catalog the palette and the MCP server use, in real runs. */

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
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 100, operatingPressurePsi: 30, pipeDiameterInches: 3, fluid: { name: 'Liquor', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 } }
  }) as unknown as ProcessEdge;

const build = (nodes: ProcessNode[], edges: ProcessEdge[]): ProcessGraph =>
  edges.reduce((g, e) => addStreamToGraph(g, e), { id: 'standard', name: 'standard', version: '1.0.0', metadata: {}, nodes, edges: [] } as unknown as ProcessGraph);

describe('Standard designed units in a run', () => {
  it('a CSTR converts reactant to product by k·τ/(1 + k·τ) at the live flow', () => {
    const feed = place('feed', 'feed', { supplyRate: 50, composition: { reactant: 0.2, solvent: 0.8 } });
    const cstr = place('cstr', 'cstr');
    const out = place('product', 'out');
    const r = simulateProcess(build([feed, cstr, out], [pipe(feed, cstr), pipe(cstr, out)]), 30);
    const kg = r.terminals.find((t) => t.nodeId === 'out')!.componentsKg!;
    const x = kg.product! / (kg.product! + kg.reactant!);
    // 1000 gal at 50 gal/min: τ = 20 min, k = 0.5/min, X = 10/11.
    assert.ok(Math.abs(x - 10 / 11) < 0.01, `conversion ${x}`);
  });

  it('more volume converts more: a CSTR tuned from the catalog', () => {
    const feed = place('feed', 'feed', { supplyRate: 50, composition: { reactant: 0.2, solvent: 0.8 } });
    const cstr = place('cstr', 'cstr', { parameters: { volumeGallons: 4000 } });
    const out = place('product', 'out');
    const kg = simulateProcess(build([feed, cstr, out], [pipe(feed, cstr), pipe(cstr, out)]), 30).terminals.find((t) => t.nodeId === 'out')!.componentsKg!;
    const x = kg.product! / (kg.product! + kg.reactant!);
    assert.ok(Math.abs(x - 40 / 41) < 0.01, `conversion ${x}`);
  });

  it('a mixer blends two feeds by flow', () => {
    const water = place('feed', 'water', { supplyRate: 30, composition: { water: 1 } });
    const brine = place('feed', 'brine', { supplyRate: 10, composition: { water: 0.8, salt: 0.2 } });
    const mixer = place('mixer', 'mixer');
    const out = place('product', 'out');
    const g = build([water, brine, mixer, out], [pipe(water, mixer, undefined, 'a'), pipe(brine, mixer, undefined, 'b'), pipe(mixer, out)]);
    const t = simulateProcess(g, 30).terminals.find((x) => x.nodeId === 'out')!;
    const salt = t.componentsKg!.salt! / (t.componentsKg!.salt! + t.componentsKg!.water!);
    assert.ok(Math.abs(salt - 0.05) < 0.002, `salt ${salt}`);
    assert.ok(Math.abs(t.gallons - 40 * 30) / (40 * 30) < 0.02, `blend ${t.gallons} gal`);
  });

  it('a splitter sends its set share to outlet A', () => {
    const feed = place('feed', 'feed', { supplyRate: 40 });
    const split = place('splitter', 'split', { parameters: { fractionToA: 0.25 } });
    const a = place('product', 'a');
    const b = place('waste', 'b');
    const g = build([feed, split, a, b], [pipe(feed, split), pipe(split, a, 'a'), pipe(split, b, 'b')]);
    const r = simulateProcess(g, 30);
    const ga = r.terminals.find((t) => t.nodeId === 'a')!.gallons;
    const gb = r.terminals.find((t) => t.nodeId === 'b')!.gallons;
    assert.ok(Math.abs(ga / (ga + gb) - 0.25) < 0.005, `share to A ${ga / (ga + gb)}`);
  });

  it('a heater brings the stream to its target within its duty', () => {
    const feed = place('feed', 'feed', { supplyRate: 20 });
    const heater = place('heater', 'heater', { parameters: { targetC: 70 } });
    const out = place('product', 'out');
    const t = simulateProcess(build([feed, heater, out], [pipe(feed, heater), pipe(heater, out)]), 30).terminals.find((x) => x.nodeId === 'out')!;
    assert.ok(Math.abs(t.temperatureC! - 70) < 0.5, `out at ${t.temperatureC} °C`);
  });
});
