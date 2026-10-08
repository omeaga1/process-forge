import { z } from 'zod';

/**
 * Phases: what physical state a stream is in, and therefore which physics,
 * which units of flow and which balances apply to it.
 *
 * Before this, a port only said whether it carried a CONTINUOUS_FLUID or
 * DISCRETE_CONTAINERs. "Continuous" covered a juice, the steam boiled off it,
 * the dusty air going into a baghouse and the powder coming out of a spray
 * dryer alike, so nothing in a contract said that a spray dryer takes a
 * liquid in and sends a solid out -- and nothing could check that the energy
 * to do it was there.
 *
 * A port can now name its phase:
 *
 *   LIQUID  pumped; flow in gal/min, L/min or kg/s; incompressible
 *   GAS     blown; flow in ACFM / SCFM / Nm³/h or kg/s; density from the
 *           ideal gas law, so it depends on temperature and pressure
 *   SOLID   bulk solids (powder, granules, cake); flow in kg/h or lb/h,
 *           volume through bulk density
 *   ITEMS   discrete pieces; flow in items/min
 *
 * and which components it carries in ANOTHER phase (`dispersed`): dust in an
 * air stream is { lubricant: 'SOLID' } on a GAS port, the moisture in a damp
 * powder is { water: 'LIQUID' } on a SOLID port, droplets in a gas are
 * { water: 'LIQUID' } on a GAS port.
 *
 * Then a component may only leave in a phase it arrived in, unless the
 * contract declares the change in `phaseChanges` -- with its mechanism
 * (EVAPORATION, DRYING, CRYSTALLISATION...) and its latent heat -- and a
 * change that takes heat needs a heat source on the unit (a duty, a hot gas
 * inlet, a utility). That is the check that makes "liquid in, solid out" a
 * statement the engine verifies rather than a label.
 */

export const MaterialPhaseSchema = z.enum(['LIQUID', 'GAS', 'SOLID', 'ITEMS']);
export type MaterialPhase = z.infer<typeof MaterialPhaseSchema>;

export const PhaseChangeMechanismSchema = z.enum([
  'EVAPORATION',
  'CONDENSATION',
  'DRYING',
  'CRYSTALLISATION',
  'PRECIPITATION',
  'DISSOLUTION',
  'MELTING',
  'SOLIDIFICATION',
  'SUBLIMATION',
  'DESUBLIMATION',
  'ABSORPTION',
  'DESORPTION',
  'REACTION'
]);
export type PhaseChangeMechanism = z.infer<typeof PhaseChangeMechanismSchema>;

/**
 * A component changing phase inside the unit. `latentHeatKjPerKg` is an
 * expression (kJ per kg of the component changed), positive when the change
 * takes heat in (evaporation, melting, sublimation, drying).
 */
export const UnitOpPhaseChangeSchema = z.object({
  component: z.string().min(1),
  from: MaterialPhaseSchema,
  to: MaterialPhaseSchema,
  mechanism: PhaseChangeMechanismSchema,
  latentHeatKjPerKg: z.string().optional(),
  description: z.string().optional()
});
export type UnitOpPhaseChange = z.infer<typeof UnitOpPhaseChangeSchema>;

/** Which phase changes each mechanism can describe (from -> to). */
export const MECHANISM_TRANSITIONS: Record<PhaseChangeMechanism, readonly (readonly [MaterialPhase, MaterialPhase])[]> = {
  EVAPORATION: [['LIQUID', 'GAS']],
  CONDENSATION: [['GAS', 'LIQUID']],
  DRYING: [['LIQUID', 'GAS'], ['LIQUID', 'SOLID']],
  CRYSTALLISATION: [['LIQUID', 'SOLID']],
  PRECIPITATION: [['LIQUID', 'SOLID']],
  DISSOLUTION: [['SOLID', 'LIQUID'], ['GAS', 'LIQUID']],
  MELTING: [['SOLID', 'LIQUID']],
  SOLIDIFICATION: [['LIQUID', 'SOLID']],
  SUBLIMATION: [['SOLID', 'GAS']],
  DESUBLIMATION: [['GAS', 'SOLID']],
  ABSORPTION: [['GAS', 'LIQUID'], ['GAS', 'SOLID']],
  DESORPTION: [['LIQUID', 'GAS'], ['SOLID', 'GAS']],
  REACTION: [
    ['LIQUID', 'GAS'], ['LIQUID', 'SOLID'], ['GAS', 'LIQUID'], ['GAS', 'SOLID'], ['SOLID', 'GAS'], ['SOLID', 'LIQUID']
  ]
};

