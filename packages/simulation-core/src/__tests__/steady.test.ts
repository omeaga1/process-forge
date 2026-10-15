import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  EXAMPLE_LINES,
  JUICE_CONCENTRATION_LINE,
  addStreamToGraph,
  createStandardUnitOp,
  findStandardUnitOp,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';
import { solveSteadyState } from '../steady.js';

/**
 * The steady state, solved on the same material network the dynamic run
 * steps: it must agree with a long run, and with hand calculations.
 */
const near = (got: number, want: number, tol: number, what: string) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got} vs ${want}`);

const place = (unit: string, id: string, options: Parameters<typeof createStandardUnitOp>[1] = {}): ProcessNode => ({ ...createStandardUnitOp(findStandardUnitOp(unit)!, options), id, name: id });
const withFluid = (n: ProcessNode, f: Record<string, number>): ProcessNode => ({ ...n, config: { ...(n.config as object), ...f } }) as ProcessNode;
const pipe = (from: ProcessNode, to: ProcessNode, fromPort = from.outputs[0]!.id, toPort = to.inputs[0]!.id): ProcessEdge =>
  ({
    id: `${from.id}:${fromPort}->${to.id}:${toPort}`,
    sourceNodeId: from.id,
    targetNodeId: to.id,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 40, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: { name: 'Mix', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 } }
  }) as unknown as ProcessEdge;
const build = (nodes: ProcessNode[], edges: ProcessEdge[]): ProcessGraph => {
  let g = { id: 'steady', name: 'steady', version: '1.0.0', metadata: {}, nodes, edges: [] } as unknown as ProcessGraph;
  for (const e of edges) g = addStreamToGraph(g, e);
  return g;
};

/** Feed 1,000 kg/h through a mixer and a CSTR; a splitter sends `recycle` of it back to the mixer. */
function loop(recycle: number): ProcessGraph {
  const feed = withFluid(place('feed', 'feed', { supplyKgPerHour: 1000, composition: { water: 0.7, reactant: 0.3 } }), { temperatureC: 20, densityGPerCm3: 1, specificHeatKjPerKgK: 4 });
  const mixer = place('mixer', 'mixer', { parameters: { ratedFlowGpm: 200 } });
  const cstr = place('cstr', 'cstr');
  const split = place('splitter', 'split', { parameters: { fractionToA: recycle } });
  const out = place('product', 'out');
  return build([feed, mixer, cstr, split, out], [pipe(feed, mixer, undefined, 'a'), pipe(mixer, cstr), pipe(cstr, split), pipe(split, mixer, 'a', 'b'), pipe(split, out, 'b')]);
}

describe('the steady-state solve', () => {
  it('agrees with a long dynamic run on the juice line, in a few milliseconds', () => {
    const s = solveSteadyState(JUICE_CONCENTRATION_LINE);
    assert.equal(s.status, 'converged', s.message);
    assert.ok(s.iterations < 30);
    const d = simulateProcess(JUICE_CONCENTRATION_LINE, 120);
    const product = s.streams.find((x) => x.to === 'Apple Juice Concentrate P-600')!;
    const dynamic = d.terminals.find((t) => t.nodeId === 'juice-p-600')!;
    near(product.kgPerHour, (dynamic.kg / 120) * 60, 2, 'concentrate kg/h');
    near(product.composition!.sugar!, 0.4149, 0.0005, 'concentrate sugar');
    assert.ok(s.energy.every((e) => e.verdict === 'consistent'), JSON.stringify(s.energy.map((e) => [e.name, e.verdict])));
    near(s.massBalance.accumulatingKgPerHour, 0, 0.1, 'mass in = out');
  });

  it('closes a material recycle, the loop flow being feed / (1 − recycle), and Wegstein gets there far sooner', () => {
    const g = loop(0.8);
    const direct = solveSteadyState(g, { accelerate: false });
    const fast = solveSteadyState(g);
    assert.equal(fast.status, 'converged', fast.message);
    assert.deepEqual(fast.tears, ['mixer']);
    const intoCstr = fast.streams.find((x) => x.from === 'mixer' && x.to === 'cstr')!;
    near(intoCstr.kgPerHour, 5000, 1, 'loop flow');
    near(fast.streams.find((x) => x.to === 'out')!.kgPerHour, 1000, 0.5, 'product');
    assert.ok(fast.iterations * 3 < direct.iterations, `Wegstein ${fast.iterations} vs direct ${direct.iterations}`);
    near(intoCstr.composition!.reactant!, direct.streams.find((x) => x.from === 'mixer' && x.to === 'cstr')!.composition!.reactant!, 1e-4, 'same answer');
  });

  it('says there is no steady state when a unit at its rating cannot pass what a recycle returns', () => {
    const s = solveSteadyState(loop(0.99));
    assert.equal(s.status, 'no-steady-state');
    assert.match(s.message, /"mixer" \(100% of its rated flow\)/);
  });

  it('declines lines that run in cycles, and says to use the dynamic run', () => {
    const s = solveSteadyState(EXAMPLE_LINES['paint-canning-line']!);
    assert.equal(s.status, 'not-applicable');
    assert.match(s.message, /simulate_process_line/);
  });

  it('reports a tank that fills, how fast, and when it is full', () => {
    const feed = withFluid(place('feed', 'feed', { supplyRate: 20, composition: { water: 1 } }), { temperatureC: 20 });
    const tank = place('surge-tank', 'tank', { parameters: { capacityGallons: 1000, initialLevelGallons: 0, maxDischargeRateGpm: 15 } });
    const out = place('product', 'out');
    const s = solveSteadyState(build([feed, tank, out], [pipe(feed, tank), pipe(tank, out)]));
    assert.equal(s.status, 'no-steady-state', s.message);
    const t = s.units.find((u) => u.nodeId === 'tank')!;
    near(t.fillingKgPerHour!, 5 * 3.785411784 * 60 * 0.998, 20, 'fills at 5 gal/min');
    assert.match(s.message, /is full in about/);
  });
});
