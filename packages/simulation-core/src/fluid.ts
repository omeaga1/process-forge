import type { ProcessEdge, ProcessGraph, ProcessNode, UnitOpContract } from '@process-forge/protocol';
import type { MachineOperationalState } from './types.js';

/**
 * Liquid in the line: reactors, tanks, pumps and the other process units, and
 * the product a pipe-fed filler draws.
 *
 * The rest of the engine is discrete-event: it moves whole containers. Liquid
 * is continuous, so it is stepped on a fixed tick instead. Each tick has two
 * passes over the fluid network in flow order:
 *
 *   1. backward: how much each unit can take this tick (a tank's free space, a
 *      filling reactor's remaining batch, a pump's rate capped by what is
 *      downstream of it);
 *   2. forward: each unit offers what it can send (a discharging reactor, a
 *      tank's outflow, whatever a pump just received) and the offer is shared
 *      among its outlets without exceeding what each can take.
 *
 * So flow is limited by the slowest thing on the path, a full tank backs up
 * whatever feeds it, and an empty one starves whatever it feeds -- the same
 * backpressure discipline the discrete side has.
 */

export type FluidRole = 'reactor' | 'tank' | 'pass' | 'filler';
export type ReactorPhase = 'FILLING' | 'REACTING' | 'DISCHARGING';

export interface FluidUnit {
  id: string;
  role: FluidRole;
  node: ProcessNode;
  /** Gallons held: a tank's level, a reactor's contents, a filler's bowl, a pump's carry-over. */
  level: number;
  capacity: number;
  /** Gallons per second. */
  inRate: number;
  outRate: number;
  receivedGallons: number;
  deliveredGallons: number;
  /** Gallons that left the line from this unit (it has no fluid outlet). */
  leftLineGallons: number;
  phase?: ReactorPhase;
  phaseEndsAt?: number;
  batches: number;
  /** Per-tick scratch. */
  accept: number;
  inbox: number;
}

const EPS = 1e-6;
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

const PASS_KINDS = new Set(['PUMP', 'HEAT_EXCHANGER', 'SEPARATOR', 'MIXER', 'DISTILLATION_COLUMN', 'SCRUBBER', 'SPRAY_CHAMBER', 'CUSTOM_UNIT_OP']);

/** A pipe carries liquid when the port it leaves from is continuous. */
export function isFluidEdge(edge: ProcessEdge, graph: ProcessGraph): boolean {
  const source = graph.nodes.find((n) => n.id === edge.sourceNodeId);
  const port = source?.outputs.find((p) => p.id === edge.sourcePortId);
  if (port) return String(port.flowDimension).startsWith('CONTINUOUS');
  return (edge.stream as { type?: string } | undefined)?.type === 'CONTINUOUS_FLUID';
}

function hasDiscreteContract(node: ProcessNode): boolean {
  const contract = (node.config as { contract?: UnitOpContract }).contract;
  return contract?.behavior.mode === 'DISCRETE_CYCLE';
}

export class FluidNetwork {
  readonly units = new Map<string, FluidUnit>();
  private readonly edges: ProcessEdge[];
  private readonly order: string[];
  private readonly outEdges = new Map<string, ProcessEdge[]>();
  private readonly inEdges = new Map<string, ProcessEdge[]>();

  constructor(graph: ProcessGraph) {
    this.edges = graph.edges.filter((e) => isFluidEdge(e, graph));
    for (const e of this.edges) {
      (this.outEdges.get(e.sourceNodeId) ?? this.outEdges.set(e.sourceNodeId, []).get(e.sourceNodeId)!).push(e);
      (this.inEdges.get(e.targetNodeId) ?? this.inEdges.set(e.targetNodeId, []).get(e.targetNodeId)!).push(e);
    }
    const touches = (id: string) => this.outEdges.has(id) || this.inEdges.has(id);

    for (const node of graph.nodes) {
      const c = node.config as Record<string, unknown>;
      let role: FluidRole | null = null;
      if (node.kind === 'BATCH_REACTOR') role = 'reactor';
      else if (node.kind === 'SURGE_TANK' && touches(node.id)) role = 'tank';
      else if (node.kind === 'ROTARY_FILLER' && this.inEdges.has(node.id)) role = 'filler';
      else if (PASS_KINDS.has(node.kind) && touches(node.id) && !hasDiscreteContract(node)) role = 'pass';
      if (!role) continue;

      let capacity = Infinity;
      let level = 0;
      if (role === 'tank') {
        capacity = num(c.capacityGallons, 1000);
        level = Math.min(capacity, num(c.initialLevelGallons, 0));
      } else if (role === 'reactor') {
        capacity = Math.max(EPS, num(c.batchVolumeGallons, 800));
      } else if (role === 'filler') {
        // The bowl holds two cycles' worth, so the next cycle can be ready.
        capacity = Math.max(EPS, fillerDemandGallons(node) * 2);
      }
      this.units.set(node.id, {
        id: node.id,
        role,
        node,
        level,
        capacity,
        inRate: 0,
        outRate: 0,
        receivedGallons: 0,
        deliveredGallons: 0,
        leftLineGallons: 0,
        batches: 0,
        accept: 0,
        inbox: 0,
        ...(role === 'reactor' ? { phase: 'FILLING' as const } : {})
      });
    }
    this.order = this.topologicalOrder();
  }

