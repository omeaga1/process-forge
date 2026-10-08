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
