import { COMPONENT_DATA } from './componentData.js';
import { closestNames, editDistance } from '../nearest.js';
import { waterCp, waterHvap, waterPsat, waterRho, waterTsat } from './water.js';

/**
 * Pure-component properties: enough thermodynamics for a contract to boil,
 * condense, dry, heat and mix real chemicals without inventing the numbers.
 *
 * A model asked to design an ethanol stripper will otherwise type in a
 * vapour pressure from memory, and it will be plausible and wrong. Here the
 * engine supplies it, from published correlations, with the range each one
 * holds over, and refuses a name it does not know (with the names it
 * probably meant) rather than guess.
 *
 * Per component (componentData.ts, generated from the Poling, PSRK and CRC
 * tables in Caleb Bell's MIT-licensed `chemicals`): molar mass, critical
 * temperature and pressure, acentric factor, normal boiling point, heat of
 * vaporisation there, Antoine constants with their range, ideal-gas heat
 * capacity polynomial, liquid heat capacity at 25 °C, liquid density at
 * 20 °C and the Rackett parameter Z_RA.
 *
 * Correlations:
 *  - vapour pressure: Antoine (log10 P/Pa = A − B/(T/K + C)) inside its range;
 *    outside it, Lee–Kesler scaled to meet Antoine at the nearer end, so the
 *    curve is continuous up to the critical point. Water: IAPWS-IF97.
 *  - heat of vaporisation: Watson, ΔH(T) = ΔH(Tb)·((Tc − T)/(Tc − Tb))^0.38.
 *  - ideal-gas heat capacity: Cp/R = a0 + a1 T + a2 T² + a3 T³ + a4 T⁴ (Poling).
 *  - liquid density: the 20 °C value carried to T by Rackett's ratio
 *    V(T)/V(20 °C) = Z_RA^((1 − Tr)^(2/7) − (1 − Tr20)^(2/7)). Water: Kell.
 */

export interface ComponentData {
  id: string;
  name: string;
  cas?: string;
  formula?: string;
  /** kg/kmol. */
  molarMass: number;
  aliases: string[];
  tcK?: number;
  pcKpa?: number;
  omega?: number;
  /** Normal boiling point, K. */
  tbK?: number;
  /** Heat of vaporisation at the normal boiling point, kJ/kg. */
  hvapTbKjPerKg?: number;
  antoine?: { A: number; B: number; C: number; tminK: number; tmaxK: number };
  /** Liquid heat capacity at 25 °C, kJ/kg·K. */
  cpLiquidKjPerKgK?: number;
  /** Ideal-gas Cp/R polynomial in T (K), with its range. */
  cpGas?: { a: number[]; tminK: number; tmaxK: number };
  cpGas298KjPerKgK?: number;
  rhoLiquid20KgPerM3?: number;
  zRa?: number;
  /**
   * Dissolves or suspends but does not evaporate (a sugar, a salt): no vapour
   * pressure, a solid heat capacity, and an apparent density for what it adds
   * to a solution's volume.
   */
  nonVolatile?: boolean;
  /** Where the figures come from. */
  source?: string;
}

const R = 8.314462618; // J/(mol·K) = kJ/(kmol·K)

/**
 * Components the generated tables do not hold: air as one gas, and solutes
 * that do not evaporate. A solute's heat capacity and density are what it
 * adds to a water solution, from Choi & Okos (1986), the model food
 * engineering uses for this (carbohydrate: cp = 1.5488 + 1.9625e-3 T,
 * rho = 1599.1 - 0.31046 T; ash: cp = 1.0926 + 1.8896e-3 T, T in °C, here at
 * 20 °C), which matches measured sugar solutions far better than the
 * crystal's own heat capacity.
 */
