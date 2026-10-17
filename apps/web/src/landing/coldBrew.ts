import {
  addStreamToGraph,
  contractToProcessNode,
  createStandardUnitOp,
  findStandardUnitOp,
  planStream,
  type ProcessGraph,
  type UnitOpContract
} from '@process-forge/protocol';
import { simulateProcess } from '@process-forge/simulation-core';

/**
 * The landing page's worked example: a cold-brew freeze concentrator, a unit
 * no simulator ships, designed through the MCP server and kept as it came
 * out of that session. The engineer confirmed the target strength and the
 * glycol temperature; every other operating condition is still Claude's
 * proposal, marked "Assumed: confirm", as the design brief requires.
 *
 *   Cold-brew feed -> freeze concentrator -> concentrate (product)
 *                                         -> melt water (byproduct)
 *
 * The page evaluates, validates and simulates it with the real engine.
 */

export const COLD_BREW_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'cold-brew-freeze-concentrator-v1',
  archetype: 'custom',
  name: 'Cold-Brew Freeze Concentrator',
  description:
    "Concentrates cold-brew coffee without heat: a glycol-jacketed scraped-surface freezer grows ice crystals in the extract, and a packed-bed wash column pushes the ice bed up against a wash front of its own melt, so pure melt water leaves the top and concentrate leaves the bottom at the freezing point. Values marked 'Assumed: confirm' were proposed by Claude, not given by the engineer.",
  ports: [
    { id: 'feed', name: 'Cold-brew extract', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'meltwater', name: 'Melt water', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'concentrate', name: 'Coffee concentrate', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
  ],
  components: ['water', 'solids'],
  parameters: [
    { name: 'targetTdsPct', label: 'Target concentrate strength', unit: '%', value: 30, min: 5, max: 50, description: 'Dissolved coffee solids in the concentrate.', ui: { group: 'Operating conditions' } },
    { name: 'glycolSupplyC', label: 'Glycol supply temperature', unit: '°C', value: -20, min: -40, max: 0, ui: { group: 'Operating conditions' } },
    { name: 'chillerCapacityKw', label: 'Chiller capacity', unit: 'kW', value: 120, min: 1, max: 5000, description: 'Refrigeration available to the freezer. Assumed: confirm.', ui: { group: 'Operating conditions' } },
    { name: 'maxSolidsLossPct', label: 'Allowed coffee loss in melt water', unit: '%', value: 0.1, min: 0.001, max: 5, description: 'Share of the coffee solids that may leave with the melt water. Assumed: confirm.', ui: { group: 'Operating conditions' } },
    { name: 'meltWaterC', label: 'Melt water outlet temperature', unit: '°C', value: 1, min: 0, max: 20, description: 'Assumed: confirm.', ui: { group: 'Operating conditions' } },
    { name: 'operatingPressureKpa', label: 'Operating pressure (absolute)', unit: 'kPa', value: 101.3, min: 50, max: 1000, description: 'Atmospheric. Assumed: confirm.', ui: { group: 'Operating conditions' } },
    { name: 'freezerAreaM2', label: 'Freezer heat-transfer area', unit: 'm2', value: 10, min: 0.5, max: 200, ui: { group: 'Freezer' } },
    { name: 'scraperKw', label: 'Scraper motor heat', unit: 'kW', value: 5, min: 0, max: 200, description: 'Assumed: confirm.', ui: { group: 'Freezer' } },
    { name: 'columnDiameterM', label: 'Wash column diameter', unit: 'm', value: 0.6, min: 0.1, max: 3, ui: { group: 'Wash column' } },
    { name: 'solidsRecovery', label: 'Coffee solids kept in concentrate', unit: '-', value: 0.9992, min: 0.9, max: 1, description: 'Wash column separation. Assumed: confirm.', ui: { group: 'Wash column' } },
    { name: 'uFreezer', label: 'Freezer overall heat-transfer coefficient', unit: 'W/m2-K', value: 1500, min: 200, max: 5000, description: 'Typical scraped-surface value. Assumed: confirm.', ui: { group: 'Freezer', advanced: true } },
    { name: 'minApproachK', label: 'Least glycol approach to the freezing point', unit: 'K', value: 3, min: 0.5, max: 20, ui: { group: 'Freezer', advanced: true } },
    { name: 'maxIceLoad', label: 'Most ice per column area', unit: 'kg/h-m2', value: 3000, min: 100, max: 20000, description: 'Wash-column ice throughput limit. Assumed: confirm.', ui: { group: 'Wash column', advanced: true } },
    { name: 'iceLatentKjPerKg', label: 'Latent heat of freezing', unit: 'kJ/kg', value: 333.6, min: 300, max: 340, ui: { group: 'Properties', advanced: true } },
    { name: 'maxPracticalTdsPct', label: 'Highest strength the column handles', unit: '%', value: 40, min: 10, max: 60, description: 'Above this the concentrate is too viscous to wash the ice. Assumed: confirm.', ui: { group: 'Wash column', advanced: true } }
  ],
  derived: [
    { name: 'solidsInKgPerS', label: 'Coffee solids in', unit: 'kg/s', expr: 'inlet.massFlowKgPerS * inlet.x.solids' },
    { name: 'waterInKgPerS', label: 'Water in', unit: 'kg/s', expr: 'inlet.massFlowKgPerS * inlet.x.water' },
    { name: 'feedTdsPct', label: 'Feed strength', unit: '%', expr: 'if(inlet.massFlowKgPerS > 0, 100 * solidsInKgPerS / inlet.massFlowKgPerS, 0)' },
    { name: 'concKgPerS', label: 'Concentrate made', unit: 'kg/s', expr: 'solidsInKgPerS * solidsRecovery * 100 / targetTdsPct' },
    { name: 'iceKgPerS', label: 'Ice frozen out', unit: 'kg/s', expr: 'max(0, waterInKgPerS - (concKgPerS - solidsInKgPerS * solidsRecovery))' },
    { name: 'waterToIce', label: 'Water frozen out', unit: '-', expr: 'if(waterInKgPerS > 0, min(1, iceKgPerS / waterInKgPerS), 0)' },
    { name: 'freezeC', label: 'Concentrate freezing point', unit: '°C', expr: 'interp(targetTdsPct, 0, 0, 10, -0.8, 20, -1.9, 30, -3.4, 40, -5.5, 50, -8.2)' },
    { name: 'sensibleKw', label: 'Cooling to the freezing point', unit: 'kW', expr: 'inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK * max(0, inlet.temperatureC - freezeC)' },
    { name: 'latentKw', label: 'Heat of freezing', unit: 'kW', expr: 'iceKgPerS * iceLatentKjPerKg' },
    { name: 'refrigKw', label: 'Refrigeration needed', unit: 'kW', expr: 'sensibleKw + latentKw + scraperKw' },
    { name: 'approachK', label: 'Glycol approach', unit: 'K', expr: 'freezeC - glycolSupplyC' },
    { name: 'freezerCapacityKw', label: 'Freezer can remove', unit: 'kW', expr: 'uFreezer * freezerAreaM2 * max(0, approachK) / 1000' },
    { name: 'columnAreaM2', label: 'Column cross-section', unit: 'm2', expr: '3.14159 * columnDiameterM * columnDiameterM / 4' },
    { name: 'iceLoad', label: 'Ice load on the column', unit: 'kg/h-m2', expr: 'iceKgPerS * 3600 / columnAreaM2' },
    { name: 'solidsLossPct', label: 'Coffee lost in melt water', unit: '%', expr: '100 * (1 - solidsRecovery)' }
  ],
  constraints: [
    { id: 'concentrates', expr: 'targetTdsPct > feedTdsPct', severity: 'ERROR', message: "The target strength is not above the feed's: there is nothing to freeze out.", hint: 'Raise targetTdsPct above the feed strength.' },
    { id: 'glycolColderThanProduct', expr: 'glycolSupplyC < freezeC', severity: 'ERROR', message: "The glycol is not colder than the concentrate's freezing point, so no ice forms.", hint: 'Lower glycolSupplyC, or aim for a weaker concentrate (targetTdsPct).' },
    { id: 'freezerCanRemoveHeat', expr: 'refrigKw <= freezerCapacityKw', severity: 'ERROR', message: 'The freezer surface cannot remove the heat of freezing at this glycol temperature.', hint: 'Add freezer area (freezerAreaM2), colder glycol (glycolSupplyC), or feed less.' },
    { id: 'chillerKeepsUp', expr: 'refrigKw <= chillerCapacityKw', severity: 'ERROR', message: 'The chiller is smaller than the refrigeration the freezer needs.', hint: 'Raise chillerCapacityKw, feed less, or aim for a weaker concentrate.' },
    { id: 'glycolApproach', expr: 'approachK >= minApproachK', severity: 'WARNING', message: 'The glycol runs too close to the freezing point: ice grows slowly and the freezer needs a lot of area.', hint: 'Lower glycolSupplyC.' },
    { id: 'columnIceLoad', expr: 'iceLoad <= maxIceLoad', severity: 'WARNING', message: 'More ice per square metre than the wash column can wash cleanly; coffee will break through into the melt water.', hint: 'Widen the column (columnDiameterM).' },
    { id: 'lossWithinSpec', expr: 'solidsLossPct <= maxSolidsLossPct', severity: 'WARNING', message: 'More coffee leaves in the melt water than allowed.', hint: 'Raise solidsRecovery (a taller wash front) or allow more loss (maxSolidsLossPct).' },
    { id: 'washable', expr: 'targetTdsPct <= maxPracticalTdsPct', severity: 'WARNING', message: 'The concentrate is too viscous for the wash column to separate the ice.', hint: 'Lower targetTdsPct, or concentrate in two stages.' }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', dutyKw: 'refrigKw' },
  designInlet: { temperatureC: 4, volumetricFlowGpm: 4, massFlowKgPerS: 0.257, densityGPerCm3: 1.02, specificHeatKjPerKgK: 3.95, composition: { water: 0.95, solids: 0.05 } },
  outlets: [
    { port: 'meltwater', recovery: { water: 'waterToIce' }, temperatureC: 'meltWaterC' },
    { port: 'concentrate', recovery: { solids: 'solidsRecovery' }, temperatureC: 'freezeC' }
  ],
  panel: [
    { kind: 'figure', result: 'concKgPerS', label: 'Concentrate made' },
    { kind: 'figure', result: 'iceKgPerS', label: 'Ice frozen out' },
    { kind: 'figure', result: 'refrigKw', label: 'Refrigeration needed' },
    { kind: 'gauge', check: 'freezerCanRemoveHeat', label: 'Freezer surface' },
    { kind: 'gauge', check: 'chillerKeepsUp', label: 'Chiller' },
    { kind: 'gauge', check: 'glycolApproach', label: 'Glycol approach' },
    { kind: 'gauge', check: 'columnIceLoad', label: 'Wash column ice load' },
    { kind: 'gauge', check: 'lossWithinSpec', label: 'Coffee lost in melt water' },
    { kind: 'note', text: "Operating conditions marked 'Assumed: confirm' were proposed, not given. Set them to your plant's numbers.", tone: 'caution' }
  ],
  provenance: { authoredBy: 'SUB_AGENT', engineerConfirmed: ['targetTdsPct', 'glycolSupplyC'] },
  drawing: {
    viewBox: { width: 220, height: 160 },
    shapes: [
      { type: 'rect', x: 6, y: 86, width: 108, height: 38, rx: 10, layer: 'detail', dashed: true },
      { type: 'rect', x: 10, y: 90, width: 100, height: 30, rx: 8, layer: 'body' },
      { type: 'line', x1: 14, y1: 105, x2: 106, y2: 105, layer: 'detail' },
      { type: 'polyline', points: [[24, 96], [30, 105], [24, 114]], layer: 'detail' },
      { type: 'polyline', points: [[46, 96], [52, 105], [46, 114]], layer: 'detail' },
      { type: 'polyline', points: [[68, 96], [74, 105], [68, 114]], layer: 'detail' },
      { type: 'polyline', points: [[90, 96], [96, 105], [90, 114]], layer: 'detail' },
      { type: 'polyline', points: [[110, 105], [125, 105], [125, 120], [140, 120]], layer: 'detail' },
      { type: 'rect', x: 140, y: 15, width: 40, height: 130, rx: 6, layer: 'body' },
      { type: 'rect', x: 142, y: 50, width: 36, height: 62, layer: 'fill' },
      { type: 'line', x1: 142, y1: 50, x2: 178, y2: 50, layer: 'detail', dashed: true },
      { type: 'line', x1: 144, y1: 30, x2: 176, y2: 30, layer: 'detail' },
      { type: 'line', x1: 144, y1: 36, x2: 176, y2: 36, layer: 'detail' },
      { type: 'line', x1: 150, y1: 130, x2: 170, y2: 130, layer: 'detail' }
    ],
    nozzles: [
      { portId: 'feed', x: 4.5, y: 65.6, side: 'left', label: 'Extract' },
      { portId: 'meltwater', x: 72.7, y: 9.4, side: 'top', label: 'Melt water' },
      { portId: 'concentrate', x: 72.7, y: 90.6, side: 'bottom', label: 'Concentrate' }
    ]
  }
};

/** The feed, as it is on the flowsheet: 5% TDS cold brew at 4 °C. */
export const COLD_BREW_FEED = { gpm: 4, temperatureC: 4, densityGPerCm3: 1.02, specificHeatKjPerKgK: 3.95, composition: { water: 0.95, solids: 0.05 } };

/** The prompt the example starts from. */
export const COLD_BREW_PROMPT =
  'Design a freeze concentrator for our cold brew: a scraped-surface freezer and a wash column. Put it on my flowsheet and simulate an hour.';

const item = (id: string) => {
  const found = findStandardUnitOp(id);
  if (!found) throw new Error(`No standard unit ${id}`);
  return found;
};

/** The contract with some parameters set otherwise (the inputs on the page). */
export function withValues(values: Record<string, number>): UnitOpContract {
  return { ...COLD_BREW_CONTRACT, parameters: COLD_BREW_CONTRACT.parameters.map((p) => (values[p.name] !== undefined ? { ...p, value: values[p.name]! } : p)) };
}

/** The same contract checked at another feed rate, so its panel reads what that feed does. */
export function atFeed(contract: UnitOpContract, gpm: number): UnitOpContract {
  const kgPerS = (gpm * 3.785411784 * COLD_BREW_FEED.densityGPerCm3) / 60;
  return { ...contract, designInlet: { ...contract.designInlet, volumetricFlowGpm: gpm, massFlowKgPerS: Math.round(kgPerS * 1000) / 1000 } };
}

/** The line: feed, the designed unit, and its two outlets, piped as on the canvas. */
export function buildColdBrewLine(contract: UnitOpContract = COLD_BREW_CONTRACT, feedGpm = COLD_BREW_FEED.gpm): ProcessGraph {
  const feed = createStandardUnitOp(item('feed'), {
    name: 'Cold-brew extract',
    material: 'Cold-brew extract, 5% TDS',
    carries: 'liquid',
    supplyRate: feedGpm,
    composition: COLD_BREW_FEED.composition,
    parameters: { temperatureC: COLD_BREW_FEED.temperatureC, densityGPerCm3: COLD_BREW_FEED.densityGPerCm3, specificHeatKjPerKgK: COLD_BREW_FEED.specificHeatKjPerKgK }
  });
  const product = createStandardUnitOp(item('product'), { name: 'Coffee concentrate', material: 'Cold-brew concentrate', carries: 'liquid' });
  const melt = createStandardUnitOp(item('byproduct'), { name: 'Melt water', material: 'Melt water', carries: 'liquid' });
  let g: ProcessGraph = {
    id: 'cold-brew-line',
    name: 'Cold-brew freeze concentration',
    version: '1.0.0',
    metadata: {},
    nodes: [
      { ...feed, id: 'feed', position: { x: 120, y: 240 } },
      contractToProcessNode(contract, { id: 'fc', position: { x: 430, y: 184 } }),
      { ...product, id: 'concentrate', position: { x: 720, y: 330 } },
      { ...melt, id: 'melt', position: { x: 720, y: 90 } }
    ],
    edges: []
  };
  let t = 0;
  const pipe = (from: string, to: string, fromPort?: string) => {
    const plan = planStream(g, { from, to, ...(fromPort ? { fromPort } : {}) }, ++t);
    if (!plan.ok) throw new Error(plan.error);
    g = addStreamToGraph(g, plan.edge);
  };
  pipe('feed', 'fc');
  pipe('fc', 'concentrate', 'concentrate');
  pipe('fc', 'melt', 'meltwater');
  return g;
}

export interface ColdBrewRun {
  minutes: number;
  feedKg: number;
  concentrateKg: number;
  meltKg: number;
  concentrateTdsPct: number;
  meltSolidsKg: number;
  concentrateC: number;
  meltC: number;
  dutyKw: number;
  /** Constraints the unit broke at the conditions it actually saw. */
  broken: string[];
}

/** Runs the line in the real engine. */
export function runColdBrew(contract: UnitOpContract = COLD_BREW_CONTRACT, feedGpm = COLD_BREW_FEED.gpm, minutes = 60): ColdBrewRun {
  const r = simulateProcess(buildColdBrewLine(contract, feedGpm), minutes, { seed: 1 });
  const term = (id: string) => r.terminals.find((t) => t.nodeId === id);
  const conc = term('concentrate');
  const melt = term('melt');
  const fed = term('feed');
  const solids = conc?.componentsKg?.solids ?? 0;
  const unit = r.nodeReports.fc;
  return {
    minutes,
    feedKg: fed?.kg ?? 0,
    concentrateKg: conc?.kg ?? 0,
    meltKg: melt?.kg ?? 0,
    concentrateTdsPct: conc?.kg ? (100 * solids) / conc.kg : 0,
    meltSolidsKg: melt?.componentsKg?.solids ?? 0,
    concentrateC: conc?.temperatureC ?? 0,
    meltC: melt?.temperatureC ?? 0,
    dutyKw: unit?.heat?.averageDutyKw ?? 0,
    broken: (unit?.designedUnit?.brokenConstraints ?? []).map((b) => b.id)
  };
}