/** Changes that take heat in: the unit needs a heat source to make them happen. */
export function isEndothermic(from: MaterialPhase, to: MaterialPhase): boolean {
  const rank: Record<MaterialPhase, number> = { SOLID: 0, ITEMS: 0, LIQUID: 1, GAS: 2 };
  return rank[to] > rank[from];
}

/**
 * How each phase's flow is stated and converted. This is what the design
 * brief hands a model so a dust collector is sized in ACFM with a dust
 * loading in g/Nm³ and a hopper discharge in kg/h, not in gal/min.
 */
export interface PhaseFlowBasis {
  phase: MaterialPhase;
  /** The quantities a design of this phase states, with their units. */
  flowUnits: string[];
  /** The property that turns mass flow into volume flow. */
  density: string;
  /** What has to be known about the stream. */
  stateVariables: string[];
  /** The fundamental relations that govern it. */
  physics: string[];
}

export const PHASE_FLOW_BASIS: Record<MaterialPhase, PhaseFlowBasis> = {
  LIQUID: {
    phase: 'LIQUID',
    flowUnits: ['gal/min (GPM)', 'L/min', 'm3/h', 'kg/s'],
    density: 'Nearly incompressible: rho from the fluid (g/cm3), barely a function of T and P.',
    stateVariables: ['temperature (°C)', 'density (g/cm3)', 'specific heat (kJ/kg-K)', 'viscosity (cP)', 'composition (mass fractions)'],
    physics: [
      'Mass balance: sum of m_in = sum of m_out (kg/s), per component.',
      'Energy balance: Q = m * cp * (T_out - T_in) + m_changed * latent heat.',
      'Hydraulics: head and pressure drop (Darcy-Weisbach, dP = f (L/D) rho v^2 / 2); pump power = Q * dP / efficiency.'
    ]
  },
  GAS: {
    phase: 'GAS',
    flowUnits: ['ACFM (actual ft3/min)', 'SCFM (ft3/min at 68 °F, 14.696 psia)', 'Nm3/h (at 0 °C, 101.325 kPa)', 'kg/s'],
    density: 'Ideal gas: rho = P * M / (R * T). Volume flow changes with temperature and pressure; mass flow does not.',
    stateVariables: ['temperature (°C)', 'absolute pressure (kPa)', 'molar mass (kg/kmol; air 28.96)', 'humidity ratio (kg water/kg dry gas)', 'dust or droplet loading (g/Nm3)'],
    physics: [
      'Ideal gas law: P V = n R T; ACFM = SCFM * (T_actual / T_std) * (P_std / P_actual), temperatures absolute.',
      'Psychrometrics: water vapour pressure p_sat(T); humidity ratio Y = 0.622 p_v / (P - p_v); relative humidity p_v / p_sat. A gas cooled below its dew point condenses.',
      'Energy carried: Q = m_dry_gas * (cp_gas + Y * cp_vapour) * dT.',
      'Fan power = Q_actual * dP / efficiency.'
    ]
  },
  SOLID: {
    phase: 'SOLID',
    flowUnits: ['kg/h', 'lb/h', 't/h', 'kg/s'],
    density: 'Bulk density (kg/m3) for volume (hoppers, screw feeders); particle density for settling and separation.',
    stateVariables: ['particle size (d50, um)', 'bulk density (kg/m3)', 'moisture (% wet basis)', 'specific heat (kJ/kg-K)', 'combustible-dust class (Kst, MIE) where it applies'],
    physics: [
      'Mass balance on a dry basis: dry solids in = dry solids out; moisture moves separately.',
      'Moisture: wet basis w = m_water / m_total; dry basis X = m_water / m_dry; X = w / (1 - w).',
      'Particle separation: Stokes settling v_t = g d^2 (rho_p - rho_g) / (18 mu); cyclones and filters are rated by cut size d50.'
    ]
  },
  ITEMS: {
    phase: 'ITEMS',
    flowUnits: ['items/min', 'items/h'],
    density: 'Not applicable: items are counted.',
    stateVariables: ['count', 'per-item volume or mass'],
    physics: ['Rate = units per cycle / cycle time; capacity and OEE as in the discrete-event engine.']
  }
};

// ----------------------------------------------------------- physics helpers

