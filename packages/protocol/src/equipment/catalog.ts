import type { NodeKind, ProcessNode } from '../nodes.js';
import { createDefaultProcessNode } from './nodeFactory.js';
import {
  createTerminalNode,
  TERMINAL_ROLE_DESCRIPTION,
  type Carries,
  type TerminalRole
} from '../terminals.js';

/**
 * The equipment that ships with ProcessForge: the palette's Standard tab, and
 * what an MCP client gets from list_standard_unit_ops. One list, so both show
 * the same units with the same defaults.
 */
export interface EquipmentPaletteItem {
  /** Stable id an MCP client names the unit by: "pump", "feed". */
  id: string;
  kind: NodeKind;
  /** Feeds and outlets only. */
  terminalRole?: TerminalRole;
  category: 'FLUID_PROCESSING' | 'STORAGE_HEAT' | 'PACKAGING' | 'FEEDS_OUTLETS';
  title: string;
  subtitle: string;
  defaultFlowGpm?: number;
  description: string;
  tags: string[];
}

const terminal = (role: TerminalRole, title: string, subtitle: string, tags: string[]): EquipmentPaletteItem => ({
  id: role,
  kind: 'TERMINAL',
  terminalRole: role,
  category: 'FEEDS_OUTLETS',
  title,
  subtitle,
  description: TERMINAL_ROLE_DESCRIPTION[role],
  tags: ['stream', 'arrow', 'boundary', role, ...tags]
});

export const STANDARD_EQUIPMENT_CATALOG: EquipmentPaletteItem[] = [
  terminal('feed', 'Feed', 'Raw material entering the flowsheet', ['input', 'inlet', 'source', 'raw material', 'supply']),
  terminal('product', 'Product', 'Finished product leaving the flowsheet', ['output', 'outlet', 'sink', 'finished']),
  terminal('byproduct', 'Byproduct', 'A secondary stream leaving the flowsheet', ['output', 'co-product', 'overhead', 'side stream']),
  terminal('waste', 'Waste', 'Rejects, purge or effluent leaving the flowsheet', ['output', 'reject', 'scrap', 'effluent', 'purge', 'disposal']),
  {
    id: 'pump',
    kind: 'PUMP',
    category: 'FLUID_PROCESSING',
    title: 'Centrifugal Pump',
    subtitle: 'End-suction process fluid transfer pump',
    defaultFlowGpm: 100,
    description: 'Dynamic pressure head boost for liquid streams. Configurable TDH, motor horsepower, and suction/discharge pipe sizing.',
    tags: ['pump', 'fluid', 'pressure', 'transfer', 'impeller', 'continuous']
  },
  {
    id: 'surge-tank',
    kind: 'SURGE_TANK',
    category: 'STORAGE_HEAT',
    title: 'Surge Buffer Tank',
    subtitle: 'Atmospheric fluid accumulation and surge damping',
    defaultFlowGpm: 60,
    description: 'Dampens batch surges and flow oscillations. Includes level telemetry, high/low alarms, and bottom sump suction port.',
    tags: ['tank', 'vessel', 'buffer', 'storage', 'damping', 'fluid']
  },
  {
    id: 'batch-reactor',
    kind: 'BATCH_REACTOR',
    category: 'FLUID_PROCESSING',
    title: 'CSTR / Batch Reactor',
    subtitle: 'Jacketed reaction vessel with mechanical agitation',
    defaultFlowGpm: 50,
    description: 'Models chemical synthesis, dispersion, and blending with turbine agitators, cooling/heating jackets, and reflux ports.',
    tags: ['reactor', 'cstr', 'batch', 'mixing', 'jacket', 'agitator', 'blending']
  },
  {
    id: 'heat-exchanger',
    kind: 'HEAT_EXCHANGER',
    category: 'STORAGE_HEAT',
    title: 'Shell & Tube Heat Exchanger',
    subtitle: 'Multi-pass industrial thermal conditioning',
    defaultFlowGpm: 80,
    description: 'Continuous thermal duty exchange between shell-side process fluid and tube-side cooling/heating utilities.',
    tags: ['exchanger', 'heat', 'thermal', 'cooling', 'heating', 'shell', 'tube']
  },
  {
    id: 'separator',
    kind: 'SEPARATOR',
    category: 'FLUID_PROCESSING',
    title: 'Flash Separation Drum',
    subtitle: 'Two-phase vapor-liquid separation vessel',
    defaultFlowGpm: 75,
    description: 'Gravity-driven separation of mixed multiphase fluids into top vapor discharge and bottom liquid streams with demister pads.',
    tags: ['separator', 'flash', 'drum', 'vapor', 'liquid', 'multiphase']
  },
  {
    id: 'rotary-filler',
    kind: 'ROTARY_FILLER',
    category: 'PACKAGING',
    title: 'Rotary Container Filler',
    subtitle: 'High-speed rotary piston liquid filling cell',
    defaultFlowGpm: 45,
    description: 'Phase transition interface converting continuous fluid infeed into discrete filled cans or bottles with reject telemetry.',
    tags: ['filler', 'packaging', 'rotary', 'liquid', 'bottling', 'canning', 'discrete']
  },
  {
    id: 'conveyor',
    kind: 'CONVEYOR',
    category: 'PACKAGING',
    title: 'Accumulation Belt Conveyor',
    subtitle: 'Continuous discrete unit transport & queuing buffer',
    description: 'Transfers packaged containers between processing cells. Features item spacing, velocity control, and backpressure monitoring.',
    tags: ['conveyor', 'belt', 'accumulation', 'discrete', 'packaging', 'transport']
  },
  {
    id: 'labeler',
    kind: 'LABELER',
    category: 'PACKAGING',
    title: 'High-Speed Container Labeler',
    subtitle: 'Continuous optical inspection & rotary labeling station',
    description: 'High-cadence labeling cell with vision inspection cameras, defect detection, and pneumatic reject diverter chutes.',
    tags: ['labeler', 'optical', 'inspection', 'packaging', 'discrete', 'reject']
  },
  {
    id: 'palletizer',
    kind: 'PALLETIZER',
    category: 'PACKAGING',
    title: 'Automated Palletizer Cell',
    subtitle: 'End-of-line robotic layer palletizing & skid staging',
    description: 'Packs finished containers into layer patterns and skids with changeover buffers and packaged throughput meters.',
    tags: ['palletizer', 'skid', 'end-of-line', 'layer', 'packaging', 'discrete']
  }
];

