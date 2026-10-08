import type { UnitOpContract } from '../contract.js';

/**
 * Standard equipment written as contracts: the units the built-in kinds do not
 * cover, in the same form an MCP client designs its own. Each is a sound,
 * general starting point -- the engine validates them in the tests -- and each
 * can be tuned (update_unit) or redesigned (design_unit_op) like any other
 * designed unit. Shortcut models, stated as such in their descriptions: none
 * pretends to be rigorous thermodynamics.
 */

const liquid = (id: string, name: string, direction: 'INLET' | 'OUTLET', required = true) =>
  ({ id, name, direction, role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required }) as const;

/** A continuous port that states its phase, and any component it carries in another phase. */
const phased = (
  id: string,
  name: string,
  direction: 'INLET' | 'OUTLET',
  phase: 'LIQUID' | 'GAS' | 'SOLID',
  dispersed?: Record<string, 'LIQUID' | 'GAS' | 'SOLID'>
) => ({ ...liquid(id, name, direction), phase, ...(dispersed ? { dispersed } : {}) });

const template = (): UnitOpContract['provenance'] => ({ authoredBy: 'TEMPLATE', engineerConfirmed: [] });

/** Water-like feed at 50 gal/min, 20 °C. */
const WATERY = { temperatureC: 20, volumetricFlowGpm: 50, massFlowKgPerS: 3.15, densityGPerCm3: 1, specificHeatKjPerKgK: 4.186 };

export const INLINE_MIXER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'standard-inline-mixer-v1',
  name: 'Inline mixer',
  description:
    'Blends up to two liquid streams into one. What leaves is the flow-weighted mix of what comes in: temperature and composition follow from the streams. Passes up to its rated flow.',
  ports: [liquid('a', 'Inlet A', 'INLET'), liquid('b', 'Inlet B', 'INLET', false), liquid('out', 'Blend', 'OUTLET')],
  parameters: [
    { name: 'ratedFlowGpm', label: 'Rated flow', unit: 'gal/min', value: 200, min: 1, max: 5000 },
    { name: 'pressureDropPsi', label: 'Pressure drop at rated flow', unit: 'psi', value: 5, min: 0, max: 100 }
  ],
  derived: [
    { name: 'loadPct', label: 'Load', unit: '%', expr: 'inlet.volumetricFlowGpm / ratedFlowGpm * 100' },
    {
      name: 'dropPsi',
      label: 'Pressure drop',
      unit: 'psi',
      expr: 'pressureDropPsi * pow(inlet.volumetricFlowGpm / ratedFlowGpm, 2)',
      description: 'Turbulent: rises with the square of the flow.'
    }
  ],
  constraints: [],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: 'ratedFlowGpm' },
  designInlet: WATERY,
  provenance: template(),
  drawing: {
    viewBox: { width: 160, height: 60 },
    shapes: [
      { type: 'rect', x: 20, y: 18, width: 120, height: 24, rx: 4, layer: 'body' },
      { type: 'polyline', points: [[35, 20], [50, 40], [65, 20], [80, 40], [95, 20], [110, 40], [125, 20]], layer: 'detail' },
      { type: 'line', x1: 30, y1: 42, x2: 30, y2: 56, layer: 'body' }
    ],
    nozzles: [
      { portId: 'a', x: 12.5, y: 50, side: 'left', label: 'A' },
      { portId: 'b', x: 18.75, y: 93.3, side: 'bottom', label: 'B' },
      { portId: 'out', x: 87.5, y: 50, side: 'right', label: 'Out' }
    ]
  }
};