const EXTRA: ComponentData[] = [
  {
    id: 'air',
    name: 'Air (dry)',
    molarMass: 28.965,
    aliases: ['dry_air'],
    tcK: 132.5,
    pcKpa: 3786,
    omega: 0.035,
    // 79 % nitrogen, 21 % oxygen by mole, from their Poling polynomials.
    cpGas: { a: [3.55811, -0.00058293, 0.0000014371, -1.97e-11, -4.062e-13], tminK: 50, tmaxK: 1000 },
    cpGas298KjPerKgK: 1.005,
    source: 'Pseudo-critical constants (Lemmon et al. 2000); Cp from N2 and O2 (Poling).'
  },
  {
    id: 'sucrose',
    name: 'Sucrose',
    formula: 'C12H22O11',
    molarMass: 342.3,
    aliases: ['sugar', 'saccharose', 'brix'],
    nonVolatile: true,
    cpLiquidKjPerKgK: 1.588,
    rhoLiquid20KgPerM3: 1592.9,
    source: 'In solution: Choi & Okos (1986) carbohydrate model at 20 °C.'
  },
  {
    id: 'glucose',
    name: 'Glucose (dextrose)',
    formula: 'C6H12O6',
    molarMass: 180.156,
    aliases: ['dextrose', 'd_glucose'],
    nonVolatile: true,
    cpLiquidKjPerKgK: 1.588,
    rhoLiquid20KgPerM3: 1592.9,
    source: 'In solution: Choi & Okos (1986) carbohydrate model at 20 °C.'
  },
  {
    id: 'sodium_chloride',
    name: 'Sodium chloride',
    formula: 'NaCl',
    molarMass: 58.443,
    aliases: ['salt', 'nacl', 'brine_salt'],
    nonVolatile: true,
    cpLiquidKjPerKgK: 1.130,
    rhoLiquid20KgPerM3: 2165,
    source: 'Heat capacity in solution: Choi & Okos (1986) ash model at 20 °C; density: the crystal (CRC).'
  }
];

const POLING = 'Antoine and heat capacities: Poling, Prausnitz & O\'Connell, The Properties of Gases and Liquids, 5th ed.; critical constants: PSRK rev. 4; ΔHvap at Tb: CRC Handbook; via chemicals (MIT).';

export const COMPONENTS: readonly ComponentData[] = [...COMPONENT_DATA.map((c) => ({ ...c, source: POLING })), ...EXTRA];

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s\-,]+/g, '_');
const BY_NAME = new Map<string, ComponentData>();
for (const c of COMPONENTS) {
  BY_NAME.set(norm(c.id), c);
  BY_NAME.set(norm(c.name), c);
  if (c.formula) BY_NAME.set(norm(c.formula), c);
  if (c.cas) BY_NAME.set(c.cas, c);
  for (const a of c.aliases) BY_NAME.set(norm(a), c);
}

/** The component a name, alias, formula or CAS number means, or undefined. */
export function findComponent(name: string): ComponentData | undefined {
  return BY_NAME.get(norm(name)) ?? BY_NAME.get(name.trim());
}

/**
 * Known names close to one that is not known, for "did you mean". Formulas
 * and short aliases (o2, co, ar) only count one edit away from a name as short,
 * or every three-letter word (oil, dye) would be a near miss.
 */
export function nearComponents(name: string): string[] {
  const all = COMPONENTS.flatMap((c) => [c.id, ...c.aliases]);
  const long = closestNames(name, all.filter((n) => n.length >= 4));
  const short = name.trim().length <= 4 ? all.filter((n) => n.length < 4 && editDistance(n, name.trim()) <= 1) : [];
  return [...new Set([...long, ...short])].slice(0, 3);
}

export class ComponentError extends Error {}

/** A component by name, or an error naming what it probably meant. */
export function requireComponent(name: string): ComponentData {
  const c = findComponent(name);
  if (c) return c;
  const near = nearComponents(name);
  throw new ComponentError(
    `"${name}" is not in the component database${near.length ? `; did you mean ${near.join(', ')}?` : ''} (lookup_component lists what is)`
  );
}

// ------------------------------------------------------------ correlations

const K = (c: number) => c + 273.15;

function leeKeslerKpa(c: ComponentData, tK: number): number {
  const tr = tK / c.tcK!;
  const f0 = 5.92714 - 6.09648 / tr - 1.28862 * Math.log(tr) + 0.169347 * tr ** 6;
  const f1 = 15.2518 - 15.6875 / tr - 13.4721 * Math.log(tr) + 0.43577 * tr ** 6;
  return c.pcKpa! * Math.exp(f0 + c.omega! * f1);
}

