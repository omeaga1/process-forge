import type { ProcessGraph } from './graph.js';
import type { ProcessNode } from './nodes.js';
import { planStream } from './connect.js';
import { addStreamToGraph } from './terminals.js';
import { createStandardUnitOp, findStandardUnitOp, STANDARD_EQUIPMENT_CATALOG, type CreateStandardOptions } from './equipment/catalog.js';
import { placeNextTo } from './layout/placement.js';
import { UnitOpContractSchema } from './unitop/contract.js';
import { executeValidateUnitOp } from './unitop/review.js';
import { contractToProcessNode } from './unitop/toNode.js';
import { applyFlowsheetEdit, type FlowsheetEdit, type ParameterChange } from './edit.js';

/**
 * Plan, then act. A set of changes to a flowsheet (add units, pipe them,
 * change settings, remove things) is applied first to a copy, all or
 * nothing, so its effect can be shown before anything moves; then, once the
 * engineer agrees, applied to the real flowsheet in one step, and only if
 * that flowsheet is still the one the plan was made against.
 *
 * The plan id binds the two: a hash of the flowsheet's process content and
 * the changes. If either differs when the plan is applied (the engineer
 * moved on, or a model changed a value between showing and applying), it is
 * refused and nothing changes. Units are named by id, name or tag, so a step
 * can pipe a unit an earlier step added by the name it gave it.
 */

export type PlanChange =
  /** A standard unit or a feed/outlet arrow from the catalog (list_standard_unit_ops), as add_standard_unit_op places it. */
  | ({ op: 'add-unit'; unit: string } & Omit<CreateStandardOptions, 'position'> & { position?: { x: number; y: number } })
  /** A designed unit: a contract the engine must accept (validate_unit_op). */
  | { op: 'add-designed-unit'; contract: unknown; name?: string; position?: { x: number; y: number } }
  /** A pipe between two units, by id, name or tag; ports optional. */
  | { op: 'add-stream'; from: string; to: string; fromPort?: string; toPort?: string }
  | Exclude<FlowsheetEdit, { op: 'apply-plan' }>;

export interface PlanStep {
  index: number;
  op: PlanChange['op'];
  message: string;
  unit?: { id: string; name: string };
  changes?: ParameterChange[];
  warnings?: string[];
}

export type PlanOutcome =
  | { ok: true; graph: ProcessGraph; steps: PlanStep[] }
  | { ok: false; error: string; failedAt: number; steps: PlanStep[] };

/** Most changes one plan may carry: a line's worth, not a plant's. */
export const MAX_PLAN_CHANGES = 60;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function applyOne(graph: ProcessGraph, change: PlanChange, index: number, now: number): { ok: true; graph: ProcessGraph; step: PlanStep } | { ok: false; error: string } {
  switch (change.op) {
    case 'add-unit': {
      const item = typeof change.unit === 'string' ? findStandardUnitOp(change.unit) : null;
      if (!item) return { ok: false, error: `No standard unit "${String(change.unit)}". Units: ${STANDARD_EQUIPMENT_CATALOG.map((i) => i.id).join(', ')}.` };
      const { op: _op, unit: _unit, position, ...options } = change;
      const made = createStandardUnitOp(item, options);
      const id = graph.nodes.some((n) => n.id === made.id) ? `${made.id}-${(now + index).toString(36)}` : made.id;
      const node: ProcessNode = { ...made, id, position: position ?? placeNextTo(graph) };
      // Settings the unit does not have are refused, as update_unit refuses them.
      const config = node.config as Record<string, unknown>;
      const unknown = Object.keys(change.parameters ?? {}).filter((k) => typeof config[k] !== 'number');
      if (unknown.length) return { ok: false, error: `A ${item.title} has no setting ${unknown.map((k) => `"${k}"`).join(', ')}. Its settings: ${Object.keys(config).filter((k) => typeof config[k] === 'number').join(', ')}.` };
      return { ok: true, graph: { ...graph, nodes: [...graph.nodes, node] }, step: { index, op: change.op, message: `Add ${item.title} "${node.name}".`, unit: { id: node.id, name: node.name } } };
    }
    case 'add-designed-unit': {
      const parsed = UnitOpContractSchema.safeParse(change.contract);
      if (!parsed.success) return { ok: false, error: `Not a unit-op contract: ${parsed.error.issues[0]?.path.join('.') || 'contract'}: ${parsed.error.issues[0]?.message ?? 'invalid'}.` };
      const verdict = executeValidateUnitOp({ contract: parsed.data });
      if (verdict.verdict !== 'ACCEPTED') return { ok: false, error: `The engine rejects "${parsed.data.name}": ${verdict.revisionGuidance}` };
      const made = contractToProcessNode(parsed.data, { position: change.position ?? placeNextTo(graph) });
      const node: ProcessNode = {
        ...made,
        ...(change.name ? { name: change.name } : {}),
        id: graph.nodes.some((n) => n.id === made.id) ? `${made.id}-${(now + index).toString(36)}` : made.id
      };
      return { ok: true, graph: { ...graph, nodes: [...graph.nodes, node] }, step: { index, op: change.op, message: `Add designed unit "${node.name}".`, unit: { id: node.id, name: node.name } } };
    }
    case 'add-stream': {
      const plan = planStream(graph, { from: String(change.from ?? ''), to: String(change.to ?? ''), ...(change.fromPort ? { fromPort: change.fromPort } : {}), ...(change.toPort ? { toPort: change.toPort } : {}) }, now + index);
      if (!plan.ok) return { ok: false, error: `${plan.error}${plan.hint ? ` ${plan.hint}` : ''}` };
      return {
        ok: true,
        graph: addStreamToGraph(graph, plan.edge),
        step: { index, op: change.op, message: `Pipe ${plan.from.name} (${plan.from.port}) into ${plan.to.name} (${plan.to.port}), carrying ${plan.carries}.` }
      };
    }
    default: {
      const r = applyFlowsheetEdit(graph, change);
      if (!r.ok) return { ok: false, error: r.error };
      return {
        ok: true,
        graph: r.graph,
        step: { index, op: change.op, message: r.message, ...(r.unit ? { unit: r.unit } : {}), ...(r.changes ? { changes: r.changes } : {}), ...(r.warnings ? { warnings: r.warnings } : {}) }
      };
    }
  }
}