export const FLOW_SPLITTER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'standard-flow-splitter-v1',
  name: 'Flow splitter',
  description:
    'Divides one liquid stream between two outlets by a fixed fraction: a recycle, a purge, a bypass. Both outlets carry the same composition and temperature.',
  ports: [liquid('in', 'In', 'INLET'), liquid('a', 'Outlet A', 'OUTLET'), liquid('b', 'Outlet B', 'OUTLET')],
  parameters: [
    { name: 'fractionToA', label: 'Share to outlet A', unit: '-', value: 0.5, min: 0, max: 1 },
    { name: 'ratedFlowGpm', label: 'Rated flow', unit: 'gal/min', value: 500, min: 1, max: 10000 }
  ],
  derived: [{ name: 'flowToAGpm', label: 'Flow to A', unit: 'gal/min', expr: 'inlet.volumetricFlowGpm * fractionToA' }],
  constraints: [],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: 'ratedFlowGpm' },
  designInlet: WATERY,
  outlets: [{ port: 'a', share: 'fractionToA' }, { port: 'b' }],
  provenance: template(),
  drawing: {
    viewBox: { width: 100, height: 100 },
    shapes: [
      { type: 'circle', cx: 50, cy: 50, r: 22, layer: 'body' },
      { type: 'line', x1: 50, y1: 50, x2: 68, y2: 36, layer: 'detail' },
      { type: 'line', x1: 50, y1: 50, x2: 68, y2: 64, layer: 'detail' }
    ],
    nozzles: [
      { portId: 'in', x: 28, y: 50, side: 'left', label: 'In' },
      { portId: 'a', x: 72, y: 38, side: 'right', label: 'A' },
      { portId: 'b', x: 72, y: 62, side: 'right', label: 'B' }
    ]
  }
};

export const PROCESS_HEATER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'standard-process-heater-v1',
  name: 'Process heater',
  description:
    'Heats a liquid stream toward a target temperature with a steam or electric duty, up to its rated duty. When the stream needs more than that, it leaves cooler than the target and the shortfall is reported. Q = m x cp x (T_target - T_in).',
  ports: [liquid('in', 'In', 'INLET'), liquid('out', 'Out', 'OUTLET')],
  parameters: [
    { name: 'targetC', label: 'Target temperature', unit: '°C', value: 80, min: -50, max: 400 },
    { name: 'ratedKw', label: 'Rated duty', unit: 'kW', value: 900, min: 1, max: 50000 },
    { name: 'ratedFlowGpm', label: 'Rated flow', unit: 'gal/min', value: 150, min: 1, max: 5000 }
  ],
  derived: [
    { name: 'needKw', label: 'Duty to reach target', unit: 'kW', expr: 'inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK * max(0, targetC - inlet.temperatureC)' },
    { name: 'usedKw', label: 'Duty used', unit: 'kW', expr: 'min(needKw, ratedKw)' },
    {
      name: 'outletC',
      label: 'Outlet temperature',
      unit: '°C',
      expr: 'if(inlet.massFlowKgPerS > 0, inlet.temperatureC + usedKw / (inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK), inlet.temperatureC)'
    }
  ],
  constraints: [
    {
      id: 'reaches-target',
      expr: 'needKw <= ratedKw',
      severity: 'WARNING',
      message: 'The stream needs more duty than the heater has, so it leaves below the target temperature.',
      hint: 'Raise ratedKw, lower targetC, or send less flow.'
    }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: 'ratedFlowGpm', dutyKw: 'usedKw' },
  designInlet: WATERY,
  outlets: [{ port: 'out', temperatureC: 'outletC' }],
  provenance: template(),
  drawing: {
    viewBox: { width: 140, height: 70 },
    shapes: [
      { type: 'rect', x: 15, y: 15, width: 110, height: 40, rx: 6, layer: 'body' },
      { type: 'polyline', points: [[30, 45], [40, 25], [50, 45], [60, 25], [70, 45], [80, 25], [90, 45], [100, 25], [110, 45]], layer: 'detail' }
    ],
    nozzles: [
      { portId: 'in', x: 10.7, y: 50, side: 'left', label: 'In' },
      { portId: 'out', x: 89.3, y: 50, side: 'right', label: 'Out' }
    ]
  }
};

