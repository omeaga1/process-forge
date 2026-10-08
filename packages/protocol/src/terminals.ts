import type { ProcessGraph } from './graph.js';
import { idealGasDensity, mixtureMolarMass, scfmToKgPerS, STD_PRESSURE_KPA } from './unitop/phases.js';
import type { NodePort, ProcessNode } from './nodes.js';
import type { ProcessEdge } from './streams.js';

/**
 * Where material enters and leaves the flowsheet: feeds, products,
 * byproducts and waste. On the canvas each is an arrow at the edge of the
 * drawing, the way a PFD marks a stream that comes from or goes to somewhere
 * off the sheet.
 *
 * All four are one node kind, TERMINAL, with a `role`. A feed has one outlet;
 * the other three have one inlet. The port has no fixed kind until it is
 * piped: it takes on whatever the unit at the other end carries (liquid or
 * items), so the same Feed arrow can feed a reactor or a labeler.
 *
 * In the simulation a feed supplies what the line takes (or up to its supply
 * rate), and an outlet takes everything it is given. Only product outlets
 * count toward the line's output; byproducts and waste are totalled apart.
 */

export const TERMINAL_ROLES = ['feed', 'product', 'byproduct', 'waste'] as const;
export type TerminalRole = (typeof TERMINAL_ROLES)[number];
export type Carries = 'liquid' | 'items';

export const TERMINAL_ROLE_LABEL: Record<TerminalRole, string> = {
  feed: 'Feed',
  product: 'Product',
  byproduct: 'Byproduct',
  waste: 'Waste'
};

/** What each role means, in a sentence, for the palette and the MCP catalog. */
export const TERMINAL_ROLE_DESCRIPTION: Record<TerminalRole, string> = {
  feed: 'Raw material entering the flowsheet. Supplies whatever the unit it feeds takes, or up to a set supply rate.',
  product: 'The saleable output leaving the flowsheet. What reaches a product outlet is the line\'s output.',
  byproduct: 'A secondary stream leaving the flowsheet (an overhead vapor, a co-product). Totalled on its own, not as output.',
  waste: 'Material leaving the flowsheet to disposal or treatment (rejects, purge, wash water). Totalled on its own.'
};

const DEFAULT_MATERIAL: Record<TerminalRole, string> = {
  feed: 'Raw material',
  product: 'Finished product',
  byproduct: 'Byproduct',
  waste: 'Waste'
};

export interface TerminalConfig {
  role: TerminalRole;
  /** What the stream is, in the engineer's words: "Latex base", "Empty cans". */
  material: string;
  /** Feeds only: the most it supplies, gal/min for liquid or items/min. 0 means whatever the line takes. */
  supplyRate?: number;
  /** Liquid feeds: what it supplies is made of, as mass fractions, e.g. { water: 0.88, sugar: 0.12 }. */
  composition?: Record<string, number>;
  /** Liquid feeds: the liquid it supplies. Unset, it is what its pipe says. */
  temperatureC?: number;
  densityGPerCm3?: number;
  specificHeatKjPerKgK?: number;
  /**
   * What phase the stream is in: LIQUID (the default), GAS or SOLID. A GAS
   * feed with no density of its own is an ideal gas at its temperature.
   */
  phase?: 'LIQUID' | 'GAS' | 'SOLID';
  /** Feeds: the most it supplies as a mass flow, kg/h. Wins over supplyRate. */
  supplyKgPerHour?: number;
  /** GAS feeds: the most it supplies in standard ft³/min (68 °F, 1 atm). Wins over supplyRate. */
  supplyScfm?: number;
}

/** A feed's or outlet's phase, when it states one. */
export function terminalPhase(node: Pick<ProcessNode, 'config'>): 'LIQUID' | 'GAS' | 'SOLID' | undefined {
  const p = (node.config as { phase?: unknown }).phase;
  return p === 'LIQUID' || p === 'GAS' || p === 'SOLID' ? p : undefined;
}

/**
 * A feed's supply as a mass flow, kg/s, when it is stated in mass (kg/h) or,
 * for a gas, in SCFM (converted with the ideal gas law and the mixture's
 * molar mass). Undefined when the feed states its supply in gal/min or not at all.
 */
export function feedMassSupplyKgPerS(node: Pick<ProcessNode, 'config'>): number | undefined {
  const c = node.config as { supplyKgPerHour?: unknown; supplyScfm?: unknown; composition?: Record<string, number> };
  if (typeof c.supplyKgPerHour === 'number' && Number.isFinite(c.supplyKgPerHour) && c.supplyKgPerHour > 0) return c.supplyKgPerHour / 3600;
  if (terminalPhase(node) === 'GAS' && typeof c.supplyScfm === 'number' && Number.isFinite(c.supplyScfm) && c.supplyScfm > 0) return scfmToKgPerS(c.supplyScfm, mixtureMolarMass(c.composition));
  return undefined;
}