/**
 * A catalog entry by id ("pump"), kind ("PUMP"), or title, case-insensitive;
 * failing those, the one entry whose title or tags contain the words.
 */
export function findStandardUnitOp(ref: string): EquipmentPaletteItem | null {
  const want = ref.trim().toLowerCase().replace(/_/g, '-');
  if (!want) return null;
  const exact = STANDARD_EQUIPMENT_CATALOG.find(
    (i) => i.id === want || i.kind.toLowerCase().replace(/_/g, '-') === want || i.title.toLowerCase() === want
  );
  if (exact) return exact;
  const words = want.split(/[\s-]+/).filter(Boolean);
  const hits = STANDARD_EQUIPMENT_CATALOG.filter((i) => {
    const text = `${i.title} ${i.subtitle} ${i.tags.join(' ')}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  return hits.length === 1 ? hits[0]! : null;
}

export interface CreateStandardOptions {
  name?: string;
  position?: { x: number; y: number };
  /** Numeric settings to change from the defaults, by config key. */
  parameters?: Record<string, number>;
  /** Feeds and outlets: what the stream is. */
  material?: string;
  /** Feeds and outlets: liquid by default; changes to match the first unit piped to it. */
  carries?: Carries;
  /** Feeds: gal/min or items/min; 0 or unset supplies whatever the line takes. */
  supplyRate?: number;
  /** Liquid feeds, and the contents of tanks and reactors: mass fractions by component. */
  composition?: Record<string, number>;
}

/** A new node for a catalog entry, with its default settings and nozzles. */
export function createStandardUnitOp(item: EquipmentPaletteItem, options: CreateStandardOptions = {}): ProcessNode {
  if (item.kind === 'TERMINAL' && item.terminalRole) {
    return createTerminalNode(item.terminalRole, {
      ...(options.name ? { name: options.name } : {}),
      ...(options.material ? { material: options.material } : {}),
      ...(options.carries ? { carries: options.carries } : {}),
      ...(options.supplyRate !== undefined ? { supplyRate: options.supplyRate } : {}),
      ...(options.composition ? { composition: options.composition } : {}),
      ...(options.position ? { position: options.position } : {})
    });
  }
  const node = createDefaultProcessNode(item.kind, {
    ...(options.name ? { name: options.name } : {}),
    ...(options.position ? { position: options.position } : {}),
    ...(item.defaultFlowGpm ? { flowRateGpm: item.defaultFlowGpm } : {})
  });
  if (!options.parameters && !options.composition) return node;
  // Only settings the unit has, and only numbers: nothing else changes.
  const config = { ...(node.config as Record<string, unknown>) };
  if (options.composition) {
    // What the unit holds (a tank's starting contents, a reactor's batch) is made of these.
    const fluid = (config.fluid as Record<string, unknown> | undefined) ?? { name: 'Liquid', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 };
    config.fluid = { ...fluid, composition: options.composition };
  }
  for (const [k, v] of Object.entries(options.parameters ?? {})) {
    if (typeof config[k] === 'number' && typeof v === 'number' && Number.isFinite(v)) config[k] = v;
  }
  return { ...node, config: config as ProcessNode['config'] };
}
