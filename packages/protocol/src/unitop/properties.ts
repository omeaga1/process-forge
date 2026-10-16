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

import { componentCpGas, componentCpLiquid, componentHvap, componentMolarMass, componentPsat, componentRhoLiquid, componentTsat } from '../thermo/components.js';

import { SOLUBILITY_SOLUTES, crystalYieldFraction, solubilityKgPerKgWater } from '../thermo/solubility.js';

export { PropertyRangeError, waterPsat, waterTsat, waterRho, waterCp, waterHvap, gasRho, airRho } from '../thermo/water.js';
import { waterPsat, waterTsat, waterRho, waterCp, waterHvap, gasRho, airRho } from '../thermo/water.js';

/**
 * The property functions: name, what each argument is (unit it must be in),
 * and the unit it returns. One table, read by the evaluator, the dimension
 * checker, the static unit checks and the design brief.
 */
export const PROPERTY_FUNCTIONS: Record<string, { args: string[]; argNames: string[]; returns: string; fn: (...a: never[]) => number; what: string }> = {
  // Any component in the database (thermo/components.ts), named in quotes as the first argument: psat('ethanol', T).
  psat: { args: ['component', '°C'], argNames: ['component', 'T'], returns: 'kPa', fn: (c: string, t: number) => componentPsat(c, t), what: "vapour pressure of a component (Antoine within its data's range, Lee-Kesler beyond it; water: IAPWS-IF97)" },
  tsat: { args: ['component', 'kPa'], argNames: ['component', 'P absolute'], returns: '°C', fn: (c: string, p: number) => componentTsat(c, p), what: 'boiling (saturation) temperature of a component at a pressure' },
  hvap: { args: ['component', '°C'], argNames: ['component', 'T'], returns: 'kJ/kg', fn: (c: string, t: number) => componentHvap(c, t), what: 'heat of vaporisation of a component (Watson from its normal boiling point)' },
  cp_liquid: { args: ['component'], argNames: ['component'], returns: 'kJ/kg-K', fn: (c: string) => componentCpLiquid(c), what: 'liquid specific heat of a component at 25 °C (a dissolved sugar or salt: what it adds to a solution)' },
  cp_gas: { args: ['component', '°C'], argNames: ['component', 'T'], returns: 'kJ/kg-K', fn: (c: string, t: number) => componentCpGas(c, t), what: 'ideal-gas specific heat of a component' },
  rho_liquid: { args: ['component', '°C'], argNames: ['component', 'T'], returns: 'kg/m3', fn: (c: string, t: number) => componentRhoLiquid(c, t), what: 'liquid density of a component (Rackett from its 20 °C value; water: Kell)' },
  molar_mass: { args: ['component'], argNames: ['component'], returns: 'kg/kmol', fn: (c: string) => componentMolarMass(c), what: 'molar mass of a component' },
  solubility: { args: ['component', '°C'], argNames: ['solute', 'T'], returns: '-', fn: (c: string, t: number) => solubilityKgPerKgWater(c, t), what: `saturated strength of a solute in water, kg solute per kg water (CRC tables; ${SOLUBILITY_SOLUTES.join(', ')})` },
  crystal_yield: { args: ['component', '-', '°C'], argNames: ['solute', 'solute mass fraction of the solution', 'T'], returns: '-', fn: (c: string, w: number, t: number) => crystalYieldFraction(c, w, t), what: 'fraction of the dissolved solute that crystallises when that solution is cooled to T and reaches equilibrium (hydrate water leaves with the crystals); use as a reaction conversion' },
  water_psat: { args: ['°C'], argNames: ['T'], returns: 'kPa', fn: waterPsat, what: 'saturation pressure of water (IAPWS-IF97)' },
  water_tsat: { args: ['kPa'], argNames: ['P absolute'], returns: '°C', fn: waterTsat, what: 'saturation (boiling) temperature of water (IAPWS-IF97)' },
  water_rho: { args: ['°C'], argNames: ['T'], returns: 'kg/m3', fn: waterRho, what: 'density of liquid water' },
  water_cp: { args: ['°C'], argNames: ['T'], returns: 'kJ/kg-K', fn: waterCp, what: 'specific heat of liquid water' },
  water_hvap: { args: ['°C'], argNames: ['T'], returns: 'kJ/kg', fn: waterHvap, what: 'latent heat of vaporisation of water' },
  gas_rho: { args: ['°C', 'kPa', 'kg/kmol'], argNames: ['T', 'P absolute', 'molar mass'], returns: 'kg/m3', fn: gasRho, what: 'ideal-gas density' },
  air_rho: { args: ['°C', 'kPa'], argNames: ['T', 'P absolute'], returns: 'kg/m3', fn: airRho, what: 'dry air density (ideal gas)' }
};
