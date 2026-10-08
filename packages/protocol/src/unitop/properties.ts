/**
 * Physical property functions a contract's expressions can call, so a model
 * does not have to hand-roll a steam table (and get it subtly wrong).
 *
 * Each takes its arguments in one stated unit (temperatures in °C,
 * pressures in kPa absolute, molar mass in kg/kmol) and returns one stated
 * unit. The dimension checker knows both; the static checks also make sure a
 * parameter passed straight in is declared in that unit, so a temperature in
 * K handed to water_psat is an error, not a wrong number.
 *
 * Sources:
 *  - water_psat / water_tsat: IAPWS-IF97 region 4 (saturation line), exact to
 *    the standard from 0.01 °C to the critical point.
 *  - water_rho: Kell (1975), liquid water at 1 atm, 0-150 °C, within 0.01 %.
 *  - water_cp: liquid water at 1 atm, 0-100 °C, within 0.1 %.
 *  - water_hvap: 2500.9 kJ/kg falling linearly to 2256.4 at 100 °C (within
 *    0.2 %), then the Watson form (exponent 0.33, within 0.5 % to 200 °C).
 *  - gas_rho / air_rho: ideal gas, rho = P M / (R T).
 */

export class PropertyRangeError extends Error {}

const N = [
  0.11670521452767e4, -0.72421316703206e6, -0.17073846940092e2, 0.12020824702470e5, -0.32325550322333e7,
  0.14915108613530e2, -0.48232657361591e4, 0.40511340542057e6, -0.23855557567849, 0.65017534844798e3
] as const;
const [n1, n2, n3, n4, n5, n6, n7, n8, n9, n10] = N;

const T_CRIT_C = 373.946;
const P_CRIT_KPA = 22064;
const R = 8.314462618; // kJ/(kmol K)

const need = (ok: boolean, msg: string) => {
  if (!ok) throw new PropertyRangeError(msg);
};

/** Saturation pressure of water, kPa, at T °C (IF97 region 4). */
export function waterPsat(tC: number): number {
  need(tC >= 0.01 && tC <= T_CRIT_C, `water_psat needs 0.01 to ${T_CRIT_C} °C, got ${tC}`);
  const T = tC + 273.15;
  const th = T + n9 / (T - n10);
  const A = th * th + n1 * th + n2;
  const B = n3 * th * th + n4 * th + n5;
  const C = n6 * th * th + n7 * th + n8;
  const pMpa = Math.pow((2 * C) / (-B + Math.sqrt(B * B - 4 * A * C)), 4);
  return pMpa * 1000;
}

/** Saturation temperature of water, °C, at P kPa absolute (IF97 region 4). */
export function waterTsat(pKpa: number): number {
  need(pKpa >= 0.611657 && pKpa <= P_CRIT_KPA, `water_tsat needs 0.611657 to ${P_CRIT_KPA} kPa (absolute), got ${pKpa}`);
  const beta = Math.pow(pKpa / 1000, 0.25);
  const E = beta * beta + n3 * beta + n6;
  const F = n1 * beta * beta + n4 * beta + n7;
  const G = n2 * beta * beta + n5 * beta + n8;
  const D = (2 * G) / (-F - Math.sqrt(F * F - 4 * E * G));
  const T = (n10 + D - Math.sqrt((n10 + D) * (n10 + D) - 4 * (n9 + n10 * D))) / 2;
  return T - 273.15;
}

/** Density of liquid water, kg/m3, at T °C (Kell). */
export function waterRho(tC: number): number {
  need(tC >= 0 && tC <= 150, `water_rho needs 0 to 150 °C (liquid), got ${tC}`);
  const t = tC;
  return (999.83952 + 16.945176 * t - 7.9870401e-3 * t ** 2 - 46.170461e-6 * t ** 3 + 105.56302e-9 * t ** 4 - 280.54253e-12 * t ** 5) / (1 + 16.87985e-3 * t);
}

/** Specific heat of liquid water, kJ/kg-K, at T °C. */
export function waterCp(tC: number): number {
  need(tC >= 0 && tC <= 100, `water_cp needs 0 to 100 °C (liquid), got ${tC}`);
  const t = tC;
  return 4.2174 - 3.720283e-3 * t + 1.412855e-4 * t ** 2 - 2.654387e-6 * t ** 3 + 2.093236e-8 * t ** 4;
}

/** Latent heat of vaporisation of water, kJ/kg, at T °C. */
export function waterHvap(tC: number): number {
  need(tC >= 0 && tC <= T_CRIT_C, `water_hvap needs 0 to ${T_CRIT_C} °C, got ${tC}`);
  // The same curve as phases.ts waterLatentHeatKjPerKg, so a contract and the engine agree.
  if (tC <= 100) return 2500.9 - 2.445 * tC;
  const Tc = T_CRIT_C + 273.15;
  return 2256.4 * Math.pow((Tc - (tC + 273.15)) / (Tc - 373.15), 0.33);
}

/** Ideal-gas density, kg/m3, at T °C, P kPa absolute, molar mass M kg/kmol. */
export function gasRho(tC: number, pKpa: number, molarMass: number): number {
  need(tC > -273.15, `gas_rho needs a temperature above absolute zero, got ${tC} °C`);
  need(pKpa > 0, `gas_rho needs a positive absolute pressure, got ${pKpa} kPa`);
  need(molarMass > 0, `gas_rho needs a positive molar mass, got ${molarMass}`);
  return (pKpa * molarMass) / (R * (tC + 273.15));
}

/** Dry air density, kg/m3, at T °C and P kPa absolute. */
export function airRho(tC: number, pKpa: number): number {
  return gasRho(tC, pKpa, 28.9647);
}

/**
 * The property functions: name, what each argument is (unit it must be in),
 * and the unit it returns. One table, read by the evaluator, the dimension
 * checker, the static unit checks and the design brief.
 */
export const PROPERTY_FUNCTIONS: Record<string, { args: string[]; argNames: string[]; returns: string; fn: (...a: number[]) => number; what: string }> = {
  water_psat: { args: ['°C'], argNames: ['T'], returns: 'kPa', fn: waterPsat, what: 'saturation pressure of water (IAPWS-IF97)' },
  water_tsat: { args: ['kPa'], argNames: ['P absolute'], returns: '°C', fn: waterTsat, what: 'saturation (boiling) temperature of water (IAPWS-IF97)' },
  water_rho: { args: ['°C'], argNames: ['T'], returns: 'kg/m3', fn: waterRho, what: 'density of liquid water' },
  water_cp: { args: ['°C'], argNames: ['T'], returns: 'kJ/kg-K', fn: waterCp, what: 'specific heat of liquid water' },
  water_hvap: { args: ['°C'], argNames: ['T'], returns: 'kJ/kg', fn: waterHvap, what: 'latent heat of vaporisation of water' },
  gas_rho: { args: ['°C', 'kPa', 'kg/kmol'], argNames: ['T', 'P absolute', 'molar mass'], returns: 'kg/m3', fn: gasRho, what: 'ideal-gas density' },
  air_rho: { args: ['°C', 'kPa'], argNames: ['T', 'P absolute'], returns: 'kg/m3', fn: airRho, what: 'dry air density (ideal gas)' }
};