function antoineKpa(a: NonNullable<ComponentData['antoine']>, tK: number): number {
  return 10 ** (a.A - a.B / (tK + a.C)) / 1000;
}

/** Vapour pressure, kPa, at T °C. */
export function componentPsat(name: string, tC: number): number {
  const c = requireComponent(name);
  if (c.nonVolatile) return 0;
  if (c.id === 'water') return waterPsat(tC);
  const tK = K(tC);
  if (!(tK > 0)) throw new ComponentError(`psat needs a temperature above absolute zero, got ${tC} °C`);
  if (c.tcK !== undefined && tK >= c.tcK) {
    throw new ComponentError(`${c.name} has no vapour pressure at ${tC} °C: that is above its critical temperature, ${(c.tcK - 273.15).toFixed(1)} °C`);
  }
  const a = c.antoine;
  if (a && tK >= a.tminK && tK <= a.tmaxK) return antoineKpa(a, tK);
  if (c.tcK === undefined || c.pcKpa === undefined || c.omega === undefined) {
    throw new ComponentError(`${c.name} has no vapour-pressure data${a ? ` outside ${(a.tminK - 273.15).toFixed(0)} to ${(a.tmaxK - 273.15).toFixed(0)} °C` : ''}`);
  }
  if (!a) return leeKeslerKpa(c, tK);
  // Lee–Kesler, scaled to meet Antoine at the nearer end of its range.
  const edge = tK < a.tminK ? a.tminK : a.tmaxK;
  return leeKeslerKpa(c, tK) * (antoineKpa(a, edge) / leeKeslerKpa(c, edge));
}

