import type { ProcessGraph } from './graph.js';
import type { ProcessNode } from './nodes.js';
import { resolveUnit } from './connect.js';
import { FEED_LIQUID_KEYS, terminalRole } from './terminals.js';
import type { UnitOpContract } from './unitop/contract.js';
import { executeValidateUnitOp } from './unitop/review.js';
import { designSpecsOf, resolveDesignSpecs, type DesignSpec } from './unitop/designSpecs.js';
import { evaluateUnitOp } from './unitop/evaluate.js';
import { engineInfluence, engineResults, parameterInfluence, resultsOf, solveForTarget } from './unitop/explore.js';
import { effectiveContract } from './unitop/standardKinds.js';
import { compactLayout, MAX_SCALE, MIN_SCALE, resolvedLayout, type Rotation } from './layout/placement.js';

/**
 * Edits an MCP client (or anything else) can make to a flowsheet by naming
 * units the way people do: by id, name or tag. Pure: each returns a new
 * graph, or says why it cannot. The desktop app applies the result; the what-if
 * tool applies it to a copy.
 */

export type FlowsheetEdit =
  | { op: 'update-unit'; unit: string; parameters?: Record<string, unknown>; name?: string }
  | { op: 'remove-unit'; unit: string }
  | { op: 'remove-stream'; stream?: string; from?: string; to?: string }
  /** Move, size, turn or mirror a unit on the sheet. Drawing only: the simulation is unchanged. */
  | { op: 'arrange-unit'; unit: string; position?: { x: number; y: number }; scale?: number; rotation?: number; flipX?: boolean }
  /** Give a stream the bends it runs through, or (auto) let it route itself around the equipment. */
  | { op: 'route-stream'; stream?: string; from?: string; to?: string; waypoints?: { x: number; y: number }[]; auto?: boolean }
  /**
   * Hold one of a unit's results at a target by varying one of its settings (a
   * design spec), or release it. The setting is solved now and re-solved after
   * every later change to the unit.
   */
  | { op: 'hold-result'; unit: string; result: string; target?: number; vary?: string; release?: boolean };

