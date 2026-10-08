import type { PhaseArchetype } from './phases.js';

/**
 * What a complete design of each kind of equipment has to contain, stated so
 * the engine can check it.
 *
 * The phase archetypes (phases.ts) say which phase each port carries. That is
 * not enough to tell a pump that forgot its shaft power from a pump that is
 * right, or an exchanger that mixes its two streams from one that keeps them
 * apart. Each requirement here names one thing the governing physics needs --
 * a quantity of a given kind, a check on it, a duty, channels, reactions -- and
 * how to add it. validate_unit_op holds a contract to its archetype's
 * requirements (physicsAlignment.ts), and design_unit_op hands them to the
 * model up front, so the negotiation converges on the physics, not on
 * whatever passes.
 *
 * Everything is JSON (patterns are regex sources, dimensions are units), so it
 * travels to an MCP client as it is.
 */

export type BehaviorMode = 'DISCRETE_CYCLE' | 'CONTINUOUS_RATE' | 'BATCH' | 'STORAGE';

export type RequirementCheck =
  /** A parameter or derived value of this kind of quantity (its unit's dimension), optionally named like `names`; `guarded`: a constraint reads it; `computed`: a derived value, worked out rather than typed in. */
  | { kind: 'quantity'; unit: string; orUnits?: string[]; names?: string; guarded?: boolean; computed?: boolean }
  /** Heat goes in or out: behavior.dutyKw, a batch phase duty, a UTILITY or ENERGY port, or a hot stream of its own (channels, a GAS inlet). */
  | { kind: 'duty' }
  /** Streams kept apart: channels. */
  | { kind: 'channels' }
  /** Mass-balanced reactions. */
  | { kind: 'reactions' }
  /** The split stated per component: outlets[].recovery. */
  | { kind: 'recoveries' }
  /** An outlet temperature worked out: outlets[].temperatureC. */
  | { kind: 'outletTemperature' }
  /** A cycle unit that draws liquid: behavior.liquidPerCycleGallons. */
  | { kind: 'liquidPerCycle' }
  /** Reads one inlet on its own: port.<id>.*. */
  | { kind: 'perPortReads' }
  /** A unit that only works on items it is sent: behavior.itemsRequired. */
  | { kind: 'itemsRequired' }
  /** Takes or makes whole groups of items: behavior.inputs / outputs, or fullCyclesOnly. */
  | { kind: 'assembly' }
  /** Says how much it can pass: capacityGpm, capacityKgPerHour, or a STORAGE capacity. */
  | { kind: 'capacity' };

export interface PhysicsRequirement {
  id: string;
  /** What the physics needs, in words. */
  what: string;
  check: RequirementCheck;
  /** ERROR: a design without it is not this equipment. WARNING: it is incomplete. */
  severity: 'ERROR' | 'WARNING';
  /** How to add it, written for the model to act on. */
  fix: string;
}

export interface ArchetypePhysics {
  /** The behavior modes this equipment runs in. */
  behaviorModes: BehaviorMode[];
  requirements: PhysicsRequirement[];
}

const q = (unit: string, names?: string, guarded?: boolean, computed = true): RequirementCheck => ({ kind: 'quantity', unit, ...(names ? { names } : {}), ...(guarded ? { guarded } : {}), ...(computed ? { computed } : {}) });
/** A quantity that may be typed in as a parameter (a rating, a setpoint). */
const given = (unit: string, names?: string, guarded?: boolean): RequirementCheck => q(unit, names, guarded, false);

