import { referencedNames } from './expression.js';
import { contractExpressions, type UnitOpContract, type UnitOpParameter } from './contract.js';
import { evaluateUnitOp, type UnitOpEvaluation, type UnitOpEvaluationInput } from './evaluate.js';
import { parseUnit } from './dimensions.js';

/**
 * Whole numbers only: declared integer, or counted in things (nozzles,
 * containers, stations) rather than a fraction. Explored and solved in whole
 * steps, since the engine refuses a queue of 12.5 containers.
 */
export function isWholeNumberParameter(p: UnitOpParameter): boolean {
  if (p.integer) return true;
  const u = p.unit.trim();
  if (['-', '%', '', 'ratio', 'fraction', 'ppm', 'ppb', 'x', '×', 'rad', 'deg', '°', 'dB'].includes(u)) return false;
  const d = parseUnit(u);
  return !!d && d.every((x) => x === 0) && Number.isInteger(p.value);
}

/**
 * Exploring a design around its current point, for the parameters panel and
 * for a model negotiating a contract with the engine.
 *
 * Every answer comes from evaluating the contract itself -- the same
 * evaluator the engine runs -- so "which values of this knob work", "what
 * value makes this check pass" and "what does this knob change" are computed,
 * never guessed from the parameter's name.
 */

export type PointStatus = 'ok' | 'warning' | 'error' | 'invalid';

export interface SweepPoint {
  value: number;
  status: PointStatus;
  /** Ids of the constraints that fail there (ERROR and WARNING). */
  failing: string[];
}

export interface SweepRange {
  from: number;
  to: number;
  log: boolean;
}

/** The range to explore a parameter over: its declared bounds, else a decade either side of its value. */
export function sweepRange(p: UnitOpParameter): SweepRange {
  const v = p.value;
  let from = p.min;
  let to = p.max;
  if (from === undefined || to === undefined) {
    const mag = Math.abs(v) > 0 ? Math.abs(v) : 1;
    if (from === undefined) from = v > 0 && (to === undefined || to > 0) ? Math.max(v / 10, 0) : v - 10 * mag;
    if (to === undefined) to = v > 0 ? v * 10 : v + 10 * mag;
    if (p.min !== undefined) from = Math.max(from, p.min);
    if (p.max !== undefined) to = Math.min(to, p.max);
  }
  if (!(to > from)) to = from + 1;
  const log = from > 0 && to / from >= 50;
  return { from, to, log };
}

const statusOf = (contract: UnitOpContract, overrides: Record<string, number>, input: UnitOpEvaluationInput): { status: PointStatus; failing: string[] } => {
  const ev = evaluateUnitOp(contract, { ...input, parameterOverrides: { ...(input.parameterOverrides ?? {}), ...overrides } });
  if (ev.error) return { status: 'invalid', failing: [] };
  const failing = ev.constraints.filter((c) => !c.satisfied);
  return {
    status: failing.some((c) => c.severity === 'ERROR') ? 'error' : failing.length ? 'warning' : 'ok',
    failing: failing.map((c) => c.id)
  };
};

/** The value at fraction t (0..1) of a range. */
export function atFraction(r: SweepRange, t: number): number {
  return r.log ? r.from * (r.to / r.from) ** t : r.from + (r.to - r.from) * t;
}

/** Where a value sits in a range, 0..1. */
export function fractionOf(r: SweepRange, v: number): number {
  const t = r.log ? Math.log(Math.max(v, r.from) / r.from) / Math.log(r.to / r.from) : (v - r.from) / (r.to - r.from);
  return Math.min(1, Math.max(0, t));
}

/**
 * The design's verdict across one parameter's range, the others held where
 * they are: which values pass every check, which only warn, which fail.
 */
export interface Sweep {
  range: SweepRange;
  points: SweepPoint[];
  /** Where the verdict changes between samples, found by bisection: exact edges of the passing runs. */
  transitions: { value: number; from: PointStatus; to: PointStatus }[];
}

export function sweepParameter(contract: UnitOpContract, name: string, samples = 48, input: UnitOpEvaluationInput = {}, range?: SweepRange): Sweep {
  const p = contract.parameters.find((x) => x.name === name);
  if (!p) return { range: { from: 0, to: 1, log: false }, points: [], transitions: [] };
  const r = range ?? sweepRange(p);
  const whole = isWholeNumberParameter(p);
  const at = (value: number) => statusOf(contract, { [name]: whole ? Math.round(value) : value }, input);
  const points: SweepPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const value = atFraction(r, samples === 1 ? 0 : i / (samples - 1));
    points.push({ value, ...at(value) });
  }
  const transitions: Sweep['transitions'] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (a.status === b.status) continue;
    let lo = a.value;
    let hi = b.value;
    for (let k = 0; k < 18; k++) {
      const mid = r.log && lo > 0 ? Math.sqrt(lo * hi) : (lo + hi) / 2;
      if (at(mid).status === a.status) lo = mid;
      else hi = mid;
    }
    transitions.push({ value: whole ? Math.round(hi) : hi, from: a.status, to: b.status });
  }
  return { range: r, points, transitions };
}

