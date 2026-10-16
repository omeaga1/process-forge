/**
 * Solubility of crystallising solutes in water, so a crystalliser's yield
 * follows from how much stays dissolved at its final temperature instead of
 * from a number someone typed in.
 *
 * Each curve is a table of the saturated solution's strength, g of anhydrous
 * solute per 100 g of water, at the temperatures the CRC Handbook of
 * Chemistry and Physics lists (the "Solubility of common inorganic compounds
 * in water" table); between points the curve is linear, and outside them the
 * function errors rather than extrapolates.
 *
 * `hydrate` is the water of crystallisation the solid that forms carries, in
 * kg per kg of anhydrous solute (MgSO4·7H2O: 7 × 18.015 / 120.37 = 1.0476).
 * It matters: those crystals take water out of the liquor with them.
 */

import { findComponent } from './components.js';

interface SolubilityCurve {
  name: string;
  aliases: string[];
  /** [°C, g anhydrous solute per 100 g water], ascending in temperature. */
  points: [number, number][];
  /** kg of water of crystallisation per kg of anhydrous solute, for the solid that forms from cool solution. */
  hydrate: number;
  source: string;
}

const CRC = 'CRC Handbook of Chemistry and Physics, solubility of common inorganic compounds in water';

const CURVES: SolubilityCurve[] = [
  {
    name: 'magnesium_sulfate',
    aliases: [],
    points: [[0, 22.0], [20, 33.7], [40, 44.5], [60, 54.6], [80, 64.2], [100, 73.8]],
    hydrate: (7 * 18.015) / 120.366,
    source: CRC
  },
  {
    name: 'potassium_nitrate',
    aliases: [],
    points: [[0, 13.3], [20, 31.6], [40, 63.9], [60, 110.0], [80, 169.0], [100, 246.0]],
    hydrate: 0,
    source: CRC
  },
  {
    name: 'potassium_chloride',
    aliases: [],
    points: [[0, 28.0], [20, 34.2], [40, 40.1], [60, 45.8], [80, 51.3], [100, 56.3]],
    hydrate: 0,
    source: CRC
  },
  {
    name: 'sodium_chloride',
    aliases: [],
    points: [[0, 35.7], [20, 35.9], [40, 36.4], [60, 37.1], [80, 38.0], [100, 39.2]],
    hydrate: 0,
    source: CRC
  }
];

export class SolubilityError extends Error {}

/** The curve for a component, by any name the component database knows it by (mgso4, epsom salt, magnesium_sulfate). */
export function findSolubility(name: string): SolubilityCurve | undefined {
  const id = findComponent(name)?.id ?? name.trim().toLowerCase();
  return CURVES.find((c) => c.name === id || c.aliases.includes(id));
}

export const SOLUBILITY_SOLUTES = CURVES.map((c) => c.name);

/** Saturated strength, kg anhydrous solute per kg of water, at T °C. */
export function solubilityKgPerKgWater(name: string, tC: number): number {
  const c = findSolubility(name);
  if (!c) throw new SolubilityError(`no solubility data for "${name}" (have: ${SOLUBILITY_SOLUTES.join(', ')})`);
  const pts = c.points;
  const lo = pts[0]!;
  const hi = pts[pts.length - 1]!;
  if (tC < lo[0] || tC > hi[0]) throw new SolubilityError(`${c.name} solubility is tabulated ${lo[0]}-${hi[0]} °C, not ${tC} °C`);
  for (let i = 1; i < pts.length; i++) {
    const [t1, s1] = pts[i]!;
    if (tC <= t1) {
      const [t0, s0] = pts[i - 1]!;
      return (s0 + ((s1 - s0) * (tC - t0)) / (t1 - t0)) / 100;
    }
  }
  return hi[1] / 100;
}

/** Saturated solution's mass fraction of anhydrous solute, at T °C. */
export function solubilityMassFraction(name: string, tC: number): number {
  const s = solubilityKgPerKgWater(name, tC);
  return s / (1 + s);
}

/** kg of water of crystallisation per kg of anhydrous solute in the solid that forms. */
export function hydrateWaterPerKg(name: string): number {
  const c = findSolubility(name);
  if (!c) throw new SolubilityError(`no solubility data for "${name}" (have: ${SOLUBILITY_SOLUTES.join(', ')})`);
  return c.hydrate;
}

/**
 * The fraction of the dissolved solute that crystallises when a solution of
 * mass fraction `w` (anhydrous basis) is cooled to `tC` and comes to
 * equilibrium. Water bound in the crystals leaves with them, so
 *   x = (S - c·W) / (1 - h·c)
 * with S solute and W water in the feed, c the saturation strength at tC
 * (kg/kg water) and h the hydrate water per kg of solute. 0 when the feed is
 * already below saturation.
 */
export function crystalYieldFraction(name: string, w: number, tC: number): number {
  const c = solubilityKgPerKgWater(name, tC);
  const h = hydrateWaterPerKg(name);
  if (!(w > 0)) return 0;
  const S = w;
  const W = 1 - w;
  const x = (S - c * W) / (1 - h * c);
  if (1 - h * c <= 0) throw new SolubilityError(`${name}: the crystals would hold more water than the liquor at ${tC} °C`);
  return Math.min(1, Math.max(0, x / S));
}