/** Requirements for the archetypes in phases.ts, by id. */
export const ARCHETYPE_PHYSICS: Record<string, ArchetypePhysics> = {
  'dust-collector': {
    behaviorModes: ['CONTINUOUS_RATE'],
    requirements: [
      { id: 'air-to-cloth', what: 'air-to-cloth ratio (filtration velocity), checked against the limit for the dust', check: q('ft/min', 'cloth|filtration|face|velocity|a2c|atc', true), severity: 'ERROR', fix: 'Derive airToCloth = acfm / filterAreaFt2 (ft/min) and constrain airToCloth <= maxAirToCloth (ERROR).' },
      { id: 'emission', what: 'outlet emission against the permit', check: q('mg/Nm3', 'emi|outlet|stack|mg', true), severity: 'WARNING', fix: 'Derive the outlet loading in mg/Nm3 from efficiency and the inlet loading; constrain it below the permit.' },
      { id: 'pressure-drop', what: 'pressure drop across the bags', check: q('inH2O', 'dp|drop|delta|pressure'), severity: 'WARNING', fix: 'Derive dP = K1 x airToCloth + cake dP (inH2O).' },
      { id: 'fan-power', what: 'fan power = Q x dP / efficiency', check: q('kW', 'fan|power|kw|motor'), severity: 'WARNING', fix: 'Derive fanKw = actual m3/s x dP (Pa) / efficiency / 1000 and report it as behavior.dutyKw.' }
    ]
  },
  cyclone: {
    behaviorModes: ['CONTINUOUS_RATE'],
    requirements: [
      { id: 'cut-size', what: 'cut size d50 against the particles to be caught', check: q('um', 'd50|cut|size|diam', true), severity: 'ERROR', fix: 'Derive the Lapple cut size d50 (um) and constrain it below the particle size to catch.' },
      { id: 'inlet-velocity', what: 'inlet velocity in its working window', check: q('m/s', 'vel|speed|v_?in', true), severity: 'WARNING', fix: 'Derive the inlet velocity (m/s) from the ACFM and inlet area; warn outside 15-25 m/s.' },
      { id: 'pressure-drop', what: 'pressure drop (velocity heads)', check: q('Pa', 'dp|drop|pressure'), severity: 'WARNING', fix: 'Derive dP = N_H x rho_g x v^2 / 2.' }
    ]
  },
  'spray-dryer': {
    behaviorModes: ['CONTINUOUS_RATE'],
    requirements: [
      { id: 'heat-source', what: 'a heat source for the evaporation', check: { kind: 'duty' }, severity: 'ERROR', fix: 'Give behavior.dutyKw (the air heater) or a hot GAS inlet.' },
      { id: 'energy-balance', what: 'heat available against heat needed, as a check', check: q('kW', 'heat|duty|evap|avail|need|q_?', true), severity: 'ERROR', fix: 'Derive the heat the air gives up and the heat to evaporate the water (kW); constrain available >= needed (ERROR).' },
      { id: 'exhaust-rh', what: 'exhaust relative humidity', check: q('-', 'rh|humid|sat', true), severity: 'WARNING', fix: 'Derive the exhaust RH from the humidity ratio and p_sat(T_out); reject RH >= 1, warn when high.' },
      { id: 'split', what: 'where each component leaves', check: { kind: 'recoveries' }, severity: 'WARNING', fix: 'Give recoveries per outlet: solids to the powder, water vapour to the exhaust.' }
    ]
  },
  'fluid-bed-dryer': {
    behaviorModes: ['CONTINUOUS_RATE', 'BATCH'],
    requirements: [
      { id: 'heat-source', what: 'a heat source for the drying', check: { kind: 'duty' }, severity: 'ERROR', fix: 'Give a duty, a hot GAS inlet or a utility.' },
      { id: 'energy-balance', what: 'heat available against heat needed', check: q('kW', 'heat|duty|evap|avail|need', true), severity: 'ERROR', fix: 'Derive the gas sensible heat and the evaporation duty (kW); constrain available >= needed.' },
      { id: 'moisture', what: 'moisture leaving, on a dry basis', check: q('-', 'moist|water|dry'), severity: 'WARNING', fix: 'Derive outlet moisture (kg water / kg dry solids) from the evaporation.' }
    ]
  },
  evaporator: {
    behaviorModes: ['CONTINUOUS_RATE', 'BATCH'],
    requirements: [
      { id: 'heat-source', what: 'steam or another heat source', check: { kind: 'duty' }, severity: 'ERROR', fix: 'Give behavior.dutyKw (the steam duty) or a UTILITY steam port.' },
      { id: 'boil-off', what: 'the vapour boiled off, from the solute balance', check: q('kg/s', 'vap|evap|boil|steam'), severity: 'WARNING', fix: 'Derive vapour kg/s = feed x (1 - x_feed / x_product).' },
      { id: 'duty', what: 'duty = sensible + latent heat', check: q('kW', 'duty|steam|heat|q_?'), severity: 'ERROR', fix: 'Derive the duty (kW) = m cp (T_boil - T_feed) + vapour x latent heat.' }
    ]
  },
  'two-stream-exchanger': {
    behaviorModes: ['CONTINUOUS_RATE'],
    requirements: [
      { id: 'channels', what: 'the two streams kept apart', check: { kind: 'channels' }, severity: 'ERROR', fix: 'channels: [{ inlet: "hot_in", outlet: "hot_out" }, { inlet: "cold_in", outlet: "cold_out" }].' },
      { id: 'per-side', what: 'each side read on its own', check: { kind: 'perPortReads' }, severity: 'ERROR', fix: 'Read port.hot_in.* and port.cold_in.* (with designPorts) instead of the mixed inlet.*.' },
      { id: 'duty', what: 'the heat transferred', check: q('kW', 'duty|q_?|heat|kw'), severity: 'ERROR', fix: 'Derive Q (kW) by effectiveness-NTU: Q = eps x Cmin x (Th,in - Tc,in).' },
      { id: 'outlet-temperatures', what: 'each outlet temperature from the duty', check: { kind: 'outletTemperature' }, severity: 'ERROR', fix: 'outlets: hot_out at Th,in - Q / C_hot, cold_out at Tc,in + Q / C_cold.' }
    ]
  },
  condenser: {
    behaviorModes: ['CONTINUOUS_RATE'],
    requirements: [
      { id: 'duty', what: 'condensing duty = vapour x latent heat', check: q('kW', 'duty|q_?|heat|kw'), severity: 'ERROR', fix: 'Derive Q = vapour kg/s x latent heat (kW).' },
      { id: 'coolant', what: 'the coolant that takes the heat', check: { kind: 'duty' }, severity: 'ERROR', fix: 'Give a UTILITY cooling-water port (or channels with the coolant), or behavior.dutyKw.' }
    ]
  },
  crystalliser: {
    behaviorModes: ['CONTINUOUS_RATE', 'BATCH'],
    requirements: [
      { id: 'yield', what: 'crystal yield from the solubility', check: q('kg', 'yield|crystal|solid', true), severity: 'WARNING', fix: 'Derive the yield = water x (C_in - C_sat(T_out)) and check the feed is supersaturated.' },
      { id: 'cooling', what: 'cooling duty', check: { kind: 'duty' }, severity: 'WARNING', fix: 'Give the jacket or coil duty (behavior.dutyKw or a HOLD phase dutyKw).' }
    ]
  },
  filter: {
    behaviorModes: ['CONTINUOUS_RATE', 'BATCH'],
    requirements: [
      { id: 'split', what: 'solids to the cake, liquid to the filtrate', check: { kind: 'recoveries' }, severity: 'WARNING', fix: 'Give recoveries per outlet: solids mostly to the cake, water mostly to the filtrate.' },
      { id: 'filtration-rate', what: 'filtration rate against the feed', check: q('gal/min', 'filtrat|rate|capacity|flux', true), severity: 'WARNING', fix: 'Derive the filtration rate (Darcy / Ruth) and constrain it above the feed rate.' }
    ]
  },
  'wet-scrubber': {
    behaviorModes: ['CONTINUOUS_RATE'],
    requirements: [
      { id: 'per-port', what: 'gas and liquor read on their own', check: { kind: 'perPortReads' }, severity: 'WARNING', fix: 'Read port.gas_in.* and port.liquor_in.* (with designPorts).' },
      { id: 'l-to-g', what: 'liquid-to-gas ratio', check: q('-', 'l_?g|l2g|liquid.?to.?gas|lg|ratio'), severity: 'WARNING', fix: 'Derive L/G = liquor gal/min per 1000 ACFM and constrain it above the minimum.' },
      { id: 'pressure-drop', what: 'pressure drop against the fan', check: q('inH2O', 'dp|drop|pressure', true), severity: 'WARNING', fix: 'Derive dP (Calvert) and constrain it below what the fan can pull.' }
    ]
  },
  mill: {
    behaviorModes: ['CONTINUOUS_RATE', 'BATCH'],
    requirements: [{ id: 'power', what: 'motor power against the size-reduction energy', check: q('kW', 'power|motor|bond|kw|energy', true), severity: 'WARNING', fix: 'Derive the Bond power = 10 Wi (1/sqrt(P80) - 1/sqrt(F80)) x t/h and constrain it below the motor rating.' }]
  },
  'pneumatic-conveyor': {
    behaviorModes: ['CONTINUOUS_RATE'],
    requirements: [{ id: 'velocity', what: 'gas velocity above saltation', check: q('m/s', 'vel|speed|pickup|salt', true), severity: 'ERROR', fix: 'Derive the line velocity (m/s) and constrain it above the saltation velocity.' }]
  },
  'tablet-press': {
    behaviorModes: ['DISCRETE_CYCLE'],
    requirements: [{ id: 'powder-draw', what: 'powder drawn = tablets/min x tablet mass', check: q('kg/h', 'draw|powder|feed|blend'), severity: 'WARNING', fix: 'Derive the powder draw (kg/h) and check the feed covers it.' }]
  },
  pump: {
    behaviorModes: ['CONTINUOUS_RATE'],
    requirements: [
      { id: 'head', what: 'the pressure (or head) it develops', check: { kind: 'quantity', unit: 'psi', orUnits: ['ft'], names: 'head|dp|delta|diff|discharge|tdh|developed|differential' }, severity: 'ERROR', fix: 'Give the differential pressure (psi, bar) or head (ft, m) as a parameter or derive it from the system curve.' },
      { id: 'power', what: 'shaft power = Q x dP / efficiency', check: q('kW', 'shaft|brake|bhp|absorbed'), severity: 'ERROR', fix: 'Derive shaftKw = Q (m3/s) x dP (kPa) / efficiency, report it as behavior.dutyKw and constrain it below the motor rating.' },
      { id: 'efficiency', what: 'hydraulic efficiency', check: given('-', 'eff'), severity: 'WARNING', fix: 'Add an efficiency parameter (0-1), typically 0.5-0.8 for a centrifugal pump.' },
      { id: 'capacity', what: 'the most it pumps', check: { kind: 'capacity' }, severity: 'WARNING', fix: 'Give behavior.capacityGpm (its rated flow) so the engine limits the flow.' },
      { id: 'npsh', what: 'NPSH available above NPSH required', check: q('ft', 'npsh', true), severity: 'WARNING', fix: 'Derive NPSHa = (P_suction - P_vapour) / (rho g) + static head - friction, and constrain it above NPSHr.' }
    ]
  },
  'fan-blower': {
    behaviorModes: ['CONTINUOUS_RATE'],
    requirements: [
      { id: 'pressure-rise', what: 'the pressure rise it develops', check: given('inH2O', 'dp|rise|static|pressure|head'), severity: 'ERROR', fix: 'Give the static pressure rise (inH2O, kPa).' },
      { id: 'power', what: 'power = Q_actual x dP / efficiency', check: q('kW', 'power|shaft|bhp|absorbed|fan|kw'), severity: 'ERROR', fix: 'Derive power (kW) from the actual flow and the pressure rise; report it as behavior.dutyKw.' },
      { id: 'capacity', what: 'its rated mass flow', check: { kind: 'capacity' }, severity: 'WARNING', fix: 'Give behavior.capacityKgPerHour (its rating at its inlet density).' }
    ]
  },
  'storage-tank': {
    behaviorModes: ['STORAGE', 'BATCH'],
    requirements: [{ id: 'capacity', what: 'working volume', check: { kind: 'capacity' }, severity: 'ERROR', fix: 'Use behavior.mode STORAGE with capacityGallons (and maxOutflowGpm if a valve limits it).' }]
  },
  'agitated-mixer': {
    behaviorModes: ['CONTINUOUS_RATE', 'BATCH', 'STORAGE'],
    requirements: [
      { id: 'power', what: 'agitator power = Np rho N^3 D^5', check: q('kW', 'power|agitat|impeller|motor|kw'), severity: 'WARNING', fix: 'Derive the agitator power from the power number, density, speed and impeller diameter.' },
      { id: 'mixing-time', what: 'residence or mixing time against what the blend needs', check: q('s', 'time|resid|blend|mix|tau', true), severity: 'WARNING', fix: 'Derive the residence (or blend) time and constrain it above the mixing time needed.' }
    ]
  },
  reactor: {
    behaviorModes: ['BATCH', 'CONTINUOUS_RATE'],
    requirements: [
      { id: 'reactions', what: 'the reaction, mass-balanced', check: { kind: 'reactions' }, severity: 'ERROR', fix: 'Declare reactions with coefficients from molar masses (they must sum to 0) and a conversion; see reactionExample.' },
      { id: 'heat', what: 'heat of reaction and the duty that removes or supplies it', check: q('kW', 'duty|heat|jacket|reaction|q_?|kw'), severity: 'WARNING', fix: 'Derive the heat of reaction (kW) from the conversion and dH, and the jacket duty that holds the temperature.' },
      { id: 'time', what: 'residence or hold time', check: q('s', 'time|resid|hold|tau|seconds'), severity: 'WARNING', fix: 'Derive the residence time (volume / flow) or the hold time from the kinetics.' }
    ]
  },
  'distillation-column': {
    behaviorModes: ['CONTINUOUS_RATE', 'BATCH'],
    requirements: [
      { id: 'split', what: 'which components go overhead and which to the bottoms', check: { kind: 'recoveries' }, severity: 'WARNING', fix: 'Give recoveries per outlet: the light key mostly to the distillate, the heavy key mostly to the bottoms.' },
      { id: 'reboiler', what: 'reboiler duty', check: { kind: 'duty' }, severity: 'ERROR', fix: 'Derive the reboiler duty (kW) from the boil-up and latent heat, as behavior.dutyKw.' },
      { id: 'reflux', what: 'reflux ratio against the minimum', check: given('-', 'reflux|r_?min|rr', true), severity: 'WARNING', fix: 'Give the reflux ratio and check it above R_min (Underwood).' }
    ]
  },
  heater: {
    behaviorModes: ['CONTINUOUS_RATE', 'BATCH'],
    requirements: [
      { id: 'duty', what: 'the heat it adds or removes', check: { kind: 'duty' }, severity: 'ERROR', fix: 'Give behavior.dutyKw (= m cp dT) or a UTILITY steam / coolant port.' },
      { id: 'outlet-temperature', what: 'the outlet temperature from the duty', check: { kind: 'outletTemperature' }, severity: 'ERROR', fix: 'outlets: [{ port, temperatureC: "inlet.temperatureC + dutyKw / (inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK)" }].' }
    ]
  },
  filler: {
    behaviorModes: ['DISCRETE_CYCLE'],
    requirements: [
      { id: 'liquid-draw', what: 'the liquid each cycle draws', check: { kind: 'liquidPerCycle' }, severity: 'ERROR', fix: 'Set behavior.liquidPerCycleGallons = containers per cycle x fill volume, so an empty tank starves it.' },
      { id: 'cycle', what: 'cycle time from the fill rate', check: given('s', 'cycle|fill|time|index'), severity: 'WARNING', fix: 'Derive the cycle time from fill volume / nozzle flow plus index time.' }
    ]
  },
  conveyor: {
    behaviorModes: ['DISCRETE_CYCLE'],
    requirements: [{ id: 'items-required', what: 'it only moves items it is sent', check: { kind: 'itemsRequired' }, severity: 'WARNING', fix: 'Set behavior.itemsRequired: true so it does not make items of its own.' }]
  },
  'item-station': {
    behaviorModes: ['DISCRETE_CYCLE'],
    requirements: [{ id: 'items-required', what: 'it only works on items it is sent', check: { kind: 'itemsRequired' }, severity: 'WARNING', fix: 'Set behavior.itemsRequired: true.' }]
  },
  'case-packer': {
    behaviorModes: ['DISCRETE_CYCLE'],
    requirements: [{ id: 'groups', what: 'whole cases or layers per cycle', check: { kind: 'assembly' }, severity: 'WARNING', fix: 'Give behavior.inputs / outputs (12 bottles and a blank make a case), or fullCyclesOnly: true for a palletizer layer.' }]
  }
};

