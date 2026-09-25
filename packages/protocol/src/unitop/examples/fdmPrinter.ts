import type { UnitOpContract } from '../contract.js';

/**
 * An FDM 3D printer, as a unit-op contract: the reference example for a unit
 * that works in cycles (DISCRETE_CYCLE), where the wax belt is the reference
 * for steady flow (CONTINUOUS_RATE).
 *
 * Plastic filament goes in, one finished part comes out per print. The cycle
 * time is not typed in: it is computed from the part and the printer, which is
 * the point -- the engine runs the arithmetic and checks the limits, and the
 * line simulation then runs the printer on that cycle.
 *
 * The physics is the volumetric one every slicer uses: the part's plastic
 * volume, laid down at layer height x line width x print speed, and a hot end
 * that can only melt so much plastic a second.
 */
export const FDM_PRINTER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'fdm-printer-v1',
  name: 'FDM 3D Printer',
  description:
    'Fused-filament printer: plastic filament is melted in the hot end and laid down layer by layer. One part per print; the print time follows from the part volume and the volumetric rate the hot end can sustain.',

  ports: [
    { id: 'filament-in', name: 'Filament', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'part-out', name: 'Finished part', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true }
  ],

  parameters: [
    { name: 'partMassG', label: 'Part mass', unit: 'g', value: 27, min: 0.1, max: 5000 },
    { name: 'filamentDensityGPerCm3', label: 'Filament density', unit: 'g/cm3', value: 1.24, min: 0.8, max: 2.5,
      description: 'PLA is about 1.24, PETG 1.27, ABS 1.04.' },
    { name: 'layerHeightMm', label: 'Layer height', unit: 'mm', value: 0.2, min: 0.04, max: 1.2 },
    { name: 'lineWidthMm', label: 'Line width', unit: 'mm', value: 0.45, min: 0.2, max: 2 },
    { name: 'printSpeedMmPerS', label: 'Print speed', unit: 'mm/s', value: 60, min: 5, max: 600,
      description: 'The knob the engineer is turning: faster prints need more melt rate.' },
    { name: 'hotEndMaxFlowMm3PerS', label: 'Hot end melt limit', unit: 'mm3/s', value: 15, min: 1, max: 200,
      description: 'The most plastic the hot end can melt. A standard hot end manages 10-15, a high-flow one 25-40.' },
    { name: 'bedClearSeconds', label: 'Part removal and bed reset', unit: 's', value: 120, min: 0, max: 3600 },
    { name: 'spoolMassG', label: 'Spool size', unit: 'g', value: 1000, min: 100, max: 10000 }
  ],

  derived: [
    { name: 'partVolumeMm3', label: 'Plastic in each part', unit: 'mm3',
      expr: 'partMassG / filamentDensityGPerCm3 * 1000' },
    { name: 'volumetricFlowMm3PerS', label: 'Melt rate needed', unit: 'mm3/s',
      expr: 'layerHeightMm * lineWidthMm * printSpeedMmPerS',
      description: 'Layer height x line width x speed: the plastic the hot end must melt each second.' },
    { name: 'printTimeS', label: 'Print time', unit: 's',
      expr: 'partVolumeMm3 / volumetricFlowMm3PerS' },
    { name: 'cycleMin', label: 'Time per part', unit: 'min',
      expr: '(printTimeS + bedClearSeconds) / 60' },
    { name: 'partsPerSpool', label: 'Parts per spool', unit: '-',
      expr: 'floor(spoolMassG / partMassG)' }
  ],

  constraints: [
    {
      id: 'hot-end-keeps-up',
      expr: 'volumetricFlowMm3PerS <= hotEndMaxFlowMm3PerS',
      severity: 'ERROR',
      message: 'The hot end cannot melt plastic this fast: the extruder will skip and the part will be under-extruded.',
      hint: 'Print slower, use thinner layers or lines, or fit a high-flow hot end.'
    },
    {
      id: 'line-wider-than-layer',
      expr: 'lineWidthMm >= layerHeightMm',
      severity: 'ERROR',
      message: 'The line is narrower than the layer is tall, so lines will not bond to the layer below.',
      hint: 'Keep the layer height below the line width (typically under 80% of it).'
    },
    {
      id: 'spool-lasts-a-shift',
      expr: 'partsPerSpool * cycleMin >= 480',
      severity: 'WARNING',
      message: 'A spool runs out in less than an 8-hour shift, so someone has to change it mid-shift.',
      hint: 'Use a larger spool, or plan a spool change.'
    }
  ],

  // One part per print. cycleSeconds is an expression over parameters and
  // derived values, so changing the part or the printer changes the cycle.
  behavior: {
    mode: 'DISCRETE_CYCLE',
    cycleSeconds: 'printTimeS + bedClearSeconds',
    unitsPerCycle: '1'
  },

  provenance: {
    authoredBy: 'ENGINEER',
    engineerConfirmed: ['filamentDensityGPerCm3', 'hotEndMaxFlowMm3PerS'],
    notes:
      'Reference contract for DISCRETE_CYCLE. Travel moves, infill patterns and supports are folded into the part mass; the melt-rate check is what keeps the print time honest.'
  },

  // A box frame with the build plate, the gantry and print head on top, and
  // the filament spool on the side. Filament enters at the spool; parts leave
  // from the build plate.
  drawing: {
    viewBox: { width: 120, height: 110 },
    shapes: [
      { type: 'rect', x: 20, y: 10, width: 80, height: 92, rx: 3, layer: 'body' },
      { type: 'line', x1: 24, y1: 30, x2: 96, y2: 30, layer: 'detail' },
      { type: 'rect', x: 52, y: 26, width: 14, height: 12, rx: 2, layer: 'body' },
      { type: 'polygon', points: [[56, 38], [62, 38], [59, 44]], layer: 'body' },
      { type: 'rect', x: 30, y: 78, width: 60, height: 6, layer: 'body' },
      { type: 'rect', x: 50, y: 70, width: 20, height: 8, rx: 1, layer: 'fill' },
      { type: 'circle', cx: 10, cy: 40, r: 9, layer: 'body' },
      { type: 'circle', cx: 10, cy: 40, r: 3, layer: 'detail' }
    ],
    nozzles: [
      { portId: 'filament-in', x: 0.9, y: 36.4, side: 'left', label: 'Filament' },
      { portId: 'part-out', x: 83.3, y: 92.7, side: 'right', label: 'Parts' }
    ]
  }
};
