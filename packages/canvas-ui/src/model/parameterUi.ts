import {
  alternativeUnits,
  fractionOf,
  parseUnit,
  type Sweep,
  type SweepPoint,
  type UnitOpParameter
} from '@process-forge/protocol';

/**
 * How each parameter of a unit is best edited, decided from the parameter
 * itself: a choice from a list is a select, a yes/no a switch, a count a
 * stepper, a bounded value a slider that shows where the design works, and an
 * open-ended value a field that takes any unit of the same kind. A contract
 * can say otherwise (parameter.ui.control); this is what it gets when it
 * does not.
 */

export type ParameterControlKind = 'select' | 'toggle' | 'stepper' | 'slider' | 'number' | 'fixed';

const FRACTION_UNITS = new Set(['-', '%', 'ratio', 'fraction', 'ppm', 'ppb', '']);

/** A unit that counts things (nozzles, items/min is a rate): dimensionless and not a fraction. */
export function isCountUnit(unit: string): boolean {
  const u = unit.trim();
  if (FRACTION_UNITS.has(u)) return false;
  const d = parseUnit(u);
  return !!d && d.every((x) => x === 0);
}

const TOGGLE_NAME = /^(is|has|use|uses|enable|enabled|with)[A-Z_]|(Enabled|Fitted|Protected|Installed|On|Active)$/;
const TOGGLE_LABEL = /\(\s*1\s*(=\s*)?yes|\b1 yes\b|0 no\b|yes\s*\/\s*no|on\s*\/\s*off/i;

/** A physical constant written as a parameter: its range is a point (R, a critical temperature, a correlation's coefficients). */
export function isConstantParameter(p: UnitOpParameter): boolean {
  return p.min !== undefined && p.max !== undefined && p.max - p.min <= 1e-3 * Math.max(Math.abs(p.max), Math.abs(p.min), 1e-12);
}

export function controlFor(p: UnitOpParameter): ParameterControlKind {
  if (isConstantParameter(p)) return 'fixed';
  const asked = p.ui?.control;
  if (asked === 'select' && p.options?.length) return 'select';
  if (asked && asked !== 'select') {
    if (asked === 'slider' && (p.min === undefined || p.max === undefined)) return 'number';
    return asked;
  }
  if (p.options?.length) return 'select';
  const binary = p.min === 0 && p.max === 1 && (p.value === 0 || p.value === 1);
  if (binary && (p.integer || TOGGLE_NAME.test(p.name) || TOGGLE_LABEL.test(p.label))) return 'toggle';
  if (p.integer || (isCountUnit(p.unit) && Number.isInteger(p.value) && (p.min === undefined || Number.isInteger(p.min)) && (p.max === undefined || Number.isInteger(p.max)))) {
    return 'stepper';
  }
  if (p.min !== undefined && p.max !== undefined && p.max > p.min) return 'slider';
  return 'number';
}

/** Section names, by the kind of quantity, when a contract gives no groups of its own. */
const KIND_GROUPS: [string, string[]][] = [
  ['Flow & capacity', ['gal/min', 'kg/h', 'items/min']],
  ['Temperatures', ['°C']],
  ['Pressures', ['psi']],
  ['Size & geometry', ['m', 'm2', 'm3']],
  ['Energy & power', ['kW', 'kJ']],
  ['Timing', ['s']],
  ['Limits & performance', ['-']]
];

function kindGroup(p: UnitOpParameter): string {
  const d = parseUnit(p.unit);
  if (!d) return 'Other settings';
  if (isCountUnit(p.unit)) return 'Counts';
  for (const [name, units] of KIND_GROUPS) {
    for (const u of units) {
      const g = parseUnit(u);
      if (g && g.every((x, i) => Math.abs(x - d[i]!) < 1e-9)) return name;
    }
  }
  // items/min and rpm are rates (per time).
  if (d[0] === 0 && d[1] === 0 && d[2] === -1 && d[3] === 0) return 'Flow & capacity';
  return 'Properties';
}

export interface ParameterGroup {
  name: string;
  params: UnitOpParameter[];
  /** Shown folded: constants and correlation coefficients. */
  folded: boolean;
}

/**
 * The parameters in sections: the contract's own groups in the order they
 * first appear; otherwise, when there are enough of them to need it, by kind
 * of quantity. Constants (min = max) and advanced ones go last, folded.
 */
export function groupParameters(params: readonly UnitOpParameter[]): ParameterGroup[] {
  const tucked = params.filter((p) => p.ui?.advanced || isConstantParameter(p));
  const shown = params.filter((p) => !tucked.includes(p));
  const declared = shown.some((p) => p.ui?.group);
  const groups: ParameterGroup[] = [];
  const push = (name: string, p: UnitOpParameter) => {
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, params: [], folded: false }));
    g.params.push(p);
  };
  if (declared) for (const p of shown) push(p.ui?.group ?? 'Other settings', p);
  else if (shown.length > 5) {
    for (const p of shown) push(kindGroup(p), p);
    // Keep the order the kinds first appear in, but never leave a section of one when there are few.
  } else if (shown.length) groups.push({ name: 'Parameters', params: [...shown], folded: false });
  if (tucked.length) groups.push({ name: 'Advanced and constants', params: tucked, folded: true });
  return groups;
}

