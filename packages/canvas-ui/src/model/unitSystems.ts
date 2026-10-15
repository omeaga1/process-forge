import { unitPreferenceKey } from './parameterUi.js';

/**
 * One switch for the units of every quantity on the panel, the way a
 * simulator's unit set works: the units the contract was written in, US
 * customary, or SI. A unit the quantity cannot be shown in is skipped, so a
 * set only names one unit per kind of quantity.
 */
export type UnitSystem = 'design' | 'us' | 'si' | 'mixed';

export const UNIT_SYSTEMS: Record<Exclude<UnitSystem, 'mixed'>, { label: string; title: string; units: string[] }> = {
  design: { label: 'As written', title: "Each figure in the units the unit's contract states it in", units: [] },
  us: { label: 'US', title: 'gal/min, °F, psi, ft, lb/h, hp, BTU/h', units: ['gal/min', '°F', 'psi', 'ft', 'lb/h', 'hp', 'gal', 'lb', 'lb/ft3', 'BTU/lb-°F', 'in'] },
  si: { label: 'SI', title: 'm3/h, °C, kPa, m, kg/h, kW', units: ['m3/h', '°C', 'kPa', 'm', 'kg/h', 'kW', 'm3', 'kg', 'kg/m3', 'kJ/kg-K', 'mm'] }
};

/** The per-kind preferences a system sets: one unit for each kind of quantity. */
export function unitSystemPrefs(system: Exclude<UnitSystem, 'mixed'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const u of UNIT_SYSTEMS[system].units) {
    const key = unitPreferenceKey(u);
    // The first unit named for a kind wins (ft before in, m before mm).
    if (key && !(key in out)) out[key] = u;
  }
  return out;
}