export const CSTR_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'standard-cstr-v1',
  name: 'Continuous stirred-tank reactor',
  description:
    'A well-mixed continuous reactor running a first-order reaction, reactant -> product. Conversion follows from the residence time: X = k·τ / (1 + k·τ), τ = volume / flow, so more flow means less conversion. Name your feed components "reactant" (and "product"), or redesign it for your chemistry.',
  ports: [liquid('in', 'Feed', 'INLET'), liquid('out', 'Product', 'OUTLET')],
  components: ['reactant', 'product'],
  parameters: [
    { name: 'volumeGallons', label: 'Liquid volume', unit: 'gal', value: 1000, min: 1, max: 100000 },
    { name: 'rateConstantPerMin', label: 'Rate constant k', unit: '1/min', value: 0.5, min: 0.0001, max: 100 },
    { name: 'heatOfReactionKjPerKg', label: 'Heat released per kg reacted', unit: 'kJ/kg', value: 0, min: -5000, max: 5000 },
    { name: 'ratedFlowGpm', label: 'Rated flow', unit: 'gal/min', value: 200, min: 1, max: 10000 }
  ],
  derived: [
    { name: 'residenceMin', label: 'Residence time', unit: 'min', expr: 'volumeGallons / max(0.001, inlet.volumetricFlowGpm)' },
    { name: 'conversion', label: 'Conversion', unit: '-', expr: 'rateConstantPerMin * residenceMin / (1 + rateConstantPerMin * residenceMin)' },
    {
      name: 'reactionKw',
      label: 'Heat released',
      unit: 'kW',
      expr: 'inlet.massFlowKgPerS * inlet.x.reactant * conversion * heatOfReactionKjPerKg',
      description: 'Positive: the jacket must remove it.'
    }
  ],
  constraints: [
    {
      id: 'converts',
      expr: 'conversion >= 0.8',
      severity: 'WARNING',
      message: 'Less than 80% of the reactant converts at this flow.',
      hint: 'Raise volumeGallons, feed more slowly, or run hotter (a larger k).'
    }
  ],
  reactions: [{ id: 'main', limiting: 'reactant', conversion: 'conversion', coefficients: { reactant: -1, product: 1 } }],
  behavior: {
    mode: 'CONTINUOUS_RATE',
    throughputPerMinute: 'inlet.volumetricFlowGpm',
    capacityGpm: 'ratedFlowGpm',
    dutyKw: 'abs(reactionKw)',
    residenceTimeSeconds: 'residenceMin * 60'
  },
  designInlet: { ...WATERY, composition: { reactant: 0.2, solvent: 0.8 } },
  provenance: template(),
  drawing: {
    viewBox: { width: 100, height: 140 },
    shapes: [
      { type: 'path', d: 'M 20 30 Q 20 18 50 18 Q 80 18 80 30 L 80 105 Q 80 125 50 125 Q 20 125 20 105 Z', layer: 'body' },
      { type: 'line', x1: 50, y1: 4, x2: 50, y2: 100, layer: 'detail' },
      { type: 'line', x1: 36, y1: 100, x2: 64, y2: 100, layer: 'detail' },
      { type: 'line', x1: 38, y1: 70, x2: 62, y2: 70, layer: 'detail' },
      { type: 'rect', x: 21, y: 60, width: 58, height: 40, layer: 'fill' }
    ],
    nozzles: [
      { portId: 'in', x: 30, y: 14.3, side: 'top', label: 'Feed' },
      { portId: 'out', x: 50, y: 90, side: 'bottom', label: 'Product' }
    ]
  }
};