/** A tidy number near v: three significant figures, whole when it is large. */
export function niceValue(v: number): number {
  if (!Number.isFinite(v) || v === 0) return v;
  const mag = Math.floor(Math.log10(Math.abs(v)));
  const step = 10 ** (mag - 2);
  return Number((Math.round(v / step) * step).toPrecision(12));
}

export interface Fix {
  parameter: string;
  /** The value to set it to. */
  value: number;
  /** Constraints this fixes, and whether everything ERROR passes there. */
  fixes: string[];
  allErrorsPass: boolean;
  allPass: boolean;
}

/**
 * The value of one parameter, nearest its current value, at which a failing
 * constraint holds, others held where they are. Searches the parameter's
 * range, then bisects the edge to a tidy value just inside it. Null when no
 * value in range satisfies it.
 */
export function solveForConstraint(contract: UnitOpContract, constraintId: string, parameter: string, input: UnitOpEvaluationInput = {}): Fix | null {
  const p = contract.parameters.find((x) => x.name === parameter);
  if (!p) return null;
  const r = sweepRange(p);
  const whole = isWholeNumberParameter(p);
  const holds = (raw: number): boolean | null => {
    const v = whole ? Math.round(raw) : raw;
    const ev = evaluateUnitOp(contract, { ...input, parameterOverrides: { ...(input.parameterOverrides ?? {}), [parameter]: v } });
    if (ev.error) return null;
    return ev.constraints.find((c) => c.id === constraintId)?.satisfied ?? null;
  };
  const N = 96;
  const vals = Array.from({ length: N }, (_, i) => atFraction(r, i / (N - 1)));
  const ok = vals.map(holds);
  // Edges between a failing and a holding sample, nearest the current value first.
  const edges: { bad: number; good: number }[] = [];
  for (let i = 0; i + 1 < N; i++) {
    if (ok[i] === true && ok[i + 1] === false) edges.push({ good: vals[i]!, bad: vals[i + 1]! });
    if (ok[i] === false && ok[i + 1] === true) edges.push({ bad: vals[i]!, good: vals[i + 1]! });
  }
  if (!edges.length) {
    const any = vals.findIndex((_, i) => ok[i] === true);
    if (any < 0) return null;
    edges.push({ bad: vals[any]!, good: vals[any]! });
  }
  edges.sort((a, b) => Math.abs(a.good - p.value) - Math.abs(b.good - p.value));
  const { bad, good } = edges[0]!;
  let lo = bad;
  let hi = good;
  for (let i = 0; i < 40 && lo !== hi; i++) {
    const mid = r.log && lo > 0 && hi > 0 ? Math.sqrt(lo * hi) : (lo + hi) / 2;
    if (holds(mid) === true) hi = mid;
    else lo = mid;
  }
  // A tidy value on the holding side, a hair in (1 % of the way to the good sample, at least).
  let value = hi;
  const inward = good === hi ? 0 : (good - hi) * 0.01;
  value += inward;
  let tidy = whole ? (good >= bad ? Math.ceil(value) : Math.floor(value)) : niceValue(value);
  if (holds(tidy) !== true) tidy = whole ? Math.round(good) : niceValue(good);
  if (holds(tidy) !== true) tidy = good;
  if (p.min !== undefined) tidy = Math.max(p.min, tidy);
  if (p.max !== undefined) tidy = Math.min(p.max, tidy);
  if (holds(tidy) !== true) return null;
  const ev = evaluateUnitOp(contract, { ...input, parameterOverrides: { ...(input.parameterOverrides ?? {}), [parameter]: tidy } });
  const before = evaluateUnitOp(contract, input);
  const failingBefore = new Set(before.constraints.filter((c) => !c.satisfied).map((c) => c.id));
  return {
    parameter,
    value: tidy,
    fixes: ev.constraints.filter((c) => c.satisfied && failingBefore.has(c.id)).map((c) => c.id),
    allErrorsPass: !ev.error && ev.constraints.every((c) => c.satisfied || c.severity !== 'ERROR'),
    allPass: !ev.error && ev.constraints.every((c) => c.satisfied)
  };
}

