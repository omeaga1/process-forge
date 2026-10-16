import type { UnitOpContract } from '../contract.js';

/**
 * A worked example of a batch unit: a cooling crystalliser.
 *
 * Each batch fills from the feed, is heated to dissolve everything (the time
 * follows from this batch's own mass and temperature, via batch.*), cooled
 * slowly so crystals grow, then drained in two steps: the clear mother liquor
 * off the top to one outlet, the crystal slurry out of the bottom to another.
 */
export const CRYSTALLISER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  archetype: 'crystalliser',
  id: 'cooling-crystalliser-v1',
  name: 'Cooling crystalliser',
  description:
    'Batch crystalliser for magnesium sulfate: charge, heat to dissolve, cool to crystallise (the yield comes from the solubility at the final temperature), then decant the mother liquor and drop the crystal slurry.',
  ports: [
    { id: 'feed', name: 'Feed', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID' },
    { id: 'liquor', name: 'Mother liquor', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID' },
    { id: 'slurry', name: 'Crystal slurry', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID', dispersed: { crystals: 'SOLID' } }
  ],
  components: ['water', 'mgso4', 'crystals'],
  phaseChanges: [{ component: 'crystals', from: 'LIQUID', to: 'SOLID', mechanism: 'CRYSTALLISATION', description: 'Solute leaves solution as the batch cools below saturation; the heat of crystallisation is small beside the sensible heat the jacket removes.' }],
  // Mass basis: 1 kg of dissolved MgSO4 takes 1.0476 kg of water into 2.0476 kg of MgSO4·7H2O crystals
  // (7 x 18.015 / 120.366). How much crystallises is not typed in: it is what the solubility curve says
  // cannot stay dissolved at finalC (crystal_yield, CRC tables).
  reactions: [
    {
      id: 'crystallise',
      limiting: 'mgso4',
      conversion: "crystal_yield('mgso4', batch.x.mgso4, finalC)",
      coefficients: { mgso4: -1, water: -1.0476, crystals: 2.0476 }
    }
  ],
  parameters: [
    { name: 'workingGallons', label: 'Working volume', unit: 'gal', value: 1200, min: 10, max: 20000 },
    { name: 'chargeGpm', label: 'Charge rate', unit: 'gal/min', value: 60, min: 1, max: 2000 },
    { name: 'jacketKw', label: 'Jacket duty', unit: 'kW', value: 250, min: 1, max: 5000 },
    { name: 'dissolveC', label: 'Dissolve at', unit: '°C', value: 75, min: 20, max: 120 },
    { name: 'finalC', label: 'Cool to', unit: '°C', value: 15, min: -10, max: 60 },
    { name: 'coolingRateCPerMin', label: 'Cooling rate', unit: '°C/min', value: 0.5, min: 0.05, max: 5 },
    { name: 'settledSolidsFraction', label: 'Crystals in the settled slurry', unit: '-', value: 0.45, min: 0.05, max: 0.95 },
    { name: 'drainGpm', label: 'Drain rate', unit: 'gal/min', value: 120, min: 1, max: 2000 },
    { name: 'cpKjPerKgK', label: 'Specific heat', unit: 'kJ/kg-K', value: 3.6, min: 0.5, max: 5 }
  ],
  derived: [
    {
      name: 'heatSeconds',
      label: 'Heat-up time',
      unit: 's',
      expr: 'batch.massKg * cpKjPerKgK * max(0, dissolveC - batch.temperatureC) / jacketKw',
      description: 'From this batch: its mass and the temperature it was charged at.'
    },
    { name: 'coolSeconds', label: 'Cooling time', unit: 's', expr: '(dissolveC - finalC) / coolingRateCPerMin * 60' },
    {
      name: 'crystalYieldKg',
      label: 'Crystals made per batch',
      unit: 'kg',
      expr: "batch.massKg * batch.x.mgso4 * crystal_yield('mgso4', batch.x.mgso4, finalC) * 2.0476",
      description: 'MgSO4·7H2O the solubility at the final temperature cannot keep dissolved.'
    }
  ],
  constraints: [
    {
      id: 'makes-crystals',
      expr: 'crystalYieldKg > 0',
      severity: 'WARNING',
      message: 'At the final temperature the feed is still below saturation, so nothing crystallises.',
      hint: 'Cool further (lower finalC) or use a stronger feed.'
    },
    {
      id: 'dissolves',
      expr: "batch.x.mgso4 <= solubility('mgso4', dissolveC) / (1 + solubility('mgso4', dissolveC))",
      severity: 'ERROR',
      message: 'The feed is stronger than a saturated solution at the dissolving temperature, so heating cannot dissolve it all.',
      hint: 'Raise dissolveC or dilute the feed.'
    },
    {
      id: 'cools',
      expr: 'finalC < dissolveC',
      severity: 'ERROR',
      message: 'It has to cool below the dissolving temperature to crystallise anything.',
      hint: 'Lower finalC or raise dissolveC.'
    },
    {
      id: 'slow-enough',
      expr: 'coolingRateCPerMin <= 1',
      severity: 'WARNING',
      message: 'Cooling faster than 1 °C/min makes fine crystals that filter badly.',
      hint: 'Lower coolingRateCPerMin.'
    }
  ],
  behavior: {
    mode: 'BATCH',
    batchGallons: 'workingGallons',
    phases: [
      { name: 'Charge', kind: 'FILL', rateGpm: 'chargeGpm' },
      { name: 'Dissolve', kind: 'HOLD', seconds: 'heatSeconds', temperatureC: 'dissolveC', dutyKw: 'jacketKw' },
      { name: 'Crystallise', kind: 'HOLD', seconds: 'coolSeconds', temperatureC: 'finalC', dutyKw: 'jacketKw', react: true },
      // The liquor comes off the settled crystals, which keep the share of liquor that makes a slurry of
      // settledSolidsFraction: the slurry is crystals / that fraction, the rest of the batch is liquor.
      { name: 'Decant liquor', kind: 'DRAIN', gallons: 'max(0, batch.gallons * (1 - batch.x.crystals / settledSolidsFraction))', rateGpm: 'drainGpm', port: 'liquor', retain: ['crystals'] },
      { name: 'Drop slurry', kind: 'DRAIN', rateGpm: 'drainGpm', port: 'slurry' }
    ]
  },
  designInlet: { temperatureC: 25, densityGPerCm3: 1.15, specificHeatKjPerKgK: 3.6, composition: { water: 0.7, mgso4: 0.3 } },
  provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] },
  drawing: {
    viewBox: { width: 100, height: 140 },
    shapes: [
      { type: 'path', d: 'M 20 20 L 80 20 L 80 100 Q 80 125 50 130 Q 20 125 20 100 Z', layer: 'body' },
      { type: 'path', d: 'M 14 30 L 14 100 Q 14 132 50 136 Q 86 132 86 100 L 86 30', layer: 'detail', dashed: true },
      { type: 'line', x1: 50, y1: 8, x2: 50, y2: 105, layer: 'detail' },
      { type: 'line', x1: 36, y1: 100, x2: 64, y2: 100, layer: 'detail' },
      { type: 'rect', x: 21, y: 70, width: 58, height: 30, layer: 'fill' }
    ],
    nozzles: [
      { portId: 'feed', x: 35, y: 14.3, side: 'top', label: 'Feed' },
      { portId: 'liquor', x: 80, y: 50, side: 'right', label: 'Liquor' },
      { portId: 'slurry', x: 50, y: 92.9, side: 'bottom', label: 'Slurry' }
    ]
  }
};