export const PLUG_FLOW_REACTOR_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'standard-pfr-v1',
  name: 'Plug-flow reactor',
  description:
    'A tubular reactor running a first-order reaction, reactant -> product, with no back-mixing: X = 1 - exp(-k·τ), τ = tube volume / flow. For the same volume it converts more than a stirred tank. Name your feed components "reactant" (and "product"), or redesign it for your chemistry.',
  ports: [liquid('in', 'Feed', 'INLET'), liquid('out', 'Product', 'OUTLET')],
  components: ['reactant', 'product'],
  parameters: [
    { name: 'tubeVolumeGallons', label: 'Tube volume', unit: 'gal', value: 400, min: 0.1, max: 50000 },
    { name: 'rateConstantPerMin', label: 'Rate constant k', unit: '1/min', value: 0.5, min: 0.0001, max: 100 },
    { name: 'ratedFlowGpm', label: 'Rated flow', unit: 'gal/min', value: 150, min: 1, max: 10000 }
  ],
  derived: [
    { name: 'residenceMin', label: 'Residence time', unit: 'min', expr: 'tubeVolumeGallons / max(0.001, inlet.volumetricFlowGpm)' },
    { name: 'conversion', label: 'Conversion', unit: '-', expr: '1 - exp(-rateConstantPerMin * residenceMin)' }
  ],
  constraints: [
    {
      id: 'converts',
      expr: 'conversion >= 0.8',
      severity: 'WARNING',
      message: 'Less than 80% of the reactant converts at this flow.',
      hint: 'Lengthen the tube (tubeVolumeGallons), feed more slowly, or run hotter (a larger k).'
    }
  ],
  reactions: [{ id: 'main', limiting: 'reactant', conversion: 'conversion', coefficients: { reactant: -1, product: 1 } }],
  behavior: {
    mode: 'CONTINUOUS_RATE',
    throughputPerMinute: 'inlet.volumetricFlowGpm',
    capacityGpm: 'ratedFlowGpm',
    residenceTimeSeconds: 'residenceMin * 60'
  },
  designInlet: { ...WATERY, composition: { reactant: 0.2, solvent: 0.8 } },
  provenance: template(),
  drawing: {
    viewBox: { width: 160, height: 70 },
    shapes: [
      { type: 'polyline', points: [[15, 20], [135, 20], [145, 27], [145, 43], [135, 50], [25, 50]], layer: 'body' },
      { type: 'polyline', points: [[15, 28], [132, 28], [137, 32], [137, 38], [132, 42], [25, 42]], layer: 'body' },
      { type: 'line', x1: 15, y1: 20, x2: 15, y2: 28, layer: 'body' },
      { type: 'line', x1: 25, y1: 42, x2: 25, y2: 50, layer: 'body' }
    ],
    nozzles: [
      { portId: 'in', x: 9.4, y: 34.3, side: 'left', label: 'Feed' },
      { portId: 'out', x: 15.6, y: 65.7, side: 'left', label: 'Product' }
    ]
  }
};

