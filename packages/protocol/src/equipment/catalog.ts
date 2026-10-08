import type { NodeKind, ProcessNode } from '../nodes.js';
import { createDefaultProcessNode } from './nodeFactory.js';
import {
  createTerminalNode,
  feedLiquid,
  TERMINAL_ROLE_DESCRIPTION,
  type Carries,
  type TerminalRole
} from '../terminals.js';
import type { UnitOpContract } from '../unitop/contract.js';
import { contractToProcessNode } from '../unitop/toNode.js';
import { EVAPORATOR_CONTRACT } from '../unitop/examples/evaporator.js';
import { DUST_COLLECTOR_CONTRACT, SPRAY_DRYER_CONTRACT, VENTURI_SCRUBBER_CONTRACT } from '../unitop/examples/phaseUnits.js';
import { TWO_STREAM_EXCHANGER_CONTRACT } from '../unitop/examples/twoStreamExchanger.js';
import { CRYSTALLISER_CONTRACT } from '../unitop/examples/crystalliser.js';
import { CASE_PACKER_CONTRACT } from '../unitop/examples/casePacker.js';
import {
  CONTINUOUS_DRYER_CONTRACT,
  CSTR_CONTRACT,
  DECANTER_CENTRIFUGE_CONTRACT,
  DISTILLATION_COLUMN_CONTRACT,
  FLOW_SPLITTER_CONTRACT,
  INLINE_MIXER_CONTRACT,
  PLUG_FLOW_REACTOR_CONTRACT,
  PROCESS_HEATER_CONTRACT,
  SOLIDS_FILTER_CONTRACT
} from '../unitop/examples/standardUnits.js';

/**
 * The equipment that ships with ProcessForge: the palette's Standard tab, and
 * what an MCP client gets from list_standard_unit_ops. One list, so both show
 * the same units with the same defaults.
 *
 * Grouped the way process engineers group equipment. Every entry runs on a
 * contract, the same form an MCP client writes its own in: the built-in kinds
 * on the one standardKinds.ts builds from their config, the rest on the
 * contract they carry. So any of them can be tuned or redesigned like a unit
 * you made.
 */
export type EquipmentCategory = 'FEEDS_OUTLETS' | 'TRANSFER_STORAGE' | 'HEAT_TRANSFER' | 'REACTION' | 'SEPARATION' | 'PACKAGING';

export const EQUIPMENT_CATEGORIES: { id: EquipmentCategory; label: string; description: string }[] = [
  { id: 'FEEDS_OUTLETS', label: 'Feeds & outlets', description: 'Where material enters and leaves the flowsheet.' },
  { id: 'TRANSFER_STORAGE', label: 'Transfer & storage', description: 'Moving, holding, blending and dividing liquid.' },
  { id: 'HEAT_TRANSFER', label: 'Heat transfer', description: 'Heating, cooling and evaporating.' },
  { id: 'REACTION', label: 'Reaction', description: 'Batch and continuous reactors.' },
  { id: 'SEPARATION', label: 'Separation', description: 'Splitting a stream by phase, size or volatility, and drying.' },
  { id: 'PACKAGING', label: 'Packaging & items', description: 'Filling, labeling, packing and moving discrete items.' }
];

export interface EquipmentPaletteItem {
  /** Stable id an MCP client names the unit by: "pump", "feed". */
  id: string;
  kind: NodeKind;
  /** Feeds and outlets only. */
  terminalRole?: TerminalRole;
  /** Designed standard units: the contract the unit runs on. */
  contract?: UnitOpContract;
  category: EquipmentCategory;
  title: string;
  /** A name short enough for a chip. */
  short: string;
  subtitle: string;
  defaultFlowGpm?: number;
  description: string;
  /** How the engine simulates it, in a sentence or two. */
  model: string;
  tags: string[];
}

