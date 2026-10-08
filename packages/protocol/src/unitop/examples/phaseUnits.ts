import type { UnitOpContract } from '../contract.js';

/**
 * Worked examples of units that move material between phases.
 *
 * DUST_COLLECTOR_CONTRACT -- a pulse-jet baghouse catching a powdered
 * lubricant (magnesium stearate) from tablet-press extraction air. GAS with a
 * dispersed SOLID comes in; GAS leaves the top and SOLID leaves the hopper.
 * Nothing changes phase: it is a mechanical separation, so there are no
 * phaseChanges, and every flow is stated in the units of its phase (ACFM and
 * g/Nm³ for the air, kg/h for the powder, mg/Nm³ for the emission).
 *
 * SPRAY_DRYER_CONTRACT -- a liquid feed (40 % maltodextrin solution) is
 * atomised into air the dryer heats. The water EVAPORATES (LIQUID -> GAS) into
 * the exhaust and the solids DRY out of solution (LIQUID -> SOLID) as powder.
 * Those two phaseChanges are what make "liquid in, solid out" legal; the
 * energy balance and the exhaust humidity are what make it physically true.
 */

export const DUST_COLLECTOR_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'pulse-jet-dust-collector-v1',
  archetype: 'dust-collector',
  name: 'Pulse-jet dust collector (powdered lubricant)',
  description:
    'Baghouse on tablet-press extraction air carrying magnesium stearate. Dusty air in; clean air out; collected powder out of the hopper.',
  ports: [
    { id: 'dirty_air', name: 'Dirty air', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'GAS', dispersed: { lubricant: 'SOLID' }, carries: ['air', 'lubricant'] },
    // No carries: whatever else the gas brings (water vapour, say) leaves with the clean air, not in the hopper.
    { id: 'clean_air', name: 'Clean air', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'GAS', dispersed: { lubricant: 'SOLID' } },
    { id: 'hopper', name: 'Collected powder', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'SOLID', carries: ['lubricant'], densityKgPerM3: 250 }
  ],
  components: ['air', 'lubricant'],
  parameters: [
    { name: 'pressureKpa', label: 'Absolute pressure at the inlet', unit: 'kPa', value: 100.3, min: 80, max: 110, description: 'Slightly below atmospheric: the fan pulls the collector.' },
    { name: 'molarMass', label: 'Gas molar mass', unit: 'kg/kmol', value: 28.96, min: 2, max: 100 },
    { name: 'gasConstant', label: 'Gas constant R', unit: 'kJ/kmol-K', value: 8.314, min: 8.314, max: 8.315 },
    { name: 'normalK', label: 'Normal temperature', unit: 'K', value: 273.15, min: 273.15, max: 273.15 },
    { name: 'normalKpa', label: 'Normal pressure', unit: 'kPa', value: 101.325, min: 101.325, max: 101.325 },
    { name: 'filterAreaFt2', label: 'Filter cloth area', unit: 'ft2', value: 1500, min: 10, max: 100000 },
    { name: 'maxAirToCloth', label: 'Highest air-to-cloth ratio for this dust', unit: 'ft/min', value: 3, min: 1, max: 8, description: 'Fine, light stearates: 2-3.5 ft/min.' },
    { name: 'efficiency', label: 'Collection efficiency', unit: '-', value: 0.9995, min: 0.9, max: 0.99999 },
    { name: 'clothDpPerVelocity', label: 'Clean cloth pressure drop per ft/min', unit: 'inH2O-min/ft', value: 0.5, min: 0.05, max: 3 },
    { name: 'cakeDpInH2O', label: 'Residual cake pressure drop', unit: 'inH2O', value: 3, min: 0.5, max: 8 },
    { name: 'fanEfficiency', label: 'Fan efficiency', unit: '-', value: 0.65, min: 0.3, max: 0.9 },
    { name: 'permitMgPerNm3', label: 'Emission limit', unit: 'mg/Nm3', value: 10, min: 0.1, max: 500 },
    { name: 'fabricMaxC', label: 'Bag fabric temperature rating', unit: '°C', value: 130, min: 60, max: 260, description: 'Polyester felt.' },
    { name: 'dustMeltC', label: 'Dust softening point', unit: '°C', value: 88, min: 20, max: 1000, description: 'Magnesium stearate softens near 88 °C and blinds the bags.' },
    { name: 'kstBarMPerS', label: 'Dust deflagration index Kst', unit: 'bar-m/s', value: 150, min: 0, max: 600, description: 'Combustible dust: St1 below 200.' },
    { name: 'explosionProtected', label: 'Explosion protection fitted (1 yes, 0 no)', unit: '-', value: 1, min: 0, max: 1, description: 'Venting or suppression on the collector and isolation on its ducts.' }
  ],
  derived: [
    {
      name: 'gasDensity',
      label: 'Gas density (ideal gas)',
      unit: 'kg/m3',
      expr: 'pressureKpa * molarMass / (gasConstant * (inlet.temperatureC + 273.15))',
      description: 'rho = P M / (R T), T absolute.'
    },
    { name: 'airKgPerS', label: 'Gas mass flow', unit: 'kg/s', expr: 'inlet.massFlowKgPerS * (1 - inlet.x.lubricant)', description: 'Everything but the dust: air and any vapour it carries.' },
    { name: 'actualM3PerS', label: 'Actual gas flow', unit: 'm3/s', expr: 'airKgPerS / gasDensity' },
    { name: 'acfm', label: 'Actual flow', unit: 'ft3/min', expr: 'actualM3PerS * 35.3147 * 60' },
    {
      name: 'normalM3PerH',
      label: 'Normal flow (0 °C, 101.325 kPa)',
      unit: 'm3/h',
      expr: 'actualM3PerS * 3600 * (normalK / (inlet.temperatureC + 273.15)) * (pressureKpa / normalKpa)'
    },
    { name: 'airToCloth', label: 'Air-to-cloth ratio', unit: 'ft/min', expr: 'acfm / filterAreaFt2' },
    { name: 'dustInKgPerH', label: 'Dust in', unit: 'kg/h', expr: 'inlet.massFlowKgPerS * inlet.x.lubricant * 3600' },
    { name: 'inletLoading', label: 'Inlet dust loading', unit: 'g/Nm3', expr: 'if(normalM3PerH > 0, dustInKgPerH * 1000 / normalM3PerH, 0)' },
    { name: 'collectedKgPerH', label: 'Powder collected', unit: 'kg/h', expr: 'dustInKgPerH * efficiency' },
    { name: 'emittedKgPerH', label: 'Powder emitted', unit: 'kg/h', expr: 'dustInKgPerH - collectedKgPerH' },
    { name: 'outletMgPerNm3', label: 'Outlet emission', unit: 'mg/Nm3', expr: 'if(normalM3PerH > 0, emittedKgPerH * 1000000 / normalM3PerH, 0)' },
    { name: 'dpInH2O', label: 'Pressure drop across the bags', unit: 'inH2O', expr: 'clothDpPerVelocity * airToCloth + cakeDpInH2O' },
    { name: 'fanKw', label: 'Fan power', unit: 'kW', expr: 'actualM3PerS * dpInH2O * 249.089 / fanEfficiency / 1000' }
  ],
  constraints: [
    {
      id: 'air-to-cloth',
      expr: 'airToCloth <= maxAirToCloth',
      severity: 'ERROR',
      message: 'The air-to-cloth ratio is above what this dust filters at: the bags blind and the pressure drop runs away.',
      hint: 'Add filter area (filterAreaFt2) or pull less air.'
    },
    {
      id: 'emission',
      expr: 'outletMgPerNm3 <= permitMgPerNm3',
      severity: 'ERROR',
      message: 'The clean-air outlet emits more powder than the limit.',
      hint: 'Raise efficiency (membrane bags, an after-filter) or reduce the inlet loading.'
    },
    {
      id: 'fabric-temperature',
      expr: 'inlet.temperatureC <= fabricMaxC',
      severity: 'WARNING',
      message: 'The air is hotter than the bag fabric is rated for.',
      hint: 'Use a higher-rated fabric (aramid, PTFE) or cool the air.'
    },
    {
      id: 'sticky-dust',
      expr: 'inlet.temperatureC <= dustMeltC - 20',
      severity: 'WARNING',
      message: 'The air is within 20 °C of the dust\'s softening point: it smears on the bags instead of pulsing off.',
      hint: 'Cool the extraction air.'
    },
    {
      id: 'pressure-drop',
      expr: 'dpInH2O <= 6',
      severity: 'WARNING',
      message: 'The pressure drop is above 6 inH2O: the fan works hard and the bags wear.',
      hint: 'Add filter area.'
    },
    {
      id: 'combustible-dust',
      expr: 'kstBarMPerS <= 0 || explosionProtected >= 1',
      severity: 'WARNING',
      message: 'The dust is combustible (Kst > 0) and the collector has no explosion protection: it needs venting or suppression, and isolation on its ducts (NFPA 652/654).',
      hint: 'Fit protection and set explosionProtected to 1.'
    }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'acfm', dutyKw: 'fanKw' },
  designInlet: {
    temperatureC: 25,
    massFlowKgPerS: 2.245,
    densityGPerCm3: 0.001172,
    specificHeatKjPerKgK: 1.006,
    composition: { air: 0.9958, lubricant: 0.0042 }
  },
  outlets: [
    { port: 'clean_air', recovery: { air: '1', lubricant: '1 - efficiency' } },
    { port: 'hopper', recovery: { air: '0', lubricant: 'efficiency' } }
  ],
  provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] },
  drawing: {
    viewBox: { width: 100, height: 160 },
    shapes: [
      { type: 'rect', x: 15, y: 10, width: 70, height: 90, rx: 3, layer: 'body' },
      { type: 'line', x1: 15, y1: 25, x2: 85, y2: 25, layer: 'detail' },
      { type: 'line', x1: 30, y1: 25, x2: 30, y2: 90, layer: 'detail' },
      { type: 'line', x1: 43, y1: 25, x2: 43, y2: 90, layer: 'detail' },
      { type: 'line', x1: 57, y1: 25, x2: 57, y2: 90, layer: 'detail' },
      { type: 'line', x1: 70, y1: 25, x2: 70, y2: 90, layer: 'detail' },
      { type: 'polygon', points: [[15, 100], [85, 100], [58, 145], [42, 145]], layer: 'body' },
      { type: 'rect', x: 42, y: 145, width: 16, height: 8, layer: 'body' }
    ],
    nozzles: [
      { portId: 'dirty_air', x: 15, y: 56, side: 'left', label: 'Dirty air' },
      { portId: 'clean_air', x: 85, y: 10, side: 'right', label: 'Clean air' },
      { portId: 'hopper', x: 50, y: 95.6, side: 'bottom', label: 'Powder' }
    ]
  }
};