// toLocaleString builds a formatter on every call; a sheet formats hundreds of numbers per edit.
const formatters = new Map<number, Intl.NumberFormat>();
const formatterFor = (digits: number) => {
  let f = formatters.get(digits);
  if (!f) formatters.set(digits, (f = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits })));
  return f;
};

/** A number for a panel: enough figures to read, no more. */
export function formatQuantity(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.001 || a >= 1e7)) return v.toExponential(2);
  return formatterFor(a < 1 ? 4 : a < 10 ? 3 : a < 100 ? 2 : a < 10000 ? 1 : 0).format(v);
}

/** The step for a stepper or the arrow keys: the contract's, else a tidy fraction of the value or range. */
export function stepFor(p: UnitOpParameter): number {
  if (p.ui?.step) return p.ui.step;
  if (p.integer || isCountUnit(p.unit)) return 1;
  const span = p.min !== undefined && p.max !== undefined ? p.max - p.min : Math.abs(p.value) || 1;
  const raw = span / 100;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 2 ? 1 : n < 5 ? 2 : 5) * mag;
}

export interface FeasibleBand {
  /** Colour runs along the track: status from fraction `from` to `to` of the range. */
  segments: { from: number; to: number; status: SweepPoint['status'] }[];
  /** The run of passing values around the current one (or nearest it), in the parameter's unit. */
  passing?: { from: number; to: number; containsValue: boolean };
}

/** The verdict at a value: from the bisected edges when there are any, else the nearest sample. */
export function statusAt(sweep: Sweep, v: number): SweepPoint['status'] {
  if (!sweep.points.length) return 'invalid';
  if (!sweep.transitions.length) {
    const i = Math.round(fractionOf(sweep.range, v) * (sweep.points.length - 1));
    return sweep.points[Math.min(sweep.points.length - 1, Math.max(0, i))]!.status;
  }
  let status = sweep.points[0]!.status;
  for (const t of sweep.transitions) {
    if (v >= t.value) status = t.to;
    else break;
  }
  return status;
}

/** The sweep as coloured runs along the track, and the passing run nearest the value, with exact edges. */
export function feasibleBand(sweep: Sweep, value: number): FeasibleBand {
  const { range, points, transitions } = sweep;
  if (!points.length) return { segments: [] };
  // Runs between the edges, in value terms.
  const runs: { from: number; to: number; status: SweepPoint['status'] }[] = [];
  let from = range.from;
  let status = points[0]!.status;
  for (const t of transitions) {
    runs.push({ from, to: t.value, status });
    from = t.value;
    status = t.to;
  }
  runs.push({ from, to: range.to, status });
  const segments = runs.map((r) => ({ from: fractionOf(range, r.from), to: fractionOf(range, r.to), status: r.status }));
  const ok = runs.filter((r) => r.status === 'ok');
  if (!ok.length) return { segments };
  const containing = ok.find((r) => value >= r.from && value <= r.to);
  if (containing) return { segments, passing: { from: containing.from, to: containing.to, containsValue: true } };
  const t = fractionOf(range, value);
  const gap = (r: { from: number; to: number }) => Math.min(Math.abs(fractionOf(range, r.from) - t), Math.abs(fractionOf(range, r.to) - t));
  const nearest = [...ok].sort((a, b) => gap(a) - gap(b))[0]!;
  return { segments, passing: { from: nearest.from, to: nearest.to, containsValue: false } };
}

/** Units this parameter can be shown in, its own first; empty when it has no alternatives. */
export function displayUnitsFor(p: UnitOpParameter): string[] {
  return alternativeUnits(p.unit);
}

/** A key for remembering the engineer's preferred unit for a kind of quantity (all temperatures, all pressures). */
export function unitPreferenceKey(unit: string): string | null {
  const d = parseUnit(unit);
  if (!d) return null;
  return `${d.join(',')}${/g$/.test(unit.trim()) ? ':gauge' : ''}`;
}
