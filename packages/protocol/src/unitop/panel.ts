import type { UnitOpContract, UnitOpPanelWidget } from './contract.js';
import { evaluateUnitOp, type UnitOpEvaluation, type UnitOpEvaluationInput } from './evaluate.js';
import { caseStudy, engineInfluence, engineResults, resultsOf, sweepRange, type PointStatus } from './explore.js';
import { parseExpression } from './expression.js';

/**
 * A unit's panel at a glance, worked out: the contract says which figures,
 * gauges, trends and notes to show (contract.panel), from a catalog the app
 * draws itself, and this fills each one in from the engine. A contract with
 * no panel gets one built from its checks. Nothing here is drawn: the app
 * renders it, and an MCP client can read it as it is.
 */

export type GaugeStatus = 'ok' | 'tight' | 'warning' | 'error';

export type ResolvedPanelWidget =
  | { kind: 'figure'; name: string; label: string; unit: string; value: number }
  | {
      kind: 'gauge';
      label: string;
      unit: string;
      value: number;
      /** The scale. */
      min: number;
      max: number;
      /** A check's limit, on the same scale. */
      limit?: number;
      /** A check: whether the value has to stay below its limit or above it. */
      keep?: 'below' | 'above';
      status: GaugeStatus;
      /** "82% of the limit", "needs 392 s, has 320 s". */
      caption: string;
      check?: string;
      /** The check's own message when it fails. */
      message?: string;
    }
  | {
      kind: 'trend';
      label: string;
      unit: string;
      over: { name: string; label: string; unit: string; value: number; log: boolean };
      points: { x: number; y: number; status: PointStatus }[];
      /** The design point. */
      at: { x: number; y: number };
    }
  | { kind: 'note'; text: string; tone: 'info' | 'caution' };

/** "beltHasCapacity", "belt_has_capacity" -> "Belt has capacity". */
export function humaniseId(id: string): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface Named {
  label: string;
  unit: string;
  value: number;
}

function lookupResult(contract: UnitOpContract, ev: UnitOpEvaluation, name: string, results: Record<string, number>): Named | undefined {
  const p = contract.parameters.find((x) => x.name === name);
  if (p) return { label: p.label, unit: p.unit, value: ev.parameters[name] ?? p.value };
  const d = contract.derived.find((x) => x.name === name);
  if (d) return ev.derived[name] !== undefined ? { label: d.label, unit: d.unit, value: ev.derived[name]! } : undefined;
  const e = engineResults(ev).find((x) => x.name === name);
  if (e) return { label: e.label, unit: e.unit, value: e.value };
  return results[name] !== undefined ? { label: name, unit: '', value: results[name]! } : undefined;
}

/** The unit a check's sides are in, when one side is a bare name. */
function checkUnit(contract: UnitOpContract, expr: string): string {
  try {
    const ast = parseExpression(expr);
    if (ast.k !== 'bin') return '';
    for (const side of [ast.a, ast.b]) {
      if (side.k !== 'ref') continue;
      const named = contract.parameters.find((p) => p.name === side.name) ?? contract.derived.find((d) => d.name === side.name);
      if (named) return named.unit;
    }
  } catch {
    // An unparsable check has no sides to gauge.
  }
  return '';
}

const fmt = (v: number) => {
  const a = Math.abs(v);
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(v);
};

function checkGauge(contract: UnitOpContract, ev: UnitOpEvaluation, id: string, label?: string): ResolvedPanelWidget | undefined {
  const c = ev.constraints.find((x) => x.id === id);
  const decl = contract.constraints.find((x) => x.id === id);
  if (!c?.sides || !decl) return undefined;
  const { value, limit, op } = c.sides;
  const keep = op === '<' || op === '<=' ? 'below' : 'above';
  const unit = checkUnit(contract, decl.expr);
  const lo = Math.min(0, value, limit);
  const top = Math.max(value, limit);
  const max = top > lo ? top + 0.25 * (top - lo) : lo + 1;
  // Headroom as a share of the limit: how far the value can move before the check flips.
  const headroom = keep === 'below' ? (limit - value) / Math.max(Math.abs(limit), 1e-12) : (value - limit) / Math.max(Math.abs(limit), 1e-12);
  const status: GaugeStatus = !c.satisfied ? (c.severity === 'ERROR' ? 'error' : 'warning') : headroom < 0.1 ? 'tight' : 'ok';
  const u = unit && unit !== '-' ? ` ${unit}` : '';
  const share = limit !== 0 && value >= 0 && limit > 0 ? Math.round((keep === 'below' ? value / limit : limit / Math.max(value, 1e-12)) * 100) : undefined;
  const caption = c.satisfied
    ? keep === 'below'
      ? `${fmt(value)}${u} against a limit of ${fmt(limit)}${u}${share !== undefined ? ` (${share}%)` : ''}`
      : `${fmt(value)}${u}, needs at least ${fmt(limit)}${u}`
    : keep === 'below'
      ? `${fmt(value)}${u}, over the limit of ${fmt(limit)}${u}`
      : `needs ${fmt(limit)}${u}, has ${fmt(value)}${u}`;
  return {
    kind: 'gauge',
    label: label ?? humaniseId(id),
    unit,
    value,
    min: lo,
    max,
    limit,
    keep,
    status,
    caption,
    check: id,
    ...(c.satisfied ? {} : { message: c.message })
  };
}