const L = (id: string, name: string, direction: 'INLET' | 'OUTLET', extra: Partial<PhaseArchetype['ports'][number]> = {}): PhaseArchetype['ports'][number] => ({
  id,
  name,
  direction,
  phase: 'LIQUID',
  flowUnits: 'gal/min or kg/s',
  ...extra
});
const I = (id: string, name: string, direction: 'INLET' | 'OUTLET', extra: Partial<PhaseArchetype['ports'][number]> = {}): PhaseArchetype['ports'][number] => ({
  id,
  name,
  direction,
  phase: 'ITEMS',
  flowUnits: 'items/min',
  ...extra
});

/** Single-phase and packaging equipment: no phase change, but physics of their own. */
export const EQUIPMENT_ARCHETYPES: PhaseArchetype[] = [
  {
    id: 'pump',
    name: 'Pump',
    keywords: ['pump', 'centrifugal pump', 'positive displacement pump', 'metering pump', 'diaphragm pump', 'gear pump', 'lobe pump', 'transfer pump', 'booster pump'],
    summary: 'Liquid in, the same liquid out at a higher pressure. Mechanical energy, no phase change: the power follows from the flow, the pressure it adds and its efficiency.',
    components: [],
    ports: [L('suction', 'Suction', 'INLET'), L('discharge', 'Discharge', 'OUTLET')],
    phaseChanges: [],
    governingPhysics: [
      'Hydraulic power = Q x dP (kW = m3/s x kPa); shaft power = hydraulic / efficiency.',
      'Head H = dP / (rho g); affinity laws: Q ~ N, H ~ N^2, P ~ N^3.',
      'NPSH available = (P_suction - P_vapour) / (rho g) + static head - friction; must exceed NPSH required or it cavitates.',
      'A rise in temperature of Q x dP x (1 - eff) / (m cp) is usually negligible: leave the outlet at the inlet temperature.'
    ],
    keyConstraints: ['ERROR shaft power above the motor rating', 'WARNING NPSHa below NPSHr + margin', 'WARNING operating far from best efficiency'],
    example: 'PUMP_CONTRACT'
  },
  {
    id: 'fan-blower',
    name: 'Fan / blower / compressor',
    keywords: ['fan', 'blower', 'compressor', 'exhauster', 'id fan', 'induced draft', 'forced draft', 'air compressor', 'vacuum pump'],
    summary: 'Gas in, gas out at a higher pressure. Sized by actual volume (ACFM) and pressure rise; a compressor also heats the gas.',
    components: ['air'],
    ports: [
      { id: 'gas_in', name: 'Gas in', direction: 'INLET', phase: 'GAS', flowUnits: 'ACFM at inlet conditions; SCFM' },
      { id: 'gas_out', name: 'Gas out', direction: 'OUTLET', phase: 'GAS', flowUnits: 'ACFM at outlet conditions' }
    ],
    phaseChanges: [],
    governingPhysics: [
      'Fan power = Q_actual x dP / efficiency (kW = m3/s x Pa / 1000 / eff).',
      'Density at the inlet from the ideal gas law; a fan rated at standard air moves less mass when the gas is hot.',
      'Compressor: adiabatic discharge temperature T2 = T1 (P2/P1)^((k-1)/k) / ... ; power = m cp (T2 - T1) / eff.'
    ],
    keyConstraints: ['ERROR power above the motor rating', 'WARNING discharge temperature above the limit (compressor)']
  },
  {
    id: 'storage-tank',
    name: 'Storage / surge tank',
    keywords: ['tank', 'storage tank', 'surge tank', 'day tank', 'holding tank', 'buffer tank', 'receiver'],
    summary: 'Holds liquid between units: it fills while it has room and empties toward what it feeds. Full, it backs up its feed; empty, it starves what it feeds.',
    components: [],
    ports: [L('inlet', 'Inlet', 'INLET'), L('outlet', 'Outlet', 'OUTLET')],
    phaseChanges: [],
    governingPhysics: ['Level: dV/dt = Q_in - Q_out; working volume between low and high level.', 'Residence time = volume / throughput.'],
    keyConstraints: ['WARNING working volume below the surge the line needs']
  },
  {
    id: 'agitated-mixer',
    name: 'Agitated mixer / blend tank',
    keywords: ['mixer', 'agitator', 'agitated tank', 'agitated vessel', 'blend tank', 'mixing tank', 'static mixer', 'disperser', 'homogeniser', 'homogenizer'],
    summary: 'Liquids in, one blended liquid out. Mixing by heat content and composition; the agitator power follows from the impeller.',
    components: [],
    ports: [L('feed_a', 'Feed A', 'INLET'), L('feed_b', 'Feed B', 'INLET', { optional: true }), L('blend', 'Blend', 'OUTLET')],
    phaseChanges: [],
    governingPhysics: ['Mixed temperature T = sum(m cp T) / sum(m cp); composition by mass.', 'Agitator power P = Np rho N^3 D^5; Reynolds Re = rho N D^2 / mu.', 'Blend time from the impeller and tank geometry (e.g. theta N = 5.4 (T/D)^2 turbulent).'],
    keyConstraints: ['WARNING residence time below the blend time', 'ERROR agitator power above the motor rating']
  },
  {
    id: 'reactor',
    name: 'Reactor (batch or continuous)',
    keywords: ['reactor', 'cstr', 'plug flow reactor', 'pfr', 'neutraliser', 'neutralizer', 'fermenter', 'fermentor', 'bioreactor', 'autoclave', 'polymerisation', 'polymerization', 'saponification', 'reaction vessel', 'hydrogenator'],
    summary: 'Reactants in, products out: a mass-balanced reaction with a conversion, and the heat it releases or takes.',
    components: ['reactant', 'product'],
    ports: [L('feed', 'Feed', 'INLET'), L('product', 'Product', 'OUTLET')],
    phaseChanges: [],
    governingPhysics: [
      'Mass basis: coefficients in kg per kg of reaction from the molar masses, summing to 0.',
      'Conversion from kinetics: CSTR X = k tau / (1 + k tau) (first order); batch X = 1 - exp(-k t).',
      'Heat of reaction Q = conversion x feed of limiting x dH_r; the jacket removes or supplies it: Q = U A LMTD.'
    ],
    keyConstraints: ['ERROR jacket duty short of the heat of reaction (runaway)', 'WARNING conversion below target'],
    example: 'NEUTRALISER_CONTRACT'
  },
  {
    id: 'distillation-column',
    name: 'Distillation column',
    keywords: ['distillation', 'distillation column', 'fractionator', 'fractionating column', 'stripper', 'stripping column', 'rectifier', 'rectifying column', 'still'],
    summary: 'A liquid feed split by volatility into a distillate (light key) and bottoms (heavy key). The reboiler boils, the condenser condenses: the vapour stays inside.',
    components: ['light', 'heavy'],
    ports: [L('feed', 'Feed', 'INLET'), L('distillate', 'Distillate', 'OUTLET'), L('bottoms', 'Bottoms', 'OUTLET')],
    phaseChanges: [],
    governingPhysics: [
      'Component balances: F x_F = D x_D + B x_B.',
      'Minimum reflux (Underwood), minimum stages (Fenske), actual stages (Gilliland).',
      'Reboiler duty = boil-up x latent heat = (R + 1) D lambda for a saturated-liquid feed.'
    ],
    keyConstraints: ['ERROR reflux below the minimum', 'WARNING reboiler duty above the steam available']
  },
  {
    id: 'heater',
    name: 'Heater / cooler on one stream',
    keywords: ['heater', 'preheater', 'steam heater', 'electric heater', 'immersion heater', 'chiller', 'warmer', 'pasteuriser', 'pasteurizer', 'heating', 'jacketed pipe', 'trim cooler'],
    summary: 'One stream in, the same stream out hotter or colder. Sensible heat only: Q = m cp dT, supplied by steam, power or a coolant.',
    components: [],
    ports: [L('inlet', 'Inlet', 'INLET'), L('outlet', 'Outlet', 'OUTLET')],
    phaseChanges: [],
    governingPhysics: ['Q = m cp (T_out - T_in).', 'Steam needed = Q / latent heat of the steam; coolant flow = Q / (cp dT_coolant).', 'Q = U A LMTD sizes the area.'],
    keyConstraints: ['ERROR duty needed above the rating', 'WARNING outlet above the product\'s limit']
  },
  {
    id: 'filler',
    name: 'Filler',
    keywords: ['filler', 'filling machine', 'rotary filler', 'piston filler', 'gravity filler', 'bottling', 'bottle filler', 'can filler', 'pail filler', 'drum filler'],
    summary: 'Liquid and empty containers in; full containers out. Each cycle draws the liquid it puts in the containers, so an empty tank starves it.',
    components: [],
    ports: [
      { id: 'product', name: 'Product', direction: 'INLET', phase: 'LIQUID', flowUnits: 'gal/min' },
      I('empties', 'Empty containers', 'INLET', { optional: true }),
      I('filled', 'Filled containers', 'OUTLET')
    ],
    phaseChanges: [],
    governingPhysics: ['Containers/min = nozzles x 60 / cycle seconds.', 'Liquid per cycle = containers per cycle x fill volume.', 'Cycle = fill time (volume / nozzle flow) + index time.'],
    keyConstraints: ['WARNING fill time shorter than the product can flow (foaming)']
  },
  {
    id: 'conveyor',
    name: 'Conveyor / accumulation table',
    keywords: ['conveyor', 'belt conveyor', 'roller conveyor', 'accumulation table', 'accumulator', 'transfer conveyor', 'infeed conveyor'],
    summary: 'Items in, the same items out after a transit time. It moves only what it is sent.',
    components: [],
    ports: [I('infeed', 'Infeed', 'INLET'), I('discharge', 'Discharge', 'OUTLET')],
    phaseChanges: [],
    governingPhysics: ['Rate = belt speed / pitch; transit time = length / speed; holds length / pitch items.'],
    keyConstraints: ['WARNING rate below what the upstream unit makes']
  },
  {
    id: 'item-station',
    name: 'Item station (labeler, capper, coder, inspection)',
    keywords: ['labeler', 'labeller', 'labelling', 'labeling', 'capper', 'capping', 'coder', 'checkweigher', 'inspection', 'vision inspection', 'seamer', 'sealer', 'induction sealer'],
    summary: 'Items in, the same items out, one operation each; rejects leave by their own lane.',
    components: [],
    ports: [I('infeed', 'Infeed', 'INLET'), I('good', 'Good', 'OUTLET'), I('reject', 'Rejects', 'OUTLET', { optional: true })],
    phaseChanges: [],
    governingPhysics: ['Rate = heads x 60 / cycle seconds.', 'Rejects as a random fraction per item (scrapRandom) or a reject lane (outputs with scrap: true).'],
    keyConstraints: ['WARNING reject rate above target']
  },
  {
    id: 'case-packer',
    name: 'Case packer / palletizer / wrapper',
    keywords: ['case packer', 'case erector', 'cartoner', 'tray packer', 'palletizer', 'palletiser', 'stretch wrapper', 'shrink wrapper', 'bundler', 'depalletizer'],
    summary: 'Items in, groups out: 12 bottles make a case, 5 layers a pallet. A cycle waits for its whole group.',
    components: [],
    ports: [I('items', 'Items', 'INLET'), I('packs', 'Packs', 'OUTLET')],
    phaseChanges: [],
    governingPhysics: ['Packs/min = items/min / items per pack.', 'A cycle needs its whole count (fullCyclesOnly, or inputs per port).'],
    keyConstraints: ['WARNING pack rate below the line rate']
  }
];