/** Which parameters and engine names each derived value, constraint and behavior field reads, followed through derived values. */
export interface Influence {
  /** Parameter -> the derived values it changes. */
  derived: Record<string, string[]>;
  /** Parameter -> the constraints it changes. */
  constraints: Record<string, string[]>;
  /** Parameter -> the behavior and outlet fields it changes (what the engine runs on). */
  behavior: Record<string, string[]>;
  /** Constraint id -> the parameters that can move it. */
  levers: Record<string, string[]>;
}

const safeRefs = (expr: string): string[] => {
  try {
    return referencedNames(expr);
  } catch {
    return [];
  }
};

export function parameterInfluence(contract: UnitOpContract): Influence {
  const params = new Set(contract.parameters.map((p) => p.name));
  // Each derived value's parameters, in declaration order, so later ones inherit earlier ones'.
  const reach = new Map<string, Set<string>>();
  const paramsOf = (expr: string): Set<string> => {
    const out = new Set<string>();
    for (const ref of safeRefs(expr)) {
      if (params.has(ref)) out.add(ref);
      for (const p of reach.get(ref) ?? []) out.add(p);
    }
    return out;
  };
  for (const d of contract.derived) reach.set(d.name, paramsOf(d.expr));
  const derived: Record<string, string[]> = {};
  const constraints: Record<string, string[]> = {};
  const behavior: Record<string, string[]> = {};
  const levers: Record<string, string[]> = {};
  for (const p of params) {
    derived[p] = [];
    constraints[p] = [];
    behavior[p] = [];
  }
  for (const d of contract.derived) for (const p of reach.get(d.name)!) derived[p]!.push(d.name);
  for (const c of contract.constraints) {
    const ps = [...paramsOf(c.expr)];
    levers[c.id] = ps;
    for (const p of ps) constraints[p]!.push(c.id);
  }
  for (const e of contractExpressions(contract)) {
    if (e.path.startsWith('derived.') || e.path.startsWith('constraints.')) continue;
    for (const p of paramsOf(e.expr)) if (!behavior[p]!.includes(e.path)) behavior[p]!.push(e.path);
  }
  return { derived, constraints, behavior, levers };
}

/**
 * Every way to make the failing checks pass by moving one parameter: for each
 * failing constraint, each parameter that can move it, the nearest value that
 * makes it hold. Best first: fixes that clear every ERROR, then those that
 * move the parameter least.
 */