const terminal = (role: TerminalRole, title: string, subtitle: string, model: string, tags: string[]): EquipmentPaletteItem => ({
  id: role,
  kind: 'TERMINAL',
  terminalRole: role,
  category: 'FEEDS_OUTLETS',
  title,
  short: title,
  subtitle,
  description: TERMINAL_ROLE_DESCRIPTION[role],
  model,
  tags: ['stream', 'arrow', 'boundary', role, ...tags]
});

const designed = (
  id: string,
  contract: UnitOpContract,
  category: EquipmentCategory,
  short: string,
  subtitle: string,
  model: string,
  tags: string[]
): EquipmentPaletteItem => ({
  id,
  kind: 'CUSTOM_UNIT_OP',
  contract,
  category,
  title: contract.name,
  short,
  subtitle,
  description: contract.description,
  model,
  tags: ['designed', ...tags]
});

export const STANDARD_EQUIPMENT_CATALOG: EquipmentPaletteItem[] = [
  // ── Feeds & outlets
  terminal('feed', 'Feed', 'Raw material entering the flowsheet', 'Supplies whatever the units it feeds can take, or up to a supply rate you set, so a short supply shows up as the bottleneck.', ['input', 'inlet', 'source', 'raw material', 'supply']),
  terminal('product', 'Product', 'Finished product leaving the flowsheet', 'Takes everything it is sent. What arrives here is the line’s output.', ['output', 'outlet', 'sink', 'finished']),
  terminal('byproduct', 'Byproduct', 'A secondary stream leaving the flowsheet', 'Takes everything it is sent, totalled on its own: an overhead vapour or a co-product does not count as output.', ['output', 'co-product', 'overhead', 'side stream']),
  terminal('waste', 'Waste', 'Rejects, purge or effluent leaving the flowsheet', 'Takes everything it is sent, totalled on its own, so rejects and purge are visible without inflating output.', ['output', 'reject', 'scrap', 'effluent', 'purge', 'disposal']),

  // ── Transfer & storage
  {
    id: 'pump',
    kind: 'PUMP',
    category: 'TRANSFER_STORAGE',
    title: 'Centrifugal pump',
    short: 'Pump',
    subtitle: 'Liquid transfer at a design flow',
    defaultFlowGpm: 100,
    description: 'Moves liquid from one unit to the next. Set its design flow, head and motor size.',
    model: 'Passes liquid up to its design flow. A pump too small caps everything downstream of it.',
    tags: ['pump', 'fluid', 'pressure', 'transfer', 'impeller', 'continuous']
  },
  {
    id: 'surge-tank',
    kind: 'SURGE_TANK',
    category: 'TRANSFER_STORAGE',
    title: 'Storage tank',
    short: 'Tank',
    subtitle: 'Atmospheric buffer and storage vessel',
    defaultFlowGpm: 60,
    description: 'Holds liquid between units, absorbing the difference between what comes in and what goes out. Set its volume and starting level.',
    model: 'Fills and drains second by second. Full, it backs up whatever feeds it; empty, it starves whatever it feeds.',
    tags: ['tank', 'vessel', 'buffer', 'surge', 'storage', 'holding', 'fluid']
  },
  designed('mixer', INLINE_MIXER_CONTRACT, 'TRANSFER_STORAGE', 'Mixer', 'Blends two liquid streams', 'Mixes whatever is piped in: flow, temperature and composition combine. Passes up to its rated flow.', ['mixer', 'blend', 'static mixer', 'junction', 'combine']),
  designed('splitter', FLOW_SPLITTER_CONTRACT, 'TRANSFER_STORAGE', 'Splitter', 'Divides a stream by a fixed fraction', 'Sends a set share of the flow to one outlet and the rest to the other, live.', ['splitter', 'tee', 'divide', 'recycle', 'purge', 'bypass']),

  // ── Heat transfer
  {
    id: 'heat-exchanger',
    kind: 'HEAT_EXCHANGER',
    category: 'HEAT_TRANSFER',
    title: 'Shell & tube heat exchanger',
    short: 'Heat exchanger',
    subtitle: 'Heats or cools a stream to a target',
    defaultFlowGpm: 80,
    description: 'Brings a liquid stream to a target temperature against a utility, within its rated duty.',
    model: 'Passes flow up to its shell-side rate. With a target temperature it heats or cools the stream within its rated duty, and the energy is counted.',
    tags: ['exchanger', 'heat', 'thermal', 'cooling', 'heating', 'shell', 'tube', 'cooler']
  },
  designed('heater', PROCESS_HEATER_CONTRACT, 'HEAT_TRANSFER', 'Heater', 'Steam or electric heater to a target', 'Heats toward its target with at most its rated duty: Q = m·cp·ΔT, from the live stream. Short of duty, the stream leaves cooler and it is flagged.', ['heater', 'steam', 'electric', 'preheater', 'heating']),
  designed('evaporator', EVAPORATOR_CONTRACT, 'HEAT_TRANSFER', 'Evaporator', 'Concentrates a feed with steam', 'Heats the live feed to its boiling point, then boils off what the remaining steam can: vapour overhead, concentrate out of the bottom.', ['evaporator', 'concentrate', 'steam', 'boil', 'vapour']),
  designed('two-stream-exchanger', TWO_STREAM_EXCHANGER_CONTRACT, 'HEAT_TRANSFER', 'Shell & tube', 'Two streams, no mixing', 'A hot stream heats a cold one through the tube wall; each leaves by its own outlet. Counter-current, rated by UA with effectiveness-NTU from both live inlets.', ['heat exchanger', 'shell and tube', 'shell & tube', 'two stream', 'cooler', 'interchanger', 'recuperator']),

  // ── Reaction
  {
    id: 'batch-reactor',
    kind: 'BATCH_REACTOR',
    category: 'REACTION',
    title: 'Batch reactor',
    short: 'Batch reactor',
    subtitle: 'Jacketed, agitated batch vessel',
    defaultFlowGpm: 50,
    description: 'Fills, heats with its jacket, reacts for a set time, then discharges. Set its volume, reaction time and jacket duty.',
    model: 'Cycles through filling, heating, reacting and discharging. Its output averages one batch per cycle, however fast it discharges.',
    tags: ['reactor', 'batch', 'mixing', 'jacket', 'agitator', 'blending', 'kettle']
  },
  designed('cstr', CSTR_CONTRACT, 'REACTION', 'CSTR', 'Continuous stirred tank, first order', 'Converts reactant to product by X = k·τ/(1 + k·τ) at the live residence time: more flow, less conversion. The outlet composition follows.', ['reactor', 'cstr', 'continuous', 'stirred', 'kinetics', 'conversion']),
  designed('pfr', PLUG_FLOW_REACTOR_CONTRACT, 'REACTION', 'PFR', 'Tubular reactor, first order', 'Converts reactant to product by X = 1 − exp(−k·τ) at the live residence time. The outlet composition follows.', ['reactor', 'pfr', 'tubular', 'plug flow', 'kinetics', 'conversion']),

  // ── Separation
  {
    id: 'separator',
    kind: 'SEPARATOR',
    category: 'SEPARATION',
    title: 'Flash drum',
    short: 'Flash drum',
    subtitle: 'Vapour-liquid separation vessel',
    defaultFlowGpm: 75,
    description: 'Separates a mixed stream into vapour overhead and liquid bottoms.',
    model: 'Splits its feed between the vapour overhead and the liquid bottoms, by its vapour ratio.',
    tags: ['separator', 'flash', 'drum', 'vapor', 'vapour', 'liquid', 'knockout']
  },
  designed('distillation-column', DISTILLATION_COLUMN_CONTRACT, 'SEPARATION', 'Column', 'Shortcut distillation with reboiler duty', 'Sends a set share overhead as distillate, the rest as bottoms, at the top and bottom temperatures. Reboiler duty follows from the live feed and the reflux ratio.', ['distillation', 'column', 'tower', 'reflux', 'reboiler', 'fractionation']),
  designed('filter', SOLIDS_FILTER_CONTRACT, 'SEPARATION', 'Filter', 'Solids-liquid filter', 'Takes captured solids out as a cake at its set dryness (a solids mass balance); the rest leaves as filtrate.', ['filter', 'press', 'cake', 'filtrate', 'solids', 'dewatering']),
  designed('centrifuge', DECANTER_CENTRIFUGE_CONTRACT, 'SEPARATION', 'Centrifuge', 'Decanter centrifuge', 'Spins solids out as a paste; recovery falls off above the rated flow, so an overloaded machine sends solids to the centrate.', ['centrifuge', 'decanter', 'solids', 'dewatering', 'centrate']),
  designed('crystalliser', CRYSTALLISER_CONTRACT, 'SEPARATION', 'Crystalliser', 'Batch cooling crystalliser', 'Charges, heats to dissolve, cools at its set rate, then decants liquor and drops slurry. Its phase times follow from the batch.', ['crystalliser', 'crystallizer', 'batch', 'cooling', 'slurry']),
  designed('dryer', CONTINUOUS_DRYER_CONTRACT, 'SEPARATION', 'Dryer', 'Continuous dryer', 'Drives off water down to the product moisture, as vapour. The duty follows from the live feed; more than the burner can supply is flagged.', ['dryer', 'drier', 'drying', 'moisture', 'rotary']),
  designed('spray-dryer', SPRAY_DRYER_CONTRACT, 'SEPARATION', 'Spray dryer', 'Liquid feed to powder in hot air', 'Liquid in, powder and humid air out: the water evaporates (latent heat at the outlet temperature) and the solids dry to their set moisture. The air must carry enough heat and leave unsaturated; both are checked live.', ['spray dryer', 'spray drier', 'spray', 'atomiser', 'atomizer', 'powder', 'drying']),
  designed('dust-collector', DUST_COLLECTOR_CONTRACT, 'SEPARATION', 'Dust collector', 'Pulse-jet baghouse', 'Dusty air in; clean air out and powder to the hopper. Sized by air-to-cloth ratio in ACFM per ft² of cloth, with the emission in mg/Nm³, pressure drop and fan power from the live gas.', ['dust collector', 'baghouse', 'bag filter', 'cartridge', 'pulse jet', 'dust', 'extraction', 'powder']),
  designed('venturi-scrubber', VENTURI_SCRUBBER_CONTRACT, 'SEPARATION', 'Venturi scrubber', 'Wet scrubber for hot dusty gas', 'Hot dusty gas and water in; cooled, saturated, cleaned gas and dirty liquor out. Collection follows L/G and throat velocity (Johnstone); the pressure drop follows Calvert; the gas cools toward adiabatic saturation as it evaporates water.', ['scrubber', 'venturi', 'wet scrubber', 'quench', 'dust', 'gas cleaning']),

  // ── Packaging & items
  {
    id: 'rotary-filler',
    kind: 'ROTARY_FILLER',
    category: 'PACKAGING',
    title: 'Rotary filler',
    short: 'Filler',
    subtitle: 'Fills containers from a liquid feed',
    defaultFlowGpm: 45,
    description: 'Turns a liquid feed into filled containers, a nozzle per container.',
    model: 'Turns liquid into containers: each cycle draws one container per nozzle from its bowl, and waits when the product runs out.',
    tags: ['filler', 'packaging', 'rotary', 'liquid', 'bottling', 'canning', 'discrete']
  },
  {
    id: 'labeler',
    kind: 'LABELER',
    category: 'PACKAGING',
    title: 'Labeler',
    short: 'Labeler',
    subtitle: 'Labels and inspects containers',
    description: 'Labels containers at speed, with an inspection that rejects bad ones.',
    model: 'Labels one container at a time at its speed; failed inspections are scrapped.',
    tags: ['labeler', 'optical', 'inspection', 'packaging', 'discrete', 'reject']
  },
  designed('case-packer', CASE_PACKER_CONTRACT, 'PACKAGING', 'Case packer', 'Wraps bottles into cases', 'Each cycle takes a full case of bottles and one carton blank (feed blanks from a Feed), and makes a case; one in so many is a reject.', ['case packer', 'cases', 'cartons', 'packing', 'discrete']),
  {
    id: 'palletizer',
    kind: 'PALLETIZER',
    category: 'PACKAGING',
    title: 'Palletizer',
    short: 'Palletizer',
    subtitle: 'Stacks cases into pallet loads',
    description: 'Builds layers of cases into loaded pallets at the end of the line.',
    model: 'Waits for a full layer, stacks it, and passes loaded skids on.',
    tags: ['palletizer', 'skid', 'end-of-line', 'layer', 'packaging', 'discrete']
  },
  {
    id: 'conveyor',
    kind: 'CONVEYOR',
    category: 'PACKAGING',
    title: 'Accumulation conveyor',
    short: 'Conveyor',
    subtitle: 'Carries and buffers items',
    description: 'Carries items between machines and buffers them when the next one is slow.',
    model: 'Carries and buffers items. When it is full, whatever feeds it blocks.',
    tags: ['conveyor', 'belt', 'accumulation', 'discrete', 'packaging', 'transport']
  }
];

