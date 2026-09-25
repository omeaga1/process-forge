import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { applyFlowsheetEdit, createDefaultProcessNode, type ProcessEdge, type ProcessGraph } from '../index.js';

function line(): ProcessGraph {
  const pump = createDefaultProcessNode('PUMP', { name: 'Transfer Pump P-102' });
  pump.id = 'pump';
  const tank = createDefaultProcessNode('SURGE_TANK', { name: 'Buffer Tank T-201' });
  tank.id = 'tank';
  const reactor = createDefaultProcessNode('BATCH_REACTOR', { name: 'Reactor R-101' });
  reactor.id = 'reactor';
  const pipe = (id: string, from: typeof pump, to: typeof pump): ProcessEdge =>
    ({
      id,
      sourceNodeId: from.id,
      sourcePortId: from.outputs[0]!.id,
      targetNodeId: to.id,
      targetPortId: to.inputs[0]!.id,
      stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 50, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: { name: 'W', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 } }
    }) as ProcessEdge;
  return { id: 'g', name: 'g', version: '1.0.0', metadata: {}, nodes: [reactor, pump, tank], edges: [pipe('e1', reactor, pump), pipe('e2', pump, tank)] };
}

describe('Flowsheet edits', () => {
  it('changes a setting by tag, and reports old and new', () => {
    const g = line();
    const r = applyFlowsheetEdit(g, { op: 'update-unit', unit: 'P-102', parameters: { designFlowRateGpm: 80 } });
    assert.ok(r.ok);
    assert.equal((r.graph.nodes.find((n) => n.id === 'pump')!.config as { designFlowRateGpm: number }).designFlowRateGpm, 80);
    assert.deepEqual(r.changes![0], { parameter: 'designFlowRateGpm', from: (g.nodes[1]!.config as { designFlowRateGpm: number }).designFlowRateGpm, to: 80 });
    assert.notEqual(r.graph, g, 'a new graph');
    assert.notEqual((g.nodes[1]!.config as { designFlowRateGpm: number }).designFlowRateGpm, 80, 'the input is untouched');
  });

  it('reaches nested settings without sharing them with the original', () => {
    const g = line();
    const r = applyFlowsheetEdit(g, { op: 'update-unit', unit: 'Reactor R-101', parameters: { 'fluid.temperatureCelsius': 90, jacketDutyKw: 300 } });
    assert.ok(r.ok);
    const c = r.graph.nodes[0]!.config as { fluid: { temperatureCelsius: number; name: string }; jacketDutyKw: number };
    assert.equal(c.fluid.temperatureCelsius, 90);
    assert.equal(c.fluid.name, 'Reaction Mixture', 'the rest of the fluid is kept');
    assert.equal((g.nodes[0]!.config as { fluid: { temperatureCelsius: number } }).fluid.temperatureCelsius, 65);
    assert.match(r.warnings![0]!, /no setting "jacketDutyKw"; it was added/);
  });

  it('renames', () => {
    const r = applyFlowsheetEdit(line(), { op: 'update-unit', unit: 'tank', name: 'Buffer Tank T-202' });
    assert.ok(r.ok);
    assert.equal(r.graph.nodes[2]!.name, 'Buffer Tank T-202');
  });

  it('refuses a word where a number goes, a bad setting name, and an empty change', () => {
    const g = line();
    const text = applyFlowsheetEdit(g, { op: 'update-unit', unit: 'pump', parameters: { designFlowRateGpm: 'fast' } });
    assert.ok(!text.ok && /is a number/.test(text.error));
    const proto = applyFlowsheetEdit(g, { op: 'update-unit', unit: 'pump', parameters: { '__proto__.x': 1 } });
    assert.ok(!proto.ok && /not allowed/.test(proto.error));
    const none = applyFlowsheetEdit(g, { op: 'update-unit', unit: 'pump' });
    assert.ok(!none.ok && /Nothing to change/.test(none.error));
    const missing = applyFlowsheetEdit(g, { op: 'update-unit', unit: 'Mixer M-9', parameters: { x: 1 } });
    assert.ok(!missing.ok && /No unit "Mixer M-9"/.test(missing.error));
  });

  it('removes a unit with its streams', () => {
    const r = applyFlowsheetEdit(line(), { op: 'remove-unit', unit: 'P-102' });
    assert.ok(r.ok);
    assert.deepEqual(r.graph.nodes.map((n) => n.id), ['reactor', 'tank']);
    assert.deepEqual(r.graph.edges, []);
    assert.deepEqual(r.removedStreams, ['e1', 'e2']);
    assert.match(r.message, /and its 2 streams/);
  });

  it('removes a stream by its ends or its id, and keeps the units', () => {
    const byEnds = applyFlowsheetEdit(line(), { op: 'remove-stream', from: 'R-101', to: 'P-102' });
    assert.ok(byEnds.ok);
    assert.deepEqual(byEnds.graph.edges.map((e) => e.id), ['e2']);
    assert.equal(byEnds.graph.nodes.length, 3);
    const byId = applyFlowsheetEdit(line(), { op: 'remove-stream', stream: 'e2' });
    assert.ok(byId.ok);
    assert.deepEqual(byId.graph.edges.map((e) => e.id), ['e1']);
    const none = applyFlowsheetEdit(line(), { op: 'remove-stream', from: 'tank', to: 'pump' });
    assert.ok(!none.ok && /No stream from/.test(none.error));
  });
});
