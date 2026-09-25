import {
  AMBIENT_C,
  LITERS_PER_GALLON,
  evaluateUnitOp,
  fluidOf,
  fluidProperties,
  heatKj,
  jacketDutyKw,
  pipeTemperature,
  reactionTemperature,
  terminalRole,
  terminalSupplyRate,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type UnitOpContract,
  type EvaluatedBatchPhase
} from '@process-forge/protocol';
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
 *
 * Feeds and outlets (TERMINAL nodes) are the network's edges: a feed offers
 * up to its supply rate (or, with none set, whatever its pipes take), and an
 * outlet takes everything it is sent.
 *
 * Temperature travels with the liquid. What a unit holds is mixed by volume
 * with what arrives. A heat exchanger with a target temperature moves the
 * liquid passing through it toward the target, but never by more than its duty
 * allows. A reactor with a jacket duty brings each full batch to its reaction
 * temperature before the reaction clock starts.
 */

export type FluidRole = 'reactor' | 'tank' | 'pass' | 'filler' | 'feed' | 'sink' | 'batch';
export type ReactorPhase = 'FILLING' | 'HEATING' | 'REACTING' | 'DISCHARGING';

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
  /** A heating batch: when it started, and from what temperature. */
  heatStartsAt?: number;
  heatFrom?: number;
  batches: number;
  /** °C of what the unit holds; for a pass-through unit, of what it last sent. */
  tempC: number;
  heat: HeatTally;
  /** Per-tick scratch. */
  accept: number;
  inbox: number;
  /** Gallon-degrees arriving this tick, so the inbox can be mixed. */
  inboxHeat: number;
  /** Gallons a designed unit's outlet shares did not account for: steam off a vent, water off a dryer. */
  lostGallons: number;
  /** A designed unit: its contract, and what it last evaluated to at live inlet conditions. */
  contract?: UnitOpContract;
  live?: LiveContract;
  /** Seconds each constraint was broken during the run, and evaluation failures. */
  contractRun?: ContractRunTally;
  /** A designed BATCH unit: the phase it is in, as evaluated when it started. */
  batchRun?: BatchRun;
}

export interface BatchRun {
  index: number;
  phase: EvaluatedBatchPhase;
  /** Gallons this phase has moved, and how many it is to move. */
  moved: number;
  target: number;
  startedAt: number;
  endsAt?: number;
  startTempC: number;
  /** Constraints broken at this phase's start, timed while it runs. */
  broken: { id: string; message: string; severity: 'ERROR' | 'WARNING' }[];
  /** Seconds spent in each phase, by name, over the run. */
  secondsByPhase: Record<string, number>;
}

export interface LiveContract {
  capacityGpm?: number;
  dutyKw?: number;
  outlets: Record<string, { share?: number; temperatureC?: number }>;
  /** A cycle unit: gallons each cycle draws. */
  liquidPerCycleGallons?: number;
}

export interface ContractRunTally {
  evaluations: number;
  broken: Record<string, { message: string; severity: 'ERROR' | 'WARNING'; seconds: number }>;
  /** The first live evaluation that failed, and for how long evaluation failed. */
  firstError?: string;
  errorSeconds: number;
}

interface Outlet {
  target: FluidUnit;
  share: number;
  temp?: number;
}

export interface HeatTally {
  /** Heat moved, kWh (heating and cooling both count). */
  energyKwh: number;
  /** Seconds a heat exchanger had flow to condition. */
  activeSeconds: number;
  /** Seconds its duty was too small to reach the target. */
  limitedSeconds: number;
  /** Seconds a reactor spent bringing batches to reaction temperature. */
  heatingSeconds: number;
  /** For the average outlet temperature. */
  sentGallons: number;
  sentGallonDegrees: number;
}

const EPS = 1e-6;
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const finite = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);


const PASS_KINDS = new Set(['PUMP', 'HEAT_EXCHANGER', 'SEPARATOR', 'MIXER', 'DISTILLATION_COLUMN', 'SCRUBBER', 'SPRAY_CHAMBER', 'CUSTOM_UNIT_OP']);

/** A pipe carries liquid when the port it leaves from is continuous. */
export function isFluidEdge(edge: ProcessEdge, graph: ProcessGraph): boolean {
  const source = graph.nodes.find((n) => n.id === edge.sourceNodeId);
  const port = source?.outputs.find((p) => p.id === edge.sourcePortId);
  if (port) return String(port.flowDimension).startsWith('CONTINUOUS');
  return (edge.stream as { type?: string } | undefined)?.type === 'CONTINUOUS_FLUID';
}

