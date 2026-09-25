import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { planStream } from '../connect.js';
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