/**
 * A catalog entry by id ("pump"), kind ("PUMP"), title or short name,
 * case-insensitive; failing those, the one entry whose title or tags contain
 * the words.
 */
export function findStandardUnitOp(ref: string): EquipmentPaletteItem | null {
  const want = ref.trim().toLowerCase().replace(/_/g, '-');
  if (!want) return null;
  const exact = STANDARD_EQUIPMENT_CATALOG.find(
    (i) =>
      i.id === want ||
      (i.kind !== 'CUSTOM_UNIT_OP' && i.kind.toLowerCase().replace(/_/g, '-') === want) ||
      i.title.toLowerCase() === want ||
      i.short.toLowerCase() === want
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
  /** Numeric settings to change from the defaults, by config key (a designed unit: by contract parameter). */
  parameters?: Record<string, number>;
  /** Feeds and outlets: what the stream is. */
  material?: string;
  /** Feeds and outlets: liquid by default; changes to match the first unit piped to it. */
  carries?: Carries;
  /** Feeds: gal/min or items/min; 0 or unset supplies whatever the line takes. */
  supplyRate?: number;
  /** Liquid feeds, and the contents of tanks and reactors: mass fractions by component. */
  composition?: Record<string, number>;
  /** Feeds and outlets: LIQUID, GAS or SOLID. */
  phase?: 'LIQUID' | 'GAS' | 'SOLID';
  /** Feeds: supply as a mass flow, kg/h, or (a gas) in SCFM. */
  supplyKgPerHour?: number;
  supplyScfm?: number;
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
      ...(options.phase ? { phase: options.phase } : {}),
      ...(options.supplyKgPerHour !== undefined ? { supplyKgPerHour: options.supplyKgPerHour } : {}),
      ...(options.supplyScfm !== undefined ? { supplyScfm: options.supplyScfm } : {}),
      // A feed's liquid: temperatureC, densityGPerCm3, specificHeatKjPerKgK.
      ...(item.terminalRole === 'feed' ? feedLiquid({ config: options.parameters ?? {} }) : {}),
      ...(options.position ? { position: options.position } : {})
    });
  }
  if (item.contract) return createDesignedStandard(item.contract, options);
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

/**
 * A designed standard unit. Its settings are its contract parameters: a value
 * inside the parameter's physical range is set on the contract (and mirrored
 * for the inspector); one outside it, or a name that is not a parameter, is
 * left at the default.
 */
function createDesignedStandard(contract: UnitOpContract, options: CreateStandardOptions): ProcessNode {
  const wanted = options.parameters ?? {};
  const tuned: UnitOpContract = {
    ...contract,
    parameters: contract.parameters.map((p) => {
      const v = wanted[p.name];
      const ok = typeof v === 'number' && Number.isFinite(v) && (p.min === undefined || v >= p.min) && (p.max === undefined || v <= p.max);
      return ok ? { ...p, value: v } : p;
    })
  };
  const node = contractToProcessNode(tuned, options.position ? { position: options.position } : {});
  return options.name ? { ...node, name: options.name } : node;
}