/** Universal gas constant, kJ/(kmol·K). */
export const R_KJ_PER_KMOL_K = 8.314462618;
export const MOLAR_MASS_AIR = 28.9647;
export const MOLAR_MASS_WATER = 18.01528;
/** US standard conditions for SCFM: 68 °F, 14.696 psia. */
export const SCFM_STD_C = 20;
export const STD_PRESSURE_KPA = 101.325;
export const M3_PER_FT3 = 0.028316846592;
export const G_PER_M3_PER_GRAIN_PER_FT3 = 2.288351839;

/** kg/kmol of components a gas commonly carries, by lower-case name; anything else is taken as air-like. */
export const COMPONENT_MOLAR_MASS: Record<string, number> = {
  air: 28.96, water: 18.015, steam: 18.015, vapour: 18.015, vapor: 18.015, h2o: 18.015,
  nitrogen: 28.013, n2: 28.013, oxygen: 31.999, o2: 31.999, co2: 44.01, carbon_dioxide: 44.01,
  co: 28.01, hydrogen: 2.016, h2: 2.016, methane: 16.04, ch4: 16.04, ammonia: 17.031, nh3: 17.031,
  argon: 39.948, hcl: 36.461, so2: 64.066, ethanol: 46.07, helium: 4.003, propane: 44.1
};

/** Mean molar mass of a gas mixture from mass fractions: M = sum(w) / sum(w / M_i). */
export function mixtureMolarMass(composition: Record<string, number> | undefined): number {
  const entries = Object.entries(composition ?? {}).filter(([, w]) => w > 0);
  if (!entries.length) return MOLAR_MASS_AIR;
  const total = entries.reduce((a, [, w]) => a + w, 0);
  const kmol = entries.reduce((a, [c, w]) => a + w / (COMPONENT_MOLAR_MASS[c.toLowerCase()] ?? MOLAR_MASS_AIR), 0);
  return total / kmol;
}

/** Ideal-gas density, kg/m³, at T (°C) and absolute P (kPa). */
export function idealGasDensity(tempC: number, pressureKpa = STD_PRESSURE_KPA, molarMass = MOLAR_MASS_AIR): number {
  return (pressureKpa * molarMass) / (R_KJ_PER_KMOL_K * (tempC + 273.15));
}

/** Actual ft³/min at (T, P) to standard ft³/min (68 °F, 14.696 psia). */
export function acfmToScfm(acfm: number, tempC: number, pressureKpa = STD_PRESSURE_KPA): number {
  return acfm * ((SCFM_STD_C + 273.15) / (tempC + 273.15)) * (pressureKpa / STD_PRESSURE_KPA);
}

export function scfmToAcfm(scfm: number, tempC: number, pressureKpa = STD_PRESSURE_KPA): number {
  return scfm / acfmToScfm(1, tempC, pressureKpa);
}

/** Mass flow, kg/s, of a gas stated in SCFM. */
export function scfmToKgPerS(scfm: number, molarMass = MOLAR_MASS_AIR): number {
  return (scfm * M3_PER_FT3 * idealGasDensity(SCFM_STD_C, STD_PRESSURE_KPA, molarMass)) / 60;
}

/** Normal m³/h (0 °C, 101.325 kPa) to kg/s. */
export function nm3PerHToKgPerS(nm3PerH: number, molarMass = MOLAR_MASS_AIR): number {
  return (nm3PerH * idealGasDensity(0, STD_PRESSURE_KPA, molarMass)) / 3600;
}

/** Saturation vapour pressure of water, kPa (Buck, 1981; within 0.05 % from 0 to 100 °C). */
export function waterSaturationPressureKpa(tempC: number): number {
  return 0.61121 * Math.exp((18.678 - tempC / 234.5) * (tempC / (257.14 + tempC)));
}

/**
 * Latent heat of vaporisation of water, kJ/kg: linear between the steam-table
 * values at 0 °C (2500.9) and 100 °C (2256.4), within 0.2 %; above 100 °C the
 * Watson form to the critical point.
 */
export function waterLatentHeatKjPerKg(tempC: number): number {
  if (tempC <= 100) return 2500.9 - 2.445 * Math.max(tempC, 0);
  const tc = 647.096;
  const tr = Math.min(tempC + 273.15, tc);
  // Exponent 0.33 fits the steam tables from 100 to 250 °C within 0.5 %.
  return 2256.4 * Math.pow((tc - tr) / (tc - 373.15), 0.33);
}

