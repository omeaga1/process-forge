import { isTemperatureDifference, parseUnit, unitScale, type Influence, type UnitOpContract, type UnitOpParameter } from '@process-forge/protocol';
import { groupParameters, isConstantParameter, type ParameterGroup } from './parameterUi.js';

/**
 * What a unit's spec sheet shows first, worked out from the contract alone so
 * that every unit (standard, community, or one an AI designed a minute ago)
 * gets the same short sheet without anyone writing a layout for it.
 *
 * A simulator's unit dialog asks for the few specifications that define the
 * equipment (a pump: pressure rise and efficiency) and takes the rest from
 * the streams. Here the same comes from three rules:
 *
 * - The key settings are the ones the engine's verdict turns on: a setting
 *   that moves a check, or what the engine runs the unit at (its capacity,
 *   duty, rate). A contract can name them itself with ui.primary. At most
 *   KEY_SETTINGS; the rest sit under "More settings".
 * - A result is shown once. A derived value that is another quantity again,
 *   in other units (a flow in m3/s beside the capacity in gal/min, a pressure
 *   in kPa beside the setting in psi), is the same number to the engineer.
 * - What the line supplies is not asked for: once a pipe brings the feed in,
 *   the design-point feed only matters before the line runs, so it moves
 *   under "More".
 */

export const KEY_SETTINGS = 6;
export const MORE_SETTINGS = 'More settings';

/** How much of the engine's verdict a setting moves: checks, plus the figures the engine runs on. */
function weight(name: string, influence: Influence, engineMovers: Record<string, string[]>): number {
  return (influence.constraints[name]?.length ?? 0) + (engineMovers[name]?.length ?? 0) + (influence.behavior[name]?.length ?? 0);
}

/** The settings to show first, in the contract's order. */
export function keySettings(contract: UnitOpContract, influence: Influence, engineMovers: Record<string, string[]>): UnitOpParameter[] {
  const tunable = contract.parameters.filter((p) => !p.ui?.advanced && !isConstantParameter(p));
  const named = tunable.filter((p) => p.ui?.primary);
  if (named.length) return named;
  if (tunable.length <= KEY_SETTINGS) return tunable;
  const scored = tunable.map((p, i) => ({ p, i, w: weight(p.name, influence, engineMovers) }));
  const chosen = scored
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .slice(0, KEY_SETTINGS);
  // A contract whose settings move nothing the engine checks: its first few, as written.
  const keep = chosen.length ? chosen : scored.slice(0, KEY_SETTINGS);
  return keep.sort((a, b) => a.i - b.i).map((x) => x.p);
}

/**
 * The sheet's groups: the key settings grouped as before, everything else in
 * one folded group. A contract short enough to read whole is left whole.
 */
export function layoutGroups(contract: UnitOpContract, influence: Influence, engineMovers: Record<string, string[]>): ParameterGroup[] {
  const key = keySettings(contract, influence, engineMovers);
  const rest = contract.parameters.filter((p) => !key.includes(p));
  if (rest.length === 0) return groupParameters(key);
  return [...groupParameters(key), { name: MORE_SETTINGS, params: rest, folded: true }];
}

export interface Quantity {
  name: string;
  label?: string;
  unit: string;
  value: number;
}

/** A value in SI with its dimension, for comparing quantities stated in different units. */
function si(q: Quantity): { dim: string; v: number } | null {
  const dim = parseUnit(q.unit);
  const s = unitScale(q.unit);
  if (!dim || !s || !Number.isFinite(q.value)) return null;
  const offset = isTemperatureDifference({ name: q.name, ...(q.label ? { label: q.label } : {}), unit: q.unit }) ? 0 : (s.o ?? 0);
  return { dim: dim.join(','), v: q.value * s.f + offset };
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b), 1e-12);

/**
 * The results worth a row: each in order, unless it is a quantity already on
 * the sheet (a setting, the feed, or a result above it) in other units. A
 * dimensionless result is never dropped this way: two ratios that happen to
 * agree are not the same thing.
 */
export function distinctResults<T extends Quantity>(results: readonly T[], alreadyShown: readonly Quantity[]): T[] {
  const dimensionless = (q: { dim: string } | null) => !q || /^0(,0)*$/.test(q.dim);
  const seen = alreadyShown.map(si).filter((x): x is { dim: string; v: number } => !dimensionless(x));
  const out: T[] = [];
  for (const r of results) {
    const q = si(r);
    if (q && !dimensionless(q) && seen.some((s) => s.dim === q.dim && same(s.v, q.v))) continue;
    out.push(r);
    if (q && !dimensionless(q)) seen.push(q);
  }
  return out;
}