/**
 * A governing relation the equipment's main quantities must satisfy, checked
 * numerically at the design point, in SI. Requirements say a quantity exists;
 * a relation says it is right: a pump's shaft power times its efficiency is
 * its flow times its pressure rise, whatever the contract called them and
 * whatever units it wrote them in. A wrong formula or a missing / 1000 shows
 * up here, where the dimension check cannot see it.
 *
 * Each role is found in the contract by `roles` (contract.roles maps a role
 * to a parameter, a derived value or an engine name such as
 * inlet.massFlowKgPerS) or, failing that, by its kind of quantity and name.
 * lhs and rhs are expressions over the roles, every role in SI (m3/s, Pa, W,
 * kg/s, J/kg-K, K, m, kg/m3, rev/s).
 */
export interface PhysicsRelation {
  id: string;
  what: string;
  roles: Record<string, { unit: string; names?: string; what: string }>;
  lhs: string;
  rhs: string;
  /** '=' within tolerance, or lhs must be at least ('>=') / at most ('<=') rhs. */
  relation?: '=' | '>=' | '<=';
  /** Relative tolerance; 0.03 when absent. */
  tolerance?: number;
  fix: string;
}

const pumpLike = (powerNames: string): PhysicsRelation => ({
  id: 'power-balance',
  what: 'shaft power x efficiency = volumetric flow x pressure rise',
  roles: {
    flow: { unit: 'm3/s', names: 'flow|q$|gpm|acfm|m3|capacity|volum', what: 'the volumetric flow through it' },
    dp: { unit: 'Pa', names: 'dp|diff|delta|rise|static|head|discharge|developed|drop', what: 'the pressure it adds' },
    power: { unit: 'W', names: powerNames, what: 'the power it takes' },
    efficiency: { unit: '-', names: 'eff', what: 'its efficiency' }
  },
  lhs: 'power * efficiency',
  rhs: 'flow * dp',
  fix: 'Work the power out as flow x pressure rise / efficiency, in consistent units: kW = m3/s x kPa / efficiency.'
});