/** Humidity ratio, kg water vapour per kg dry air, from partial pressure p_v (kPa) at total P (kPa). */
export function humidityRatio(vapourPressureKpa: number, pressureKpa = STD_PRESSURE_KPA): number {
  return (0.62198 * vapourPressureKpa) / Math.max(pressureKpa - vapourPressureKpa, 1e-9);
}

/** Relative humidity 0..1 of air at T with humidity ratio Y (kg/kg dry air). */
export function relativeHumidity(tempC: number, humidity: number, pressureKpa = STD_PRESSURE_KPA): number {
  const pv = (humidity * pressureKpa) / (0.62198 + humidity);
  return pv / waterSaturationPressureKpa(tempC);
}

/** Dust loading: grains per ft³ to g/m³. */
export function grainsPerFt3ToGPerM3(gr: number): number {
  return gr * G_PER_M3_PER_GRAIN_PER_FT3;
}

/** Moisture: wet basis (kg water / kg wet) to dry basis (kg water / kg dry solid). */
export function wetToDryBasis(w: number): number {
  return w / (1 - w);
}

/** Terminal settling velocity in the Stokes regime, m/s. */
export function stokesVelocity(diameterUm: number, particleDensity: number, gasDensity: number, viscosityPaS = 1.81e-5): number {
  const d = diameterUm * 1e-6;
  return (9.80665 * d * d * (particleDensity - gasDensity)) / (18 * viscosityPaS);
}

// --------------------------------------------------------------- archetypes

/**
 * Equipment that moves material between phases, with the phase on each port.
 * This is how the design tool decides which physics drive a unit: the
 * description is matched to an archetype, and the archetype says which phase
 * each port carries, in which flow units, which phase changes happen, and
 * which balances a complete design has to state. A model then writes the
 * contract to that plan, and the phase gate checks it.
 */
export interface PhasePortPlan {
  id: string;
  name: string;
  direction: 'INLET' | 'OUTLET';
  phase: MaterialPhase;
  /** Components carried in another phase than the port's own. */
  dispersed?: Record<string, MaterialPhase>;
  carries?: string[];
  role?: 'MATERIAL' | 'UTILITY';
  /** How its flow is stated. */
  flowUnits: string;
}

export interface PhaseArchetype {
  id: string;
  name: string;
  keywords: string[];
  summary: string;
  components: string[];
  ports: PhasePortPlan[];
  phaseChanges: Omit<UnitOpPhaseChange, 'latentHeatKjPerKg'>[];
  /** The relations a complete design of it computes. */
  governingPhysics: string[];
  /** The checks that make it physically valid or not. */
  keyConstraints: string[];
  /** A worked example contract shipped with the engine, by export name. */
  example?: string;
}

