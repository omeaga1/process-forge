import { PAINT_CANNING_LINE, BEVERAGE_BOTTLING_LINE, BLANK_LINE, SPRAY_DRYING_LINE, type ProcessGraph } from '@process-forge/protocol';

/** What a new project can start from. */
export interface ProjectTemplate {
  key: string;
  name: string;
  description: string;
  graph: ProcessGraph;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    key: 'blank',
    name: 'Blank flowsheet',
    description: 'An empty canvas. Add standard equipment or design your own unit ops.',
    graph: BLANK_LINE
  },
  {
    key: 'paint-canning-line',
    name: 'Paint canning line',
    description: 'Blending, filling, labelling and palletising architectural paint.',
    graph: PAINT_CANNING_LINE
  },
  {
    key: 'beverage-bottling-line',
    name: 'Beverage bottling line',
    description: 'Carbonation, rotary filling, capping, accumulation and case packing.',
    graph: BEVERAGE_BOTTLING_LINE
  },
  {
    key: 'spray-drying-line',
    name: 'Spray drying line',
    description: 'Liquid in, powder out: a spray dryer and a product-recovery baghouse, with gas, liquid and solid streams in their own units.',
    graph: SPRAY_DRYING_LINE
  }
];

export function findTemplate(key: string): ProjectTemplate {
  return PROJECT_TEMPLATES.find((t) => t.key === key) ?? PROJECT_TEMPLATES[0]!;
}

/** "Untitled flowsheet", then "Untitled flowsheet 2", ... among existing names. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}