export const SOLIDS_FILTER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'standard-solids-filter-v1',
  name: 'Solids filter',
  description:
    'Separates suspended solids from a liquid: a filter press, belt or drum filter. It captures a share of the feed solids in a cake at a set dryness; the rest of the liquid leaves as filtrate. Mass balance on solids: cake share = feed solids x capture / cake solids.',
  ports: [
    phased('in', 'Slurry', 'INLET', 'LIQUID', { solids: 'SOLID' }),
    phased('filtrate', 'Filtrate', 'OUTLET', 'LIQUID', { solids: 'SOLID' }),
    phased('cake', 'Cake', 'OUTLET', 'SOLID', { water: 'LIQUID' })
  ],
  parameters: [
    { name: 'feedSolidsPct', label: 'Feed solids', unit: '%', value: 8, min: 0.01, max: 60 },
    { name: 'capture', label: 'Solids captured', unit: '-', value: 0.98, min: 0, max: 1 },
    { name: 'cakeSolidsPct', label: 'Cake solids', unit: '%', value: 55, min: 1, max: 95 },
    { name: 'ratedFlowGpm', label: 'Rated flow', unit: 'gal/min', value: 80, min: 0.1, max: 5000 }
  ],
  derived: [
    { name: 'cakeShare', label: 'Share leaving as cake', unit: '-', expr: 'clamp(feedSolidsPct * capture / cakeSolidsPct, 0, 1)' },
    {
      name: 'filtrateSolidsPct',
      label: 'Filtrate solids',
      unit: '%',
      expr: 'if(cakeShare < 1, feedSolidsPct * (1 - capture) / (1 - cakeShare), 0)'
    }
  ],
  constraints: [
    {
      id: 'cake-drier-than-feed',
      expr: 'cakeSolidsPct > feedSolidsPct',
      severity: 'ERROR',
      message: 'The cake must hold more solids than the feed, or the filter separates nothing.',
      hint: 'Raise cakeSolidsPct above feedSolidsPct.'
    },
    {
      id: 'clear-filtrate',
      expr: 'filtrateSolidsPct <= 0.5',
      severity: 'WARNING',
      message: 'The filtrate carries over half a percent of solids.',
      hint: 'Raise capture (a finer medium, a precoat).'
    }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: 'ratedFlowGpm' },
  designInlet: { ...WATERY, volumetricFlowGpm: 40, massFlowKgPerS: 2.6, densityGPerCm3: 1.05 },
  outlets: [{ port: 'cake', share: 'cakeShare' }, { port: 'filtrate' }],
  provenance: template(),
  drawing: {
    viewBox: { width: 140, height: 100 },
    shapes: [
      { type: 'rect', x: 15, y: 20, width: 110, height: 45, rx: 3, layer: 'body' },
      { type: 'line', x1: 35, y1: 20, x2: 35, y2: 65, layer: 'detail' },
      { type: 'line', x1: 55, y1: 20, x2: 55, y2: 65, layer: 'detail' },
      { type: 'line', x1: 75, y1: 20, x2: 75, y2: 65, layer: 'detail' },
      { type: 'line', x1: 95, y1: 20, x2: 95, y2: 65, layer: 'detail' },
      { type: 'polygon', points: [[45, 65], [95, 65], [80, 85], [60, 85]], layer: 'body' }
    ],
    nozzles: [
      { portId: 'in', x: 10.7, y: 42, side: 'left', label: 'Slurry' },
      { portId: 'filtrate', x: 89.3, y: 42, side: 'right', label: 'Filtrate' },
      { portId: 'cake', x: 50, y: 90, side: 'bottom', label: 'Cake' }
    ]
  }
};

