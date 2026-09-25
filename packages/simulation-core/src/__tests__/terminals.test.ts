import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { addStreamToGraph, createTerminalNode, planStream, type ProcessGraph, type ProcessNode } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

type Dim = 'CONTINUOUS_VOLUME' | 'DISCRETE_CONTAINER';

const node = (id: string, kind: ProcessNode['kind'], config: Record<string, unknown>, inputs: Dim[] = [], outputs: Dim[] = []): ProcessNode =>
  ({
    id,
    name: id,
    kind,
    position: { x: 0, y: 0 },
    inputs: inputs.map((d, i) => ({ id: `in-${i}`, name: `in ${i}`, type: d === 'DISCRETE_CONTAINER' ? 'DISCRETE_INPUT' : 'FLUID_INPUT', flowDimension: d })),
    outputs: outputs.map((d, i) => ({ id: `out-${i}`, name: `out ${i}`, type: d === 'DISCRETE_CONTAINER' ? 'DISCRETE_OUTPUT' : 'FLUID_OUTPUT', flowDimension: d })),
    config
  }) as unknown as ProcessNode;

const empty = (id: string, nodes: ProcessNode[]): ProcessGraph => ({ id, name: id, version: '1.0.0', metadata: {}, nodes, edges: [] }) as ProcessGraph;

/** Pipes units the way the canvas and add_stream do, so terminals take on the right kind. */
function pipeAll(g: ProcessGraph, pairs: [string, string, string?][]): ProcessGraph {
  let t = 0;
  for (const [from, to, fromPort] of pairs) {
    const plan = planStream(g, { from, to, ...(fromPort ? { fromPort } : {}) }, ++t);
    assert.ok(plan.ok, plan.ok ? '' : plan.error);
    g = addStreamToGraph(g, plan.edge);
  }
  return g;
}

const filler = () =>
  node('filler', 'ROTARY_FILLER', { nozzleCount: 10, fillTimePerCycleSeconds: 10, indexTimePerCycleSeconds: 2, rejectRatePercentage: 0, containerVolumeGallons: 1 }, ['CONTINUOUS_VOLUME'], ['DISCRETE_CONTAINER']);
const labeler = (speed = 40) =>
  node('labeler', 'LABELER', { maxSpeedUnitsPerMinute: speed, opticalInspectionFailRate: 0 }, ['DISCRETE_CONTAINER'], ['DISCRETE_CONTAINER']);

describe('Feeds and outlets: terminals take on the kind they are piped to', () => {
  it('a liquid-default feed piped to a labeler becomes an items feed, and the stream carries items', () => {
    const g = pipeAll(empty('adapt', [createTerminalNode('feed', { id: 'feed' }), labeler()]), [['feed', 'labeler']]);
    const feed = g.nodes.find((n) => n.id === 'feed')!;
    assert.equal(feed.outputs[0]!.flowDimension, 'DISCRETE_CONTAINER');
    assert.equal(g.edges[0]!.stream.type, 'DISCRETE_CONTAINER_STREAM');
  });

  it('a terminal already piped keeps its kind: liquid into it is refused once it takes items', () => {
    let g = pipeAll(empty('fixed', [labeler(), createTerminalNode('product', { id: 'out' }), createTerminalNode('feed', { id: 'feed' })]), [['labeler', 'out']]);
    g = { ...g, nodes: [...g.nodes, node('tank', 'SURGE_TANK', { capacityGallons: 10, initialLevelGallons: 5 }, ['CONTINUOUS_VOLUME'], ['CONTINUOUS_VOLUME'])] };
    assert.equal(planStream(g, { from: 'tank', to: 'out' }).ok, false);
  });
});