/** A GAS feed's density, g/cm³, as an ideal gas at its temperature and 1 atm (unless it states its own). */
export function feedGasDensityGPerCm3(node: Pick<ProcessNode, 'config'>, temperatureC: number): number | undefined {
  if (terminalPhase(node) !== 'GAS') return undefined;
  const c = node.config as { composition?: Record<string, number> };
  return idealGasDensity(temperatureC, STD_PRESSURE_KPA, mixtureMolarMass(c.composition)) / 1000;
}

/** The settings that describe the liquid a feed supplies. */
export const FEED_LIQUID_KEYS = ['temperatureC', 'densityGPerCm3', 'specificHeatKjPerKgK'] as const;

/** The liquid a feed says it supplies (only what it sets). */
export function feedLiquid(node: Pick<ProcessNode, 'config'>): { temperatureC?: number; densityGPerCm3?: number; specificHeatKjPerKgK?: number } {
  const c = node.config as Record<string, unknown>;
  const out: { temperatureC?: number; densityGPerCm3?: number; specificHeatKjPerKgK?: number } = {};
  const t = c.temperatureC;
  if (typeof t === 'number' && Number.isFinite(t)) out.temperatureC = t;
  for (const k of ['densityGPerCm3', 'specificHeatKjPerKgK'] as const) {
    const v = c[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

export function isTerminal(node: Pick<ProcessNode, 'kind'> | undefined): boolean {
  return node?.kind === 'TERMINAL';
}

export function terminalRole(node: Pick<ProcessNode, 'kind' | 'config'> | undefined): TerminalRole | null {
  if (!node || node.kind !== 'TERMINAL') return null;
  const role = (node.config as { role?: unknown }).role;
  return (TERMINAL_ROLES as readonly unknown[]).includes(role) ? (role as TerminalRole) : 'product';
}

export function terminalMaterial(node: Pick<ProcessNode, 'kind' | 'config'>): string {
  const m = (node.config as { material?: unknown }).material;
  return typeof m === 'string' && m.trim() ? m.trim() : DEFAULT_MATERIAL[terminalRole(node) ?? 'product'];
}

/** Feeds only: gal/min or items/min; 0 (or unset) means whatever the line takes. */
export function terminalSupplyRate(node: Pick<ProcessNode, 'config'>): number {
  const r = (node.config as { supplyRate?: unknown }).supplyRate;
  return typeof r === 'number' && Number.isFinite(r) && r > 0 ? r : 0;
}

function portFor(role: TerminalRole, carries: Carries, material: string): NodePort {
  const items = carries === 'items';
  return role === 'feed'
    ? { id: 'out', name: material, type: items ? 'DISCRETE_OUTPUT' : 'FLUID_OUTPUT', flowDimension: items ? 'DISCRETE_CONTAINER' : 'CONTINUOUS_VOLUME' }
    : { id: 'in', name: material, type: items ? 'DISCRETE_INPUT' : 'FLUID_INPUT', flowDimension: items ? 'DISCRETE_CONTAINER' : 'CONTINUOUS_VOLUME' };
}

export function terminalCarries(node: Pick<ProcessNode, 'inputs' | 'outputs'>): Carries {
  const port = node.outputs[0] ?? node.inputs[0];
  return port?.flowDimension === 'DISCRETE_CONTAINER' ? 'items' : 'liquid';
}

export interface CreateTerminalOptions {
  name?: string;
  material?: string;
  /** Liquid by default; it changes to match the first unit it is piped to. */
  carries?: Carries;
  supplyRate?: number;
  /** Liquid feeds: mass fractions of what it supplies. */
  composition?: Record<string, number>;
  /** Liquid feeds: the liquid it supplies. */
  temperatureC?: number;
  densityGPerCm3?: number;
  specificHeatKjPerKgK?: number;
  phase?: 'LIQUID' | 'GAS' | 'SOLID';
  supplyKgPerHour?: number;
  supplyScfm?: number;
  position?: { x: number; y: number };
  id?: string;
}

export function createTerminalNode(role: TerminalRole, options: CreateTerminalOptions = {}): ProcessNode {
  const material = options.material?.trim() || DEFAULT_MATERIAL[role];
  const port = portFor(role, options.carries ?? 'liquid', material);
  const config: TerminalConfig = {
    role,
    material,
    ...(role === 'feed' ? { supplyRate: options.supplyRate ?? 0 } : {}),
    ...(role === 'feed' && options.composition ? { composition: options.composition } : {}),
    ...(role === 'feed' ? feedLiquid({ config: options as Record<string, unknown> }) : {}),
    ...(options.phase ? { phase: options.phase } : {}),
    ...(role === 'feed' && options.supplyKgPerHour && options.supplyKgPerHour > 0 ? { supplyKgPerHour: options.supplyKgPerHour } : {}),
    ...(role === 'feed' && options.supplyScfm && options.supplyScfm > 0 ? { supplyScfm: options.supplyScfm } : {})
  };
  return {
    id: options.id ?? `${role}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    name: options.name?.trim() || (material === DEFAULT_MATERIAL[role] ? TERMINAL_ROLE_LABEL[role] : `${TERMINAL_ROLE_LABEL[role]}: ${material}`),
    kind: 'TERMINAL',
    // Near the middle, a little apart each time, like the other standard units.
    position: options.position ?? { x: 400 + Math.floor(Math.random() * 80) - 40, y: 250 + Math.floor(Math.random() * 80) - 40 },
    inputs: role === 'feed' ? [] : [port],
    outputs: role === 'feed' ? [port] : [],
    config: config as unknown as ProcessNode['config']
  };
}

/**
 * Changes an outlet between product, byproduct and waste. A feed stays a
 * feed and an outlet stays an outlet: that would turn its pipes around.
 */
export function setTerminalRole(node: ProcessNode, role: TerminalRole): ProcessNode {
  const current = terminalRole(node);
  if (!current || current === role || (current === 'feed') !== (role === 'feed')) return node;
  return { ...node, config: { ...(node.config as Record<string, unknown>), role } as ProcessNode['config'] };
}

/** Renames what a terminal carries; its port is named after it. */
export function setTerminalMaterial(node: ProcessNode, material: string): ProcessNode {
  if (!isTerminal(node)) return node;
  const rename = (p: NodePort) => ({ ...p, name: material.trim() || p.name });
  return {
    ...node,
    inputs: node.inputs.map(rename),
    outputs: node.outputs.map(rename),
    config: { ...(node.config as Record<string, unknown>), material } as ProcessNode['config']
  };
}

const isDiscrete = (p: NodePort) => p.flowDimension === 'DISCRETE_CONTAINER';

function portInUse(graph: ProcessGraph, nodeId: string, portId: string): boolean {
  return graph.edges.some(
    (e) => (e.sourceNodeId === nodeId && e.sourcePortId === portId) || (e.targetNodeId === nodeId && e.targetPortId === portId)
  );
}

/** A terminal's port that nothing is piped to yet: it can take either kind. */
function adaptable(graph: ProcessGraph, node: ProcessNode | undefined, port: NodePort): boolean {
  return isTerminal(node) && !portInUse(graph, node!.id, port.id);
}

/**
 * Whether a pipe from `out` on one unit into `in` on another carries one kind
 * of thing. Both liquid, or both items -- or one end is a terminal that has
 * nothing piped to it yet, which takes on the other end's kind.
 */
export function portsFit(graph: ProcessGraph, from: ProcessNode | undefined, out: NodePort, to: ProcessNode | undefined, inp: NodePort): boolean {
  if (isDiscrete(out) === isDiscrete(inp)) return true;
  return adaptable(graph, from, out) || adaptable(graph, to, inp);
}

/**
 * What a new pipe carries: the kind of the end that is fixed. When the
 * source is a terminal about to take on the target's kind, that is the
 * target's.
 */
export function effectivePortKind(graph: ProcessGraph, from: ProcessNode | undefined, out: NodePort, _to: ProcessNode | undefined, inp: NodePort): Carries {
  if (isDiscrete(out) !== isDiscrete(inp) && adaptable(graph, from, out)) return isDiscrete(inp) ? 'items' : 'liquid';
  return isDiscrete(out) ? 'items' : 'liquid';
}

function retype(node: ProcessNode, portId: string, carries: Carries): ProcessNode {
  const role = terminalRole(node) ?? 'product';
  const fix = (p: NodePort) => (p.id === portId ? { ...portFor(role, carries, p.name), id: p.id } : p);
  return { ...node, inputs: node.inputs.map(fix), outputs: node.outputs.map(fix) };
}

/**
 * Adds a pipe to the flowsheet. A terminal end with nothing piped to it yet
 * takes on the other end's kind first, so the pipe, the port and the
 * simulation agree on what flows.
 */
export function addStreamToGraph(graph: ProcessGraph, edge: ProcessEdge): ProcessGraph {
  const from = graph.nodes.find((n) => n.id === edge.sourceNodeId);
  const to = graph.nodes.find((n) => n.id === edge.targetNodeId);
  const out = from?.outputs.find((p) => p.id === edge.sourcePortId);
  const inp = to?.inputs.find((p) => p.id === edge.targetPortId);
  let nodes = graph.nodes;
  if (from && to && out && inp && isDiscrete(out) !== isDiscrete(inp)) {
    if (adaptable(graph, from, out)) {
      const carries: Carries = isDiscrete(inp) ? 'items' : 'liquid';
      nodes = nodes.map((n) => (n.id === from.id ? retype(n, out.id, carries) : n));
    } else if (adaptable(graph, to, inp)) {
      const carries: Carries = isDiscrete(out) ? 'items' : 'liquid';
      nodes = nodes.map((n) => (n.id === to.id ? retype(n, inp.id, carries) : n));
    }
  }
  return { ...graph, nodes, edges: [...graph.edges, edge] };
}

/** What a node is, in words: "surge tank", or "feed" / "waste outlet" for an arrow. */
export function kindLabel(node: Pick<ProcessNode, 'kind' | 'config'>): string {
  const role = terminalRole(node);
  if (role) return role === 'feed' ? 'feed' : `${role} outlet`;
  return node.kind.replace(/_/g, ' ').toLowerCase();
}
