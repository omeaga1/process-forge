import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE, applyFlowsheetEdit, applyPlan, graphFingerprint, planIdFor, type PlanChange, type ProcessGraph } from '../index.js';

/**
 * Plan, then act: a set of changes goes on a copy all or nothing, and is
 * applied for real only against the flowsheet it was planned on.
 */
const g = JUICE_CONCENTRATION_LINE;

const build: PlanChange[] = [
  { op: 'add-unit', unit: 'surge-tank', name: 'Concentrate Tank T-501', parameters: { capacityGallons: 2000 } },
  { op: 'remove-stream', from: 'P-401', to: 'P-600' },
  { op: 'add-stream', from: 'P-401', to: 'T-501' },
  { op: 'add-stream', from: 'T-501', to: 'P-600' },
  { op: 'update-unit', unit: 'P-401', parameters: { ratedFlowGpm: 8 } }
];

describe('a plan of changes', () => {
  it('applies every change in order, naming units earlier steps added', () => {
    const r = applyPlan(g, build);
    assert.ok(r.ok, !r.ok ? r.error : '');
    assert.equal(r.steps.length, 5);
    const tank = r.graph.nodes.find((n) => n.name === 'Concentrate Tank T-501');
    assert.ok(tank);
    assert.equal((tank!.config as { capacityGallons: number }).capacityGallons, 2000);
    const into = r.graph.edges.filter((e) => e.targetNodeId === tank!.id);
    const outOf = r.graph.edges.filter((e) => e.sourceNodeId === tank!.id);
    assert.equal(into.length, 1);
    assert.equal(outOf.length, 1);
    assert.equal(g.nodes.length + 1, r.graph.nodes.length, 'the original is untouched');
  });

  it('changes nothing when any change fails, and says which one', () => {
    const bad: PlanChange[] = [...build.slice(0, 3), { op: 'update-unit', unit: 'P-401', parameters: { ratedFlowGPM: 8 } }];
    const r = applyPlan(g, bad);
    assert.ok(!r.ok);
    assert.equal(r.failedAt, 3);
    assert.match(r.error, /Change 4 \(update-unit\).*Did you mean ratedFlowGpm\?.*Nothing was changed/);
    assert.equal(r.steps.length, 3, 'reports the steps that worked before it');
  });

  it('refuses an unknown catalog unit and a setting a standard unit does not have', () => {
    const a = applyPlan(g, [{ op: 'add-unit', unit: 'flux-capacitor' }]);
    assert.ok(!a.ok && /No standard unit "flux-capacitor"/.test(a.error));
    const b = applyPlan(g, [{ op: 'add-unit', unit: 'pump', parameters: { warpFactor: 9 } }]);
    assert.ok(!b.ok && /has no setting "warpFactor"/.test(b.error));
  });

  it('fingerprints what the line is, not where it is drawn', () => {
    const moved: ProcessGraph = { ...g, nodes: g.nodes.map((n, i) => (i === 0 ? { ...n, position: { x: n.position.x + 300, y: 5 } } : n)) };
    assert.equal(graphFingerprint(moved), graphFingerprint(g));
    const changed = applyFlowsheetEdit(g, { op: 'update-unit', unit: 'P-401', parameters: { ratedFlowGpm: 9 } });
    assert.ok(changed.ok);
    assert.notEqual(graphFingerprint(changed.graph), graphFingerprint(g));
  });

  it('applies as one edit only against the flowsheet and the changes it was planned for', () => {
    const planId = planIdFor(g, build);
    const ok = applyFlowsheetEdit(g, { op: 'apply-plan', changes: build, planId });
    assert.ok(ok.ok, !ok.ok ? ok.error : '');
    assert.equal(ok.steps?.length, 5);
    assert.match(ok.message, /^Applied a plan of 5 changes:/);

    // The flowsheet moved on: refused.
    const later = applyFlowsheetEdit(g, { op: 'update-unit', unit: 'E-101', parameters: { targetC: 70 } });
    assert.ok(later.ok);
    const stale = applyFlowsheetEdit(later.graph, { op: 'apply-plan', changes: build, planId });
    assert.ok(!stale.ok && /not for the flowsheet as it is now/.test(stale.error));

    // The changes were altered after the plan was shown: refused.
    const altered = build.map((c) => (c.op === 'update-unit' ? { ...c, parameters: { ratedFlowGpm: 12 } } : c));
    const swapped = applyFlowsheetEdit(g, { op: 'apply-plan', changes: altered, planId });
    assert.ok(!swapped.ok && /not for the flowsheet as it is now/.test(swapped.error));
  });

  it('refuses an empty plan and a plan inside a plan', () => {
    assert.ok(!applyPlan(g, []).ok);
    const nested = applyPlan(g, [{ op: 'apply-plan', changes: [], planId: 'x' } as unknown as PlanChange]);
    assert.ok(!nested.ok && /cannot contain a plan/.test(nested.error));
  });
});