export interface ParameterChange {
  parameter: string;
  from: unknown;
  to: unknown;
  /** True when it is one of a designed unit's own parameters (contract.parameters). */
  designParameter?: boolean;
  /** Set by a design spec, re-solved to keep this result at its target. */
  heldFor?: string;
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
  // A designed unit's own parameters live in its contract: that is what the
  // engine evaluates. Changing one re-checks the whole design.
  let contract = config.contract as UnitOpContract | undefined;
  for (const [path, value] of Object.entries(params)) {
    const bad = validPath(path);
    if (bad) return { ok: false, error: bad };
    const declared = contract?.parameters.find((p) => p.name === path);
    if (contract && declared) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, error: `${found.name}'s ${path} is a number (${declared.unit}); ${JSON.stringify(value)} is not.` };
      }
      if ((declared.min !== undefined && value < declared.min) || (declared.max !== undefined && value > declared.max)) {
        return {
          ok: false,
          error: `${found.name}'s ${path} must be between ${declared.min ?? '-inf'} and ${declared.max ?? 'inf'} ${declared.unit} (its physical range); ${value} is outside it.`
        };
      }
      contract = { ...contract, parameters: contract.parameters.map((p) => (p.name === path ? { ...p, value } : p)) };
      config.contract = contract;
      // The inspector reads a mirror of each parameter next to the contract.
      config[path] = value;
      changes.push({ parameter: path, from: declared.value, to: value, designParameter: true });
      continue;
    }
    const before = getSetting(config, path);
    if (typeof before === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      return { ok: false, error: `"${path}" on ${found.name} is a number (now ${before}); ${JSON.stringify(value)} is not.` };
    }
    const feedSetting = terminalRole(found) === 'feed' && (FEED_LIQUID_KEYS as readonly string[]).includes(path);
    if (!feedSetting && !(path.split('.')[0]! in config)) {
      warnings.push(
        `${found.name} had no setting "${path.split('.')[0]}"; it was added. If the engine does not read it, it changes nothing.` +
          (contract ? ` Its design parameters are: ${contract.parameters.map((p) => p.name).join(', ')}.` : '')
      );
    }
    config = withSetting(config, path, value);
    changes.push({ parameter: path, from: before, to: value });
  }
  // Design specs: a setting the engineer (or the AI) set by hand is no longer
  // held; every other hold is re-solved for the unit as it now stands.
  const specs = designSpecsOf(config);
  if (specs.length && changes.length) {
    const edited = new Set(changes.map((c) => c.parameter));
    const kept = specs.filter((h) => !edited.has(h.vary));
    for (const h of specs.filter((x) => edited.has(x.vary))) {
      warnings.push(`${h.vary} was held to keep ${h.result} at ${h.target}; setting it by hand released that hold.`);
    }
    if (kept.length !== specs.length) config.designSpecs = kept;
    const current = contract ?? effectiveContract({ ...found, config } as ProcessNode);
    if (current && kept.length) {
      for (const [name, value] of Object.entries(resolveDesignSpecs(current, kept))) {
        const before = contract?.parameters.find((p) => p.name === name)?.value ?? getSetting(config, name);
        if (before === value) continue;
        if (contract && contract.parameters.some((p) => p.name === name)) {
          contract = { ...contract, parameters: contract.parameters.map((p) => (p.name === name ? { ...p, value } : p)) };
          config.contract = contract;
        }
        config[name] = value;
        changes.push({ parameter: name, from: before, to: value, heldFor: kept.find((h) => h.vary === name)!.result, ...(contract ? { designParameter: true } : {}) });
      }
    }
  }
  if (contract && changes.some((c) => c.designParameter)) {
    const verdict = executeValidateUnitOp({ contract });
    if (verdict.verdict !== 'ACCEPTED') {
      const reasons = Object.values(verdict.gates).flatMap((g) => g.errors);
      return {
        ok: false,
        error: `That change makes ${found.name}'s design fail its checks, so nothing was changed: ${reasons.join('; ') || verdict.revisionGuidance}`
      };
    }
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

function holdResult(graph: ProcessGraph, edit: Extract<FlowsheetEdit, { op: 'hold-result' }>): EditOutcome {
  const found = resolveUnit(graph, String(edit.unit ?? ''));
  if (typeof found === 'string') return { ok: false, error: found };
  const config = { ...(found.config as Record<string, unknown>) };
  const specs = designSpecsOf(config);
  const result = String(edit.result ?? '');
  const commit = (cfg: Record<string, unknown>, message: string, changes: ParameterChange[] = []): EditOutcome => {
    const updated = { ...found, config: cfg } as ProcessNode;
    return { ok: true, graph: { ...graph, nodes: graph.nodes.map((n) => (n.id === found.id ? updated : n)) }, unit: { id: found.id, name: found.name }, changes, message };
  };

  if (edit.release) {
    const kept = specs.filter((h) => h.result !== result && h.vary !== result);
    if (kept.length === specs.length) return { ok: false, error: `${found.name} holds nothing called "${result}". Held: ${specs.map((h) => `${h.result} by ${h.vary}`).join(', ') || 'nothing'}.` };
    return commit({ ...config, designSpecs: kept }, `Released the hold on ${result} on ${found.name}; its setting stays where it is.`);
  }

  let contract = config.contract as UnitOpContract | undefined;
  const current = contract ?? effectiveContract(found);
  if (!current) return { ok: false, error: `${found.name} has no contract to solve: only units the engine models can hold a result.` };
  const ev = evaluateUnitOp(current);
  const values = resultsOf(ev);
  if (values[result] === undefined) {
    const names = [...engineResults(ev).map((e) => e.name), ...current.derived.map((d) => d.name)];
    return { ok: false, error: `${found.name} has no result "${result}". Its results: ${names.join(', ')}.` };
  }
  const target = Number(edit.target);
  if (!Number.isFinite(target)) return { ok: false, error: 'Give "target": the value to hold the result at, in its own unit.' };
  // The settings that move this result: through the equations, or the engine's figures.
  const inf = parameterInfluence(current);
  const eng = engineInfluence(current);
  const movers = current.parameters.filter((p) => (inf.derived[p.name] ?? []).includes(result) || (eng[p.name] ?? []).includes(result)).map((p) => p.name);
  const vary = edit.vary ? String(edit.vary) : movers[0];
  if (!vary || !movers.includes(vary)) {
    return { ok: false, error: `${vary ? `${vary} does not move ${result}` : `Nothing moves ${result}`}. Settings that do: ${movers.join(', ') || 'none'}.` };
  }
  const solved = solveForTarget(current, result, target, vary);
  if (!solved) return { ok: false, error: `The engine could not evaluate ${found.name} while varying ${vary}.` };
  if (!solved.reached) {
    return { ok: false, error: `${result} cannot reach ${target} by varying ${vary} within its range: the closest is ${Number(solved.achieved.toPrecision(5))} at ${vary} = ${Number(solved.value.toPrecision(5))}. Nothing was changed.` };
  }
  const before = current.parameters.find((p) => p.name === vary)?.value;
  const spec: DesignSpec = { result, target, vary };
  const next = { ...config, [vary]: solved.value, designSpecs: [...specs.filter((h) => h.vary !== vary && h.result !== result), spec] };
  if (contract) {
    contract = { ...contract, parameters: contract.parameters.map((p) => (p.name === vary ? { ...p, value: solved.value } : p)) };
    next.contract = contract;
  }
  return commit(
    next,
    `${found.name} now holds ${result} at ${target} by varying ${vary} (${Number(solved.value.toPrecision(5))} now); it is re-solved after every change to the unit.${solved.allErrorsPass ? '' : ' A check fails at that value.'}`,
    [{ parameter: vary, from: before, to: solved.value, heldFor: result, ...(contract ? { designParameter: true } : {}) }]
  );
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

function arrangeUnit(graph: ProcessGraph, edit: Extract<FlowsheetEdit, { op: 'arrange-unit' }>): EditOutcome {
  const found = resolveUnit(graph, String(edit.unit ?? ''));
  if (typeof found === 'string') return { ok: false, error: found };
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (edit.position !== undefined && !(finite(edit.position?.x) && finite(edit.position?.y))) {
    return { ok: false, error: 'position is { x, y } in canvas pixels.' };
  }
  if (edit.scale !== undefined && !(finite(edit.scale) && edit.scale >= MIN_SCALE && edit.scale <= MAX_SCALE)) {
    return { ok: false, error: `scale is the size against the drawing's natural size, ${MIN_SCALE} to ${MAX_SCALE} (1 is natural).` };
  }
  let rotation: Rotation | undefined;
  if (edit.rotation !== undefined) {
    const r = (((Math.round(Number(edit.rotation)) % 360) + 360) % 360);
    if (!finite(edit.rotation) || r % 90 !== 0) return { ok: false, error: 'rotation is clockwise in quarter turns: 0, 90, 180 or 270 degrees.' };
    rotation = r as Rotation;
  }
  if (edit.position === undefined && edit.scale === undefined && rotation === undefined && edit.flipX === undefined) {
    return { ok: false, error: 'Nothing to change: give position, scale, rotation or flipX.' };
  }
  const was = resolvedLayout(found.layout);
  const layout = compactLayout({
    scale: edit.scale ?? was.scale,
    rotation: rotation ?? was.rotation,
    flipX: edit.flipX ?? was.flipX
  });
  const { layout: _old, ...rest } = found;
  const updated: ProcessNode = { ...rest, ...(layout ? { layout } : {}), ...(edit.position ? { position: { x: edit.position.x, y: edit.position.y } } : {}) };
  const now = resolvedLayout(layout);
  const what = [
    ...(edit.position ? [`moved to (${Math.round(edit.position.x)}, ${Math.round(edit.position.y)})`] : []),
    ...(now.scale !== was.scale ? [`sized to ${Math.round(now.scale * 100)} %`] : []),
    ...(now.rotation !== was.rotation ? [`turned to ${now.rotation}°`] : []),
    ...(now.flipX !== was.flipX ? [now.flipX ? 'mirrored' : 'unmirrored'] : [])
  ];
  return {
    ok: true,
    graph: { ...graph, nodes: graph.nodes.map((n) => (n.id === found.id ? updated : n)) },
    unit: { id: found.id, name: found.name },
    message: `${found.name}: ${what.join(', ') || 'unchanged'}. Its pipes stay on their nozzles; a pipe with bends of its own keeps them.`
  };
}

function routeStream(graph: ProcessGraph, edit: Extract<FlowsheetEdit, { op: 'route-stream' }>): EditOutcome {
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
    if (matches.length > 1) return { ok: false, error: `${matches.length} streams run from ${from.name} to ${to.name}: ${matches.map((e) => e.id).join(', ')}. Give one as "stream".` };
  }
  const e = matches[0]!;
  const auto = edit.auto === true || !edit.waypoints?.length;
  if (!auto) {
    if (edit.waypoints!.length > 64) return { ok: false, error: 'At most 64 bends.' };
    if (!edit.waypoints!.every((w) => Number.isFinite(w?.x) && Number.isFinite(w?.y))) return { ok: false, error: 'waypoints are [{ x, y }, ...] in canvas pixels.' };
  }
  const { waypoints: _old, ...rest } = e;
  const updated = auto ? rest : { ...rest, waypoints: edit.waypoints!.map((w) => ({ x: Math.round(w.x), y: Math.round(w.y) })) };
  return {
    ok: true,
    graph: { ...graph, edges: graph.edges.map((x) => (x.id === e.id ? updated : x)) },
    message: auto
      ? `The stream from ${name(e.sourceNodeId)} to ${name(e.targetNodeId)} now routes itself around the equipment.`
      : `The stream from ${name(e.sourceNodeId)} to ${name(e.targetNodeId)} now runs through ${edit.waypoints!.length} bend${edit.waypoints!.length === 1 ? '' : 's'}, joined square.`
  };
}

export function applyFlowsheetEdit(graph: ProcessGraph, edit: FlowsheetEdit): EditOutcome {
  switch (edit?.op) {
    case 'arrange-unit':
      return arrangeUnit(graph, edit);
    case 'route-stream':
      return routeStream(graph, edit);
    case 'update-unit':
      return updateUnit(graph, edit);
    case 'hold-result':
      return holdResult(graph, edit);
    case 'remove-unit':
      return removeUnit(graph, edit);
    case 'remove-stream':
      return removeStream(graph, edit);
    default:
      return { ok: false, error: `Unknown edit "${String((edit as { op?: unknown })?.op)}".` };
  }
}
