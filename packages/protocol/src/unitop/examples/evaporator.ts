import type { UnitOpContract } from '../contract.js';

/**
 * A worked example of a unit op that depends on what flows into it.
 *
 * A single-effect evaporator on a fixed steam duty: the steam first brings the
 * feed to a boil, then boils off what it can of the rest. So the share that
 * leaves as vapour depends on the live feed rate and temperature, which the
 * engine supplies as inlet.* every second of the run. It shows:
 *
 *   - designInlet: the conditions validation checks the design at;
 *   - capacityGpm: a flow limit the engine enforces;
 *   - outlets: a live share and temperature per outlet port;
 *   - if(): a guard, so zero flow is not a division by zero;
 *   - interp(): a lookup table (boiling point rise with concentration).
 */
export const EVAPORATOR_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'single-effect-evaporator-v1',
  name: 'Single-effect evaporator',
  description:
    'Concentrates a watery feed with steam. The steam duty first heats the feed to its boiling point, then evaporates what it can; the vapour goes overhead, the concentrate out of the bottom.',
  ports: [
    { id: 'feed', name: 'Feed', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'vapour', name: 'Vapour', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'concentrate', name: 'Concentrate', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
  ],
  parameters: [
    { name: 'steamDutyKw', label: 'Steam duty', unit: 'kW', value: 1500, min: 0, max: 20000 },
    { name: 'maxFeedGpm', label: 'Tube capacity', unit: 'gal/min', value: 25, min: 1, max: 2000 },
    { name: 'feedSolidsPct', label: 'Feed solids', unit: '%', value: 12, min: 0, max: 60 },
    { name: 'latentHeatKjPerKg', label: 'Latent heat of water', unit: 'kJ/kg', value: 2257, min: 2000, max: 2500 }
  ],
  derived: [
    {
      name: 'boilingPointC',
      label: 'Boiling point',
      unit: '°C',
      expr: '100 + interp(feedSolidsPct, 0, 0, 20, 1, 40, 3, 60, 7)',
      description: 'Boiling point rise with dissolved solids, from a table.'
    },
    {
      name: 'sensibleKw',
      label: 'Heat to boiling',
      unit: 'kW',
      expr: 'inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK * max(0, boilingPointC - inlet.temperatureC)'
    },
    {
      name: 'vapourShare',
      label: 'Evaporated share',
      unit: '-',
      expr: 'if(inlet.massFlowKgPerS > 0, clamp((steamDutyKw - sensibleKw) / (inlet.massFlowKgPerS * latentHeatKjPerKg), 0, 0.9), 0)'
    },
    {
      name: 'productSolidsPct',
      label: 'Concentrate solids',
      unit: '%',
      expr: 'feedSolidsPct / max(0.1, 1 - vapourShare)'
    }
  ],
  constraints: [
    {
      id: 'reaches-boil',
      expr: 'steamDutyKw > sensibleKw',
      severity: 'ERROR',
      message: 'The steam cannot bring the feed to a boil, so nothing evaporates.',
      hint: 'Raise steamDutyKw, preheat the feed, or feed it more slowly.'
    },
    {
      id: 'pumpable',
      expr: 'productSolidsPct <= 65',
      severity: 'WARNING',
      message: 'The concentrate is over 65% solids and may not flow.',
      hint: 'Lower steamDutyKw or raise the feed rate.'
    }
  ],
  behavior: {
    mode: 'CONTINUOUS_RATE',
    throughputPerMinute: 'inlet.volumetricFlowGpm',
    capacityGpm: 'maxFeedGpm',
    dutyKw: 'steamDutyKw'
  },
  designInlet: { temperatureC: 20, volumetricFlowGpm: 25, massFlowKgPerS: 1.58, densityGPerCm3: 1, specificHeatKjPerKgK: 4.186 },
  outlets: [
    { port: 'vapour', share: 'vapourShare', temperatureC: 'boilingPointC' },
    { port: 'concentrate', temperatureC: 'boilingPointC' }
  ],
  provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] },
  drawing: {
    viewBox: { width: 100, height: 140 },
    shapes: [
      { type: 'rect', x: 30, y: 10, width: 40, height: 40, rx: 20, layer: 'body' },
      { type: 'rect', x: 25, y: 45, width: 50, height: 70, rx: 4, layer: 'body' },
      { type: 'line', x1: 35, y1: 55, x2: 35, y2: 105, layer: 'detail' },
      { type: 'line', x1: 45, y1: 55, x2: 45, y2: 105, layer: 'detail' },
      { type: 'line', x1: 55, y1: 55, x2: 55, y2: 105, layer: 'detail' },
      { type: 'line', x1: 65, y1: 55, x2: 65, y2: 105, layer: 'detail' },
      { type: 'polygon', points: [[25, 115], [75, 115], [55, 130], [45, 130]], layer: 'body' },
      { type: 'rect', x: 26, y: 95, width: 48, height: 19, layer: 'fill' }
    ],
    nozzles: [
      { portId: 'feed', x: 25, y: 60, side: 'left', label: 'Feed' },
      { portId: 'vapour', x: 50, y: 7.1, side: 'top', label: 'Vapour' },
      { portId: 'concentrate', x: 50, y: 92.9, side: 'bottom', label: 'Concentrate' }
    ]
  }
};
