import type { UnitOpContract } from '../contract.js';

/**
 * A worked example of a unit that takes and makes different items: a case
 * packer that puts bottles and a flat carton blank together into one case,
 * and kicks out a case whose check-weigh fails.
 *
 * It shows inputs[] (a whole kit per cycle, from two ports), outputs[] (good
 * cases and rejects on their own ports, rejects marked scrap), and a cycle
 * computed from the physics rather than typed in.
 */
export const CASE_PACKER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'wrap-around-case-packer-v1',
  name: 'Wrap-around case packer',
  description:
    'Collates bottles into a pack pattern, wraps a carton blank around them and glues it. One case a cycle; a case that fails the check-weigher goes to the reject lane.',
  ports: [
    { id: 'bottles', name: 'Bottles', direction: 'INLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true },
    { id: 'blanks', name: 'Carton blanks', direction: 'INLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true },
    { id: 'cases', name: 'Cases', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true },
    { id: 'rejects', name: 'Rejects', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: false }
  ],
  parameters: [
    { name: 'rows', label: 'Rows', unit: 'bottles', value: 3, min: 1, max: 8 },
    { name: 'columns', label: 'Columns', unit: 'bottles', value: 4, min: 1, max: 8 },
    { name: 'collateSecondsPerBottle', label: 'Collation time per bottle', unit: 's', value: 0.25, min: 0.05, max: 5 },
    { name: 'wrapAndGlueSeconds', label: 'Wrap and glue', unit: 's', value: 2.5, min: 0.5, max: 20 },
    { name: 'rejectEvery', label: 'One reject every', unit: 'cases', value: 50, min: 2, max: 100000 }
  ],
  derived: [
    { name: 'bottlesPerCase', label: 'Bottles per case', unit: 'bottles', expr: 'rows * columns' },
    {
      name: 'cycleS',
      label: 'Cycle',
      unit: 's',
      expr: 'max(wrapAndGlueSeconds, bottlesPerCase * collateSecondsPerBottle)',
      description: 'Collating the next pack overlaps wrapping this one, so the slower of the two sets the cycle.'
    },
    { name: 'casesPerMinute', label: 'Cases per minute', unit: '/min', expr: '60 / cycleS' }
  ],
  constraints: [
    {
      id: 'glue-set',
      expr: 'wrapAndGlueSeconds >= 1',
      severity: 'ERROR',
      message: 'Hot-melt needs at least a second of compression to set.',
      hint: 'Raise wrapAndGlueSeconds.'
    },
    {
      id: 'stable-pack',
      expr: 'rows * 3 >= columns',
      severity: 'WARNING',
      message: 'A long, narrow pack tips over on the collator.',
      hint: 'Use more rows and fewer columns.'
    }
  ],
  behavior: {
    mode: 'DISCRETE_CYCLE',
    cycleSeconds: 'cycleS * rejectEvery',
    unitsPerCycle: 'rejectEvery',
    inputs: [
      { port: 'bottles', perCycle: 'bottlesPerCase * rejectEvery' },
      { port: 'blanks', perCycle: 'rejectEvery' }
    ],
    outputs: [
      { port: 'cases', perCycle: 'rejectEvery - 1' },
      { port: 'rejects', perCycle: '1', scrap: true }
    ]
  },
  provenance: {
    authoredBy: 'TEMPLATE',
    engineerConfirmed: [],
    notes:
      'One engine cycle is a run of rejectEvery cases, so the reject rate is exact and whole. A shorter cycle with fractional rejects is not possible: items are whole.'
  },
  drawing: {
    viewBox: { width: 180, height: 90 },
    shapes: [
      { type: 'rect', x: 10, y: 20, width: 160, height: 55, rx: 3, layer: 'body' },
      { type: 'line', x1: 10, y1: 62, x2: 170, y2: 62, layer: 'detail' },
      { type: 'rect', x: 30, y: 40, width: 30, height: 22, layer: 'detail' },
      { type: 'rect', x: 80, y: 36, width: 36, height: 26, layer: 'body' },
      { type: 'rect', x: 130, y: 40, width: 30, height: 22, layer: 'fill' },
      { type: 'rect', x: 84, y: 5, width: 28, height: 15, layer: 'body' }
    ],
    nozzles: [
      { portId: 'bottles', x: 5.6, y: 55.6, side: 'left', label: 'Bottles' },
      { portId: 'blanks', x: 54.4, y: 5.6, side: 'top', label: 'Blanks' },
      { portId: 'cases', x: 94.4, y: 55.6, side: 'right', label: 'Cases' },
      { portId: 'rejects', x: 83.3, y: 83.3, side: 'bottom', label: 'Rejects' }
    ]
  }
};