export function suggestFixes(contract: UnitOpContract, input: UnitOpEvaluationInput = {}, limit = 6): Fix[] {
  const ev = evaluateUnitOp(contract, input);
  if (ev.error) return [];
  const failing = ev.constraints.filter((c) => !c.satisfied);
  if (!failing.length) return [];
  const inf = parameterInfluence(contract);
  const out: (Fix & { move: number; severity: number })[] = [];
  for (const c of failing) {
    for (const name of inf.levers[c.id] ?? []) {
      const p = contract.parameters.find((x) => x.name === name)!;
      const fix = solveForConstraint(contract, c.id, name, input);
      if (!fix) continue;
      const r = sweepRange(p);
      out.push({ ...fix, move: Math.abs(fractionOf(r, fix.value) - fractionOf(r, p.value)), severity: c.severity === 'ERROR' ? 0 : 1 });
    }
  }
  out.sort((a, b) => a.severity - b.severity || Number(b.allErrorsPass) - Number(a.allErrorsPass) || Number(b.allPass) - Number(a.allPass) || a.move - b.move);
  const seen = new Set<string>();
  return out
    .filter((f) => {
      const k = `${f.parameter}:${f.value}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit)
    .map(({ move: _m, severity: _s, ...f }) => f);
}

/** What solveForTarget found: the parameter value and the result it gives. */
export interface TargetSolution {
  parameter: string;
  value: number;
  /** The result's value there (the target, when reached). */
  achieved: number;
  /** The target lies inside what the parameter can reach in its range. */
  reached: boolean;
  /** Every ERROR check passes at that value. */
  allErrorsPass: boolean;
}

/**
 * The value of one parameter that brings a calculated result to a target,
 * the others held where they are ("Concentrate Brix = 45 % by varying the
 * steam duty", as a process simulator specifies a result rather than an
 * input). Scans the parameter's range for where the result crosses the
 * target, nearest the current value, and bisects it. When no value in range
 * reaches the target, returns the value that comes closest, reached false.
 * Null when the result cannot be evaluated anywhere in the range.
 */
export function solveForTarget(
  contract: UnitOpContract,
  result: string,
  target: number,
  parameter: string,
  input: UnitOpEvaluationInput = {}
): TargetSolution | null {
  const p = contract.parameters.find((x) => x.name === parameter);
  if (!p || !Number.isFinite(target)) return null;
  const r = sweepRange(p);
  const whole = isWholeNumberParameter(p);
  const at = (raw: number) => {
    const v = whole ? Math.round(raw) : raw;
    const ev = evaluateUnitOp(contract, { ...input, parameterOverrides: { ...(input.parameterOverrides ?? {}), [parameter]: v } });
    const y = ev.error ? undefined : resultsOf(ev)[result];
    return { v, y: y !== undefined && Number.isFinite(y) ? y : undefined, ev };
  };
  const finish = (v: number, reached: boolean): TargetSolution | null => {
    let value = whole ? Math.round(v) : v;
    if (p.min !== undefined) value = Math.max(p.min, value);
    if (p.max !== undefined) value = Math.min(p.max, value);
    const s = at(value);
    if (s.y === undefined) return null;
    return {
      parameter,
      value,
      achieved: s.y,
      reached,
      allErrorsPass: !s.ev.error && s.ev.constraints.every((c) => c.satisfied || c.severity !== 'ERROR')
    };
  };

  const N = 96;
  const samples = Array.from({ length: N }, (_, i) => at(atFraction(r, i / (N - 1))));
  const valid = samples.filter((s) => s.y !== undefined) as { v: number; y: number }[];
  if (!valid.length) return null;

  // Brackets where the result crosses the target, nearest the current value first.
  const brackets: { a: { v: number; y: number }; b: { v: number; y: number } }[] = [];
  for (let i = 0; i + 1 < samples.length; i++) {
    const a = samples[i]!;
    const b = samples[i + 1]!;
    if (a.y === undefined || b.y === undefined) continue;
    if (a.y === target) brackets.push({ a: { v: a.v, y: a.y }, b: { v: a.v, y: a.y } });
    else if ((a.y - target) * (b.y - target) < 0) brackets.push({ a: { v: a.v, y: a.y }, b: { v: b.v, y: b.y } });
  }
  if (!brackets.length) {
    // Out of reach: the closest the parameter gets.
    const best = [...valid].sort((x, y) => Math.abs(x.y - target) - Math.abs(y.y - target))[0]!;
    return finish(best.v, false);
  }
  brackets.sort((x, y) => Math.abs((x.a.v + x.b.v) / 2 - p.value) - Math.abs((y.a.v + y.b.v) / 2 - p.value));
  let { a, b } = brackets[0]!;
  for (let i = 0; i < 60 && a.v !== b.v; i++) {
    const mid = r.log && a.v > 0 && b.v > 0 ? Math.sqrt(a.v * b.v) : (a.v + b.v) / 2;
    const m = at(mid);
    if (m.y === undefined) break;
    if ((a.y - target) * (m.y - target) <= 0) b = { v: mid, y: m.y };
    else a = { v: mid, y: m.y };
    if (Math.abs(m.y - target) <= Math.abs(target) * 1e-9) {
      a = b = { v: mid, y: m.y };
      break;
    }
  }
  const pick = Math.abs(a.y - target) <= Math.abs(b.y - target) ? a : b;
  return finish(pick.v, true);
}

/** One row of a case study: the setting's value, every result there, and the verdict. */
export interface CaseStudyRow {
  value: number;
  derived: Record<string, number>;
  status: PointStatus;
  /** Ids of the constraints that fail there. */
  failing: string[];
}

/**
 * A sensitivity study: the unit evaluated with one setting stepped from
 * `from` to `to` (inclusive, evenly, or geometrically when `log`), the
 * others where they are. Whole-number settings are rounded and repeats dropped.
 */
export function caseStudy(
  contract: UnitOpContract,
  parameter: string,
  from: number,
  to: number,
  steps: number,
  options: { log?: boolean; input?: UnitOpEvaluationInput } = {}
): CaseStudyRow[] {
  const p = contract.parameters.find((x) => x.name === parameter);
  if (!p || !Number.isFinite(from) || !Number.isFinite(to)) return [];
  const n = Math.max(2, Math.min(200, Math.round(steps)));
  const log = Boolean(options.log) && from > 0 && to > 0;
  const whole = isWholeNumberParameter(p);
  const input = options.input ?? {};
  const rows: CaseStudyRow[] = [];
  for (let i = 0; i < n; i++) {
    const raw = atFraction({ from, to, log }, i / (n - 1));
    const value = whole ? Math.round(raw) : raw;
    if (rows.length && rows[rows.length - 1]!.value === value) continue;
    const ev = evaluateUnitOp(contract, { ...input, parameterOverrides: { ...(input.parameterOverrides ?? {}), [parameter]: value } });
    if (ev.error) {
      rows.push({ value, derived: {}, status: 'invalid', failing: [] });
      continue;
    }
    const failing = ev.constraints.filter((c) => !c.satisfied);
    rows.push({
      value,
      derived: resultsOf(ev),
      status: failing.some((c) => c.severity === 'ERROR') ? 'error' : failing.length ? 'warning' : 'ok',
      failing: failing.map((c) => c.id)
    });
  }
  return rows;
}

/** A figure the engine runs the unit on (rate, cycle, capacity, duty), offered alongside the contract's own results. */
export interface EngineResult {
  /** "engine.<field>", never a derived value's name. */
  name: string;
  label: string;
  unit: string;
  value: number;
}

/** What the engine will run, as results: the rate and cycle of a machine, the capacity and duty of a continuous unit. */
export function engineResults(ev: UnitOpEvaluation): EngineResult[] {
  const b = ev.behavior;
  const r = (field: string, label: string, unit: string, value: number | undefined): EngineResult[] =>
    value !== undefined && Number.isFinite(value) ? [{ name: `engine.${field}`, label, unit, value }] : [];
  switch (b.mode) {
    case 'DISCRETE_CYCLE':
      return [...r('unitsPerMinute', 'Rate', 'items/min', b.unitsPerMinute), ...r('cycleSeconds', 'Cycle time', 's', b.cycleSeconds), ...r('unitsPerCycle', 'Units per cycle', 'items', b.unitsPerCycle)];
    case 'CONTINUOUS_RATE':
      return [
        ...r('capacityGpm', 'Capacity', 'gal/min', b.capacityGpm),
        ...r('capacityKgPerHour', 'Capacity (mass)', 'kg/h', b.capacityKgPerHour),
        ...r('dutyKw', 'Duty', 'kW', b.dutyKw),
        ...r('residenceTimeSeconds', 'Residence time', 's', b.residenceTimeSeconds)
      ];
    case 'BATCH':
      return [...r('batchGallons', 'Batch size', 'gal', b.batchGallons), ...r('cycleSecondsEstimate', 'Batch cycle', 's', b.cycleSecondsEstimate), ...r('gallonsPerMinute', 'Average throughput', 'gal/min', b.gallonsPerMinute)];
    case 'STORAGE':
      return [...r('capacityGallons', 'Capacity', 'gal', b.capacityGallons), ...r('maxOutflowGpm', 'Most outflow', 'gal/min', b.maxOutflowGpm)];
  }
}

/** Every result of an evaluation by name: the contract's derived values and the engine's figures. */
export function resultsOf(ev: UnitOpEvaluation): Record<string, number> {
  const out: Record<string, number> = { ...ev.derived };
  for (const e of engineResults(ev)) out[e.name] = e.value;
  return out;
}

/**
 * Parameter -> the engine figures it moves, found by nudging each one: the
 * figures are worked out from several fields, so reading expressions is not
 * enough.
 */
export function engineInfluence(contract: UnitOpContract, input: UnitOpEvaluationInput = {}): Record<string, string[]> {
  const base = evaluateUnitOp(contract, input);
  const before = base.error ? [] : engineResults(base);
  const out: Record<string, string[]> = {};
  for (const p of contract.parameters) {
    out[p.name] = [];
    if (!before.length) continue;
    const whole = isWholeNumberParameter(p);
    let v = p.value === 0 ? (p.max !== undefined && p.max > 0 ? Math.min(1, p.max) : 1) : p.value * 1.1;
    if (whole) v = Math.max(Math.round(v), Math.round(p.value) + 1);
    if (p.max !== undefined && v > p.max) v = p.value === 0 ? p.max : p.value * 0.9;
    if (whole) v = Math.round(v);
    if (v === p.value) continue;
    const ev = evaluateUnitOp(contract, { ...input, parameterOverrides: { ...(input.parameterOverrides ?? {}), [p.name]: v } });
    if (ev.error) continue;
    const after = resultsOf(ev);
    for (const e of before) {
      const a = after[e.name];
      if (a !== undefined && Math.abs(a - e.value) > 1e-9 * Math.max(1, Math.abs(e.value))) out[p.name]!.push(e.name);
    }
  }
  return out;
}
