import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE, applyFlowsheetEdit, type PlanChange, type ProcessGraph } from '@process-forge/protocol';
import { FORGE_TOOLS } from '../registry.js';
import type { ToolHost } from '../host.js';

/** A host whose open flowsheet is held in memory and edited with the app's own rules. */
function memoryHost(start: ProcessGraph, options: { dropLastNode?: boolean } = {}): ToolHost & { graph: ProcessGraph } {
  const host = {
    graph: start,
    surface: 'mcp' as const,
    readOpen: async () => ({ graph: host.graph }),
    addUnit: async () => ({ success: false }),
    addDesignedUnit: async () => ({ success: false }),
    addStream: async () => ({ success: false }),
    edit: async (e: Parameters<ToolHost['edit']>[0]) => {
      const r = applyFlowsheetEdit(host.graph, e);
      if (!r.ok) return { success: false, changed: false, error: r.error };
      // A host that loses part of the change, to prove the read-back notices.
      host.graph = options.dropLastNode ? { ...r.graph, nodes: r.graph.nodes.slice(0, -1) } : r.graph;
      return { success: true, changed: true, message: r.message, ...(r.steps ? { steps: r.steps } : {}) };
    },
    requestPublish: async () => ({ success: false }),
    decider: {} as ToolHost['decider'],
    communityApiBase: 'http://localhost'
  };
  return host;
}

const tool = (name: string) => FORGE_TOOLS.find((t) => t.name === name)!;

const changes: PlanChange[] = [
  { op: 'add-unit', unit: 'surge-tank', name: 'Concentrate Tank T-501', parameters: { capacityGallons: 2000, initialLevelGallons: 0 } },
  { op: 'remove-stream', from: 'P-401', to: 'P-600' },
  { op: 'add-stream', from: 'P-401', to: 'T-501' },
  { op: 'add-stream', from: 'T-501', to: 'P-600' }
];

describe('plan_changes, then apply_changes', () => {
  it('plans on a copy, shows the diff and the run before and after, and changes nothing', async () => {
    const host = memoryHost(JUICE_CONCENTRATION_LINE);
    const plan = (await tool('plan_changes').run({ changes, durationMinutes: 30 }, host)) as Record<string, any>;
    assert.equal(plan.success, true, plan.error);
    assert.match(plan.planId, /^plan-[0-9a-f]{16}$/);
    assert.deepEqual(plan.diff.unitsAdded, ['Concentrate Tank T-501']);
    assert.equal(plan.diff.streamsAdded.length, 2);
    assert.equal(plan.diff.streamsRemoved.length, 1);
    assert.equal(plan.run.before.status, 'ok');
    assert.ok(plan.run.after.status, 'the run after is reported');
    assert.equal(host.graph, JUICE_CONCENTRATION_LINE, 'nothing changed');
    assert.equal(tool('plan_changes').access, 'read');
  });

  it('applies the plan in one step and reads it back', async () => {
    const host = memoryHost(JUICE_CONCENTRATION_LINE);
    const plan = (await tool('plan_changes').run({ changes }, host)) as Record<string, any>;
    const r = (await tool('apply_changes').run({ changes, planId: plan.planId }, host)) as Record<string, any>;
    assert.equal(r.applied, true, r.error);
    assert.equal(r.readBack.verified, true, JSON.stringify(r.readBack));
    assert.ok(host.graph.nodes.some((n) => n.name === 'Concentrate Tank T-501'));
    assert.equal(tool('apply_changes').access, 'write');
  });

  it('refuses a plan the flowsheet has moved on from, and changes nothing', async () => {
    const host = memoryHost(JUICE_CONCENTRATION_LINE);
    const plan = (await tool('plan_changes').run({ changes }, host)) as Record<string, any>;
    const moved = applyFlowsheetEdit(host.graph, { op: 'update-unit', unit: 'E-101', parameters: { targetC: 70 } });
    assert.ok(moved.ok);
    host.graph = moved.graph;
    const r = (await tool('apply_changes').run({ changes, planId: plan.planId }, host)) as Record<string, any>;
    assert.equal(r.applied, false);
    assert.match(r.error, /Run plan_changes again/);
    assert.equal(host.graph, moved.graph);
  });

  it('says so when the read-back does not show every change', async () => {
    const host = memoryHost(JUICE_CONCENTRATION_LINE, { dropLastNode: true });
    const plan = (await tool('plan_changes').run({ changes }, host)) as Record<string, any>;
    const r = (await tool('apply_changes').run({ changes, planId: plan.planId }, host)) as Record<string, any>;
    assert.equal(r.readBack.verified, false);
    assert.deepEqual(r.readBack.missingUnits, ['Concentrate Tank T-501']);
    assert.match(r.warning, /does not show every planned change/);
  });

  it('reports the step a bad plan fails at, with the steps before it', async () => {
    const host = memoryHost(JUICE_CONCENTRATION_LINE);
    const plan = (await tool('plan_changes').run({ changes: [...changes, { op: 'remove-unit', unit: 'Z-999' }] }, host)) as Record<string, any>;
    assert.equal(plan.success, false);
    assert.equal(plan.failedAt, 5);
    assert.equal(plan.stepsThatWorked.length, 4);
  });
});
