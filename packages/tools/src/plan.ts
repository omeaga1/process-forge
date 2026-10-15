import {
  applyPlan,
  getSetting,
  graphFingerprint,
  planIdFor,
  validateProcessGraph,
  type PlanChange,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { simulateLine } from './line.js';
import type { ToolHost } from './host.js';

/**
 * plan_changes and apply_changes: plan, then act.
 *
 * plan_changes applies a set of changes to a copy of the flowsheet, all or
 * nothing, and says what they would do: what is added, removed and changed,
 * what the static check finds before and after, and how a run of the line
 * moves (its status, its output, its bottleneck). It returns a plan id bound
 * to the flowsheet as it is and to these exact changes.
 *
 * apply_changes takes the same changes and that id. The app applies them in
 * one step, only if the flowsheet and the changes still match the id, and the
 * result is read back from the app to confirm every change landed: a change
 * that did not land is reported, never assumed.
 */

export interface PlanChangesParams {
  changes: PlanChange[];
  durationMinutes?: number;
}

const nodeLabel = (n: ProcessNode) => n.name;

function diff(before: ProcessGraph, after: ProcessGraph) {
  const byId = (g: ProcessGraph) => new Map(g.nodes.map((n) => [n.id, n]));
  const b = byId(before);
  const a = byId(after);
  const edgeKey = (g: ProcessGraph, e: ProcessGraph['edges'][number]) =>
    `${g.nodes.find((n) => n.id === e.sourceNodeId)?.name ?? e.sourceNodeId} → ${g.nodes.find((n) => n.id === e.targetNodeId)?.name ?? e.targetNodeId}`;
  const settings = [...a.values()].flatMap((n) => {
    const old = b.get(n.id);
    if (!old) return [];
    const was = old.config as Record<string, unknown>;
    const now = n.config as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter((k) => k !== 'contract' && k !== 'designSpecs');
    const changed = keys.filter((k) => JSON.stringify(was[k]) !== JSON.stringify(now[k])).map((k) => ({ setting: k, from: was[k], to: now[k] }));
    const renamed = old.name !== n.name ? [{ setting: 'name', from: old.name, to: n.name }] : [];
    return changed.length || renamed.length ? [{ unit: n.name, changes: [...renamed, ...changed] }] : [];
  });
  const beforeEdges = new Set(before.edges.map((e) => e.id));
  const afterEdges = new Set(after.edges.map((e) => e.id));
  return {
    unitsAdded: [...a.values()].filter((n) => !b.has(n.id)).map(nodeLabel),
    unitsRemoved: [...b.values()].filter((n) => !a.has(n.id)).map(nodeLabel),
    settingsChanged: settings,
    streamsAdded: after.edges.filter((e) => !beforeEdges.has(e.id)).map((e) => edgeKey(after, e)),
    streamsRemoved: before.edges.filter((e) => !afterEdges.has(e.id)).map((e) => edgeKey(before, e))
  };
}

function runSummary(g: ProcessGraph, minutes: number, seed?: number) {
  try {
    const r = simulateLine(g, minutes, seed);
    return {
      seed: r.seed,
      summary: {
        status: r.status,
        issues: r.issues.filter((i) => i.severity !== 'info').map((i) => `${i.code}${i.unit ? ` (${i.unit})` : ''}`),
        unitsPerMinute: r.overallThroughputPpm,
        liquidOutKg: r.liquidOutKg,
        bottleneck: r.identifiedBottleneckMachine
      }
    };
  } catch (e) {
    return { seed, summary: { status: 'failed' as const, issues: [`the line does not run: ${(e as Error).message}`] } };
  }
}

export function planChanges(graph: ProcessGraph, params: PlanChangesParams) {
  const changes = Array.isArray(params?.changes) ? params.changes : [];
  const r = applyPlan(graph, changes);
  if (!r.ok) return { success: false, error: r.error, failedAt: r.failedAt + 1, stepsThatWorked: r.steps };
  const minutes = params.durationMinutes && params.durationMinutes > 0 ? Math.min(params.durationMinutes, 24 * 60) : 60;
  const errorsOf = (g: ProcessGraph) => validateProcessGraph(g).diagnostics.filter((d) => d.severity === 'ERROR').map((d) => d.message);
  const beforeErrors = new Set(errorsOf(graph));
  const afterErrors = errorsOf(r.graph);
  const before = runSummary(graph, minutes);
  // The same seed, so the difference is the plan and nothing else.
  const after = runSummary(r.graph, minutes, before.seed);
  const planId = planIdFor(graph, changes);
  return {
    success: true,
    planId,
    flowsheetFingerprint: graphFingerprint(graph),
    steps: r.steps,
    diff: diff(graph, r.graph),
    staticCheck: { newErrors: afterErrors.filter((e) => !beforeErrors.has(e)), clearedErrors: [...beforeErrors].filter((e) => !afterErrors.includes(e)) },
    run: { minutes, seed: before.seed, before: before.summary, after: after.summary },
    nextStep:
      'Nothing has changed yet. Show the engineer this plan (the diff, and what the run says), and if they agree, call apply_changes with these same changes and this planId. If the flowsheet changes first, the plan is refused and you plan again.'
  };
}

/** After an apply: does the flowsheet the app now holds show every planned change? */
function readBack(expected: ProcessGraph, actual: ProcessGraph) {
  const names = (g: ProcessGraph) => new Map(g.nodes.map((n) => [n.name, n]));
  const want = names(expected);
  const got = names(actual);
  const missing = [...want.keys()].filter((n) => !got.has(n));
  const unexpected = [...got.keys()].filter((n) => !want.has(n));
  const settingsNotApplied = [...want.values()].flatMap((n) => {
    const m = got.get(n.name);
    if (!m) return [];
    const cfg = n.config as Record<string, unknown>;
    return Object.keys(cfg)
      .filter((k) => k !== 'contract' && typeof cfg[k] === 'number' && getSetting(m.config as Record<string, unknown>, k) !== cfg[k])
      .map((k) => `${n.name}: ${k}`);
  });
  const streams = { expected: expected.edges.length, found: actual.edges.length };
  const verified = !missing.length && !unexpected.length && !settingsNotApplied.length && streams.expected === streams.found;
  return { verified, ...(missing.length ? { missingUnits: missing } : {}), ...(unexpected.length ? { unexpectedUnits: unexpected } : {}), ...(settingsNotApplied.length ? { settingsNotApplied } : {}), streams };
}

export async function applyChanges(args: { changes: PlanChange[]; planId: string }, host: ToolHost) {
  const open = await host.readOpen();
  if ('error' in open) return { success: false, applied: false, error: open.error };
  const changes = Array.isArray(args?.changes) ? args.changes : [];
  if (planIdFor(open.graph, changes) !== args?.planId) {
    return {
      success: false,
      applied: false,
      error:
        'This plan is not for the flowsheet as it is now: it changed since plan_changes, or these changes differ from the planned ones. Nothing was changed. Run plan_changes again and show the engineer the new plan.'
    };
  }
  const expected = applyPlan(open.graph, changes);
  const result = await host.edit({ op: 'apply-plan', changes, planId: args.planId });
  if (!result.success) return { ...result, applied: false };
  const after = await host.readOpen();
  const check = expected.ok && !('error' in after) ? readBack(expected.graph, after.graph) : { verified: false, note: 'Could not read the flowsheet back to confirm.' };
  return {
    ...result,
    applied: true,
    readBack: check,
    ...(check.verified ? {} : { warning: 'The flowsheet read back from the app does not show every planned change: check it with get_open_flowsheet before going on, and tell the engineer.' })
  };
}
