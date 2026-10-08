import { referencedNames } from './expression.js';
import { contractExpressions, type UnitOpContract, type UnitOpParameter } from './contract.js';
import { evaluateUnitOp, type UnitOpEvaluationInput } from './evaluate.js';
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