export const PHASE_ARCHETYPES: readonly PhaseArchetype[] = [
  {
    id: 'dust-collector',
    name: 'Dust collector (baghouse / cartridge / pulse-jet)',
    keywords: ['dust collector', 'baghouse', 'bag house', 'bag filter', 'cartridge collector', 'pulse jet', 'pulse-jet', 'fabric filter', 'dust extraction', 'dust'],
    summary: 'Dust-laden air in; clean air out the top; collected powder out of the hopper. Mechanical separation: no phase changes, the dust stays SOLID throughout.',
    components: ['air', 'dust'],
    ports: [
      { id: 'dirty_air', name: 'Dirty air', direction: 'INLET', phase: 'GAS', dispersed: { dust: 'SOLID' }, carries: ['air', 'dust'], flowUnits: 'ACFM (and SCFM) of gas; dust loading in g/Nm3 or gr/ft3' },
      { id: 'clean_air', name: 'Clean air', direction: 'OUTLET', phase: 'GAS', dispersed: { dust: 'SOLID' }, carries: ['air', 'dust'], flowUnits: 'ACFM; outlet emission in mg/Nm3' },
      { id: 'hopper', name: 'Collected dust', direction: 'OUTLET', phase: 'SOLID', carries: ['dust'], flowUnits: 'kg/h or lb/h of powder' }
    ],
    phaseChanges: [],
    governingPhysics: [
      'Air-to-cloth ratio (filtration velocity) = ACFM / filter area, ft/min. Fine, light powders (stearates, pharma) 2-3.5 ft/min; coarse mineral dust up to 5-6.',
      'Dust in = loading (g/Nm3) * Nm3/h; collected = efficiency * dust in; emitted = dust in - collected.',
      'Pressure drop: dP = K1 * V (clean cloth) + K2 * W * V (cake), V the filtration velocity, W the cake areal load. Typical 3-6 inH2O.',
      'Fan power = Q_actual * dP / efficiency.',
      'Can velocity (upward velocity between bags) must stay below ~250-350 ft/min or the pulse re-entrains the cake.'
    ],
    keyConstraints: [
      'ERROR air-to-cloth above the limit for the dust',
      'ERROR outlet emission above the permit limit (mg/Nm3)',
      'WARNING inlet temperature within the bag fabric rating and above the dew point',
      'WARNING combustible dust (Kst > 0): explosion venting / isolation per NFPA 652/654'
    ],
    example: 'DUST_COLLECTOR_CONTRACT'
  },
  {
    id: 'cyclone',
    name: 'Cyclone separator',
    keywords: ['cyclone'],
    summary: 'Dusty gas in; gas out the vortex finder; solids out the cone. Separation by centrifugal settling, rated by cut size d50.',
    components: ['air', 'dust'],
    ports: [
      { id: 'inlet', name: 'Dusty gas', direction: 'INLET', phase: 'GAS', dispersed: { dust: 'SOLID' }, carries: ['air', 'dust'], flowUnits: 'ACFM; loading g/Nm3' },
      { id: 'gas_out', name: 'Gas out', direction: 'OUTLET', phase: 'GAS', dispersed: { dust: 'SOLID' }, carries: ['air', 'dust'], flowUnits: 'ACFM' },
      { id: 'solids', name: 'Solids', direction: 'OUTLET', phase: 'SOLID', carries: ['dust'], flowUnits: 'kg/h' }
    ],
    phaseChanges: [],
    governingPhysics: [
      'Lapple cut size d50 = sqrt(9 mu W / (2 pi N_e v_in (rho_p - rho_g))).',
      'Grade efficiency eta(d) = 1 / (1 + (d50 / d)^2).',
      'Pressure drop = N_H * rho_g * v_in^2 / 2, N_H ~ 6-8 velocity heads.'
    ],
    keyConstraints: ['WARNING inlet velocity 15-25 m/s', 'ERROR d50 above the particle size to be caught']
  },
  {
    id: 'spray-dryer',
    name: 'Spray dryer',
    keywords: ['spray dryer', 'spray drier', 'spray drying', 'spray chamber', 'atomiser', 'atomizer'],
    summary: 'A liquid feed (solution or slurry) is atomised into hot air: the water evaporates into the air and the solids leave as powder. LIQUID in, SOLID and GAS out.',
    components: ['water', 'solids', 'air'],
    ports: [
      { id: 'feed', name: 'Liquid feed', direction: 'INLET', phase: 'LIQUID', carries: ['water', 'solids'], flowUnits: 'kg/h or L/h of feed; solids content % w/w' },
      { id: 'hot_air', name: 'Hot drying air', direction: 'INLET', phase: 'GAS', carries: ['air', 'water'], flowUnits: 'kg/h dry air (or SCFM); inlet temperature °C; humidity kg/kg' },
      { id: 'powder', name: 'Powder', direction: 'OUTLET', phase: 'SOLID', dispersed: { water: 'LIQUID' }, carries: ['solids', 'water'], flowUnits: 'kg/h; residual moisture % wet basis' },
      { id: 'exhaust', name: 'Exhaust air', direction: 'OUTLET', phase: 'GAS', carries: ['air', 'water'], flowUnits: 'ACFM at outlet temperature; humidity kg/kg' }
    ],
    phaseChanges: [
      { component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'EVAPORATION' },
      { component: 'solids', from: 'LIQUID', to: 'SOLID', mechanism: 'DRYING' }
    ],
    governingPhysics: [
      'Dry-solids balance: m_feed * x_s = m_powder * (1 - w_powder).',
      'Water evaporated = m_feed * (1 - x_s) - m_powder * w_powder.',
      'Energy balance: m_air * cp_humid * (T_in - T_out) = m_evap * (lambda(T_out) + cp_v (T_out - T_feed) ... ) + m_solids * cp_s * (T_powder - T_feed) + losses.',
      'Exhaust humidity Y_out = Y_in + m_evap / m_air; relative humidity at T_out from p_sat(T_out) must stay low (typically < 20-30 %) or the powder does not dry.',
      'Volume of gas leaving: ideal gas at T_out, so the exhaust ACFM is far larger than the inlet SCFM.'
    ],
    keyConstraints: [
      'ERROR heat in the air below the heat to evaporate the water',
      'ERROR exhaust saturated (RH >= 100 %): it condenses',
      'WARNING exhaust RH high: the powder leaves wet',
      'WARNING outlet temperature above the product\'s sticky or degradation point'
    ],
    example: 'SPRAY_DRYER_CONTRACT'
  },
  {
    id: 'fluid-bed-dryer',
    name: 'Fluid-bed / tray / rotary dryer',
    keywords: ['fluid bed', 'fluidised bed', 'fluidized bed', 'rotary dryer', 'tray dryer', 'belt dryer', 'granule dryer', 'dryer', 'drier'],
    summary: 'Wet solids and hot gas in; dry solids and humid gas out. The moisture evaporates into the gas.',
    components: ['solids', 'water', 'air'],
    ports: [
      { id: 'wet', name: 'Wet solids', direction: 'INLET', phase: 'SOLID', dispersed: { water: 'LIQUID' }, carries: ['solids', 'water'], flowUnits: 'kg/h; moisture % wet basis' },
      { id: 'hot_gas', name: 'Hot gas', direction: 'INLET', phase: 'GAS', carries: ['air', 'water'], flowUnits: 'kg/h dry gas or SCFM; °C' },
      { id: 'dry', name: 'Dry solids', direction: 'OUTLET', phase: 'SOLID', dispersed: { water: 'LIQUID' }, carries: ['solids', 'water'], flowUnits: 'kg/h' },
      { id: 'exhaust', name: 'Exhaust', direction: 'OUTLET', phase: 'GAS', carries: ['air', 'water'], flowUnits: 'ACFM' }
    ],
    phaseChanges: [{ component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'DRYING' }],
    governingPhysics: [
      'Dry-basis moisture balance: m_dry * (X_in - X_out) = water evaporated.',
      'Energy: gas sensible heat drop covers evaporation + heating the solids.',
      'Fluidisation: superficial velocity between minimum fluidisation and terminal velocity of the particles.'
    ],
    keyConstraints: ['ERROR heat short of evaporation duty', 'ERROR exhaust saturated', 'WARNING velocity outside the fluidisation window']
  },
  {
    id: 'evaporator',
    name: 'Evaporator / concentrator',
    keywords: ['evaporator', 'concentrator', 'falling film', 'boil off', 'boiling'],
    summary: 'A liquid in; a concentrated liquid and vapour out. The water boils with steam heat.',
    components: ['water', 'solute'],
    ports: [
      { id: 'feed', name: 'Feed', direction: 'INLET', phase: 'LIQUID', carries: ['water', 'solute'], flowUnits: 'gal/min or kg/s' },
      { id: 'vapour', name: 'Vapour', direction: 'OUTLET', phase: 'GAS', carries: ['water'], flowUnits: 'kg/h of vapour' },
      { id: 'concentrate', name: 'Concentrate', direction: 'OUTLET', phase: 'LIQUID', carries: ['water', 'solute'], flowUnits: 'gal/min or kg/s' }
    ],
    phaseChanges: [{ component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'EVAPORATION' }],
    governingPhysics: ['Q_steam = m * cp * (T_boil - T_feed) + m_vapour * lambda(T_boil)', 'Solute balance: m_feed * x_feed = m_conc * x_conc', 'Boiling point rise with concentration; T_boil set by the vacuum.'],
    keyConstraints: ['ERROR steam short of the sensible heat', 'WARNING concentrate too viscous to pump']
  },
  {
    id: 'condenser',
    name: 'Condenser',
    keywords: ['condenser', 'condense'],
    summary: 'Vapour in, liquid condensate out, heat rejected to cooling water.',
    components: ['water'],
    ports: [
      { id: 'vapour', name: 'Vapour', direction: 'INLET', phase: 'GAS', carries: ['water'], flowUnits: 'kg/h' },
      { id: 'cw', name: 'Cooling water', direction: 'INLET', phase: 'LIQUID', role: 'UTILITY', flowUnits: 'gal/min' },
      { id: 'condensate', name: 'Condensate', direction: 'OUTLET', phase: 'LIQUID', carries: ['water'], flowUnits: 'gal/min' },
      { id: 'cw_return', name: 'Cooling water return', direction: 'OUTLET', phase: 'LIQUID', role: 'UTILITY', flowUnits: 'gal/min' }
    ],
    phaseChanges: [{ component: 'water', from: 'GAS', to: 'LIQUID', mechanism: 'CONDENSATION' }],
    governingPhysics: ['Q = m_vapour * lambda = m_cw * cp * dT_cw = U A LMTD'],
    keyConstraints: ['ERROR cooling water outlet hotter than the condensing temperature']
  },
  {
    id: 'crystalliser',
    name: 'Crystalliser',
    keywords: ['crystalliser', 'crystallizer', 'crystallise', 'crystallize', 'precipitat'],
    summary: 'A solution in; crystals (a slurry or cake) and mother liquor out. Solute leaves solution as it cools or concentrates past saturation.',
    components: ['water', 'solute'],
    ports: [
      { id: 'feed', name: 'Solution', direction: 'INLET', phase: 'LIQUID', carries: ['water', 'solute'], flowUnits: 'gal/min' },
      { id: 'crystals', name: 'Crystals', direction: 'OUTLET', phase: 'SOLID', dispersed: { water: 'LIQUID' }, carries: ['solute', 'water'], flowUnits: 'kg/h' },
      { id: 'liquor', name: 'Mother liquor', direction: 'OUTLET', phase: 'LIQUID', carries: ['water', 'solute'], flowUnits: 'gal/min' }
    ],
    phaseChanges: [{ component: 'solute', from: 'LIQUID', to: 'SOLID', mechanism: 'CRYSTALLISATION' }],
    governingPhysics: ['Yield = m_water * (C_in - C_sat(T_out)), C in kg solute / kg water', 'Heat of crystallisation released; cooling duty = m cp dT + yield * dH_cryst'],
    keyConstraints: ['ERROR feed not supersaturated at the outlet temperature', 'WARNING supersaturation too high (fines)']
  },
  {
    id: 'filter',
    name: 'Filter / filter press / centrifuge',
    keywords: ['filter press', 'filter', 'centrifuge', 'decanter centrifuge', 'nutsche', 'belt filter'],
    summary: 'A slurry (liquid with suspended solids) in; filtrate and cake out. Mechanical separation, no phase change.',
    components: ['water', 'solids'],
    ports: [
      { id: 'slurry', name: 'Slurry', direction: 'INLET', phase: 'LIQUID', dispersed: { solids: 'SOLID' }, carries: ['water', 'solids'], flowUnits: 'gal/min; solids % w/w' },
      { id: 'filtrate', name: 'Filtrate', direction: 'OUTLET', phase: 'LIQUID', dispersed: { solids: 'SOLID' }, carries: ['water', 'solids'], flowUnits: 'gal/min' },
      { id: 'cake', name: 'Cake', direction: 'OUTLET', phase: 'SOLID', dispersed: { water: 'LIQUID' }, carries: ['solids', 'water'], flowUnits: 'kg/h; cake moisture %' }
    ],
    phaseChanges: [],
    governingPhysics: ['Darcy / Ruth filtration: dV/dt = A^2 dP / (mu (alpha c V + R_m A))', 'Solids balance with cake moisture'],
    keyConstraints: ['ERROR filtration rate below the feed rate', 'WARNING cake moisture high']
  },
  {
    id: 'wet-scrubber',
    name: 'Wet scrubber',
    keywords: ['scrubber', 'venturi scrubber', 'absorber', 'absorption column'],
    summary: 'Contaminated gas and scrubbing liquid in; clean gas and spent liquid out. Dust or a soluble gas moves into the liquid.',
    components: ['air', 'pollutant', 'water'],
    ports: [
      { id: 'gas_in', name: 'Gas in', direction: 'INLET', phase: 'GAS', carries: ['air', 'pollutant'], flowUnits: 'ACFM' },
      { id: 'liquor_in', name: 'Scrubbing liquor', direction: 'INLET', phase: 'LIQUID', carries: ['water'], flowUnits: 'gal/min' },
      { id: 'gas_out', name: 'Clean gas', direction: 'OUTLET', phase: 'GAS', carries: ['air', 'pollutant', 'water'], flowUnits: 'ACFM' },
      { id: 'liquor_out', name: 'Spent liquor', direction: 'OUTLET', phase: 'LIQUID', carries: ['water', 'pollutant'], flowUnits: 'gal/min' }
    ],
    phaseChanges: [
      { component: 'pollutant', from: 'GAS', to: 'LIQUID', mechanism: 'ABSORPTION' },
      { component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'EVAPORATION' }
    ],
    governingPhysics: ['L/G ratio (gal per 1000 ACF)', 'Removal from transfer units: eta = 1 - exp(-NTU)', 'Gas leaves near adiabatic saturation'],
    keyConstraints: ['ERROR L/G below the minimum', 'ERROR outlet concentration above the permit limit']
  },
  {
    id: 'mill',
    name: 'Mill / grinder / blender',
    keywords: ['mill', 'grinder', 'pulveriser', 'pulverizer', 'blender', 'v-blender', 'ribbon blender', 'granulator', 'sieve', 'screen'],
    summary: 'Solids in, solids out: size reduction or mixing. No phase change.',
    components: ['solids'],
    ports: [
      { id: 'feed', name: 'Feed', direction: 'INLET', phase: 'SOLID', carries: ['solids'], flowUnits: 'kg/h' },
      { id: 'product', name: 'Product', direction: 'OUTLET', phase: 'SOLID', carries: ['solids'], flowUnits: 'kg/h' }
    ],
    phaseChanges: [],
    governingPhysics: ['Bond law: W = 10 Wi (1/sqrt(P80) - 1/sqrt(F80)) kWh/t', 'Blend uniformity: mixing time and RSD'],
    keyConstraints: ['ERROR motor power below the Bond energy x throughput']
  },
  {
    id: 'pneumatic-conveyor',
    name: 'Pneumatic conveyor',
    keywords: ['pneumatic convey', 'vacuum convey', 'dilute phase', 'dense phase'],
    summary: 'Powder and conveying air in; at the receiver, powder and air out. No phase change.',
    components: ['air', 'solids'],
    ports: [
      { id: 'solids_in', name: 'Powder in', direction: 'INLET', phase: 'SOLID', carries: ['solids'], flowUnits: 'kg/h' },
      { id: 'air_in', name: 'Conveying air', direction: 'INLET', phase: 'GAS', carries: ['air'], flowUnits: 'SCFM' },
      { id: 'solids_out', name: 'Powder out', direction: 'OUTLET', phase: 'SOLID', carries: ['solids'], flowUnits: 'kg/h' },
      { id: 'air_out', name: 'Air to filter', direction: 'OUTLET', phase: 'GAS', dispersed: { solids: 'SOLID' }, carries: ['air', 'solids'], flowUnits: 'ACFM' }
    ],
    phaseChanges: [],
    governingPhysics: ['Solids loading ratio = m_solids / m_air', 'Pickup velocity above saltation (dilute phase ~15-25 m/s)'],
    keyConstraints: ['ERROR gas velocity below saltation']
  },
  {
    id: 'tablet-press',
    name: 'Tablet press / compactor',
    keywords: ['tablet press', 'tablet', 'compaction', 'compactor', 'pill press', 'capsule filler', 'encapsulat'],
    summary: 'Powder blend in, discrete tablets or capsules out. Bulk SOLID becomes ITEMS: the count is set by the fill mass per item.',
    components: ['blend'],
    ports: [
      { id: 'blend', name: 'Powder blend', direction: 'INLET', phase: 'SOLID', carries: ['blend'], flowUnits: 'kg/h' },
      { id: 'tablets', name: 'Tablets', direction: 'OUTLET', phase: 'ITEMS', flowUnits: 'tablets/min' }
    ],
    phaseChanges: [],
    governingPhysics: ['Tablets/min = stations * turret rpm', 'Powder draw = tablets/min * tablet mass', 'Dwell time = punch flat / punch linear speed'],
    keyConstraints: ['ERROR powder feed below draw', 'WARNING dwell time too short to compact']
  }
];

function score(text: string, a: PhaseArchetype): number {
  // Longer phrases are more specific: "spray dryer" outranks "dryer".
  return a.keywords.reduce((s, k) => (text.includes(k) ? s + k.split(' ').length * 2 + k.length / 20 : s), 0);
}

/** The archetypes a description matches, best first. */
export function matchPhaseArchetypes(description: string): { archetype: PhaseArchetype; score: number }[] {
  const t = ` ${description.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return PHASE_ARCHETYPES.map((archetype) => ({ archetype, score: score(t, archetype) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function matchPhaseArchetype(description: string): PhaseArchetype | null {
  return matchPhaseArchetypes(description)[0]?.archetype ?? null;
}
