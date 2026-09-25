import type { ProcessGraph } from './graph.js';
import type { ProcessNode } from './nodes.js';
import { resolveUnit } from './connect.js';

/**
 * Edits an MCP client (or anything else) can make to a flowsheet by naming
 * units the way people do: by id, name or tag. Pure: each returns a new
 * graph, or says why it cannot. The desktop app applies the result; the what-if
 * tool applies it to a copy.
 */

export type FlowsheetEdit =
  | { op: 'update-unit'; unit: string; parameters?: Record<string, unknown>; name?: string }
  | { op: 'remove-unit'; unit: string }
  | { op: 'remove-stream'; stream?: string; from?: string; to?: string };

export interface ParameterChange {
  parameter: string;
  from: unknown;
  to: unknown;
}

export type EditOutcome =
  | { ok: true; graph: ProcessGraph; message: string; unit?: { id: string; name: string }; changes?: ParameterChange[]; removedStreams?: string[]; warnings?: string[] }
  | { ok: false; error: string };

const NESTED_LIMIT = 4;

/** Reads a dotted setting, e.g. "fluid.temperatureCelsius". */
export function getSetting(config: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((at, k) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[k] : undefined), config);
}

/** A copy of `config` with a dotted setting set; nested objects are copied, never shared. */
export function withSetting(config: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  const root = { ...config };
  let at: Record<string, unknown> = root;
  for (const k of keys.slice(0, -1)) {
    const next = at[k];
    at[k] = next && typeof next === 'object' && !Array.isArray(next) ? { ...(next as Record<string, unknown>) } : {};
    at = at[k] as Record<string, unknown>;
  }
  at[keys[keys.length - 1]!] = value;
  return root;
}

function validPath(path: string): string | null {
  const keys = path.split('.');
  if (!path || keys.some((k) => !k)) return `"${path}" is not a setting name.`;
  if (keys.length > NESTED_LIMIT) return `"${path}" is nested too deep.`;
  if (keys.some((k) => k === '__proto__' || k === 'constructor' || k === 'prototype')) return `"${path}" is not allowed.`;
  return null;
}

function updateUnit(graph: ProcessGraph, edit: Extract<FlowsheetEdit, { op: 'update-unit' }>): EditOutcome {
  const found = resolveUnit(graph, String(edit.unit ?? ''));
  if (typeof found === 'string') return { ok: false, error: found };
  const params = edit.parameters && typeof edit.parameters === 'object' ? edit.parameters : {};
  const newName = typeof edit.name === 'string' && edit.name.trim() ? edit.name.trim() : undefined;
  if (Object.keys(params).length === 0 && !newName) {
    return { ok: false, error: 'Nothing to change: give "parameters" (settings by name) or a new "name".' };
  }
  let config = { ...(found.config as Record<string, unknown>) };
  const changes: ParameterChange[] = [];
  const warnings: string[] = [];
  for (const [path, value] of Object.entries(params)) {
    const bad = validPath(path);
    if (bad) return { ok: false, error: bad };
    const before = getSetting(config, path);
    if (typeof before === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      return { ok: false, error: `"${path}" on ${found.name} is a number (now ${before}); ${JSON.stringify(value)} is not.` };
    }
    if (!(path.split('.')[0]! in config)) {
      warnings.push(`${found.name} had no setting "${path.split('.')[0]}"; it was added. If the engine does not read it, it changes nothing.`);
    }
    config = withSetting(config, path, value);
    changes.push({ parameter: path, from: before, to: value });
  }
  const updated = { ...found, config, ...(newName ? { name: newName } : {}) } as ProcessNode;
  const next: ProcessGraph = { ...graph, nodes: graph.nodes.map((n) => (n.id === found.id ? updated : n)) };
  const what = [
    ...changes.map((c) => `${c.parameter} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`),
    ...(newName ? [`renamed to "${newName}"`] : [])
  ].join(', ');
  return {
    ok: true,
    graph: next,
    unit: { id: found.id, name: updated.name },
    changes,
    ...(warnings.length ? { warnings } : {}),
    message: `Updated ${found.name}: ${what}.`
  };
}

function removeUnit(graph: ProcessGraph, edit: Extract<FlowsheetEdit, { op: 'remove-unit' }>): EditOutcome {
  const found = resolveUnit(graph, String(edit.unit ?? ''));
  if (typeof found === 'string') return { ok: false, error: found };
  const dropped = graph.edges.filter((e) => e.sourceNodeId === found.id || e.targetNodeId === found.id);
  return {
    ok: true,
    graph: {
      ...graph,
      nodes: graph.nodes.filter((n) => n.id !== found.id),
      edges: graph.edges.filter((e) => !dropped.includes(e))
    },
    unit: { id: found.id, name: found.name },
    removedStreams: dropped.map((e) => e.id),
    message: `Removed ${found.name}${dropped.length ? ` and its ${dropped.length} stream${dropped.length === 1 ? '' : 's'}` : ''}.`
  };
}

function removeStream(graph: ProcessGraph, edit: Extract<FlowsheetEdit, { op: 'remove-stream' }>): EditOutcome {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
  let matches = graph.edges;
  if (edit.stream) {
    matches = graph.edges.filter((e) => e.id === edit.stream);
    if (!matches.length) return { ok: false, error: `No stream "${edit.stream}". get_open_flowsheet lists them.` };
  } else {
    if (!edit.from || !edit.to) return { ok: false, error: 'Name the stream: its id as "stream", or the units at its ends as "from" and "to".' };
    const from = resolveUnit(graph, edit.from);
    if (typeof from === 'string') return { ok: false, error: from };
    const to = resolveUnit(graph, edit.to);
    if (typeof to === 'string') return { ok: false, error: to };
    matches = graph.edges.filter((e) => e.sourceNodeId === from.id && e.targetNodeId === to.id);
    if (!matches.length) return { ok: false, error: `No stream from ${from.name} to ${to.name}.` };
    if (matches.length > 1) {
      return { ok: false, error: `${matches.length} streams run from ${from.name} to ${to.name}: ${matches.map((e) => e.id).join(', ')}. Give one as "stream".` };
    }
  }
  const e = matches[0]!;
  return {
    ok: true,
    graph: { ...graph, edges: graph.edges.filter((x) => x.id !== e.id) },
    removedStreams: [e.id],
    message: `Removed the stream from ${name(e.sourceNodeId)} to ${name(e.targetNodeId)}.`
  };
}

export function applyFlowsheetEdit(graph: ProcessGraph, edit: FlowsheetEdit): EditOutcome {
  switch (edit?.op) {
    case 'update-unit':
      return updateUnit(graph, edit);
    case 'remove-unit':
      return removeUnit(graph, edit);
    case 'remove-stream':
      return removeStream(graph, edit);
    default:
      return { ok: false, error: `Unknown edit "${String((edit as { op?: unknown })?.op)}".` };
  }
}