export const DECANTER_CENTRIFUGE_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'standard-decanter-centrifuge-v1',
  name: 'Decanter centrifuge',
  description:
    'Spins solids out of a liquid continuously. Recovery falls off above the rated flow, as it does in a real bowl: less time under g means more solids carried over in the centrate. Solids leave as a paste at the set dryness.',
  ports: [
    phased('in', 'Feed', 'INLET', 'LIQUID', { solids: 'SOLID' }),
    phased('centrate', 'Centrate', 'OUTLET', 'LIQUID', { solids: 'SOLID' }),
    phased('solids', 'Solids', 'OUTLET', 'SOLID', { water: 'LIQUID' })
  ],
  parameters: [
    { name: 'feedSolidsPct', label: 'Feed solids', unit: '%', value: 10, min: 0.01, max: 50 },
    { name: 'ratedRecovery', label: 'Solids recovery at rated flow', unit: '-', value: 0.95, min: 0, max: 1 },
    { name: 'pasteSolidsPct', label: 'Paste solids', unit: '%', value: 35, min: 1, max: 90 },
    { name: 'ratedFlowGpm', label: 'Rated flow', unit: 'gal/min', value: 100, min: 0.1, max: 2000 },
    { name: 'maxFlowGpm', label: 'Hydraulic limit', unit: 'gal/min', value: 130, min: 0.1, max: 3000 }
  ],
  derived: [
    { name: 'load', label: 'Load', unit: '-', expr: 'inlet.volumetricFlowGpm / ratedFlowGpm' },
    {
      name: 'recovery',
      label: 'Solids recovery',
      unit: '-',
      expr: 'ratedRecovery * interp(load, 0, 1, 1, 1, 1.3, 0.8, 2, 0.5)',
      description: 'Full recovery up to rated flow, falling off above it.'
    },
    { name: 'solidsShare', label: 'Share leaving as paste', unit: '-', expr: 'clamp(feedSolidsPct * recovery / pasteSolidsPct, 0, 1)' }
  ],
  constraints: [
    {
      id: 'paste-drier-than-feed',
      expr: 'pasteSolidsPct > feedSolidsPct',
      severity: 'ERROR',
      message: 'The paste must hold more solids than the feed, or nothing is separated.',
      hint: 'Raise pasteSolidsPct above feedSolidsPct.'
    },
    {
      id: 'within-rating',
      expr: 'load <= 1',
      severity: 'WARNING',
      message: 'Running above the rated flow: recovery is falling and the centrate is carrying solids.',
      hint: 'Feed less, or add a second machine.'
    },
    { id: 'hydraulics', expr: 'maxFlowGpm >= ratedFlowGpm', severity: 'ERROR', message: 'The hydraulic limit is below the rated flow.', hint: 'Raise maxFlowGpm.' }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: 'maxFlowGpm' },
  designInlet: { ...WATERY, volumetricFlowGpm: 80, massFlowKgPerS: 5.3, densityGPerCm3: 1.05 },
  outlets: [{ port: 'solids', share: 'solidsShare' }, { port: 'centrate' }],
  provenance: template(),
  drawing: {
    viewBox: { width: 160, height: 80 },
    shapes: [
      { type: 'polygon', points: [[20, 25], [110, 25], [140, 35], [140, 45], [110, 55], [20, 55]], layer: 'body' },
      { type: 'polyline', points: [[30, 30], [40, 50], [50, 30], [60, 50], [70, 30], [80, 50], [90, 30], [100, 50], [110, 30]], layer: 'detail' },
      { type: 'line', x1: 20, y1: 55, x2: 20, y2: 70, layer: 'body' },
      { type: 'line', x1: 110, y1: 55, x2: 110, y2: 70, layer: 'body' }
    ],
    nozzles: [
      { portId: 'in', x: 12.5, y: 50, side: 'left', label: 'Feed' },
      { portId: 'centrate', x: 12.5, y: 87.5, side: 'bottom', label: 'Centrate' },
      { portId: 'solids', x: 87.5, y: 50, side: 'right', label: 'Solids' }
    ]
  }
};

