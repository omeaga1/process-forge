import {
  applyFlowsheetEdit,
  effectiveContract,
  getSetting,
  resolveUnit,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { seedFromString, simulateProcess, type SimulationResult } from '@process-forge/simulation-core';
import { auditRun } from './audit.js';

/**
 * Studies of a whole line, run by the engine so the model never interpolates
 * or iterates by hand:
 *
 *  - sweep_line: one setting across a range, the line simulated at each value
 *    on the same seed, with the results it asks for in a table;
 *  - solve_line_target: a design spec for the line, as a simulator's "vary X
 *    so that Y = target" (Aspen's design spec, DWSIM's Adjust): bracketed
 *    regula falsi (Illinois) over full runs, with the history of every try,
 *    and refused with the nearest value when the target is out of reach.
 *
 * Results are named as metrics:
 *   output.unitsPerMinute, output.kgPerHour, output.gallonsPerMinute    the line's product
 *   <unit>.outletTemperatureC, <unit>.dutyKw, <unit>.kgPerHour,
 *   <unit>.unitsPerMinute, <unit>.oee, <unit>.busyPercent                a unit (id, name or tag)
 *   <unit>.fraction.<component>                                        a unit's (or an outlet's) mass fraction out
 */

export interface StudyVary {
  unit: string;
  parameter: string;
}

const round = (x: number, d = 4) => Number(x.toPrecision(d));

/** The value of a metric in a run, or a reason it has none. */
export function readMetric(graph: ProcessGraph, result: SimulationResult, metric: string): number | { error: string } {
  const minutes = result.durationMinutes || 1;
  const m = metric.trim();
  if (m === 'output.unitsPerMinute') return result.averageLineThroughputUnitsPerMin;
  if (m === 'output.kgPerHour') return (result.totalFluidDeliveredKg / minutes) * 60;
  if (m === 'output.gallonsPerMinute') return result.totalFluidDeliveredGallons / minutes;
  // <unit>.<what>: the unit's name may itself hold dots ("Tank T-1.2"), so try the longest name first.
  const parts = m.split('.');
  for (let cut = parts.length - 1; cut >= 1; cut--) {
    const ref = parts.slice(0, cut).join('.');
    const found = resolveUnit(graph, ref);
    if (typeof found === 'string') continue;
    const what = parts.slice(cut);
    const rep = result.nodeReports[found.id];
    if (!rep) return { error: `${found.name} has no report in this run` };
    const terminal = rep.terminal;
    switch (what[0]) {
      case 'outletTemperatureC': {
        const t = terminal?.temperatureC ?? rep.fluid?.averageOutletTemperatureC;
        return t ?? { error: `${found.name} sent no liquid, so it has no outlet temperature` };
      }
      case 'dutyKw':
        return rep.heat?.averageDutyKw ?? { error: `${found.name} states no duty` };
      case 'kgPerHour':
        return ((terminal ? terminal.kg : rep.fluid?.deliveredKg ?? 0) / minutes) * 60;
      case 'unitsPerMinute':
        return (terminal ? terminal.units : rep.unitsProduced) / minutes;
      case 'oee':
        return rep.overallOeePercentage;
      case 'busyPercent':
        return (rep.busyTimeSeconds / Math.max(1, rep.totalTimeSeconds)) * 100;
      case 'fraction': {
        const c = what[1];
        if (!c) return { error: 'fraction needs a component: <unit>.fraction.<component>' };
        if (terminal) {
          const kg = terminal.componentsKg ?? {};
          const total = Object.values(kg).reduce((a, b) => a + b, 0);
          return total > 0 ? (kg[c] ?? 0) / total : { error: `${found.name} received nothing with a composition` };
        }
        const comp = rep.fluid?.averageOutletComposition;
        return comp ? comp[c] ?? 0 : { error: `${found.name} sent nothing with a composition` };
      }
      default:
        return { error: `"${what.join('.')}" is not a result of a unit: use outletTemperatureC, dutyKw, kgPerHour, unitsPerMinute, oee, busyPercent or fraction.<component>` };
    }
  }
  return { error: `"${m}" names no unit on the flowsheet and is not output.unitsPerMinute, output.kgPerHour or output.gallonsPerMinute` };
}

/** The graph with one setting changed, or why it cannot be. */
function withSetting(graph: ProcessGraph, vary: StudyVary, value: number): { ok: true; graph: ProcessGraph } | { ok: false; error: string } {
  const r = applyFlowsheetEdit(graph, { op: 'update-unit', unit: vary.unit, parameters: { [vary.parameter]: value } });
  return r.ok ? { ok: true, graph: r.graph } : { ok: false, error: r.error };
}

/** A setting's current value and physical range, where the unit's contract declares one. */
function settingRange(graph: ProcessGraph, vary: StudyVary): { node: ProcessNode; current?: number; min?: number; max?: number } | string {
  const node = resolveUnit(graph, vary.unit);
  if (typeof node === 'string') return node;
  const contract = (node.config as { contract?: ReturnType<typeof effectiveContract> }).contract ?? effectiveContract(node, graph.edges);
  const p = contract?.parameters.find((x) => x.name === vary.parameter);
  const raw = p?.value ?? getSetting(node.config as Record<string, unknown>, vary.parameter);
  return { node, ...(typeof raw === 'number' ? { current: raw } : {}), ...(p?.min !== undefined ? { min: p.min } : {}), ...(p?.max !== undefined ? { max: p.max } : {}) };
}

function run(graph: ProcessGraph, minutes: number, seed?: number) {
  const result = simulateProcess(graph, minutes, seed !== undefined ? { seed } : {});
  return { result, audit: auditRun(graph, result) };
}

const DEFAULT_METRICS = ['output.unitsPerMinute', 'output.kgPerHour'];

export interface SweepParams {
  vary: StudyVary;
  values?: number[];
  from?: number;
  to?: number;
  steps?: number;
  metrics?: string[];
  durationMinutes?: number;
}

export function sweepLine(graph: ProcessGraph, params: SweepParams) {
  const vary = params?.vary;
  if (!vary?.unit || !vary?.parameter) return { success: false, error: 'Give "vary": { "unit": ..., "parameter": ... }.' };
  const range = settingRange(graph, vary);
  if (typeof range === 'string') return { success: false, error: range };
  let values = Array.isArray(params.values) ? params.values.filter((v) => typeof v === 'number' && Number.isFinite(v)) : [];
  if (!values.length) {
    const from = params.from ?? range.min;
    const to = params.to ?? range.max;
    if (from === undefined || to === undefined) return { success: false, error: `Give "values", or "from" and "to": ${range.node.name}'s ${vary.parameter} has no declared range.` };
    const steps = Math.max(2, Math.min(15, Math.round(params.steps ?? 7)));
    values = Array.from({ length: steps }, (_, i) => from + ((to - from) * i) / (steps - 1));
  }
  values = values.slice(0, 15);
  const minutes = params.durationMinutes && params.durationMinutes > 0 ? Math.min(params.durationMinutes, 24 * 60) : 60;
  const metrics = (params.metrics?.length ? params.metrics : DEFAULT_METRICS).slice(0, 8);
  const base = run(graph, minutes);
  const seed = base.result.seed;
  const rows = values.map((v) => {
    const g = withSetting(graph, vary, v);
    if (!g.ok) return { value: round(v, 6), error: g.error };
    try {
      const { result, audit } = run(g.graph, minutes, seed);
      const cells = Object.fromEntries(metrics.map((m) => {
        const x = readMetric(g.graph, result, m);
        return [m, typeof x === 'number' ? round(x) : null];
      }));
      return { value: round(v, 6), status: audit.status, ...(audit.issues.some((i) => i.severity !== 'info') ? { issues: audit.issues.filter((i) => i.severity !== 'info').map((i) => i.code) } : {}), ...cells };
    } catch (e) {
      return { value: round(v, 6), status: 'failed', error: (e as Error).message };
    }
  });
  const unreadable = metrics.map((m) => [m, readMetric(graph, base.result, m)] as const).filter(([, x]) => typeof x !== 'number');
  return {
    success: true,
    unit: range.node.name,
    parameter: vary.parameter,
    ...(range.current !== undefined ? { currentValue: range.current } : {}),
    durationMinutes: minutes,
    seed,
    metrics,
    rows,
    ...(unreadable.length ? { metricNotes: Object.fromEntries(unreadable.map(([m, x]) => [m, (x as { error: string }).error])) } : {}),
    note: 'Each row is a full run on the same seed, with only this setting changed; nothing on the flowsheet changed. A row whose status is failed broke an ERROR check (or did not run): do not choose it.'
  };
}

export interface SolveTargetParams {
  vary: StudyVary & { min?: number; max?: number };
  target: { metric: string; value: number; tolerance?: number };
  durationMinutes?: number;
}

export function solveLineTarget(graph: ProcessGraph, params: SolveTargetParams) {
  const vary = params?.vary;
  const target = params?.target;
  if (!vary?.unit || !vary?.parameter) return { success: false, error: 'Give "vary": { "unit": ..., "parameter": ..., "min"?, "max"? }.' };
  if (!target?.metric || typeof target.value !== 'number') return { success: false, error: 'Give "target": { "metric": ..., "value": ... }.' };
  const range = settingRange(graph, vary);
  if (typeof range === 'string') return { success: false, error: range };
  const lo0 = vary.min ?? range.min;
  const hi0 = vary.max ?? range.max;
  if (lo0 === undefined || hi0 === undefined || !(hi0 > lo0)) {
    return { success: false, error: `Give "vary.min" and "vary.max": ${range.node.name}'s ${vary.parameter} has no declared range to search.` };
  }
  const minutes = params.durationMinutes && params.durationMinutes > 0 ? Math.min(params.durationMinutes, 24 * 60) : 60;
  // The seed every run would derive from this flowsheet: all tries share it, so only the setting differs.
  const seed = seedFromString(graph.id);
  const tol = Math.abs(target.tolerance ?? Math.max(Math.abs(target.value) * 0.005, 1e-9));
  const history: { value: number; result: number | null; status: string }[] = [];
  const at = (x: number): { y: number; status: string } | { error: string } => {
    const g = withSetting(graph, vary, x);
    if (!g.ok) return { error: g.error };
    const { result, audit } = run(g.graph, minutes, seed);
    const y = readMetric(g.graph, result, target.metric);
    if (typeof y !== 'number') return { error: y.error };
    history.push({ value: round(x, 6), result: round(y, 6), status: audit.status });
    return { y, status: audit.status };
  };
  // An end of the range where the unit's own design fails its checks is not a
  // place to search: walk it toward the other end (halving) until the design
  // holds, and say where the valid range stops.
  const notes: string[] = [];
  const designHolds = (x: number) => withSetting(graph, vary, x);
  // A value inside the range where the design holds: the current one, else the first of a few tries.
  const anchor = [range.current, (lo0 + hi0) / 2, lo0, hi0, lo0 + (hi0 - lo0) / 4, lo0 + (3 * (hi0 - lo0)) / 4].find(
    (x): x is number => x !== undefined && x >= lo0 && x <= hi0 && designHolds(x).ok
  );
  if (anchor === undefined) {
    const why = designHolds(lo0);
    return { success: false, error: `No value of ${vary.parameter} between ${lo0} and ${hi0} keeps ${range.node.name}'s design valid${!why.ok ? `: ${why.error}` : ''}.` };
  }
  // The end of the valid range on one side: bisect (no simulation, only the design checks) between the anchor and the end.
  const edge = (end: number): number => {
    if (designHolds(end).ok) return end;
    let ok = anchor;
    let bad = end;
    for (let i = 0; i < 40 && Math.abs(bad - ok) > 1e-9 * Math.max(1, Math.abs(ok)); i++) {
      const mid = (ok + bad) / 2;
      if (designHolds(mid).ok) ok = mid;
      else bad = mid;
    }
    return ok;
  };
  const evalAt = (x: number): { x: number; r: { y: number; status: string } } | { error: string } => {
    const r = at(x);
    return 'error' in r ? r : { x, r };
  };
  const va = evalAt(edge(lo0));
  if ('error' in va) return { success: false, error: va.error, history };
  const vb = evalAt(edge(hi0));
  if ('error' in vb) return { success: false, error: vb.error, history };
  if (va.x !== lo0) notes.push(`Below ${round(va.x, 6)} the unit's design fails its checks, so the search starts there.`);
  if (vb.x !== hi0) notes.push(`Above ${round(vb.x, 6)} the unit's design fails its checks, so the search stops there.`);
  let lo = va.x;
  let hi = vb.x;
  const a = va.r;
  const b = vb.r;
  let fa = a.y - target.value;
  let fb = b.y - target.value;
  const finish = (x: number, y: number, status: string, iterations: number) => ({
    success: true,
    solved: true,
    unit: range.node.name,
    parameter: vary.parameter,
    value: round(x, 6),
    ...(range.current !== undefined ? { currentValue: range.current } : {}),
    metric: target.metric,
    achieved: round(y, 6),
    target: target.value,
    status,
    ...(status === 'failed' ? { warning: 'The run at this value FAILED its checks (see simulate_process_line): the target is met only by breaking an ERROR check. Do not apply it as is.' } : {}),
    runs: iterations,
    history,
    durationMinutes: minutes,
    seed,
    ...(notes.length ? { notes } : {}),
    nextStep: `Nothing on the flowsheet changed. To apply: update_unit ${range.node.name} { "${vary.parameter}": ${round(x, 6)} } (or plan it with plan_changes), then simulate to confirm.`
  });
  if (Math.abs(fa) <= tol) return finish(lo, a.y, a.status, 2);
  if (Math.abs(fb) <= tol) return finish(hi, b.y, b.status, 2);
  if (Math.abs(a.y - b.y) <= tol * 1e-3) {
    return { success: true, solved: false, reason: 'insensitive', message: `${target.metric} does not respond to ${range.node.name}'s ${vary.parameter} between ${lo} and ${hi} (${round(a.y)} at both ends): something else limits it. Find what with simulate_process_line.`, history, durationMinutes: minutes, seed };
  }
  if (fa * fb > 0) {
    const nearest = history.reduce((best, h) => (h.result !== null && Math.abs(h.result - target.value) < Math.abs((best.result ?? Infinity) - target.value) ? h : best), history[0]!);
    return {
      success: true,
      solved: false,
      reason: 'out-of-reach',
      message: `${target.metric} runs from ${round(a.y)} to ${round(b.y)} as ${vary.parameter} goes from ${lo} to ${hi}: ${target.value} is not between them. The nearest is ${nearest.result} at ${nearest.value}. Widen the range, if the setting allows, or change something else.`,
      nearest,
      history,
      ...(notes.length ? { notes } : {}),
      durationMinutes: minutes,
      seed
    };
  }
  // Illinois regula falsi: bracketed, so it cannot leave the range; the halving of a stuck end keeps it from stalling.
  let side = 0;
  let last = { x: lo, y: a.y, status: a.status };
  for (let i = 0; i < 14; i++) {
    const x = (lo * fb - hi * fa) / (fb - fa);
    const r = at(x);
    if ('error' in r) return { success: false, error: r.error, history };
    last = { x, y: r.y, status: r.status };
    const fx = r.y - target.value;
    if (Math.abs(fx) <= tol || Math.abs(hi - lo) <= 1e-9 * Math.max(1, Math.abs(x))) return finish(x, r.y, r.status, history.length);
    if (fx * fb > 0) {
      hi = x;
      fb = fx;
      if (side === -1) fa /= 2;
      side = -1;
    } else {
      lo = x;
      fa = fx;
      if (side === 1) fb /= 2;
      side = 1;
    }
  }
  return {
    success: true,
    solved: false,
    reason: 'not-converged',
    message: `No value within ${tol} of the target after ${history.length} runs; the closest was ${round(last.y)} at ${round(last.x, 6)}. A line with random draws or batches can step rather than slide: loosen the tolerance or run longer.`,
    history,
    durationMinutes: minutes,
    seed
  };
}