  /** True when there is any liquid to step. */
  get active(): boolean {
    return this.units.size > 0;
  }

  /** A filler fed by a pipe waits for product; one without keeps filling on its own. */
  isPipeFedFiller(nodeId: string): boolean {
    return this.units.get(nodeId)?.role === 'filler';
  }

  /** A node's inbound pipes carry liquid it does not step (e.g. a designed cycle unit). */
  hasFluidInlet(nodeId: string): boolean {
    return this.inEdges.has(nodeId);
  }

  bowl(nodeId: string): number {
    return this.units.get(nodeId)?.level ?? 0;
  }

  draw(nodeId: string, gallons: number): void {
    const u = this.units.get(nodeId);
    if (u) u.level = Math.max(0, u.level - gallons);
  }

  private topologicalOrder(): string[] {
    const ids = [...this.units.keys()];
    const indegree = new Map(ids.map((id) => [id, 0]));
    for (const e of this.edges) {
      if (this.units.has(e.sourceNodeId) && indegree.has(e.targetNodeId)) {
        indegree.set(e.targetNodeId, indegree.get(e.targetNodeId)! + 1);
      }
    }
    const ready = ids.filter((id) => indegree.get(id) === 0);
    const out: string[] = [];
    while (ready.length) {
      const id = ready.shift()!;
      out.push(id);
      for (const e of this.outEdges.get(id) ?? []) {
        if (!indegree.has(e.targetNodeId)) continue;
        const d = indegree.get(e.targetNodeId)! - 1;
        indegree.set(e.targetNodeId, d);
        if (d === 0) ready.push(e.targetNodeId);
      }
    }
    // A recycle loop: step its members in graph order rather than drop them.
    for (const id of ids) if (!out.includes(id)) out.push(id);
    return out;
  }

  /** The fluid targets of a unit's pipes, with the share of its outflow each gets. */
  private outlets(u: FluidUnit): { target: FluidUnit; share: number }[] {
    const edges = (this.outEdges.get(u.id) ?? []).filter((e) => this.units.has(e.targetNodeId));
    if (edges.length === 0) return [];
    if (u.node.kind === 'SEPARATOR' && edges.length >= 2) {
      // The first outlet port is the vapor overhead; the rest share the bottoms.
      const ratio = Math.min(1, Math.max(0, num((u.node.config as Record<string, unknown>).vaporSplitRatio, 0.25)));
      const first = u.node.outputs[0]?.id;
      const top = edges.filter((e) => e.sourcePortId === first);
      const rest = edges.filter((e) => e.sourcePortId !== first);
      if (top.length && rest.length) {
        return [
          ...top.map((e) => ({ target: this.units.get(e.targetNodeId)!, share: ratio / top.length })),
          ...rest.map((e) => ({ target: this.units.get(e.targetNodeId)!, share: (1 - ratio) / rest.length }))
        ];
      }
    }
    return edges.map((e) => ({ target: this.units.get(e.targetNodeId)!, share: 1 / edges.length }));
  }

  /** Gallons per second a pass-through unit can move. */
  private passRate(u: FluidUnit): number {
    const c = u.node.config as Record<string, unknown>;
    const gpm =
      u.node.kind === 'PUMP'
        ? c.designFlowRateGpm
        : u.node.kind === 'HEAT_EXCHANGER'
          ? c.shellSideFlowGpm
          : u.node.kind === 'CUSTOM_UNIT_OP'
            ? c.designThroughput
            : undefined;
    return typeof gpm === 'number' && gpm > 0 ? gpm / 60 : Infinity;
  }

  private reactorRates(u: FluidUnit): { fill: number; discharge: number; reactSeconds: number } {
    const c = u.node.config as Record<string, unknown>;
    const fillMin = Math.max(EPS, num(c.fillDurationMinutes, 15));
    return {
      fill: u.capacity / (fillMin * 60),
      discharge: Math.max(EPS, num(c.dischargeRateGpm, 50)) / 60,
      reactSeconds: num(c.reactionDurationMinutes, 30) * 60
    };
  }