export const DISTILLATION_COLUMN_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'standard-distillation-column-v1',
  name: 'Distillation column',
  description:
    'A shortcut column: a set share of the feed goes overhead as distillate, the rest leaves as bottoms. The reboiler boils up the distillate plus its reflux, so its duty is distillate x (1 + reflux ratio) x latent heat. Split by share, not by vapour-liquid equilibrium; redesign it with component recoveries for a sharper model.',
  // A total condenser and a reboiler: vapour and liquid change places inside the column, and both products leave as liquid.
  ports: [phased('feed', 'Feed', 'INLET', 'LIQUID'), phased('distillate', 'Distillate', 'OUTLET', 'LIQUID'), phased('bottoms', 'Bottoms', 'OUTLET', 'LIQUID')],
  parameters: [
    { name: 'distillateShare', label: 'Share taken overhead', unit: '-', value: 0.3, min: 0.01, max: 0.99 },
    { name: 'refluxRatio', label: 'Reflux ratio', unit: '-', value: 2, min: 0, max: 50 },
    { name: 'minRefluxRatio', label: 'Minimum reflux ratio', unit: '-', value: 1.2, min: 0, max: 50 },
    { name: 'latentHeatKjPerKg', label: 'Latent heat of the overhead', unit: 'kJ/kg', value: 850, min: 100, max: 2500 },
    { name: 'topC', label: 'Top temperature', unit: '°C', value: 78, min: -150, max: 400 },
    { name: 'bottomC', label: 'Bottom temperature', unit: '°C', value: 100, min: -150, max: 450 },
    { name: 'ratedFeedGpm', label: 'Rated feed', unit: 'gal/min', value: 60, min: 0.1, max: 5000 }
  ],
  derived: [
    { name: 'distillateKgPerS', label: 'Distillate', unit: 'kg/s', expr: 'inlet.massFlowKgPerS * distillateShare' },
    { name: 'boilupKgPerS', label: 'Boil-up', unit: 'kg/s', expr: 'distillateKgPerS * (1 + refluxRatio)' },
    { name: 'reboilerKw', label: 'Reboiler duty', unit: 'kW', expr: 'boilupKgPerS * latentHeatKjPerKg' },
    { name: 'condenserKw', label: 'Condenser duty', unit: 'kW', expr: 'reboilerKw' }
  ],
  constraints: [
    {
      id: 'above-min-reflux',
      expr: 'refluxRatio >= minRefluxRatio',
      severity: 'WARNING',
      message: 'The reflux ratio is below the minimum for this separation; the split would not be reached with any number of trays.',
      hint: 'Raise refluxRatio (1.2 to 1.5 times the minimum is usual).'
    },
    {
      id: 'top-cooler-than-bottom',
      expr: 'topC < bottomC',
      severity: 'ERROR',
      message: 'The top of a column is cooler than the bottom.',
      hint: 'Set topC to the overhead boiling point and bottomC to the bottoms boiling point.'
    }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: 'ratedFeedGpm', dutyKw: 'reboilerKw' },
  designInlet: { temperatureC: 60, volumetricFlowGpm: 40, massFlowKgPerS: 2.4, densityGPerCm3: 0.95, specificHeatKjPerKgK: 3.5 },
  outlets: [
    { port: 'distillate', share: 'distillateShare', temperatureC: 'topC' },
    { port: 'bottoms', temperatureC: 'bottomC' }
  ],
  provenance: template(),
  drawing: {
    viewBox: { width: 80, height: 200 },
    shapes: [
      { type: 'rect', x: 22, y: 10, width: 36, height: 180, rx: 18, layer: 'body' },
      { type: 'line', x1: 22, y1: 45, x2: 58, y2: 45, layer: 'detail', dashed: true },
      { type: 'line', x1: 22, y1: 70, x2: 58, y2: 70, layer: 'detail', dashed: true },
      { type: 'line', x1: 22, y1: 95, x2: 58, y2: 95, layer: 'detail', dashed: true },
      { type: 'line', x1: 22, y1: 120, x2: 58, y2: 120, layer: 'detail', dashed: true },
      { type: 'line', x1: 22, y1: 145, x2: 58, y2: 145, layer: 'detail', dashed: true }
    ],
    nozzles: [
      { portId: 'feed', x: 27.5, y: 50, side: 'left', label: 'Feed' },
      { portId: 'distillate', x: 50, y: 5, side: 'top', label: 'Distillate' },
      { portId: 'bottoms', x: 50, y: 95, side: 'bottom', label: 'Bottoms' }
    ]
  }
};