/** Relations for the archetypes that have one, by archetype id. */
export const ARCHETYPE_RELATIONS: Record<string, PhysicsRelation[]> = {
  pump: [pumpLike('shaft|brake|bhp|absorbed')],
  'fan-blower': [pumpLike('power|shaft|bhp|absorbed|fan|kw')],
  'dust-collector': [
    {
      id: 'air-to-cloth',
      what: 'air-to-cloth ratio = actual gas flow / cloth area',
      roles: {
        ratio: { unit: 'm/s', names: 'cloth|filtration|face|a2c|atc', what: 'the air-to-cloth ratio' },
        flow: { unit: 'm3/s', names: 'actual|acfm', what: 'the actual gas flow' },
        area: { unit: 'm2', names: 'area|cloth', what: 'the cloth area' }
      },
      lhs: 'ratio',
      rhs: 'flow / area',
      fix: 'airToCloth = actual flow / filter area, in consistent units (ACFM / ft2 gives ft/min).'
    }
  ],
  heater: [
    {
      id: 'sensible-heat',
      what: 'duty = mass flow x specific heat x (outlet - inlet temperature)',
      roles: {
        duty: { unit: 'W', names: 'duty|used|q$|kw|heat', what: 'the heat it adds' },
        massFlow: { unit: 'kg/s', names: 'mass|kg|flow', what: 'the mass flow heated' },
        cp: { unit: 'J/kg-K', names: 'cp|specific', what: 'the specific heat' },
        tIn: { unit: 'K', names: 'in|feed|temperatureC', what: 'the inlet temperature' },
        tOut: { unit: 'K', names: 'out|exit|leav', what: 'the outlet temperature' }
      },
      lhs: 'abs(duty)',
      rhs: 'abs(massFlow * cp * (tOut - tIn))',
      fix: 'duty (kW) = m (kg/s) x cp (kJ/kg-K) x (T_out - T_in), and the outlet temperature from the same duty.'
    }
  ],
  evaporator: [
    {
      id: 'latent-duty',
      what: 'duty covers the vapour boiled off x latent heat',
      roles: {
        duty: { unit: 'W', names: 'duty|steam|heat|q$', what: 'the heat supplied' },
        vapour: { unit: 'kg/s', names: 'vap|evap|boil|steam', what: 'the vapour boiled off' },
        latent: { unit: 'J/kg', names: 'latent|lambda|hvap|hfg|vaporis|vaporiz', what: 'the latent heat' }
      },
      lhs: 'duty',
      rhs: 'vapour * latent',
      relation: '>=',
      fix: 'The steam duty must at least cover vapour x latent heat (plus the sensible heat to bring the feed to the boil).'
    }
  ],
  condenser: [
    {
      id: 'condensing-duty',
      what: 'duty = vapour condensed x latent heat',
      roles: {
        duty: { unit: 'W', names: 'duty|q$|heat', what: 'the heat removed' },
        vapour: { unit: 'kg/s', names: 'vap|steam|condens', what: 'the vapour condensed' },
        latent: { unit: 'J/kg', names: 'latent|lambda|hvap|hfg', what: 'the latent heat' }
      },
      lhs: 'abs(duty)',
      rhs: 'vapour * latent',
      fix: 'Q (kW) = vapour (kg/s) x latent heat (kJ/kg).'
    }
  ],
  'agitated-mixer': [
    {
      id: 'agitator-power',
      what: 'agitator power = power number x density x speed^3 x diameter^5',
      roles: {
        power: { unit: 'W', names: 'power|agitat|impeller|motor|kw', what: 'the agitator power' },
        np: { unit: '-', names: '^np|power ?number|powernumber', what: 'the power number' },
        rho: { unit: 'kg/m3', names: 'rho|dens', what: 'the liquid density' },
        speed: { unit: 'Hz', names: 'speed|rpm|^n$|rate', what: 'the impeller speed (rev/s)' },
        diameter: { unit: 'm', names: 'diam|imp|^d$', what: 'the impeller diameter' }
      },
      lhs: 'power',
      rhs: 'np * rho * pow(speed, 3) * pow(diameter, 5)',
      fix: 'P (W) = Np x rho (kg/m3) x N^3 (rev/s) x D^5 (m); divide by 1000 for kW, and convert rpm to rev/s.'
    }
  ]
};