/** Saturation (boiling) temperature, °C, at P kPa absolute: componentPsat inverted. */
export function componentTsat(name: string, pKpa: number): number {
  const c = requireComponent(name);
  if (c.nonVolatile) throw new ComponentError(`${c.name} does not boil: it is not volatile`);
  if (!(pKpa > 0)) throw new ComponentError(`tsat needs a positive absolute pressure, got ${pKpa} kPa`);
  if (c.id === 'water') return waterTsat(pKpa);
  if (c.pcKpa !== undefined && pKpa >= c.pcKpa) throw new ComponentError(`${c.name} does not boil at ${pKpa} kPa: that is above its critical pressure, ${c.pcKpa} kPa`);
  const top = (c.tcK ?? 1000) - 273.15 - 1e-6;
  let lo = -273.15 + Math.max(10, (c.tcK ?? 300) * 0.3);
  let hi = top;
  const f = (t: number) => Math.log(componentPsat(name, t)) - Math.log(pKpa);
  if (f(lo) > 0) throw new ComponentError(`${c.name}'s boiling point at ${pKpa} kPa is below the range its data covers`);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Heat of vaporisation, kJ/kg, at T °C (Watson from the normal boiling point). */
export function componentHvap(name: string, tC: number): number {
  const c = requireComponent(name);
  if (c.id === 'water') return waterHvap(tC);
  if (c.nonVolatile) throw new ComponentError(`${c.name} does not evaporate`);
  if (c.hvapTbKjPerKg === undefined || c.tbK === undefined || c.tcK === undefined) throw new ComponentError(`${c.name} has no heat of vaporisation in the database`);
  const tK = K(tC);
  if (tK >= c.tcK) return 0;
  return c.hvapTbKjPerKg * Math.pow((c.tcK - tK) / (c.tcK - c.tbK), 0.38);
}

/** Ideal-gas heat capacity, kJ/kg·K, at T °C. */
export function componentCpGas(name: string, tC: number): number {
  const c = requireComponent(name);
  const p = c.cpGas;
  if (!p) {
    if (c.cpGas298KjPerKgK !== undefined) return c.cpGas298KjPerKgK;
    throw new ComponentError(`${c.name} has no gas heat capacity in the database`);
  }
  const tK = Math.min(Math.max(K(tC), p.tminK), p.tmaxK);
  const cpR = p.a.reduce((sum, a, i) => sum + a * tK ** i, 0);
  return (cpR * R) / c.molarMass;
}

/** Liquid heat capacity, kJ/kg·K (at 25 °C; a dissolved solid's own). */
export function componentCpLiquid(name: string, tC = 25): number {
  const c = requireComponent(name);
  if (c.id === 'water' && tC >= 0 && tC <= 100) return waterCp(tC);
  if (c.cpLiquidKjPerKgK === undefined) throw new ComponentError(`${c.name} has no liquid heat capacity in the database (it is a gas at ordinary conditions)`);
  return c.cpLiquidKjPerKgK;
}

/** Liquid density, kg/m3, at T °C. */
export function componentRhoLiquid(name: string, tC: number): number {
  const c = requireComponent(name);
  if (c.id === 'water' && tC >= 0 && tC <= 150) return waterRho(tC);
  if (c.rhoLiquid20KgPerM3 === undefined) throw new ComponentError(`${c.name} has no liquid density in the database (it is a gas at ordinary conditions)`);
  if (c.nonVolatile || c.tcK === undefined || c.zRa === undefined) return c.rhoLiquid20KgPerM3;
  const tK = K(tC);
  if (tK >= c.tcK) throw new ComponentError(`${c.name} is not a liquid above its critical temperature, ${(c.tcK - 273.15).toFixed(1)} °C`);
  const e = (t: number) => Math.pow(1 - t / c.tcK!, 2 / 7);
  return c.rhoLiquid20KgPerM3 / Math.pow(c.zRa, e(tK) - e(293.15));
}

export function componentMolarMass(name: string): number {
  return requireComponent(name).molarMass;
}

/**
 * A liquid mixture's heat capacity and density from its mass fractions, when
 * every component is known and has liquid data: cp by mass, volume adding
 * (1/ρ = Σ wᵢ/ρᵢ). Ideal mixing: right to about 1 % for sugar and salt
 * solutions; alcohol–water mixtures shrink when mixed, so their density
 * comes out up to about 4 % low. Undefined when any component is unknown or
 * is a gas.
 */
export function liquidMixture(composition: Record<string, number>, tC: number): { cpKjPerKgK: number; densityKgPerM3: number } | undefined {
  const entries = Object.entries(composition).filter(([, w]) => w > 0);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  if (!entries.length || !(total > 0)) return undefined;
  let cp = 0;
  let vol = 0;
  for (const [name, w0] of entries) {
    const c = findComponent(name);
    if (!c || c.rhoLiquid20KgPerM3 === undefined || c.cpLiquidKjPerKgK === undefined) return undefined;
    const w = w0 / total;
    try {
      cp += w * componentCpLiquid(c.id, tC);
      vol += w / componentRhoLiquid(c.id, tC);
    } catch {
      return undefined;
    }
  }
  return { cpKjPerKgK: cp, densityKgPerM3: 1 / vol };
}

/** An ideal-gas mixture's heat capacity from its mass fractions, when every component has gas data. */
export function gasMixtureCp(composition: Record<string, number>, tC: number): number | undefined {
  const entries = Object.entries(composition).filter(([, w]) => w > 0);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  if (!entries.length || !(total > 0)) return undefined;
  let cp = 0;
  for (const [name, w] of entries) {
    const c = findComponent(name);
    if (!c || (!c.cpGas && c.cpGas298KjPerKgK === undefined)) return undefined;
    cp += (w / total) * componentCpGas(c.id, tC);
  }
  return cp;
}

/** Mole fractions from mass fractions; components not in the database are left out (and listed). */
export function moleFractions(composition: Record<string, number>): { x: Record<string, number>; unknown: string[] } {
  const unknown: string[] = [];
  const kmol: Record<string, number> = {};
  for (const [name, w] of Object.entries(composition)) {
    if (!(w > 0)) continue;
    const c = findComponent(name);
    if (!c) {
      unknown.push(name);
      continue;
    }
    kmol[c.id] = (kmol[c.id] ?? 0) + w / c.molarMass;
  }
  const total = Object.values(kmol).reduce((a, b) => a + b, 0);
  return { x: total > 0 ? Object.fromEntries(Object.entries(kmol).map(([k, v]) => [k, v / total])) : {}, unknown };
}

/**
 * Bubble point of a liquid mixture, °C, at P kPa absolute, for an ideal
 * solution (Raoult: Σ xᵢ·Psatᵢ(T) = P), with the vapour's mole fractions
 * there. Non-volatile solutes (sugar, salt) stay in the liquid and only dilute
 * it. Real mixtures of unlike liquids (ethanol and water) deviate: treat this
 * as a first estimate there.
 */
export function bubblePoint(composition: Record<string, number>, pKpa: number): { temperatureC: number; vapour: Record<string, number> } {
  const { x, unknown } = moleFractions(composition);
  if (unknown.length) throw new ComponentError(`not in the component database: ${unknown.join(', ')}`);
  const volatile = Object.keys(x).filter((c) => !findComponent(c)!.nonVolatile);
  if (!volatile.length) throw new ComponentError('nothing in it evaporates');
  const p = (t: number) => volatile.reduce((a, c) => a + x[c]! * componentPsat(c, t), 0);
  // Half a kelvin under the lightest component's critical point (IF97's water stops at 373.946 °C).
  const tcMin = Math.min(...volatile.map((c) => (findComponent(c)!.tcK ?? 1000) - 273.15)) - 0.5;
  let lo = -150;
  let hi = tcMin;
  const f = (t: number) => {
    try {
      return Math.log(p(t)) - Math.log(pKpa);
    } catch {
      return NaN;
    }
  };
  if (!(f(hi) > 0)) throw new ComponentError(`it does not boil at ${pKpa} kPa below the critical temperature of its lightest component`);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const v = f(mid);
    if (Number.isNaN(v) || v < 0) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  const total = p(t);
  return { temperatureC: t, vapour: Object.fromEntries(volatile.map((c) => [c, (x[c]! * componentPsat(c, t)) / total])) };
}

/** Everything the database says about one component, for lookup_component. */
export function describeComponent(name: string): Record<string, unknown> {
  const c = requireComponent(name);
  const safe = (f: () => number) => {
    try {
      const v = f();
      return Number.isFinite(v) ? Number(v.toPrecision(5)) : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    id: c.id,
    name: c.name,
    ...(c.formula ? { formula: c.formula } : {}),
    ...(c.cas ? { cas: c.cas } : {}),
    aliases: c.aliases,
    molarMassKgPerKmol: c.molarMass,
    ...(c.nonVolatile ? { nonVolatile: true } : {}),
    ...(c.tbK !== undefined ? { normalBoilingPointC: Number((c.tbK - 273.15).toFixed(2)) } : {}),
    ...(c.tcK !== undefined ? { criticalTemperatureC: Number((c.tcK - 273.15).toFixed(2)), criticalPressureKpa: c.pcKpa, acentricFactor: c.omega } : {}),
    ...(c.antoine ? { antoineRangeC: [Number((c.antoine.tminK - 273.15).toFixed(1)), Number((c.antoine.tmaxK - 273.15).toFixed(1))] } : {}),
    at25C: {
      ...(safe(() => componentPsat(c.id, 25)) !== undefined ? { vapourPressureKpa: safe(() => componentPsat(c.id, 25)) } : {}),
      ...(c.cpLiquidKjPerKgK !== undefined ? { liquidCpKjPerKgK: c.cpLiquidKjPerKgK } : {}),
      ...(safe(() => componentCpGas(c.id, 25)) !== undefined ? { gasCpKjPerKgK: safe(() => componentCpGas(c.id, 25)) } : {}),
      ...(safe(() => componentRhoLiquid(c.id, 25)) !== undefined ? { liquidDensityKgPerM3: safe(() => componentRhoLiquid(c.id, 25)) } : {}),
      ...(safe(() => componentHvap(c.id, 25)) !== undefined ? { heatOfVaporisationKjPerKg: safe(() => componentHvap(c.id, 25)) } : {})
    },
    source: c.source
  };
}
