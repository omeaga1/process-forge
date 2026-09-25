import type { UnitOpContract } from '../contract.js';

/**
 * Worked examples of units that change what a stream is made of.
 *
 * JUICE_CONCENTRATOR_CONTRACT separates by component: steam boils water off a
 * juice, so the vapour is water and the concentrate keeps every bit of the
 * sugar. How much water leaves depends on the live feed (inlet.x.water,
 * inlet.massFlowKgPerS, inlet.temperatureC).
 *
 * NEUTRALISER_CONTRACT reacts: HCl + NaOH -> NaCl + H2O, written on a mass
 * basis from the molar masses (36.461 + 39.997 = 58.443 + 18.015), so the
 * coefficients add up to zero.
 */
export const JUICE_CONCENTRATOR_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'juice-concentrator-v1',
  name: 'Falling-film juice concentrator',
  description: 'Boils water off a juice with steam. The vapour is water; the sugar all stays in the concentrate.',
  ports: [
    { id: 'juice', name: 'Juice', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'vapour', name: 'Vapour', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'concentrate', name: 'Concentrate', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
  ],
  components: ['water', 'sugar'],
  parameters: [
    { name: 'steamKw', label: 'Steam duty', unit: 'kW', value: 900, min: 0, max: 20000 },
    { name: 'boilC', label: 'Boiling point', unit: '°C', value: 70, min: 30, max: 110, description: 'Under vacuum.' },
    { name: 'latentKjPerKg', label: 'Latent heat', unit: 'kJ/kg', value: 2333, min: 2000, max: 2500 },
    { name: 'maxBrix', label: 'Highest concentrate sugar', unit: '%', value: 65, min: 10, max: 80 }
  ],
  derived: [
    { name: 'waterKgPerS', label: 'Water in', unit: 'kg/s', expr: 'inlet.massFlowKgPerS * inlet.x.water' },
    { name: 'sensibleKw', label: 'Heat to boiling', unit: 'kW', expr: 'inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK * max(0, boilC - inlet.temperatureC)' },
    {
      name: 'boiledKgPerS',
      label: 'Water boiled off',
      unit: 'kg/s',
      expr: 'clamp((steamKw - sensibleKw) / latentKjPerKg, 0, 0.95 * waterKgPerS)'
    },
    { name: 'waterToVapour', label: 'Water to vapour', unit: '-', expr: 'if(waterKgPerS > 0, boiledKgPerS / waterKgPerS, 0)' },
    {
      name: 'productBrix',
      label: 'Concentrate sugar',
      unit: '%',
      expr: 'if(inlet.massFlowKgPerS > boiledKgPerS, 100 * inlet.massFlowKgPerS * inlet.x.sugar / (inlet.massFlowKgPerS - boiledKgPerS), 0)'
    }
  ],
  constraints: [
    {
      id: 'boils',
      expr: 'steamKw > sensibleKw',
      severity: 'ERROR',
      message: 'The steam cannot bring the juice to the boil.',
      hint: 'Raise steamKw or preheat the juice.'
    },
    {
      id: 'pumpable',
      expr: 'productBrix <= maxBrix',
      severity: 'WARNING',
      message: 'The concentrate is thicker than the highest sugar the pumps can move.',
      hint: 'Lower steamKw or feed more juice.'
    }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', dutyKw: 'steamKw' },
  designInlet: {
    temperatureC: 20,
    volumetricFlowGpm: 30,
    massFlowKgPerS: 2.0,
    specificHeatKjPerKgK: 3.9,
    densityGPerCm3: 1.05,
    composition: { water: 0.88, sugar: 0.12 }
  },
  outlets: [
    { port: 'vapour', recovery: { water: 'waterToVapour', sugar: '0' }, temperatureC: 'boilC' },
    { port: 'concentrate', recovery: { sugar: '1' }, temperatureC: 'boilC' }
  ],
  provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] },
  drawing: {
    viewBox: { width: 80, height: 160 },
    shapes: [
      { type: 'rect', x: 20, y: 10, width: 40, height: 120, rx: 6, layer: 'body' },
      { type: 'line', x1: 30, y1: 20, x2: 30, y2: 120, layer: 'detail' },
      { type: 'line', x1: 40, y1: 20, x2: 40, y2: 120, layer: 'detail' },
      { type: 'line', x1: 50, y1: 20, x2: 50, y2: 120, layer: 'detail' },
      { type: 'polygon', points: [[20, 130], [60, 130], [48, 150], [32, 150]], layer: 'body' }
    ],
    nozzles: [
      { portId: 'juice', x: 25, y: 12.5, side: 'left', label: 'Juice' },
      { portId: 'vapour', x: 75, y: 25, side: 'right', label: 'Vapour' },
      { portId: 'concentrate', x: 50, y: 93.8, side: 'bottom', label: 'Concentrate' }
    ]
  }
};

export const NEUTRALISER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'inline-neutraliser-v1',
  name: 'Inline acid neutraliser',
  description: 'Neutralises hydrochloric acid in a waste stream with the caustic already in it. HCl + NaOH -> NaCl + H2O.',
  ports: [
    { id: 'in', name: 'Acid waste', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'out', name: 'Neutralised', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
  ],
  components: ['HCl', 'NaOH', 'NaCl', 'water'],
  parameters: [{ name: 'mixingEfficiency', label: 'Mixing efficiency', unit: '-', value: 0.98, min: 0.5, max: 1 }],
  derived: [
    {
      name: 'causticRatio',
      label: 'Caustic to acid (kg/kg)',
      unit: '-',
      expr: 'if(inlet.x.HCl > 0, inlet.x.NaOH / inlet.x.HCl, 99)',
      description: 'Stoichiometric is 1.097 kg NaOH per kg HCl.'
    }
  ],
  constraints: [
    {
      id: 'enough-caustic',
      expr: 'causticRatio >= 1.097',
      severity: 'WARNING',
      message: 'There is less caustic than it takes to neutralise all the acid, so acid leaves the unit.',
      hint: 'Dose more caustic upstream.'
    }
  ],
  reactions: [
    {
      id: 'neutralise',
      limiting: 'HCl',
      conversion: 'mixingEfficiency',
      coefficients: { HCl: -1, NaOH: -1.096980335, NaCl: 1.60289076, water: 0.494089575 }
    }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: '200' },
  designInlet: { volumetricFlowGpm: 50, composition: { HCl: 0.03, NaOH: 0.035, water: 0.935 } },
  provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] },
  drawing: {
    viewBox: { width: 160, height: 60 },
    shapes: [
      { type: 'rect', x: 10, y: 20, width: 140, height: 20, rx: 10, layer: 'body' },
      { type: 'polyline', points: [[30, 22], [40, 38], [50, 22], [60, 38], [70, 22], [80, 38], [90, 22], [100, 38], [110, 22], [120, 38], [130, 22]], layer: 'detail' }
    ],
    nozzles: [
      { portId: 'in', x: 6.25, y: 50, side: 'left', label: 'In' },
      { portId: 'out', x: 93.75, y: 50, side: 'right', label: 'Out' }
    ]
  }
};