describe('Feeds and outlets in the simulation', () => {
  it('only product counts as output; byproduct and waste are totalled apart', () => {
    // Filler cans go to a labeler whose output is product; its rejects are not
    // modelled as a stream, so a second labeler stands in for a waste line.
    let g = empty('split', [
      createTerminalNode('feed', { id: 'feed', material: 'Latex' }),
      filler(),
      node('lab', 'LABELER', { maxSpeedUnitsPerMinute: 200, opticalInspectionFailRate: 0 }, ['DISCRETE_CONTAINER'], ['DISCRETE_CONTAINER', 'DISCRETE_CONTAINER']),
      createTerminalNode('product', { id: 'good', material: 'Labeled cans' }),
      createTerminalNode('waste', { id: 'bad', material: 'Rejects' })
    ]);
    g = pipeAll(g, [['feed', 'filler'], ['filler', 'lab'], ['lab', 'good', 'out-0'], ['lab', 'bad', 'out-1']]);
    const r = simulateProcess(g, 30);
    const good = r.terminals.find((t) => t.nodeId === 'good')!;
    const bad = r.terminals.find((t) => t.nodeId === 'bad')!;
    const feed = r.terminals.find((t) => t.nodeId === 'feed')!;
    assert.ok(good.units > 0 && bad.units > 0, `product ${good.units}, waste ${bad.units}`);
    assert.equal(r.totalUnitsPackaged, good.units, 'output is the product outlet only');
    assert.equal(feed.carries, 'liquid');
    // 50 cans a minute for 30 min, less the first cycle: the feed supplies what the filler draws.
    assert.ok(feed.gallons >= 1400 && feed.gallons <= 1520, `feed supplied ${feed.gallons} gal`);
    assert.ok(Math.abs(good.units + bad.units - r.nodeReports['filler']!.unitsProduced) <= 20, 'what the filler makes leaves by the outlets');
  });

  it('a supply rate limits the line: a 20 gal/min feed holds a 50 can/min filler to about 20 a minute', () => {
    let g = empty('limited', [createTerminalNode('feed', { id: 'feed', supplyRate: 20 }), filler(), createTerminalNode('product', { id: 'cans' })]);
    g = pipeAll(g, [['feed', 'filler'], ['filler', 'cans']]);
    const r = simulateProcess(g, 60);
    const rate = r.totalUnitsPackaged / 60;
    assert.ok(rate > 18 && rate <= 20.5, `line made ${rate.toFixed(1)}/min`);
    assert.ok(r.nodeReports['filler']!.starvedTimeSeconds > 30 * 60, 'the filler waits for product');
  });

  it('an items feed with a rate supplies that rate; without one it keeps the line full', () => {
    let limited = empty('items-rate', [createTerminalNode('feed', { id: 'feed', supplyRate: 10 }), labeler(40), createTerminalNode('product', { id: 'out' })]);
    limited = pipeAll(limited, [['feed', 'labeler'], ['labeler', 'out']]);
    const a = simulateProcess(limited, 30);
    assert.ok(a.totalUnitsPackaged >= 290 && a.totalUnitsPackaged <= 300, `rate-limited: ${a.totalUnitsPackaged}`);

    let open = empty('items-open', [createTerminalNode('feed', { id: 'feed' }), labeler(40), createTerminalNode('product', { id: 'out' })]);
    open = pipeAll(open, [['feed', 'labeler'], ['labeler', 'out']]);
    const b = simulateProcess(open, 30);
    assert.ok(b.totalUnitsPackaged >= 1190 && b.totalUnitsPackaged <= 1200, `unlimited: the labeler's 40/min, got ${b.totalUnitsPackaged}`);
    assert.ok(b.nodeReports['labeler']!.starvedTimeSeconds < 5, 'never short of items');
  });

  it('a separator splits a feed into a product and a byproduct outlet', () => {
    let g = empty('sep', [
      createTerminalNode('feed', { id: 'feed', supplyRate: 40 }),
      node('sep', 'SEPARATOR', { vaporSplitRatio: 0.25 }, ['CONTINUOUS_VOLUME'], ['CONTINUOUS_VOLUME', 'CONTINUOUS_VOLUME']),
      createTerminalNode('byproduct', { id: 'vapor' }),
      createTerminalNode('product', { id: 'liquid' })
    ]);
    g = pipeAll(g, [['feed', 'sep'], ['sep', 'vapor', 'out-0'], ['sep', 'liquid', 'out-1']]);
    const r = simulateProcess(g, 60);
    const vapor = r.terminals.find((t) => t.nodeId === 'vapor')!.gallons;
    const liquid = r.terminals.find((t) => t.nodeId === 'liquid')!.gallons;
    assert.ok(Math.abs(vapor + liquid - 2400) < 5, `40 gal/min for an hour, got ${vapor + liquid}`);
    assert.ok(Math.abs(vapor / (vapor + liquid) - 0.25) < 0.01, 'a quarter goes overhead');
    assert.equal(r.totalFluidDeliveredGallons, liquid, 'only the product outlet is output');
  });

  it('a palletizer passes its layers on to a product outlet', () => {
    let g = empty('pallet', [
      createTerminalNode('feed', { id: 'feed' }),
      node('pz', 'PALLETIZER', { containersPerLayer: 20, cycleSecondsPerLayer: 30 }, ['DISCRETE_CONTAINER'], ['DISCRETE_CONTAINER']),
      createTerminalNode('product', { id: 'skids' })
    ]);
    g = pipeAll(g, [['feed', 'pz'], ['pz', 'skids']]);
    const r = simulateProcess(g, 30);
    assert.equal(r.totalUnitsPackaged, r.nodeReports['pz']!.unitsProduced);
    assert.ok(r.totalUnitsPackaged >= 1180, `40/min for 30 min, got ${r.totalUnitsPackaged}`);
  });

  it('a flowsheet without terminals reports as before', () => {
    const g = pipeAll(empty('plain', [node('tank', 'SURGE_TANK', { capacityGallons: 800, initialLevelGallons: 400, maxDischargeRateGpm: 45 }, ['CONTINUOUS_VOLUME'], ['CONTINUOUS_VOLUME']), filler()]), [['tank', 'filler']]);
    const r = simulateProcess(g, 30);
    assert.deepEqual(r.terminals, []);
    assert.equal(r.totalUnitsPackaged, r.nodeReports['filler']!.unitsProduced);
  });
});