function contractOf(node: ProcessNode): UnitOpContract | undefined {
  return (node.config as { contract?: UnitOpContract }).contract;
}

function hasBatchContract(node: ProcessNode): boolean {
  return contractOf(node)?.behavior.mode === 'BATCH';
}

function hasDiscreteContract(node: ProcessNode): boolean {
  return contractOf(node)?.behavior.mode === 'DISCRETE_CYCLE';
}

/** A designed cycle unit that draws liquid each cycle. */
function drawsLiquid(node: ProcessNode): boolean {
  const b = contractOf(node)?.behavior;
  return b?.mode === 'DISCRETE_CYCLE' && Boolean(b.liquidPerCycleGallons);
}

/** What a contract evaluates to, in the terms the liquid step uses. */
function liveOf(ev: ReturnType<typeof evaluateUnitOp>): LiveContract {
  const b = ev.behavior;
  const live: LiveContract = { outlets: ev.outlets ?? {} };
  if (b.mode === 'CONTINUOUS_RATE') {
    if (b.capacityGpm !== undefined) live.capacityGpm = b.capacityGpm;
    if (b.dutyKw !== undefined) live.dutyKw = b.dutyKw;
  } else if (b.mode === 'DISCRETE_CYCLE' && b.liquidPerCycleGallons !== undefined) {
    live.liquidPerCycleGallons = b.liquidPerCycleGallons;
  }
  return live;
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
      if (node.kind === 'TERMINAL') {
        const t = terminalRole(node);
        if (t === 'feed' && this.outEdges.has(node.id)) role = 'feed';
        else if (t !== 'feed' && this.inEdges.has(node.id)) role = 'sink';
      } else if (node.kind === 'BATCH_REACTOR') role = 'reactor';
      // A designed batch vessel runs its phases whether or not it is piped.
      else if (hasBatchContract(node)) role = 'batch';
      else if (node.kind === 'SURGE_TANK' && touches(node.id)) role = 'tank';
      else if (node.kind === 'ROTARY_FILLER' && this.inEdges.has(node.id)) role = 'filler';
      // A designed cycle unit fed by a pipe draws its liquid each cycle, as a filler does.
      else if (drawsLiquid(node) && this.inEdges.has(node.id)) role = 'filler';
      else if (PASS_KINDS.has(node.kind) && touches(node.id) && !hasDiscreteContract(node)) role = 'pass';
      if (!role) continue;

      const contract = contractOf(node);
      const designEval = contract ? evaluateUnitOp(contract) : undefined;
      const live = designEval && !designEval.error ? liveOf(designEval) : undefined;

      let capacity = Infinity;
      let level = 0;
      if (role === 'tank') {
        capacity = num(c.capacityGallons, 1000);
        level = Math.min(capacity, num(c.initialLevelGallons, 0));
      } else if (role === 'reactor') {
        capacity = Math.max(EPS, num(c.batchVolumeGallons, 800));
      } else if (role === 'batch') {
        const b = designEval?.behavior;
        capacity = Math.max(EPS, b?.mode === 'BATCH' ? b.batchGallons : 0);
      } else if (role === 'filler') {
        // The bowl holds two cycles' worth, so the next cycle can be ready.
        capacity = Math.max(EPS, (live?.liquidPerCycleGallons ?? fillerDemandGallons(node)) * 2);
      }
      const tempC =
        role === 'feed'
          ? pipeTemperature(this.outEdges.get(node.id)) ?? AMBIENT_C
          : role === 'tank'
            ? finite(fluidOf(c)?.temperatureCelsius) ?? pipeTemperature(this.inEdges.get(node.id)) ?? AMBIENT_C
            : role === 'reactor'
              ? AMBIENT_C
              : pipeTemperature(this.inEdges.get(node.id)) ?? AMBIENT_C;
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
        tempC,
        heat: { energyKwh: 0, activeSeconds: 0, limitedSeconds: 0, heatingSeconds: 0, sentGallons: 0, sentGallonDegrees: 0 },
        accept: 0,
        inbox: 0,
        inboxHeat: 0,
        lostGallons: 0,
        ...(contract ? { contract, contractRun: { evaluations: 0, broken: {}, errorSeconds: 0 } } : {}),
        ...(live ? { live } : {}),
        ...(role === 'reactor' ? { phase: 'FILLING' as const } : {})
      });
    }
    this.order = this.topologicalOrder();
    for (const u of this.units.values()) if (u.role === 'batch') this.startPhase(u, 0, 0);
  }

  /**
   * Starts a designed batch unit's phase: evaluates the contract at the batch
   * as it is now (batch.gallons, batch.temperatureC, ...), so the phase's
   * amounts and times follow from the physics of this batch.
   */
  private startPhase(u: FluidUnit, index: number, now: number): void {
    const { density } = this.properties(u);
    const ev = evaluateUnitOp(u.contract!, {
      batch: { gallons: u.level, temperatureC: u.tempC, massKg: u.level * LITERS_PER_GALLON * density, number: u.batches + 1 }
    });
    const run = u.contractRun!;
    run.evaluations++;
    const declared = (u.contract!.behavior as { phases: { name: string; kind: EvaluatedBatchPhase['kind'] }[] }).phases[index]!;
    let phase: EvaluatedBatchPhase = { name: declared.name, kind: declared.kind };
    if (ev.error) {
      if (!run.firstError) run.firstError = `${ev.error.path}: ${ev.error.message}`;
      // The phase is skipped (nothing to move, no time); the next one is tried.
      phase = { ...phase, ...(declared.kind === 'HOLD' ? { seconds: 0 } : { gallons: 0 }) };
    } else if (ev.behavior.mode === 'BATCH') {
      phase = ev.behavior.phases[index] ?? phase;
    }
    const target =
      phase.kind === 'FILL' ? phase.gallons ?? Math.max(0, u.capacity - u.level) : phase.kind === 'DRAIN' ? phase.gallons ?? u.level : 0;
    u.batchRun = {
      index,
      phase,
      moved: 0,
      target,
      startedAt: now,
      ...(phase.kind === 'HOLD' ? { endsAt: now + (phase.seconds ?? 0) } : {}),
      startTempC: u.tempC,
      broken: ev.error ? [] : ev.constraints.filter((c) => !c.satisfied).map((c) => ({ id: c.id, message: c.message, severity: c.severity })),
      secondsByPhase: u.batchRun?.secondsByPhase ?? {}
    };
  }

  /** The next phase, or the first again once a batch is done. */
  private nextPhase(u: FluidUnit, now: number): void {
    const phases = (u.contract!.behavior as { phases: unknown[] }).phases;
    let next = u.batchRun!.index + 1;
    if (next >= phases.length) {
      next = 0;
      u.batches++;
    }
    this.startPhase(u, next, now);
  }

  /** A designed batch unit's phase, as far as this tick goes: time, heat, self-charging. */
  private stepBatch(u: FluidUnit, now: number, dt: number): void {
    const run = u.batchRun!;
    run.secondsByPhase[run.phase.name] = (run.secondsByPhase[run.phase.name] ?? 0) + dt;
    for (const b of run.broken) {
      const t = u.contractRun!.broken[b.id] ?? (u.contractRun!.broken[b.id] = { message: b.message, severity: b.severity, seconds: 0 });
      t.seconds += dt;
    }
    const ph = run.phase;
    if (ph.kind === 'HOLD') {
      const end = run.endsAt ?? now;
      const spent = Math.max(0, Math.min(dt, end - (now - dt)));
      if (ph.dutyKw !== undefined) {
        u.heat.energyKwh += (ph.dutyKw * spent) / 3600;
        u.heat.activeSeconds += spent;
      }
      if (ph.temperatureC !== undefined) {
        const span = Math.max(EPS, end - run.startedAt);
        const f = Math.min(1, (now - run.startedAt) / span);
        u.tempC = run.startTempC + (ph.temperatureC - run.startTempC) * f;
      }
      if (now >= end - EPS) {
        if (ph.temperatureC !== undefined) u.tempC = ph.temperatureC;
        this.nextPhase(u, now);
      }
      return;
    }
    if (ph.kind === 'FILL' && !this.inEdges.has(u.id)) {
      // No feed pipe: it charges itself (its raw materials are not modelled).
      const design = u.contract!.designInlet;
      const rate = (ph.rateGpm ?? design?.volumetricFlowGpm ?? 50) / 60;
      const add = Math.max(0, Math.min(u.capacity - u.level, run.target - run.moved, rate * dt));
      this.receive(u, add, design?.temperatureC ?? AMBIENT_C);
      u.receivedGallons += add;
      u.inRate = add / dt;
      run.moved += add;
    }
  }

  /** A batch unit's outlets while it drains: one port if the phase names it, else every outlet. */
  private batchOutlets(u: FluidUnit): { outs: Outlet[]; unpiped: boolean } {
    const port = u.batchRun?.phase.port;
    if (!port) return { outs: this.outlets(u), unpiped: false };
    const edges = (this.outEdges.get(u.id) ?? []).filter((e) => e.sourcePortId === port && this.units.has(e.targetNodeId));
    return { outs: edges.map((e) => ({ target: this.units.get(e.targetNodeId)!, share: 1 / edges.length })), unpiped: edges.length === 0 };
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

  /** Gallons one cycle of a pipe-fed unit draws: a filler's nozzles, or a designed unit's liquidPerCycleGallons. */
  drawPerCycle(nodeId: string): number {
    const u = this.units.get(nodeId);
    if (!u) return 0;
    return u.live?.liquidPerCycleGallons ?? fillerDemandGallons(u.node);
  }

  bowl(nodeId: string): number {
    return this.units.get(nodeId)?.level ?? 0;
  }

  draw(nodeId: string, gallons: number): void {
    const u = this.units.get(nodeId);
    if (u) u.level = Math.max(0, u.level - gallons);
  }

  /** Density and specific heat of what a unit handles: its own fluid, else its pipes'. */
  private properties(u: FluidUnit): { density: number; cp: number } {
    return fluidProperties(u.node, [...(this.inEdges.get(u.id) ?? []), ...(this.outEdges.get(u.id) ?? [])]);
  }

  /**
   * A pass-through unit mixes this tick's arrivals into what it carries over.
   * A heat exchanger with a target conditions the arrivals first, within its
   * duty: Q = m x cp x (T_in - T_target), capped at the rated duty.
   */
  private condition(u: FluidUnit, dt: number): void {
    if (u.inbox <= EPS) return;
    const tin = u.inboxHeat / u.inbox;
    let tout = tin;
    const c = u.node.config as Record<string, unknown>;
    const target = finite(c.targetTemperatureCelsius);
    if (u.node.kind === 'HEAT_EXCHANGER' && target !== undefined) {
      const { density, cp } = this.properties(u);
      const kgPerSecond = (u.inbox / dt) * LITERS_PER_GALLON * density;
      const needKw = kgPerSecond * cp * (tin - target); // positive: cooling
      const rated = finite(c.dutyKw);
      const duty = rated !== undefined && rated >= 0 ? rated : Infinity;
      const used = Math.min(Math.abs(needKw), duty);
      tout = tin - (Math.sign(needKw) * used) / (kgPerSecond * cp);
      u.heat.energyKwh += (used * dt) / 3600;
      u.heat.activeSeconds += dt;
      if (Math.abs(needKw) > duty * (1 + 1e-9) + 1e-9) u.heat.limitedSeconds += dt;
    }
    if (u.contract?.behavior.mode === 'CONTINUOUS_RATE') this.evaluateLive(u, tin, dt);
    u.tempC = (u.level * u.tempC + u.inbox * tout) / (u.level + u.inbox);
  }

  /**
   * A designed continuous unit, evaluated at what is flowing in this tick:
   * its capacity, duty and outlet shares and temperatures follow the live
   * stream, and every constraint it breaks is timed. A failed evaluation
   * keeps the last good one and is reported.
   */
  private evaluateLive(u: FluidUnit, tinC: number, dt: number): void {
    const { density, cp } = this.properties(u);
    const run = u.contractRun!;
    const ev = evaluateUnitOp(u.contract!, {
      inlet: {
        temperatureC: tinC,
        volumetricFlowGpm: (u.inbox / dt) * 60,
        massFlowKgPerS: (u.inbox / dt) * LITERS_PER_GALLON * density,
        densityGPerCm3: density,
        specificHeatKjPerKgK: cp
      }
    });
    run.evaluations++;
    if (ev.error) {
      run.errorSeconds += dt;
      if (!run.firstError) run.firstError = `${ev.error.path}: ${ev.error.message}`;
      return;
    }
    for (const c of ev.constraints) {
      if (c.satisfied) continue;
      const t = run.broken[c.id] ?? (run.broken[c.id] = { message: c.message, severity: c.severity, seconds: 0 });
      t.seconds += dt;
    }
    u.live = liveOf(ev);
    const duty = u.live.dutyKw;
    if (duty !== undefined) {
      u.heat.energyKwh += (Math.abs(duty) * dt) / 3600;
      u.heat.activeSeconds += dt;
    }
  }

  /** Adds `gallons` at `tempC` to a unit, mixed with what it already holds. */
  private receive(target: FluidUnit, gallons: number, tempC: number): void {
    if (target.role === 'pass') {
      target.inbox += gallons;
      target.inboxHeat += gallons * tempC;
      return;
    }
    const total = target.level + gallons;
    if (total > EPS) target.tempC = (target.level * target.tempC + gallons * tempC) / total;
    target.level = total;
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
  private outlets(u: FluidUnit): Outlet[] {
    const edges = (this.outEdges.get(u.id) ?? []).filter((e) => this.units.has(e.targetNodeId));
    if (edges.length === 0) return [];
    if (this.hasOutletPlan(u)) return this.contractOutlets(u, edges).outs;
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

  private hasOutletPlan(u: FluidUnit): boolean {
    return Boolean(u.live && Object.keys(u.live.outlets).length);
  }

  /**
   * A designed unit's outflow, by its declared outlet shares. Outlets with no
   * share split what the declared ones leave; a declared outlet with no pipe
   * sends its share out of the line; whatever no outlet takes is lost (vented,
   * evaporated).
   */
  private contractOutlets(u: FluidUnit, edges: ProcessEdge[]): { outs: Outlet[]; unpipedShare: number; lossShare: number } {
    const plan = u.live!.outlets;
    const piped = new Map<string, ProcessEdge[]>();
    for (const e of edges) {
      const list = piped.get(e.sourcePortId) ?? [];
      list.push(e);
      piped.set(e.sourcePortId, list);
    }
    const declared = Object.values(plan).reduce((sum, o) => sum + (o.share ?? 0), 0);
    const open = [...piped.keys()].filter((port) => plan[port]?.share === undefined);
    const rest = Math.max(0, 1 - declared);
    const outs: Outlet[] = [];
    let pipedShare = 0;
    for (const [port, list] of piped) {
      const share = plan[port]?.share ?? (open.length ? rest / open.length : 0);
      pipedShare += share;
      const temp = plan[port]?.temperatureC;
      for (const e of list) {
        outs.push({ target: this.units.get(e.targetNodeId)!, share: share / list.length, ...(temp !== undefined ? { temp } : {}) });
      }
    }
    const unpipedShare = Object.entries(plan)
      .filter(([port]) => !piped.has(port))
      .reduce((sum, [, o]) => sum + (o.share ?? 0), 0);
    return { outs, unpipedShare, lossShare: Math.max(0, 1 - pipedShare - unpipedShare) };
  }

  /** The design flow of a unit's outlet pipes, gal/min (45 each by default). */
  private pipeDesignGpm(u: FluidUnit): number {
    return (this.outEdges.get(u.id) ?? []).reduce((sum, e) => {
      const gpm = (e.stream as { designFlowRateGpm?: unknown }).designFlowRateGpm;
      return sum + (typeof gpm === 'number' && gpm > 0 ? gpm : 45);
    }, 0);
  }

  /** Gallons per second a pass-through unit can move. */
  private passRate(u: FluidUnit): number {
    const c = u.node.config as Record<string, unknown>;
    if (u.contract?.behavior.mode === 'CONTINUOUS_RATE') {
      const cap = u.live?.capacityGpm;
      return cap === undefined ? Infinity : Math.max(0, cap) / 60;
    }
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
      u.inboxHeat = 0;
      u.inRate = 0;
      u.outRate = 0;
      if (u.role === 'batch') {
        this.stepBatch(u, now, dt);
        continue;
      }
      if (u.role !== 'reactor') continue;
      if (u.phase === 'HEATING') this.heatBatch(u, now, dt);
      if (u.phase === 'REACTING' && now >= (u.phaseEndsAt ?? 0) - EPS) u.phase = 'DISCHARGING';
      if (u.phase === 'FILLING' && !this.inEdges.has(u.id)) {
        const add = Math.min(u.capacity - u.level, this.reactorRates(u).fill * dt);
        this.receive(u, add, AMBIENT_C);
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
        case 'sink':
          u.accept = Infinity;
          break;
        case 'feed':
          u.accept = 0;
          break;
        case 'reactor':
          u.accept =
            u.phase === 'FILLING' && this.inEdges.has(u.id)
              ? Math.max(0, Math.min(u.capacity - u.level, this.reactorRates(u).fill * dt))
              : 0;
          break;
        case 'batch': {
          const run = u.batchRun!;
          const rate = run.phase.rateGpm !== undefined ? (run.phase.rateGpm / 60) * dt : Infinity;
          u.accept =
            run.phase.kind === 'FILL' && this.inEdges.has(u.id)
              ? Math.max(0, Math.min(u.capacity - u.level, run.target - run.moved, rate))
              : 0;
          break;
        }
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
      else if (u.role === 'batch' && u.batchRun!.phase.kind === 'DRAIN') {
        const run = u.batchRun!;
        // With no rate set, it drains as fast as its outlet pipes' design flow.
        const gpm = run.phase.rateGpm ?? (this.outEdges.has(u.id) ? this.pipeDesignGpm(u) : Infinity);
        const rate = Number.isFinite(gpm) ? (gpm / 60) * dt : Infinity;
        offer = Math.max(0, Math.min(u.level, run.target - run.moved, rate));
      }
      else if (u.role === 'tank' && this.outEdges.has(u.id)) {
        const max = num((u.node.config as Record<string, unknown>).maxDischargeRateGpm, 0);
        offer = Math.min(u.level, max > 0 ? (max / 60) * dt : Infinity);
      } else if (u.role === 'pass') {
        this.condition(u, dt);
        offer = u.level + u.inbox;
      }
      else if (u.role === 'feed') {
        const rate = terminalSupplyRate(u.node);
        offer = rate > 0 ? (rate / 60) * dt : Infinity;
      }
      if (offer <= EPS) {
        if (u.role === 'pass') u.level = offer;
        continue;
      }

      const drainTo = u.role === 'batch' ? this.batchOutlets(u) : undefined;
      const outs = drainTo ? drainTo.outs : this.outlets(u);
      let sent = 0;
      if (outs.length === 0) {
        // No fluid outlet. A reactor or pump at the end of a line sends its
        // product out of the line; one piped into a unit that takes no liquid
        // cannot send anything. A batch draining to an unpiped port empties
        // out of the line.
        if (!this.outEdges.has(u.id) || drainTo?.unpiped) {
          sent = offer;
          u.leftLineGallons += sent;
        }
      } else {
        // Largest total that respects every outlet's share and room.
        let total = Math.min(offer, ...outs.map((o) => (o.share > 0 ? remaining.get(o.target.id)! / o.share : Infinity)));
        // A feed with no supply rate into units with no limit of their own
        // (an unrated mixer, an outlet): the pipes' design flow is the limit.
        if (!Number.isFinite(total)) total = this.pipeDesignGpm(u) / 60 * dt;
        let degrees = 0;
        let piped = 0;
        for (const o of outs) {
          const x = total * o.share;
          if (x <= 0) continue;
          remaining.set(o.target.id, remaining.get(o.target.id)! - x);
          o.target.receivedGallons += x;
          o.target.inRate += x / dt;
          const t = o.temp ?? u.tempC;
          this.receive(o.target, x, t);
          if (o.target.role === 'batch') o.target.batchRun!.moved += x;
          degrees += x * t;
          piped += x;
        }
        sent = total;
        if (this.hasOutletPlan(u) && !u.batchRun?.phase.port) {
          // A designed unit's unclaimed remainder is lost; a declared outlet with no pipe leaves the line.
          const split = this.contractOutlets(u, (this.outEdges.get(u.id) ?? []).filter((e) => this.units.has(e.targetNodeId)));
          u.leftLineGallons += total * split.unpipedShare;
          u.lostGallons += total * split.lossShare;
        }
        u.heat.sentGallons += piped;
        u.heat.sentGallonDegrees += degrees;
      }
      if (outs.length === 0) {
        u.heat.sentGallons += sent;
        u.heat.sentGallonDegrees += sent * u.tempC;
      }
      u.deliveredGallons += sent;
      u.outRate = sent / dt;
      if (u.role === 'batch') u.batchRun!.moved += sent;
      if (u.role === 'pass') u.level = Math.max(0, offer - sent);
      else u.level = Math.max(0, u.level - sent);
    }

    // Reactor and batch phase changes that follow from contents.
    for (const u of this.units.values()) {
      if (u.role === 'batch') {
        const run = u.batchRun!;
        const done =
          run.phase.kind === 'FILL'
            ? run.moved >= run.target - EPS || u.level >= u.capacity - EPS
            : run.phase.kind === 'DRAIN'
              ? run.moved >= run.target - EPS || u.level <= EPS
              : false;
        if (done) this.nextPhase(u, now);
        continue;
      }
      if (u.role !== 'reactor') continue;
      if (u.phase === 'FILLING' && u.level >= u.capacity - EPS) {
        u.level = u.capacity;
        this.startBatch(u, now);
      } else if (u.phase === 'DISCHARGING' && u.level <= EPS) {
        u.level = 0;
        u.phase = 'FILLING';
        u.batches++;
      }
    }
  }

  /**
   * A full reactor. With a jacket duty it first brings the batch to reaction
   * temperature, which takes mass x cp x dT / duty; without one it is there at
   * once. Either way the heat it took is counted.
   */
  private startBatch(u: FluidUnit, now: number): void {
    const react = reactionTemperature(u.node);
    const jacket = jacketDutyKw(u.node);
    if (react !== undefined && jacket !== undefined && Math.abs(react - u.tempC) > 0.05) {
      u.phase = 'HEATING';
      u.heatFrom = u.tempC;
      u.heatStartsAt = now;
      u.phaseEndsAt = now + heatKj(u.level, react - u.tempC, this.properties(u)) / jacket;
      return;
    }
    if (react !== undefined) {
      u.heat.energyKwh += heatKj(u.level, react - u.tempC, this.properties(u)) / 3600;
      u.tempC = react;
    }
    u.phase = 'REACTING';
    u.phaseEndsAt = now + this.reactorRates(u).reactSeconds;
  }

  /** One tick of a batch coming up to temperature at the jacket's full duty. */
  private heatBatch(u: FluidUnit, now: number, dt: number): void {
    const react = reactionTemperature(u.node) ?? u.tempC;
    const start = u.heatStartsAt ?? now;
    const end = u.phaseEndsAt ?? now;
    const from = u.heatFrom ?? u.tempC;
    // Only the part of this tick spent heating counts.
    const spent = Math.max(0, Math.min(dt, end - (now - dt)));
    u.heat.heatingSeconds += spent;
    u.heat.energyKwh += ((jacketDutyKw(u.node) ?? 0) * spent) / 3600;
    if (now >= end - EPS) {
      u.tempC = react;
      u.phase = 'REACTING';
      u.phaseEndsAt = end + this.reactorRates(u).reactSeconds;
    } else {
      u.tempC = from + ((react - from) * (now - start)) / Math.max(EPS, end - start);
    }
  }

  /** The operating state a unit's liquid implies. Fillers are the engine's to set. */
  stateOf(u: FluidUnit): MachineOperationalState {
    switch (u.role) {
      case 'batch': {
        const kind = u.batchRun!.phase.kind;
        if (kind === 'HOLD') return 'BUSY';
        if (kind === 'DRAIN') return u.outRate > EPS ? 'BUSY' : 'BLOCKED';
        return u.inRate > EPS ? 'BUSY' : 'STARVED';
      }
      case 'reactor':
        if (u.phase === 'REACTING' || u.phase === 'HEATING') return 'BUSY';
        if (u.phase === 'DISCHARGING') return u.outRate > EPS ? 'BUSY' : 'BLOCKED';
        return u.inRate > EPS ? 'BUSY' : 'STARVED';
      case 'tank':
        if (!this.outEdges.has(u.id)) return u.inRate > EPS ? 'BUSY' : 'IDLE';
        if (u.outRate > EPS) return 'BUSY';
        return u.level <= EPS ? 'STARVED' : 'BLOCKED';
      case 'pass':
        if (u.outRate > EPS) return 'BUSY';
        return u.level > EPS ? 'BLOCKED' : 'STARVED';
      case 'feed':
        return u.outRate > EPS ? 'BUSY' : 'IDLE';
      case 'sink':
        return u.inRate > EPS ? 'BUSY' : 'IDLE';
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