export const CONTINUOUS_DRYER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'standard-continuous-dryer-v1',
  name: 'Continuous dryer',
  description:
    'Drives moisture off a wet feed: a rotary, belt or spray dryer. Water removed per kg of feed = (feed moisture - product moisture) / (100 - product moisture); it leaves as vapour, and the heat to evaporate it (with the dryer\'s losses) is the duty. If the burner cannot supply it, that is flagged.',
  ports: [
    phased('in', 'Wet feed', 'INLET', 'SOLID', { water: 'LIQUID' }),
    phased('product', 'Dry product', 'OUTLET', 'SOLID', { water: 'LIQUID' }),
    phased('vapour', 'Exhaust vapour', 'OUTLET', 'GAS')
  ],
  phaseChanges: [{ component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'DRYING', latentHeatKjPerKg: 'heatPerKgWaterKj' }],
  parameters: [
    { name: 'feedMoisturePct', label: 'Feed moisture', unit: '%', value: 40, min: 0, max: 95 },
    { name: 'productMoisturePct', label: 'Product moisture', unit: '%', value: 5, min: 0, max: 90 },
    { name: 'heatPerKgWaterKj', label: 'Heat per kg water removed', unit: 'kJ/kg', value: 3200, min: 2257, max: 10000, description: 'Latent heat plus the dryer\'s losses; 3000-4500 is typical.' },
    { name: 'availableKw', label: 'Burner duty', unit: 'kW', value: 1500, min: 1, max: 100000 },
    { name: 'productC', label: 'Product temperature', unit: '°C', value: 60, min: 0, max: 300 },
    { name: 'exhaustC', label: 'Exhaust temperature', unit: '°C', value: 90, min: 40, max: 400 },
    { name: 'ratedFeedGpm', label: 'Rated feed', unit: 'gal/min', value: 30, min: 0.1, max: 2000 }
  ],
  derived: [
    { name: 'waterShare', label: 'Share driven off', unit: '-', expr: 'max(0, feedMoisturePct - productMoisturePct) / (100 - productMoisturePct)' },
    { name: 'evaporationKgPerS', label: 'Evaporation', unit: 'kg/s', expr: 'inlet.massFlowKgPerS * waterShare' },
    { name: 'needKw', label: 'Duty needed', unit: 'kW', expr: 'evaporationKgPerS * heatPerKgWaterKj' }
  ],
  constraints: [
    {
      id: 'dries',
      expr: 'productMoisturePct < feedMoisturePct',
      severity: 'ERROR',
      message: 'The product must be drier than the feed.',
      hint: 'Lower productMoisturePct below feedMoisturePct.'
    },
    {
      id: 'enough-heat',
      expr: 'needKw <= availableKw',
      severity: 'ERROR',
      message: 'The burner cannot supply the heat to dry this much feed to the target moisture.',
      hint: 'Raise availableKw, feed less, or accept a wetter product.'
    }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: 'ratedFeedGpm', dutyKw: 'needKw' },
  designInlet: { temperatureC: 20, volumetricFlowGpm: 10, massFlowKgPerS: 0.7, densityGPerCm3: 1.1, specificHeatKjPerKgK: 3.2 },
  outlets: [
    { port: 'vapour', share: 'waterShare', temperatureC: 'exhaustC' },
    { port: 'product', temperatureC: 'productC' }
  ],
  provenance: template(),
  drawing: {
    viewBox: { width: 160, height: 90 },
    shapes: [
      { type: 'polygon', points: [[20, 30], [140, 40], [140, 70], [20, 60]], layer: 'body' },
      { type: 'line', x1: 50, y1: 33, x2: 50, y2: 63, layer: 'detail' },
      { type: 'line', x1: 80, y1: 35, x2: 80, y2: 66, layer: 'detail' },
      { type: 'line', x1: 110, y1: 38, x2: 110, y2: 68, layer: 'detail' },
      { type: 'line', x1: 130, y1: 39, x2: 130, y2: 15, layer: 'body' }
    ],
    nozzles: [
      { portId: 'in', x: 12.5, y: 50, side: 'left', label: 'Wet feed' },
      { portId: 'product', x: 87.5, y: 77.8, side: 'bottom', label: 'Dry' },
      { portId: 'vapour', x: 81.3, y: 11, side: 'top', label: 'Vapour' }
    ]
  }
};