export const SPRAY_DRYER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'co-current-spray-dryer-v1',
  archetype: 'spray-dryer',
  name: 'Co-current spray dryer',
  description:
    'Atomises a 40 % maltodextrin solution into air the dryer heats. Water evaporates into the exhaust; the solids leave as powder. Liquid in, solid and gas out.',
  ports: [
    { id: 'feed', name: 'Liquid feed', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID', carries: ['water', 'solids'] },
    { id: 'air_in', name: 'Process air', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'GAS', carries: ['air', 'water'] },
    { id: 'powder', name: 'Powder', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'SOLID', dispersed: { water: 'LIQUID' }, carries: ['solids', 'water'], densityKgPerM3: 550 },
    { id: 'exhaust', name: 'Exhaust air', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'GAS', dispersed: { solids: 'SOLID' }, carries: ['air', 'water', 'solids'] }
  ],
  components: ['water', 'solids', 'air'],
  phaseChanges: [
    { component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'EVAPORATION', latentHeatKjPerKg: 'latentKjPerKg' },
    { component: 'solids', from: 'LIQUID', to: 'SOLID', mechanism: 'DRYING', latentHeatKjPerKg: '0' }
  ],
  parameters: [
    { name: 'airInletC', label: 'Air inlet temperature', unit: '°C', value: 200, min: 80, max: 350 },
    { name: 'outletC', label: 'Outlet temperature', unit: '°C', value: 90, min: 40, max: 150 },
    { name: 'ambientC', label: 'Air before the heater', unit: '°C', value: 25, min: -20, max: 50 },
    { name: 'feedC', label: 'Feed temperature', unit: '°C', value: 25, min: 1, max: 95 },
    { name: 'humidityIn', label: 'Process air humidity', unit: '-', value: 0.008, min: 0, max: 0.05, description: 'kg water per kg dry air.' },
    { name: 'residualMoisture', label: 'Powder moisture (wet basis)', unit: '-', value: 0.04, min: 0.005, max: 0.2 },
    { name: 'finesToExhaust', label: 'Fines carried out with the exhaust', unit: '-', value: 0.02, min: 0, max: 0.3, description: 'Share of the powder too fine to settle in the chamber: it leaves with the air, for a cyclone or baghouse to catch.' },
    { name: 'cpAir', label: 'Humid air specific heat', unit: 'kJ/kg-K', value: 1.02, min: 1.0, max: 1.1 },
    { name: 'cpWater', label: 'Water specific heat', unit: 'kJ/kg-K', value: 4.18, min: 4.1, max: 4.25 },
    { name: 'cpSolids', label: 'Solids specific heat', unit: 'kJ/kg-K', value: 1.5, min: 0.5, max: 3 },
    { name: 'criticalK', label: 'Critical temperature of water', unit: 'K', value: 647.1, min: 647.1, max: 647.1 },
    { name: 'boilingK', label: 'Normal boiling point of water', unit: 'K', value: 373.15, min: 373.15, max: 373.15 },
    { name: 'latentAt100', label: 'Latent heat of water at 100 °C', unit: 'kJ/kg', value: 2256.4, min: 2256.4, max: 2256.4 },
    { name: 'heatLossFraction', label: 'Heat lost through the chamber wall', unit: '-', value: 0.05, min: 0, max: 0.3 },
    { name: 'pressureKpa', label: 'Chamber pressure', unit: 'kPa', value: 101.1, min: 90, max: 110 },
    { name: 'buckP0', label: 'Buck constant', unit: 'kPa', value: 0.61121, min: 0.61121, max: 0.61121 },
    { name: 'buckA', label: 'Buck constant', unit: '°C', value: 234.5, min: 234.5, max: 234.5 },
    { name: 'buckB', label: 'Buck constant', unit: '°C', value: 257.14, min: 257.14, max: 257.14 },
    { name: 'maxOutletRh', label: 'Highest exhaust relative humidity', unit: '-', value: 0.25, min: 0.05, max: 0.9 },
    { name: 'productMaxC', label: 'Highest temperature the powder tolerates', unit: '°C', value: 100, min: 30, max: 250 }
  ],
  derived: [
    { name: 'solidsKgPerS', label: 'Solids in', unit: 'kg/s', expr: 'inlet.massFlowKgPerS * inlet.x.solids' },
    { name: 'airKgPerS', label: 'Dry air in', unit: 'kg/s', expr: 'inlet.massFlowKgPerS * inlet.x.air' },
    { name: 'airWaterKgPerS', label: 'Water in the air', unit: 'kg/s', expr: 'airKgPerS * humidityIn' },
    { name: 'feedWaterKgPerS', label: 'Water in the feed', unit: 'kg/s', expr: 'max(0, inlet.massFlowKgPerS * inlet.x.water - airWaterKgPerS)' },
    { name: 'powderKgPerS', label: 'Powder collected from the chamber', unit: 'kg/s', expr: 'solidsKgPerS * (1 - finesToExhaust) / (1 - residualMoisture)' },
    { name: 'powderWaterKgPerS', label: 'Water left in the powder', unit: 'kg/s', expr: 'min(powderKgPerS * residualMoisture, feedWaterKgPerS)' },
    { name: 'evaporatedKgPerS', label: 'Water evaporated', unit: 'kg/s', expr: 'feedWaterKgPerS - powderWaterKgPerS' },
    {
      name: 'latentKjPerKg',
      label: 'Latent heat at the outlet temperature (Watson, fitted to the steam tables)',
      unit: 'kJ/kg',
      expr: 'latentAt100 * pow((criticalK - (outletC + 273.15)) / (criticalK - boilingK), 0.33)'
    },
    { name: 'heatAvailableKw', label: 'Heat the air gives up', unit: 'kW', expr: 'airKgPerS * cpAir * (airInletC - outletC) * (1 - heatLossFraction)' },
    {
      name: 'heatNeededKw',
      label: 'Heat to evaporate the water and warm the product',
      unit: 'kW',
      expr: 'evaporatedKgPerS * latentKjPerKg + feedWaterKgPerS * cpWater * (outletC - feedC) + solidsKgPerS * cpSolids * (outletC - feedC)'
    },
    { name: 'heaterKw', label: 'Air heater duty', unit: 'kW', expr: 'airKgPerS * cpAir * (airInletC - ambientC)' },
    { name: 'humidityOut', label: 'Exhaust humidity', unit: '-', expr: 'if(airKgPerS > 0, (airWaterKgPerS + evaporatedKgPerS) / airKgPerS, 0)' },
    { name: 'vapourKpa', label: 'Water vapour partial pressure in the exhaust', unit: 'kPa', expr: 'humidityOut * pressureKpa / (0.62198 + humidityOut)' },
    {
      name: 'saturationKpa',
      label: 'Saturation pressure at the outlet temperature (Buck)',
      unit: 'kPa',
      expr: 'buckP0 * exp((18.678 - outletC / buckA) * (outletC / (buckB + outletC)))'
    },
    { name: 'exhaustRh', label: 'Exhaust relative humidity', unit: '-', expr: 'vapourKpa / saturationKpa' },
    { name: 'thermalEfficiency', label: 'Thermal efficiency', unit: '-', expr: 'if(heaterKw > 0, evaporatedKgPerS * latentKjPerKg / heaterKw, 0)' },
    { name: 'powderShareOfWater', label: 'Share of the water that stays in the powder', unit: '-', expr: 'if(inlet.massFlowKgPerS * inlet.x.water > 0, powderWaterKgPerS / (inlet.massFlowKgPerS * inlet.x.water), 0)' },
    { name: 'powderKgPerH', label: 'Powder made', unit: 'kg/h', expr: 'powderKgPerS * 3600' },
    { name: 'finesKgPerH', label: 'Fines to the exhaust', unit: 'kg/h', expr: 'solidsKgPerS * finesToExhaust * 3600' }
  ],
  constraints: [
    {
      id: 'energy-balance',
      expr: 'heatAvailableKw >= heatNeededKw',
      severity: 'ERROR',
      message: 'The air does not carry enough heat to evaporate the water: the powder leaves wet or the chamber floods.',
      hint: 'Raise airInletC, pull more air, or feed less.'
    },
    {
      id: 'outlet-below-inlet',
      expr: 'outletC < airInletC',
      severity: 'ERROR',
      message: 'The outlet must be cooler than the inlet: drying takes heat out of the air.',
      hint: 'Lower outletC.'
    },
    {
      id: 'not-saturated',
      expr: 'exhaustRh < 1',
      severity: 'ERROR',
      message: 'The exhaust would be saturated: water condenses in the chamber and the cyclone.',
      hint: 'More air, a higher outlet temperature, or less feed.'
    },
    {
      id: 'dry-enough',
      expr: 'exhaustRh <= maxOutletRh',
      severity: 'WARNING',
      message: 'The exhaust is humid: the powder will not reach its target moisture at this outlet temperature.',
      hint: 'Raise outletC or the air flow.'
    },
    {
      id: 'product-temperature',
      expr: 'outletC <= productMaxC',
      severity: 'WARNING',
      message: 'The powder leaves hotter than it tolerates (stickiness, browning).',
      hint: 'Lower outletC.'
    }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'powderKgPerS * 60', dutyKw: 'heaterKw' },
  designInlet: {
    temperatureC: 25,
    massFlowKgPerS: 0.4814,
    densityGPerCm3: 0.0012,
    specificHeatKjPerKgK: 1.02,
    composition: { water: 0.0421, solids: 0.02308, air: 0.93482 }
  },
  outlets: [
    { port: 'powder', recovery: { solids: '1 - finesToExhaust', water: 'powderShareOfWater', air: '0' }, temperatureC: 'outletC' },
    { port: 'exhaust', recovery: { solids: 'finesToExhaust', water: '1 - powderShareOfWater', air: '1' }, temperatureC: 'outletC' }
  ],
  provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] },
  drawing: {
    viewBox: { width: 100, height: 170 },
    shapes: [
      { type: 'rect', x: 20, y: 15, width: 60, height: 80, layer: 'body' },
      { type: 'polygon', points: [[20, 95], [80, 95], [56, 150], [44, 150]], layer: 'body' },
      { type: 'rect', x: 44, y: 150, width: 12, height: 10, layer: 'body' },
      { type: 'circle', cx: 50, cy: 22, r: 4, layer: 'detail' },
      { type: 'polyline', points: [[50, 26], [36, 60]], layer: 'detail', dashed: true },
      { type: 'polyline', points: [[50, 26], [50, 64]], layer: 'detail', dashed: true },
      { type: 'polyline', points: [[50, 26], [64, 60]], layer: 'detail', dashed: true }
    ],
    nozzles: [
      { portId: 'feed', x: 50, y: 8.8, side: 'top', label: 'Feed' },
      { portId: 'air_in', x: 20, y: 14.7, side: 'left', label: 'Air' },
      { portId: 'exhaust', x: 80, y: 47, side: 'right', label: 'Exhaust' },
      { portId: 'powder', x: 50, y: 94.1, side: 'bottom', label: 'Powder' }
    ]
  }
};

