import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { planStream, spliceUnit } from '../connect.js';
import { addStreamToGraph, createTerminalNode, setTerminalRole } from '../terminals.js';
import { validateProcessGraph } from '../graph.js';
import { ProcessEdgeSchema } from '../streams.js';
import type { ProcessGraph } from '../graph.js';

type Dim = 'CONTINUOUS_VOLUME' | 'DISCRETE_CONTAINER';
const unit = (id: string, name: string, inputs: [string, Dim][], outputs: [string, Dim][]) => ({
  id,
  name,
  kind: 'CUSTOM_UNIT_OP',
  position: { x: 0, y: 0 },
  inputs: inputs.map(([pid, d]) => ({ id: pid, name: pid, type: d === 'DISCRETE_CONTAINER' ? 'CONTAINER_INPUT' : 'FLUID_INPUT', flowDimension: d })),
  outputs: outputs.map(([pid, d]) => ({ id: pid, name: pid, type: d === 'DISCRETE_CONTAINER' ? 'CONTAINER_OUTPUT' : 'FLUID_OUTPUT', flowDimension: d })),
  config: {}
});

const graph = (): ProcessGraph =>
  ({
    id: 'g',
    name: 'g',
    version: '1',
    metadata: {},
    nodes: [
      unit('tank-1', 'Surge Tank ST-200', [['in', 'CONTINUOUS_VOLUME']], [['out', 'CONTINUOUS_VOLUME']]),
      unit('filler-1', 'Rotary Filler RF-300', [['product', 'CONTINUOUS_VOLUME']], [['cans', 'DISCRETE_CONTAINER']]),
      unit('labeler-1', 'Labeler LB-500', [['in', 'DISCRETE_CONTAINER']], [['out', 'DISCRETE_CONTAINER']])
    ],
    edges: []
  }) as unknown as ProcessGraph;

describe('planStream: piping units together', () => {
  it('connects by name, id or tag, picking the ports that fit', () => {
    const g = graph();
    const a = planStream(g, { from: 'Surge Tank ST-200', to: 'filler-1' });
    assert.ok(a.ok);
    assert.equal(a.edge.sourcePortId, 'out');
    assert.equal(a.edge.targetPortId, 'product');
    assert.equal(a.carries, 'liquid');
    assert.ok(ProcessEdgeSchema.safeParse(a.edge).success, 'a valid edge');

    const b = planStream(g, { from: 'RF-300', to: 'LB-500' });
    assert.ok(b.ok);
    assert.equal(b.carries, 'items');
    assert.equal(b.edge.stream.type, 'DISCRETE_CONTAINER_STREAM');
  });

  it('refuses liquid into an items inlet, and says why', () => {
    const r = planStream(graph(), { from: 'tank-1', to: 'labeler-1' });
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /liquid or items, not both/);
  });

  it('refuses a loop into the same unit, an unknown unit, and a duplicate', () => {
    const g = graph();
    assert.equal(planStream(g, { from: 'tank-1', to: 'tank-1' }).ok, false);
    const missing = planStream(g, { from: 'pump-9', to: 'tank-1' });
    assert.equal(missing.ok, false);
    assert.match((missing as { error: string }).error, /Units: Surge Tank ST-200/);
    const first = planStream(g, { from: 'tank-1', to: 'filler-1' });
    assert.ok(first.ok);
    g.edges.push(first.edge);
    assert.equal(planStream(g, { from: 'tank-1', to: 'filler-1' }).ok, false);
  });

  it('uses a named port, and lists the ports when the name is wrong', () => {
    const g = graph();
    assert.ok(planStream(g, { from: 'filler-1', fromPort: 'cans', to: 'labeler-1' }).ok);
    const bad = planStream(g, { from: 'filler-1', fromPort: 'bottles', to: 'labeler-1' });
    assert.equal(bad.ok, false);
    assert.match((bad as { error: string }).error, /It has: cans/);
  });
});