/** Applies every change in order to a copy of the graph, or none of them: the first that fails stops the plan and says why. */
export function applyPlan(graph: ProcessGraph, changes: readonly PlanChange[], now: number = Date.now()): PlanOutcome {
  if (!Array.isArray(changes) || changes.length === 0) return { ok: false, error: 'Give "changes": at least one change.', failedAt: -1, steps: [] };
  if (changes.length > MAX_PLAN_CHANGES) return { ok: false, error: `A plan carries at most ${MAX_PLAN_CHANGES} changes; this one has ${changes.length}. Split it.`, failedAt: -1, steps: [] };
  let g = graph;
  const steps: PlanStep[] = [];
  for (const [i, change] of changes.entries()) {
    if (!isObject(change) || typeof change.op !== 'string') return { ok: false, error: `Change ${i + 1} is not { "op": ..., ... }.`, failedAt: i, steps };
    if ((change.op as string) === 'apply-plan') return { ok: false, error: 'A plan cannot contain a plan.', failedAt: i, steps };
    const r = applyOne(g, change as PlanChange, i, now);
    if (!r.ok) return { ok: false, error: `Change ${i + 1} (${change.op}): ${r.error} Nothing was changed.`, failedAt: i, steps };
    g = r.graph;
    steps.push(r.step);
  }
  return { ok: true, graph: g, steps };
}

// ------------------------------------------------------------ fingerprint

/** JSON with object keys sorted, so equal content gives equal text. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObject(v)) return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

/** 64-bit FNV-1a, as hex. Not a security hash: it detects change, it does not resist forgery. */
function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

/**
 * The flowsheet's process content, hashed: its units (kind, name, settings,
 * ports) and streams. Where things are drawn (positions, layouts, a pipe's
 * bends) is left out: moving a unit on the canvas does not make a plan stale.
 */
export function graphFingerprint(graph: ProcessGraph): string {
  const nodes = graph.nodes.map(({ position: _p, layout: _l, ...rest }) => rest);
  const edges = graph.edges.map(({ waypoints: _w, ...rest }) => rest);
  return fnv1a64(canonical({ nodes, edges }));
}

/** The id that binds a plan to the flowsheet it was made against and to its changes. */
export function planIdFor(graph: ProcessGraph, changes: readonly PlanChange[]): string {
  return `plan-${fnv1a64(`${graphFingerprint(graph)}|${canonical(changes)}`)}`;
}

/** The edit that applies a plan: checks the plan id against the flowsheet as it is now, then applies all of it or none. */
export function applyPlanEdit(
  graph: ProcessGraph,
  edit: { changes: PlanChange[]; planId: string }
): { ok: true; graph: ProcessGraph; message: string; steps: PlanStep[] } | { ok: false; error: string } {
  const changes = Array.isArray(edit.changes) ? edit.changes : [];
  if (!edit.planId || planIdFor(graph, changes) !== edit.planId) {
    return {
      ok: false,
      error:
        'This plan is not for the flowsheet as it is now: it changed since the plan was made, or these changes differ from the planned ones. Nothing was changed. Run plan_changes again and show the engineer the new plan.'
    };
  }
  const r = applyPlan(graph, changes);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, graph: r.graph, steps: r.steps, message: `Applied a plan of ${r.steps.length} change${r.steps.length === 1 ? '' : 's'}: ${r.steps.map((s) => s.message.replace(/\.$/, '')).join('; ')}.` };
}