/**
 * A venturi scrubber: hot dusty gas and scrubbing water in, cooled clean gas
 * and dirty liquor out. It reads each inlet on its own (port.gas_in.*,
 * port.liquor_in.*), because its physics turns on the liquid-to-gas ratio:
 *
 *   L/G  = liquor gal/min per 1000 actual ft³/min of gas
 *   d_d  = 16400 / v_throat(ft/s) + 1.45 (L/G)^1.5          (Nukiyama-Tanasawa, µm)
 *   ψ    = ρ_p v d_p² / (18 µ d_d)                         (inertial impaction)
 *   η    = 1 − exp(−k (L/G) √ψ)                           (Johnstone)
 *   ΔP   = 5e-5 v² (L/G)                                    (Calvert, inH2O, v in ft/s)
 *
 * and the hot gas evaporates water until it nears saturation at the outlet
 * temperature: the heat the gas gives up pays for that evaporation and for
 * warming the once-through water, which sets the outlet temperature.
 */
export const VENTURI_SCRUBBER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'venturi-scrubber-v1',
  archetype: 'wet-scrubber',
  name: 'Venturi scrubber',
  description: 'Hot dusty gas and scrubbing water in; cooled, cleaned, humidified gas and dirty liquor out. Collection follows the liquid-to-gas ratio and the throat velocity.',
  ports: [
    { id: 'gas_in', name: 'Dirty gas', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'GAS', dispersed: { dust: 'SOLID' }, carries: ['air', 'water', 'dust'] },
    { id: 'liquor_in', name: 'Scrubbing water', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID', carries: ['water'] },
    { id: 'gas_out', name: 'Clean gas', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'GAS', dispersed: { dust: 'SOLID' } },
    { id: 'liquor_out', name: 'Dirty liquor', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID', dispersed: { dust: 'SOLID' }, densityKgPerM3: 1010 }
  ],
  components: ['air', 'water', 'dust'],
  phaseChanges: [{ component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'EVAPORATION', latentHeatKjPerKg: 'latentKjPerKg' }],
  parameters: [
    { name: 'throatAreaM2', label: 'Throat area', unit: 'm2', value: 0.035, min: 0.001, max: 5 },
    { name: 'johnstoneK', label: 'Johnstone constant', unit: '-', value: 0.15, min: 0.05, max: 0.25, description: '1000 ft³/gal; 0.1 to 0.2 for most venturis.' },
    { name: 'particleUm', label: 'Particle size (mass median)', unit: 'um', value: 3, min: 0.1, max: 100 },
    { name: 'particleDensity', label: 'Particle density', unit: 'kg/m3', value: 2200, min: 500, max: 8000 },
    { name: 'gasViscosity', label: 'Gas viscosity', unit: 'Pa-s', value: 0.000021, min: 0.00001, max: 0.00005 },
    { name: 'outletC', label: 'Gas and liquor outlet temperature', unit: '°C', value: 34, min: 10, max: 100, description: 'Where the gas\'s heat balances the water it evaporates and the warming of the once-through water.' },
    { name: 'pressureKpa', label: 'Absolute pressure', unit: 'kPa', value: 99, min: 80, max: 110 },
    { name: 'molarMass', label: 'Gas molar mass', unit: 'kg/kmol', value: 28.7, min: 2, max: 100 },
    { name: 'gasConstant', label: 'Gas constant R', unit: 'kJ/kmol-K', value: 8.314, min: 8.314, max: 8.315 },
    { name: 'cpGas', label: 'Gas specific heat', unit: 'kJ/kg-K', value: 1.03, min: 0.9, max: 1.2 },
    { name: 'latentKjPerKg', label: 'Latent heat of water', unit: 'kJ/kg', value: 2418, min: 2250, max: 2500 },
    { name: 'cpWater', label: 'Water specific heat', unit: 'kJ/kg-K', value: 4.18, min: 4.1, max: 4.25 },
    { name: 'buckP0', label: 'Buck constant', unit: 'kPa', value: 0.61121, min: 0.61121, max: 0.61121 },
    { name: 'buckA', label: 'Buck constant', unit: '°C', value: 234.5, min: 234.5, max: 234.5 },
    { name: 'buckB', label: 'Buck constant', unit: '°C', value: 257.14, min: 257.14, max: 257.14 },
    { name: 'outletRh', label: 'Gas outlet relative humidity', unit: '-', value: 0.95, min: 0.5, max: 1 },
    { name: 'minRatio', label: 'Lowest L/G', unit: 'gal/kcf', value: 5, min: 1, max: 30, description: 'gal per 1000 actual ft³.' },
    { name: 'maxDpInH2O', label: 'Highest pressure drop the fan can pull', unit: 'inH2O', value: 40, min: 5, max: 100 },
    { name: 'ntA', label: 'Nukiyama-Tanasawa velocity term', unit: 'um-ft/s', value: 16400, min: 16400, max: 16400 },
    { name: 'ntB', label: 'Nukiyama-Tanasawa liquor term', unit: 'um', value: 1.45, min: 1.45, max: 1.45 },
    { name: 'calvertC', label: 'Calvert pressure-drop coefficient', unit: 'inH2O-s2/ft2', value: 0.00005, min: 0.00003, max: 0.00008 },
    { name: 'requiredEfficiency', label: 'Required collection efficiency', unit: '-', value: 0.98, min: 0.5, max: 0.9999 }
  ],
  derived: [
    { name: 'gasKgPerS', label: 'Gas in (without dust)', unit: 'kg/s', expr: 'port.gas_in.massFlowKgPerS * (1 - port.gas_in.x.dust)' },
    { name: 'gasDensity', label: 'Gas density at the inlet', unit: 'kg/m3', expr: 'pressureKpa * molarMass / (gasConstant * (port.gas_in.temperatureC + 273.15))' },
    { name: 'gasM3PerS', label: 'Actual gas flow', unit: 'm3/s', expr: 'gasKgPerS / gasDensity' },
    { name: 'acfm', label: 'Actual gas flow', unit: 'ft3/min', expr: 'gasM3PerS * 35.3147 * 60' },
    { name: 'liquorGpm', label: 'Scrubbing water', unit: 'gal/min', expr: 'port.liquor_in.volumetricFlowGpm' },
    { name: 'ratio', label: 'L/G', unit: 'gal/kcf', expr: 'if(acfm > 0, liquorGpm / (acfm / 1000), 0)' },
    { name: 'throatVelocity', label: 'Throat velocity', unit: 'm/s', expr: 'gasM3PerS / throatAreaM2' },
    { name: 'throatFtPerS', label: 'Throat velocity', unit: 'ft/s', expr: 'throatVelocity * 3.28084' },
    { name: 'dropletUm', label: 'Mean droplet size (Nukiyama-Tanasawa)', unit: 'um', expr: 'ntA / max(throatFtPerS, 1) + ntB * pow(ratio, 1.5)' },
    {
      name: 'impaction',
      label: 'Inertial impaction parameter',
      unit: '-',
      expr: 'particleDensity * throatVelocity * pow(particleUm / 1000000, 2) / (18 * gasViscosity * max(dropletUm, 1) / 1000000)'
    },
    { name: 'efficiency', label: 'Collection efficiency (Johnstone)', unit: '-', expr: '1 - exp(0 - johnstoneK * ratio * sqrt(impaction))' },
    { name: 'dpInH2O', label: 'Pressure drop (Calvert)', unit: 'inH2O', expr: 'calvertC * throatFtPerS * throatFtPerS * ratio' },
    { name: 'waterInGasKgPerS', label: 'Water in the gas', unit: 'kg/s', expr: 'port.gas_in.massFlowKgPerS * port.gas_in.x.water' },
    { name: 'dryGasKgPerS', label: 'Dry gas', unit: 'kg/s', expr: 'max(gasKgPerS - waterInGasKgPerS, 0.000001)' },
    {
      name: 'saturationKpa',
      label: 'Saturation pressure at the outlet',
      unit: 'kPa',
      expr: 'buckP0 * exp((18.678 - outletC / buckA) * (outletC / (buckB + outletC)))'
    },
    { name: 'humidityOut', label: 'Gas outlet humidity', unit: '-', expr: '0.62198 * outletRh * saturationKpa / (pressureKpa - outletRh * saturationKpa)' },
    { name: 'evaporatedKgPerS', label: 'Water evaporated', unit: 'kg/s', expr: 'max(dryGasKgPerS * humidityOut - waterInGasKgPerS, 0)' },
    { name: 'heatGivenKw', label: 'Heat the gas gives up', unit: 'kW', expr: 'gasKgPerS * cpGas * (port.gas_in.temperatureC - outletC)' },
    { name: 'heatToEvaporateKw', label: 'Heat to evaporate the water', unit: 'kW', expr: 'evaporatedKgPerS * latentKjPerKg' },
    {
      name: 'heatToWarmKw',
      label: 'Heat to warm the scrubbing water',
      unit: 'kW',
      expr: 'port.liquor_in.massFlowKgPerS * cpWater * (outletC - port.liquor_in.temperatureC)'
    },
    { name: 'heatNeededKw', label: 'Heat the water takes', unit: 'kW', expr: 'heatToEvaporateKw + heatToWarmKw' },
    { name: 'waterTotalKgPerS', label: 'Water in', unit: 'kg/s', expr: 'inlet.massFlowKgPerS * inlet.x.water' },
    { name: 'waterToGas', label: 'Share of the water leaving with the gas', unit: '-', expr: 'if(waterTotalKgPerS > 0, min((waterInGasKgPerS + evaporatedKgPerS) / waterTotalKgPerS, 1), 0)' }
  ],
  constraints: [
    { id: 'enough-liquor', expr: 'ratio >= minRatio', severity: 'ERROR', message: 'Too little scrubbing water for the gas: the throat runs dry.', hint: 'Raise the water flow or lower the gas flow.' },
    {
      id: 'water-left',
      expr: 'evaporatedKgPerS < port.liquor_in.massFlowKgPerS',
      severity: 'ERROR',
      message: 'The hot gas would evaporate all the scrubbing water.',
      hint: 'Raise the water flow, or cool the gas first.'
    },
    {
      id: 'collects',
      expr: 'efficiency >= requiredEfficiency',
      severity: 'WARNING',
      message: 'Collection is below what is required.',
      hint: 'Narrow the throat (throatAreaM2) for more velocity, or raise L/G; both raise the pressure drop.'
    },
    { id: 'fan', expr: 'dpInH2O <= maxDpInH2O', severity: 'ERROR', message: 'The pressure drop is more than the fan can pull.', hint: 'Widen the throat or lower L/G.' },
    {
      id: 'heat-balance',
      expr: 'abs(heatGivenKw - heatNeededKw) <= 0.1 * max(heatGivenKw, 1)',
      severity: 'WARNING',
      message: 'The outlet temperature does not balance: the heat the gas gives up should equal what the water takes to evaporate and warm.',
      hint: 'Move outletC: lower when the water takes more heat than the gas gives, higher when it takes less.'
    },
    { id: 'velocity', expr: 'throatVelocity >= 40 && throatVelocity <= 150', severity: 'WARNING', message: 'Throat velocity outside 40-150 m/s.', hint: 'Resize the throat.' }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'acfm' },
  designInlet: { temperatureC: 41, massFlowKgPerS: 5.115, densityGPerCm3: 0.0019, specificHeatKjPerKgK: 2.97, composition: { air: 0.3786, water: 0.6203, dust: 0.00115 } },
  designPorts: {
    gas_in: { temperatureC: 180, massFlowKgPerS: 1.96, composition: { air: 0.988, water: 0.009, dust: 0.003 } },
    liquor_in: { temperatureC: 20, massFlowKgPerS: 3.155, volumetricFlowGpm: 50, composition: { water: 1 } }
  },
  outlets: [
    { port: 'gas_out', recovery: { air: '1', dust: '1 - efficiency', water: 'waterToGas' }, temperatureC: 'outletC' },
    { port: 'liquor_out', recovery: { air: '0', dust: 'efficiency', water: '1 - waterToGas' }, temperatureC: 'outletC' }
  ],
  provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] },
  drawing: {
    viewBox: { width: 160, height: 120 },
    shapes: [
      { type: 'polygon', points: [[10, 20], [60, 20], [72, 45], [72, 55], [60, 80], [10, 80]], layer: 'body' },
      { type: 'rect', x: 72, y: 45, width: 18, height: 10, layer: 'body' },
      { type: 'polygon', points: [[90, 45], [100, 20], [150, 20], [150, 110], [100, 110], [90, 55]], layer: 'body' },
      { type: 'line', x1: 30, y1: 30, x2: 45, y2: 50, layer: 'detail', dashed: true },
      { type: 'line', x1: 30, y1: 70, x2: 45, y2: 50, layer: 'detail', dashed: true }
    ],
    nozzles: [
      { portId: 'gas_in', x: 6.25, y: 50, side: 'left', label: 'Gas in' },
      { portId: 'liquor_in', x: 22, y: 16.7, side: 'top', label: 'Water' },
      { portId: 'gas_out', x: 78, y: 16.7, side: 'top', label: 'Gas out' },
      { portId: 'liquor_out', x: 78, y: 91.7, side: 'bottom', label: 'Liquor' }
    ]
  }
};