describe('Feeds and outlets: the arrows at the edge of the flowsheet', () => {
  it('an outlet takes on the kind of what is piped into it, liquid or items', () => {
    let g = graph();
    g = { ...g, nodes: [...g.nodes, createTerminalNode('waste', { id: 'waste-1' }), createTerminalNode('product', { id: 'cans-out' })] };
    const liquid = planStream(g, { from: 'tank-1', to: 'waste-1' });
    assert.ok(liquid.ok);
    assert.equal(liquid.carries, 'liquid');
    const items = planStream(g, { from: 'labeler-1', to: 'cans-out' });
    assert.ok(items.ok, 'an unpiped liquid-default outlet takes items');
    assert.equal(items.carries, 'items');
    g = addStreamToGraph(g, items.edge);
    assert.equal(g.nodes.find((n) => n.id === 'cans-out')!.inputs[0]!.flowDimension, 'DISCRETE_CONTAINER');
    assert.equal(validateProcessGraph(g).valid, true, 'the retyped port matches its pipe');
  });

  it('a feed with a supply rate is the bottleneck when it is the slowest thing', () => {
    let g = graph();
    g = { ...g, nodes: [...g.nodes, createTerminalNode('feed', { id: 'feed-1', carries: 'items', supplyRate: 5 })] };
    const plan = planStream(g, { from: 'feed-1', to: 'labeler-1' });
    assert.ok(plan.ok);
    g = addStreamToGraph(g, plan.edge);
    const b = validateProcessGraph(g).bottlenecks;
    assert.equal(b.bottleneckNodeId, 'feed-1');
    assert.equal(b.maximumSystemThroughputUnitsPerMin, 5);
  });

  it('only outlets change between product, byproduct and waste; a feed stays a feed', () => {
    const out = createTerminalNode('product');
    assert.equal((setTerminalRole(out, 'waste').config as { role: string }).role, 'waste');
    const feed = createTerminalNode('feed');
    assert.equal(setTerminalRole(feed, 'waste'), feed);
  });
});

describe('spliceUnit: dropping a unit onto a pipe', () => {
  /** The tank piped to the filler, and a pump not piped to anything. */
  const piped = (): ProcessGraph => {
    const g = graph();
    const plan = planStream(g, { from: 'tank-1', to: 'filler-1' });
    assert.ok(plan.ok);
    const pump = unit('pump-1', 'Pump P-101', [['suction', 'CONTINUOUS_VOLUME']], [['discharge', 'CONTINUOUS_VOLUME']]);
    return { ...addStreamToGraph(g, { ...plan.edge, id: 'pipe' }), nodes: [...g.nodes, pump] } as unknown as ProcessGraph;
  };

  it('puts the unit in the pipe: tank to pump, pump to filler, both carrying what the pipe did', () => {
    const g = piped();
    const r = spliceUnit(g, 'pump-1', 'pipe', 1);
    assert.ok(r.ok, r.ok ? '' : r.reason);
    assert.equal(r.graph.edges.length, 2);
    assert.ok(!r.graph.edges.some((e) => e.id === 'pipe'));
    assert.deepEqual([r.into.sourceNodeId, r.into.sourcePortId, r.into.targetNodeId, r.into.targetPortId], ['tank-1', 'out', 'pump-1', 'suction']);
    assert.deepEqual([r.out.sourceNodeId, r.out.sourcePortId, r.out.targetNodeId, r.out.targetPortId], ['pump-1', 'discharge', 'filler-1', 'product']);
    const was = g.edges.find((e) => e.id === 'pipe')!.stream;
    assert.deepEqual(r.into.stream, was);
    assert.deepEqual(r.out.stream, was);
    for (const e of r.graph.edges) ProcessEdgeSchema.parse(e);
    assert.equal(new Set(r.graph.edges.map((e) => e.id)).size, 2);
  });

  it('refuses a unit that cannot take what the pipe carries, and changes nothing', () => {
    const r = spliceUnit(piped(), 'labeler-1', 'pipe');
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.reason : '', /no inlet for the liquid/);
  });

  it('refuses a unit that is already piped', () => {
    let g = piped();
    const plan = planStream(g, { from: 'pump-1', to: 'labeler-1' });
    if (plan.ok) g = addStreamToGraph(g, plan.edge);
    else g = { ...g, edges: [...g.edges, { ...g.edges[0]!, id: 'other', sourceNodeId: 'pump-1', sourcePortId: 'discharge' }] };
    const r = spliceUnit(g, 'pump-1', 'pipe');
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.reason : '', /already piped/);
  });

  it('gives the pipe out a new stream when the unit changes what flows, and the outlet takes it on', () => {
    let g = graph();
    g = { ...g, nodes: [...g.nodes, createTerminalNode('product', { id: 'out-1' })] };
    const plan = planStream(g, { from: 'tank-1', to: 'out-1' });
    assert.ok(plan.ok);
    g = addStreamToGraph(g, { ...plan.edge, id: 'pipe' });
    const r = spliceUnit(g, 'filler-1', 'pipe', 1);
    assert.ok(r.ok, r.ok ? '' : r.reason);
    assert.equal(r.into.stream.type, 'CONTINUOUS_FLUID');
    assert.equal(r.out.stream.type, 'DISCRETE_CONTAINER_STREAM');
    const outlet = r.graph.nodes.find((n) => n.id === 'out-1')!;
    assert.equal(outlet.inputs[0]!.flowDimension, 'DISCRETE_CONTAINER');
    assert.equal(validateProcessGraph(r.graph).diagnostics.filter((d) => d.severity === 'ERROR').length, 0, JSON.stringify(validateProcessGraph(r.graph).diagnostics));
  });
});