function trend(contract: UnitOpContract, ev: UnitOpEvaluation, result: string, over: string, input: UnitOpEvaluationInput, label?: string): ResolvedPanelWidget | undefined {
  const p = contract.parameters.find((x) => x.name === over);
  const now = lookupResult(contract, ev, result, resultsOf(ev));
  if (!p || !now) return undefined;
  const r = sweepRange(p);
  const rows = caseStudy(contract, over, r.from, r.to, 33, { log: r.log, input });
  const points = rows.flatMap((row) => (row.derived[result] !== undefined && Number.isFinite(row.derived[result]) ? [{ x: row.value, y: row.derived[result]!, status: row.status }] : []));
  if (points.length < 2) return undefined;
  return {
    kind: 'trend',
    label: label ?? `${now.label} against ${p.label.toLowerCase()}`,
    unit: now.unit,
    over: { name: p.name, label: p.label, unit: p.unit, value: ev.parameters[over] ?? p.value, log: r.log },
    points,
    at: { x: ev.parameters[over] ?? p.value, y: now.value }
  };
}

/** What a contract with no panel of its own shows: a gauge for every check that has a limit, then the main figure against what moves it most. */
export function defaultPanel(contract: UnitOpContract, ev: UnitOpEvaluation, input: UnitOpEvaluationInput = {}): UnitOpPanelWidget[] {
  const rank: Record<string, number> = { error: 0, warning: 1, tight: 2, ok: 3 };
  const gauges = ev.constraints
    .filter((c) => c.sides)
    .map((c) => ({ id: c.id, g: checkGauge(contract, ev, c.id) }))
    .filter((x) => x.g)
    .sort((a, b) => rank[(a.g as { status: GaugeStatus }).status]! - rank[(b.g as { status: GaugeStatus }).status]!)
    .slice(0, 6)
    .map((x): UnitOpPanelWidget => ({ kind: 'gauge', check: x.id }));
  const out: UnitOpPanelWidget[] = [...gauges];
  if (!contract.parameters.length) return out;
  // The rate first, then the rest; never a figure that only repeats one setting (a batch's volume, a tank's capacity).
  const preferred = ['unitsPerMinute', 'gallonsPerMinute', 'capacityGpm', 'capacityKgPerHour', 'dutyKw', 'residenceTimeSeconds', 'cycleSeconds', 'cycleSecondsEstimate'];
  const figures = engineResults(ev)
    .filter((e) => !contract.parameters.some((p) => Math.abs((ev.parameters[p.name] ?? p.value) - e.value) <= 1e-9 * Math.max(1, Math.abs(e.value))))
    .sort((a, b) => (preferred.indexOf(a.name.slice(7)) + 1 || 99) - (preferred.indexOf(b.name.slice(7)) + 1 || 99));
  const movers = engineInfluence(contract, input);
  // A figure in plain proportion to a setting (a capacity that is the rated flow) is a straight line with nothing to read.
  const proportional = (figure: string, over: string, at: number): boolean => {
    const twice = evaluateUnitOp(contract, { ...input, parameterOverrides: { ...(input.parameterOverrides ?? {}), [over]: at * 2 } });
    const now = resultsOf(ev)[figure];
    const then = twice.error ? undefined : resultsOf(twice)[figure];
    return now === undefined || then === undefined || Math.abs(then - 2 * now) <= 1e-6 * Math.max(1, Math.abs(now));
  };
  for (const main of figures) {
    const over = contract.parameters.find(
      (p) => (movers[p.name] ?? []).includes(main.name) && !p.ui?.advanced && !(p.min !== undefined && p.min === p.max) && p.value !== 0 && !proportional(main.name, p.name, ev.parameters[p.name] ?? p.value)
    );
    if (over) {
      out.push({ kind: 'trend', result: main.name, over: over.name });
      break;
    }
  }
  return out;
}

/**
 * The panel, filled in: the contract's own widgets, or the default ones. A
 * widget whose figures cannot be worked out here (the design does not
 * evaluate, a check is not a comparison) is left out rather than drawn wrong.
 */
export function resolvePanel(contract: UnitOpContract, evaluation?: UnitOpEvaluation, input: UnitOpEvaluationInput = {}): { declared: boolean; widgets: ResolvedPanelWidget[] } {
  const ev = evaluation ?? evaluateUnitOp(contract, input);
  const declared = Boolean(contract.panel?.length);
  if (ev.error) {
    return { declared, widgets: (contract.panel ?? []).flatMap((w) => (w.kind === 'note' ? [{ kind: 'note' as const, text: w.text, tone: w.tone ?? 'info' }] : [])) };
  }
  const spec = declared ? contract.panel! : defaultPanel(contract, ev, input);
  const results = resultsOf(ev);
  const widgets = spec.flatMap((w): ResolvedPanelWidget[] => {
    switch (w.kind) {
      case 'figure': {
        const r = lookupResult(contract, ev, w.result, results);
        return r ? [{ kind: 'figure', name: w.result, label: w.label ?? r.label, unit: r.unit, value: r.value }] : [];
      }
      case 'gauge': {
        if (w.check) {
          const g = checkGauge(contract, ev, w.check, w.label);
          return g ? [g] : [];
        }
        const r = w.result ? lookupResult(contract, ev, w.result, results) : undefined;
        if (!r || w.max === undefined) return [];
        const min = w.min ?? 0;
        const status: GaugeStatus = r.value > w.max || r.value < min ? 'warning' : 'ok';
        const u = r.unit && r.unit !== '-' ? ` ${r.unit}` : '';
        return [{ kind: 'gauge', label: w.label ?? r.label, unit: r.unit, value: r.value, min, max: w.max, status, caption: `${fmt(r.value)}${u} on a scale of ${fmt(min)} to ${fmt(w.max)}${u}` }];
      }
      case 'trend': {
        const t = trend(contract, ev, w.result, w.over, input, w.label);
        return t ? [t] : [];
      }
      case 'note':
        return [{ kind: 'note', text: w.text, tone: w.tone ?? 'info' }];
    }
  });
  return { declared, widgets };
}