  /** Advances the liquid by `dt` seconds, ending at time `now`. */
  tick(now: number, dt: number): void {
    // Reactor phases that end on the clock, and reactors with no feed pipe,
    // which charge themselves (their raw materials are not modelled).
    for (const u of this.units.values()) {
      u.inbox = 0;
      u.inRate = 0;
      u.outRate = 0;
      if (u.role !== 'reactor') continue;
      if (u.phase === 'REACTING' && now >= (u.phaseEndsAt ?? 0) - EPS) u.phase = 'DISCHARGING';
      if (u.phase === 'FILLING' && !this.inEdges.has(u.id)) {
        const add = Math.min(u.capacity - u.level, this.reactorRates(u).fill * dt);
        u.level += add;
        u.receivedGallons += add;
        u.inRate = add / dt;
      }
    }

    // Backward pass: what each unit can take this tick.
    for (let i = this.order.length - 1; i >= 0; i--) {
      const u = this.units.get(this.order[i]!)!;
      switch (u.role) {
        case 'tank':
          u.accept = Math.max(0, u.capacity - u.level);
          break;
        case 'filler':
          u.accept = Math.max(0, u.capacity - u.level);
          break;
        case 'reactor':
          u.accept =
            u.phase === 'FILLING' && this.inEdges.has(u.id)
              ? Math.max(0, Math.min(u.capacity - u.level, this.reactorRates(u).fill * dt))
              : 0;
          break;
        case 'pass': {
          const outs = this.outlets(u);
          const downstream = outs.length
            ? Math.min(...outs.map((o) => (o.share > 0 ? o.target.accept / o.share : Infinity)))
            : this.outEdges.has(u.id)
              ? 0 // piped into a unit that takes no liquid
              : Infinity; // nothing downstream: it leaves the line
          u.accept = Math.max(0, Math.min(this.passRate(u) * dt, downstream) - u.level);
          break;
        }
      }
    }

    // Forward pass: send what each unit offers, within what each target takes.
    const remaining = new Map([...this.units.values()].map((u) => [u.id, u.accept]));
    for (const id of this.order) {
      const u = this.units.get(id)!;
      let offer = 0;
      if (u.role === 'reactor' && u.phase === 'DISCHARGING') offer = Math.min(u.level, this.reactorRates(u).discharge * dt);
      else if (u.role === 'tank' && this.outEdges.has(u.id)) {
        const max = num((u.node.config as Record<string, unknown>).maxDischargeRateGpm, 0);
        offer = Math.min(u.level, max > 0 ? (max / 60) * dt : Infinity);
      } else if (u.role === 'pass') offer = u.level + u.inbox;
      if (offer <= EPS) {
        if (u.role === 'pass') u.level = offer;
        continue;
      }

      const outs = this.outlets(u);
      let sent = 0;
      if (outs.length === 0) {
        // No fluid outlet. A reactor or pump at the end of a line sends its
        // product out of the line; one piped into a unit that takes no liquid
        // cannot send anything.
        if (!this.outEdges.has(u.id)) {
          sent = offer;
          u.leftLineGallons += sent;
        }
      } else {
        // Largest total that respects every outlet's share and room.
        const total = Math.min(offer, ...outs.map((o) => (o.share > 0 ? remaining.get(o.target.id)! / o.share : Infinity)));
        for (const o of outs) {
          const x = total * o.share;
          if (x <= 0) continue;
          remaining.set(o.target.id, remaining.get(o.target.id)! - x);
          o.target.receivedGallons += x;
          o.target.inRate += x / dt;
          if (o.target.role === 'pass') o.target.inbox += x;
          else o.target.level += x;
        }
        sent = total;
      }

      u.deliveredGallons += sent;
      u.outRate = sent / dt;
      if (u.role === 'pass') u.level = Math.max(0, offer - sent);
      else u.level = Math.max(0, u.level - sent);
    }

    // Reactor phase changes that follow from contents.
    for (const u of this.units.values()) {
      if (u.role !== 'reactor') continue;
      if (u.phase === 'FILLING' && u.level >= u.capacity - EPS) {
        u.level = u.capacity;
        u.phase = 'REACTING';
        u.phaseEndsAt = now + this.reactorRates(u).reactSeconds;
      } else if (u.phase === 'DISCHARGING' && u.level <= EPS) {
        u.level = 0;
        u.phase = 'FILLING';
        u.batches++;
      }
    }
  }

  /** The operating state a unit's liquid implies. Fillers are the engine's to set. */
  stateOf(u: FluidUnit): MachineOperationalState {
    switch (u.role) {
      case 'reactor':
        if (u.phase === 'REACTING') return 'BUSY';
        if (u.phase === 'DISCHARGING') return u.outRate > EPS ? 'BUSY' : 'BLOCKED';
        return u.inRate > EPS ? 'BUSY' : 'STARVED';
      case 'tank':
        if (!this.outEdges.has(u.id)) return u.inRate > EPS ? 'BUSY' : 'IDLE';
        if (u.outRate > EPS) return 'BUSY';
        return u.level <= EPS ? 'STARVED' : 'BLOCKED';
      case 'pass':
        if (u.outRate > EPS) return 'BUSY';
        return u.level > EPS ? 'BLOCKED' : 'STARVED';
      default:
        return 'IDLE';
    }
  }
}

/** Gallons one filler cycle takes: every nozzle fills one container. */
export function fillerDemandGallons(node: ProcessNode): number {
  const c = node.config as Record<string, unknown>;
  return num(c.nozzleCount, 10) * num(c.containerVolumeGallons, 1);
}
