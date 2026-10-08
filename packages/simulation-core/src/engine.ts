import type { ProcessGraph, ProcessNode, UnitOpContract, UnitOpEvaluation } from '@process-forge/protocol';
import {
  blockingViolations,
  componentPhaseAt,
  COMPONENT_MOLAR_MASS,
  effectiveContract,
  idealGasDensity,
  isPhaseAware,
  portPhase,
  M3_PER_FT3,
  SCFM_STD_C,
  evaluateUnitOp,
  terminalCarries,
  terminalMaterial,
  terminalPhase,
  terminalRole,
  terminalSupplyRate,
  type TerminalRole
} from '@process-forge/protocol';
import type { PortStreamReport } from './types.js';
import { PriorityQueue } from './priority-queue.js';
import { M3_PER_GALLON, MaterialNetwork, gallonsOf, type MaterialUnit, type Parcel } from './material.js';
import { isCycleSource, isFluidEdge } from './roles.js';
import { createRng, seedFromString, type SeededRng } from './rng.js';
import type {
  DesignedUnitReport,
  HeatReport,
  MachineOeeReport,
  MachineOperationalState,
  NodeTelemetrySnapshot,
  SimEvent,
  SimulationResult,
  TerminalReport
} from './types.js';

/**
 * The line simulation.
 *
 * Every unit runs on a contract (see protocol/unitop/standardKinds.ts for the
 * built-in kinds); there is no handler per kind of equipment. Feeds and
 * outlets are the line's boundary. Items move as discrete events: a cycle
 * takes what it needs when it starts and hands on what it made when it ends,
 * holding it (BLOCKED) when there is no room downstream. Liquid is stepped
 * each second by the material network (material.ts) inside the same event
 * loop, so a filler waiting on a reactor and a reactor backed up by a full
 * tank are the same backpressure.
 */

interface UnitRuntime {
  node: ProcessNode;
  /** Feeds and outlets. */
  terminal: TerminalRole | null;
  contract?: UnitOpContract;
  /** The contract at its design point, evaluated before the clock starts. */
  ev?: UnitOpEvaluation;
  state: MachineOperationalState;
  stateStartTime: number;
  busyTime: number;
  blockedTime: number;
  starvedTime: number;
  downTime: number;
  unitsProduced: number;
  unitsScrapped: number;
  /** Items waiting to be processed (an outlet: items received this instant). */
  queue: number;
  maxQueue: number;
  /** A unit that takes a kit (inputs[]): its queue per item inlet port. `queue` stays the total. */
  portQueue?: Map<string, number>;
  /** Items the cycle in progress took. */
  inProcess: number;
  /** Finished items that could not leave yet. */
  held: number;
  /** A unit with outputs[]: finished items per outlet port that could not leave yet. */
  heldByPort?: Map<string, number>;
  failure?: { mtbfSeconds: number; mttrSeconds: number };
  beforeFailure?: MachineOperationalState;
  interrupted?: { type: SimEvent['type']; remainingSeconds: number };
  /** The one cycle event this unit has queued, so a breakdown can pause it. */
  pending?: { id: string; type: SimEvent['type']; timeSeconds: number };
}

type CycleBehavior = Extract<UnitOpEvaluation['behavior'], { mode: 'DISCRETE_CYCLE' }>;

const round1 = (x: number) => Math.round(x * 10) / 10;
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Mass fractions rounded for a report, largest first; undefined when there are none. */
function fractions(comp: Record<string, number>): Record<string, number> | undefined {
  const entries = Object.entries(comp)
    .filter(([, v]) => v > 1e-6)
    .sort((a, b) => b[1] - a[1]);
  return entries.length ? Object.fromEntries(entries.map(([k, v]) => [k, round4(v)])) : undefined;
}

/** kg of each component in a parcel. */
function componentKg(p: Parcel): Record<string, number> | undefined {
  const entries = Object.entries(p.comp).filter(([, v]) => v > 1e-9);
  if (!entries.length || p.kg <= 0) return undefined;
  return Object.fromEntries(entries.map(([k, v]) => [k, round1(v * p.kg)]));
}

/** A port's parcel split into its own phase (with that part's mean molar mass) and what it carries dispersed. */
function phaseSplit(port: UnitOpContract['ports'][number], p: Parcel, phase: string): { ownKg: number; molarMass: number; dispersedKg: Record<string, number> } {
  const dispersedKg: Record<string, number> = {};
  let ownFraction = 0;
  let kmolPerKg = 0;
  for (const [c, f] of Object.entries(p.comp)) {
    if (f <= 0) continue;
    if (componentPhaseAt(port, c) !== phase) dispersedKg[c] = f * p.kg;
    else {
      ownFraction += f;
      kmolPerKg += f / (COMPONENT_MOLAR_MASS[c.toLowerCase()] ?? 28.96);
    }
  }
  if (Object.keys(p.comp).length === 0) {
    ownFraction = 1;
    kmolPerKg = 1 / 28.96;
  }
  return { ownKg: ownFraction * p.kg, molarMass: ownFraction > 0 ? ownFraction / kmolPerKg : 28.96, dispersedKg };
}

/** ACFM (at T, 1 atm) and SCFM (68 °F, 1 atm) of a gas mass flow. */
function gasVolumes(kgPerS: number, molarMass: number, tempC: number): { acfm: number; scfm: number } {
  return {
    acfm: round1((kgPerS / idealGasDensity(tempC, 101.325, molarMass) / M3_PER_FT3) * 60),
    scfm: round1((kgPerS / idealGasDensity(SCFM_STD_C, 101.325, molarMass) / M3_PER_FT3) * 60)
  };
}

/**
 * What each outlet port is sending right now: kg/h and °C, and ACFM for a gas.
 * For phase-aware units and units with several liquid outlets (an
 * exchanger's two sides), where one figure for the unit would mislead.
 */
function portFlowsNow(contract: UnitOpContract | undefined, tick: Record<string, Parcel>): NodeTelemetrySnapshot['portFlows'] {
  if (!contract) return undefined;
  const severalOutlets = contract.ports.filter((p) => p.direction === 'OUTLET' && p.flowDimension === 'CONTINUOUS_FLUID').length > 1;
  if (!isPhaseAware(contract) && !severalOutlets) return undefined;
  const out: NonNullable<NodeTelemetrySnapshot['portFlows']> = {};
  for (const port of contract.ports) {
    const p = tick[port.id];
    if (port.direction !== 'OUTLET' || !p || p.kg <= 1e-12) continue;
    const phase = portPhase(port);
    const split = phaseSplit(port, p, phase);
    out[port.id] = {
      phase,
      kgPerHour: round1(p.kg * 3600),
      temperatureC: round1(p.tempC),
      ...(phase === 'GAS' && split.ownKg > 0 ? { acfm: gasVolumes(split.ownKg, split.molarMass, p.tempC).acfm } : {})
    };
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * What a designed unit sent out of each outlet port over the run, in the
 * units of the port's phase: gal/min for a liquid, ACFM and SCFM (ideal gas,
 * at the temperature it left at) for a gas, kg/h for a solid. Components
 * carried in another phase (dust in air, moisture in a powder) are reported
 * apart and left out of the gas volume.
 */
export function portStreams(contract: UnitOpContract, byPort: Record<string, Parcel>, seconds: number): PortStreamReport[] {
  if (seconds <= 0) return [];
  const out: PortStreamReport[] = [];
  for (const port of contract.ports) {
    if (port.direction !== 'OUTLET' || port.flowDimension !== 'CONTINUOUS_FLUID') continue;
    const p = byPort[port.id];
    if (!p || p.kg <= 1e-9) continue;
    const phase = portPhase(port);
    const report: PortStreamReport = {
      port: port.id,
      name: port.name,
      phase,
      kg: round1(p.kg),
      kgPerHour: round1((p.kg / seconds) * 3600),
      temperatureC: round1(p.tempC),
      ...(componentKg(p) ? { componentsKg: componentKg(p) } : {})
    };
    const split = phaseSplit(port, p, phase);
    // Three significant figures: the trace of dust in clean air is the figure that matters.
    const dispersed = Object.fromEntries(Object.entries(split.dispersedKg).map(([c, kg]) => [c, Number(((kg / seconds) * 3600).toPrecision(3))]));
    if (Object.keys(dispersed).length) report.dispersedKgPerHour = dispersed;
    if (phase === 'LIQUID') report.gallonsPerMinute = round1((p.m3 / M3_PER_GALLON / seconds) * 60);
    if (phase === 'GAS' && split.ownKg > 0) {
      const gas = gasVolumes(split.ownKg / seconds, split.molarMass, p.tempC);
      report.gasKgPerHour = round1((split.ownKg / seconds) * 3600);
      report.molarMass = round1(split.molarMass);
      report.actualCubicFeetPerMinute = gas.acfm;
      report.standardCubicFeetPerMinute = gas.scfm;
    }
    out.push(report);
  }
  return out;
}

/** Event types that are a unit's own cycle, and so pause while it is down. */
const CYCLE_EVENTS = new Set<SimEvent['type']>(['CYCLE_COMPLETE']);

/** Batch phase names the canvas animates as a reactor's phases. */
const REACTOR_PHASES = new Set(['FILLING', 'HEATING', 'REACTING', 'DISCHARGING']);

export class SimulationEngine {
  private queue = new PriorityQueue<SimEvent>();
  private currentTimeSeconds = 0;
  private nodes = new Map<string, UnitRuntime>();
  private telemetry: NodeTelemetrySnapshot[] = [];
  private eventCounter = 0;
  private lastTelemetrySnapshotMinute = -1;
  /** Round-robin position per node (and port) with more than one outgoing edge. */
  private routeCursor = new Map<string, number>();
  private readonly material: MaterialNetwork;
  /** Seconds between liquid steps. */
  private static readonly FLUID_DT = 1;
  /** Edges that carry items, not liquid. */
  private readonly discreteEdges: ProcessGraph['edges'];

  private readonly rng: SeededRng;
  /**
   * Breakdowns and cycle-time variation draw from streams of their own, so
   * turning them on for one unit does not change any other draw in the run.
   */
  private readonly failureRng: SeededRng;
  private readonly variationRng: SeededRng;
  /** Cycle events paused by a breakdown; skipped when they come due. */
  private readonly cancelled = new Set<string>();

  /**
   * @param options.seed Seed for the run's random draws. Omit it and the seed
   * is derived from the graph id, so the same graph is reproducible by
   * identity. Supply one to compare two designs under identical draws, which
   * is the only way a throughput difference between them means anything.
   */
  constructor(
    private readonly graph: ProcessGraph,
    options: { seed?: number } = {}
  ) {
    this.rng = createRng(options.seed ?? seedFromString(graph.id));
    this.failureRng = createRng(((this.rng.seed ^ 0x9e3779b9) >>> 0) || 1);
    this.variationRng = createRng(((this.rng.seed ^ 0x85ebca6b) >>> 0) || 1);
    this.discreteEdges = graph.edges.filter((e) => !isFluidEdge(e, graph));
    const contracts = new Map<string, UnitOpContract>();
    const evaluations = new Map<string, UnitOpEvaluation>();
    this.initializeNodes(contracts, evaluations);
    this.material = new MaterialNetwork(graph, contracts, evaluations);
  }

  /** The seed this run used. Reported on the result so a run can be replayed. */
  public get seed(): number {
    return this.rng.seed;
  }

  private initializeNodes(contracts: Map<string, UnitOpContract>, evaluations: Map<string, UnitOpEvaluation>): void {
    for (const node of this.graph.nodes) {
      const terminal = node.kind === 'TERMINAL' ? terminalRole(node) ?? 'product' : null;
      const contract = terminal ? undefined : effectiveContract(node, this.graph.edges);
      let ev: UnitOpEvaluation | undefined;
      if (contract) {
        // Evaluated once, up front, so a physically incoherent unit fails
        // before the clock starts rather than partway through a run.
        ev = evaluateUnitOp(contract);
        if (ev.error) {
          throw new Error(`Node "${node.id}" contract "${contract.id}" failed to evaluate at ${ev.error.path}: ${ev.error.message}`);
        }
        const blocking = blockingViolations(ev);
        if (blocking.length > 0) {
          throw new Error(`Node "${node.id}" contract "${contract.id}" is not physically valid: ` + blocking.map((c) => c.message).join(' | '));
        }
        contracts.set(node.id, contract);
        evaluations.set(node.id, ev);
      }
      const b = ev?.behavior;
      const cycle = b?.mode === 'DISCRETE_CYCLE' ? b : undefined;
      const configured = (node.config as { bufferCapacity?: unknown }).bufferCapacity;
      const maxQueue =
        terminal && terminal !== 'feed'
          ? Infinity // an outlet takes everything it is sent
          : cycle?.queueCapacity ?? (typeof configured === 'number' && configured > 0 ? configured : 100);

      this.nodes.set(node.id, {
        node,
        terminal,
        ...(contract ? { contract, ev } : {}),
        ...(ev?.reliability ? { failure: ev.reliability } : {}),
        state: 'IDLE',
        stateStartTime: 0,
        busyTime: 0,
        blockedTime: 0,
        starvedTime: 0,
        downTime: 0,
        unitsProduced: 0,
        unitsScrapped: 0,
        queue: 0,
        maxQueue,
        inProcess: 0,
        held: 0,
        ...(cycle?.inputs ? { portQueue: new Map(cycle.inputs.map((x) => [x.port, 0])) } : {}),
        ...(cycle?.outputs ? { heldByPort: new Map(cycle.outputs.map((x) => [x.port, 0])) } : {})
      });
    }
  }

  private cycleOf(rt: UnitRuntime): CycleBehavior | undefined {
    return rt.ev?.behavior.mode === 'DISCRETE_CYCLE' ? rt.ev.behavior : undefined;
  }

  private scheduleEvent(delaySeconds: number, nodeId: string, type: SimEvent['type'], payload?: Record<string, unknown>): void {
    const timeSeconds = this.currentTimeSeconds + delaySeconds;
    const id = `evt-${++this.eventCounter}`;
    this.queue.enqueue({ id, timeSeconds, nodeId, type, payload }, timeSeconds);
    if (CYCLE_EVENTS.has(type)) {
      const runtime = this.nodes.get(nodeId);
      if (runtime) runtime.pending = { id, type, timeSeconds };
    }
  }

  private setNodeState(runtime: UnitRuntime, newState: MachineOperationalState): void {
    if (runtime.state === newState) return;
    this.creditElapsed(runtime);
    runtime.state = newState;
  }

  /**
   * Adds the time since the last state change to the current state's bucket.
   * Split out of setNodeState so finalization can call it: a unit IDLE all
   * run would otherwise end with zero seconds in every bucket.
   */
  private creditElapsed(runtime: UnitRuntime): void {
    const duration = this.currentTimeSeconds - runtime.stateStartTime;
    switch (runtime.state) {
      case 'BUSY':
        runtime.busyTime += duration;
        break;
      case 'BLOCKED':
        runtime.blockedTime += duration;
        break;
      case 'FAILED':
        runtime.downTime += duration;
        break;
      case 'STARVED':
      case 'IDLE':
        runtime.starvedTime += duration;
        break;
    }
    runtime.stateStartTime = this.currentTimeSeconds;
  }

  /** Runs the simulation for the requested duration in minutes. */
  public run(durationMinutes: number): SimulationResult {
    const startWallClock = performance.now();
    const maxTimeSeconds = durationMinutes * 60;

    // Cycle units: a source starts at once; anything else waits for material.
    for (const runtime of this.nodes.values()) {
      if (this.cycleOf(runtime)) this.startCycle(runtime);
    }
    // Feeds last, once every unit they feed is waiting for material.
    for (const runtime of this.nodes.values()) {
      if (this.isItemFeed(runtime)) this.startFeed(runtime);
    }
    if (this.material.active) this.scheduleEvent(SimulationEngine.FLUID_DT, '__fluid__', 'FLUID_TICK');
    for (const runtime of this.nodes.values()) {
      if (runtime.failure) this.scheduleEvent(this.drawExponential(runtime.failure.mtbfSeconds), runtime.node.id, 'MACHINE_FAILURE');
    }

    while (!this.queue.isEmpty()) {
      const event = this.queue.dequeue();
      if (!event || event.timeSeconds > maxTimeSeconds) break;
      this.currentTimeSeconds = event.timeSeconds;
      this.handleEvent(event);

      // A telemetry snapshot once per simulated minute.
      const currentMinute = Math.floor(this.currentTimeSeconds / 60);
      if (currentMinute > this.lastTelemetrySnapshotMinute) {
        this.recordTelemetrySnapshot();
        this.lastTelemetrySnapshotMinute = currentMinute;
      }
    }

    this.currentTimeSeconds = maxTimeSeconds;
    for (const runtime of this.nodes.values()) this.creditElapsed(runtime);
    return this.buildSimulationResult(durationMinutes, performance.now() - startWallClock);
  }

  private handleEvent(event: SimEvent): void {
    if (event.type === 'FLUID_TICK') {
      this.handleFluidTick();
      return;
    }
    const runtime = this.nodes.get(event.nodeId);
    if (!runtime) return;
    if (this.cancelled.delete(event.id)) return;
    if (runtime.pending?.id === event.id) delete runtime.pending;

    switch (event.type) {
      case 'MACHINE_FAILURE':
        this.handleFailure(runtime);
        break;
      case 'MACHINE_REPAIRED':
        this.handleRepair(runtime);
        break;
      case 'CYCLE_COMPLETE':
        this.completeCycle(runtime);
        break;
      case 'FEED_ARRIVAL':
        // One item from a rate-limited feed: in, or held until there is room.
        if (this.routeUnits(runtime, 1) > 0) {
          runtime.unitsProduced++;
          this.scheduleFeedArrival(runtime);
        } else {
          runtime.held = 1;
          this.setNodeState(runtime, 'BLOCKED');
        }
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------- cycles

  /** Whether a cycle unit starts cycles on its own (roles.ts). */
  private isSource(runtime: UnitRuntime): boolean {
    const b = this.cycleOf(runtime);
    return Boolean(b) && isCycleSource(b!, this.discreteEdges.filter((e) => e.targetNodeId === runtime.node.id).length);
  }

  /** Whether the next cycle has its items: a whole kit, a whole cycle's worth, or anything (a source: nothing). */
  private inputsReady(runtime: UnitRuntime): boolean {
    const b = this.cycleOf(runtime);
    if (!b) return false;
    if (b.inputs && runtime.portQueue) return b.inputs.every((x) => (runtime.portQueue!.get(x.port) ?? 0) >= x.perCycle);
    if (this.isSource(runtime)) return true;
    if (b.fullCyclesOnly) return runtime.queue >= b.unitsPerCycle;
    return runtime.queue > 0;
  }

  /**
   * Starts a cycle if the unit can: not down, not busy, not holding finished
   * items, with its items (and, piped, its liquid) on hand. It takes them now,
   * which frees room upstream; it waits (STARVED) when they are not there.
   */
  private startCycle(runtime: UnitRuntime): void {
    const b = this.cycleOf(runtime);
    if (!b || runtime.state === 'FAILED' || runtime.pending) return;
    if (runtime.held > 0 || [...(runtime.heldByPort?.values() ?? [])].some((n) => n > 0)) {
      this.setNodeState(runtime, 'BLOCKED');
      return;
    }
    if (!this.inputsReady(runtime) || !this.material.cycleReady(runtime.node.id)) {
      this.setNodeState(runtime, 'STARVED');
      return;
    }
    const source = this.isSource(runtime);
    let taken: number;
    if (b.inputs && runtime.portQueue) {
      for (const x of b.inputs) {
        runtime.portQueue.set(x.port, (runtime.portQueue.get(x.port) ?? 0) - x.perCycle);
        runtime.queue -= x.perCycle;
      }
      taken = b.unitsPerCycle;
    } else if (source) {
      taken = b.unitsPerCycle;
    } else {
      taken = Math.min(b.unitsPerCycle, runtime.queue);
      runtime.queue -= taken;
    }
    this.material.drawCycle(runtime.node.id);
    runtime.inProcess = taken;
    this.setNodeState(runtime, 'BUSY');
    this.scheduleEvent(this.cycleDuration(runtime, b), runtime.node.id, 'CYCLE_COMPLETE');
    if (!source) this.unblockUpstreamIfWaiting(runtime.node.id);
  }

  /** The cycle's length: cycleSeconds, or a lognormal draw around it with the contract's spread. */
  private cycleDuration(runtime: UnitRuntime, b: CycleBehavior): number {
    const cv = runtime.ev?.cycleTimeCv ?? 0;
    if (!(cv > 0)) return b.cycleSeconds;
    const s2 = Math.log(1 + cv * cv);
    const mu = Math.log(b.cycleSeconds) - s2 / 2;
    // Box-Muller; u1 in (0, 1] so the log is finite.
    const u1 = 1 - this.variationRng.next();
    const u2 = this.variationRng.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.exp(mu + Math.sqrt(s2) * z);
  }

  /** How many of `n` items are rejects: a fixed fraction, or each drawn at random. */
  private rejects(n: number, b: CycleBehavior): number {
    if (!(b.scrapFraction > 0) || n <= 0) return 0;
    if (!b.scrapRandom) return Math.floor(n * b.scrapFraction);
    let r = 0;
    for (let i = 0; i < n; i++) if (this.rng.next() < b.scrapFraction) r++;
    return r;
  }

  /** A cycle ends: what it made goes downstream, or is held (BLOCKED) until there is room. */
  private completeCycle(runtime: UnitRuntime): void {
    const b = this.cycleOf(runtime);
    if (!b) return;
    const made = runtime.inProcess;
    runtime.inProcess = 0;

    if (b.outputs && runtime.heldByPort) {
      let held = 0;
      for (const o of b.outputs) {
        if (o.scrap) runtime.unitsScrapped += o.perCycle;
        if (!this.hasDownstream(runtime.node.id, o.port)) {
          // Nothing piped to this port: its items leave the line.
          if (!o.scrap) runtime.unitsProduced += o.perCycle;
          continue;
        }
        const moved = this.routeUnits(runtime, o.perCycle, o.port);
        if (!o.scrap) runtime.unitsProduced += moved;
        runtime.heldByPort.set(o.port, (runtime.heldByPort.get(o.port) ?? 0) + o.perCycle - moved);
        held += o.perCycle - moved;
      }
      if (held > 0) this.setNodeState(runtime, 'BLOCKED');
      else this.startCycle(runtime);
      return;
    }

    const scrapped = this.rejects(made, b);
    const good = made - scrapped;
    runtime.unitsScrapped += scrapped;
    if (this.hasDownstream(runtime.node.id)) {
      const moved = this.routeUnits(runtime, good);
      runtime.unitsProduced += moved;
      if (good - moved > 0) {
        // Downstream is full: hold the rest and block. This is what makes backpressure propagate.
        runtime.held += good - moved;
        this.setNodeState(runtime, 'BLOCKED');
        return;
      }
    } else {
      // The end of a line: what it made leaves the line.
      runtime.unitsProduced += good;
    }
    this.startCycle(runtime);
  }

  // -------------------------------------------------------- breakdowns

  private drawExponential(mean: number): number {
    // Never exactly 0 or infinite: u is in [0, 1).
    return -Math.log(1 - this.failureRng.next()) * mean;
  }

  /** A breakdown: the unit stops, the cycle it was in pauses where it is, and it comes back after an exponential repair. */
  private handleFailure(runtime: UnitRuntime): void {
    if (!runtime.failure) return;
    runtime.beforeFailure = runtime.state;
    if (runtime.pending) {
      this.cancelled.add(runtime.pending.id);
      runtime.interrupted = { type: runtime.pending.type, remainingSeconds: Math.max(0, runtime.pending.timeSeconds - this.currentTimeSeconds) };
      delete runtime.pending;
    }
    this.material.setDown(runtime.node.id, true);
    this.setNodeState(runtime, 'FAILED');
    this.scheduleEvent(this.drawExponential(runtime.failure.mttrSeconds), runtime.node.id, 'MACHINE_REPAIRED');
  }

  /** Back from repair: finish the interrupted cycle, or pick up where it stood. */
  private handleRepair(runtime: UnitRuntime): void {
    if (!runtime.failure) return;
    const before = runtime.beforeFailure ?? 'IDLE';
    delete runtime.beforeFailure;
    const interrupted = runtime.interrupted;
    delete runtime.interrupted;
    this.material.setDown(runtime.node.id, false);

    if (interrupted) {
      this.setNodeState(runtime, 'BUSY');
      this.scheduleEvent(interrupted.remainingSeconds, runtime.node.id, interrupted.type);
    } else {
      // It was waiting: wait again, and take any work that arrived while it was down.
      this.setNodeState(runtime, before === 'BUSY' ? 'IDLE' : before);
      if (runtime.state === 'BLOCKED') this.resumeBlocked(runtime);
      else if (this.cycleOf(runtime)) this.startCycle(runtime);
    }
    this.scheduleEvent(this.drawExponential(runtime.failure.mtbfSeconds), runtime.node.id, 'MACHINE_FAILURE');
  }

  // ------------------------------------------------------------- feeds

  /** A feed arrow piped to units that take items (a liquid feed is the material network's). */
  private isItemFeed(runtime: UnitRuntime): boolean {
    return runtime.terminal === 'feed' && this.hasDownstream(runtime.node.id);
  }

  /** With a supply rate, items arrive one at a time at that rate; without one, the feed keeps every queue it feeds full. */
  private startFeed(runtime: UnitRuntime): void {
    if (terminalSupplyRate(runtime.node) > 0) this.scheduleFeedArrival(runtime);
    else this.topUpFeed(runtime);
  }

  private scheduleFeedArrival(runtime: UnitRuntime): void {
    this.setNodeState(runtime, 'BUSY');
    this.scheduleEvent(60 / terminalSupplyRate(runtime.node), runtime.node.id, 'FEED_ARRIVAL');
  }

  private topUpFeed(runtime: UnitRuntime): void {
    // Only the room there is: a feed straight into an outlet (which has no limit) would otherwise never stop.
    const room = this.downstreamRuntimes(runtime.node.id).reduce(
      (sum, t) => sum + (Number.isFinite(t.maxQueue) ? Math.max(0, t.maxQueue - t.queue) : 0),
      0
    );
    if (room > 0) runtime.unitsProduced += this.routeUnits(runtime, room);
    this.setNodeState(runtime, 'IDLE');
  }

  // ------------------------------------------------------------- liquid

  /** One step of the liquid, then the states it implies and the cycles it can restart. */
  private handleFluidTick(): void {
    this.material.tick(this.currentTimeSeconds, SimulationEngine.FLUID_DT);
    for (const unit of this.material.units.values()) {
      const runtime = this.nodes.get(unit.id);
      if (!runtime || runtime.state === 'FAILED') continue;
      if (unit.role === 'drawer') {
        // A cycle waiting on liquid starts once a cycle's worth is there.
        if (runtime.state === 'STARVED') this.startCycle(runtime);
        continue;
      }
      this.setNodeState(runtime, this.material.stateOf(unit));
      if (unit.role === 'batch') runtime.unitsProduced = unit.batches;
    }
    this.scheduleEvent(SimulationEngine.FLUID_DT, '__fluid__', 'FLUID_TICK');
  }

  // ----------------------------------------------------------- routing

  /** Items arrived at a unit that was waiting for them. */
  private onArrival(target: UnitRuntime): void {
    if (target.state === 'FAILED') return;
    if (target.terminal) {
      // An outlet: what arrives has left the line.
      target.unitsProduced += target.queue;
      target.queue = 0;
      return;
    }
    if (target.state === 'STARVED' || target.state === 'IDLE') this.startCycle(target);
  }

  private unblockUpstreamIfWaiting(currentNodeId: string): void {
    for (const edge of this.discreteEdges) {
      if (edge.targetNodeId !== currentNodeId) continue;
      const upstream = this.nodes.get(edge.sourceNodeId);
      if (!upstream) continue;
      if (upstream.terminal === 'feed' && terminalSupplyRate(upstream.node) === 0) this.topUpFeed(upstream);
      else if (upstream.state === 'BLOCKED') this.resumeBlocked(upstream);
    }
  }

  /** Gives a blocked unit another chance to push its held output downstream, and restarts it if everything got out. */
  private resumeBlocked(upstream: UnitRuntime): void {
    if (upstream.state === 'FAILED') return;
    const outs = this.cycleOf(upstream)?.outputs ?? [];
    if (upstream.heldByPort) {
      let left = 0;
      for (const o of outs) {
        const held = upstream.heldByPort.get(o.port) ?? 0;
        if (held <= 0) continue;
        const moved = this.routeUnits(upstream, held, o.port);
        upstream.heldByPort.set(o.port, held - moved);
        if (!o.scrap) upstream.unitsProduced += moved;
        left += held - moved;
      }
      if (left > 0) return;
    }
    if (upstream.held > 0) {
      const moved = this.routeUnits(upstream, upstream.held);
      upstream.held -= moved;
      upstream.unitsProduced += moved;
      if (upstream.held > 0) return;
    }
    if (upstream.terminal) {
      // A rate-limited feed whose held item got in: the next one is due.
      this.scheduleFeedArrival(upstream);
      return;
    }
    this.setNodeState(upstream, 'IDLE');
    this.startCycle(upstream);
  }

  /** A kit port's queue holds at least two cycles' worth, so one kit waits while the next gathers. */
  private portCapacity(runtime: UnitRuntime, port: string): number {
    const need = this.cycleOf(runtime)?.inputs?.find((x) => x.port === port)?.perCycle ?? 0;
    return Math.max(runtime.maxQueue, 2 * need);
  }

  /** A queue that waits for whole cycles holds at least one. */
  private queueCapacity(runtime: UnitRuntime): number {
    const b = this.cycleOf(runtime);
    return b?.fullCyclesOnly ? Math.max(runtime.maxQueue, b.unitsPerCycle) : runtime.maxQueue;
  }

  private downstreamRuntimes(nodeId: string): UnitRuntime[] {
    const out: UnitRuntime[] = [];
    for (const e of this.discreteEdges) {
      if (e.sourceNodeId !== nodeId) continue;
      const target = this.nodes.get(e.targetNodeId);
      if (target) out.push(target);
    }
    return out;
  }

  private hasDownstream(nodeId: string, port?: string): boolean {
    return this.discreteEdges.some((e) => e.sourceNodeId === nodeId && (port === undefined || e.sourcePortId === port) && this.nodes.has(e.targetNodeId));
  }

  /**
   * Moves up to `count` items from `from` into its downstream queues and
   * returns how many moved. Every transfer is capacity-checked here, so no
   * unit can overfill a queue. With several outgoing pipes, items are dealt
   * round-robin to targets that have room.
   */
  private routeUnits(from: UnitRuntime, count: number, port?: string): number {
    const targets: { runtime: UnitRuntime; inPort: string }[] = [];
    for (const e of this.discreteEdges) {
      if (e.sourceNodeId !== from.node.id || (port !== undefined && e.sourcePortId !== port)) continue;
      const t = this.nodes.get(e.targetNodeId);
      if (t) targets.push({ runtime: t, inPort: e.targetPortId });
    }
    if (targets.length === 0 || count <= 0) return 0;

    const key = port === undefined ? from.node.id : `${from.node.id}:${port}`;
    let cursor = this.routeCursor.get(key) ?? 0;
    let moved = 0;
    let misses = 0;
    const touched = new Set<UnitRuntime>();
    while (moved < count && misses < targets.length) {
      const { runtime: target, inPort } = targets[cursor % targets.length]!;
      cursor++;
      const ports = target.portQueue;
      const room = ports ? (ports.get(inPort) ?? 0) < this.portCapacity(target, inPort) : target.queue < this.queueCapacity(target);
      if (room) {
        target.queue++;
        if (ports) ports.set(inPort, (ports.get(inPort) ?? 0) + 1);
        moved++;
        misses = 0;
        touched.add(target);
      } else {
        misses++;
      }
    }
    this.routeCursor.set(key, cursor % targets.length);
    for (const target of touched) this.onArrival(target);
    return moved;
  }

  // ----------------------------------------------------------- reports

  private recordTelemetrySnapshot(): void {
    for (const r of this.nodes.values()) {
      this.telemetry.push({
        timeSeconds: this.currentTimeSeconds,
        nodeId: r.node.id,
        state: r.state,
        unitsProduced: r.unitsProduced,
        unitsScrapped: r.unitsScrapped,
        bufferLevel: r.queue,
        instantaneousRatePerMin: this.currentTimeSeconds > 0 ? (r.unitsProduced / this.currentTimeSeconds) * 60 : 0,
        ...this.liquidTelemetry(r.node.id)
      });
    }
  }

  private liquidTelemetry(nodeId: string): Partial<NodeTelemetrySnapshot> {
    const u = this.material.units.get(nodeId);
    if (!u) return {};
    // An outlet's "level" is everything it has received; a feed's, what it has supplied.
    const level = u.role === 'sink' ? u.received : u.role === 'feed' ? u.delivered : u.hold;
    const phaseName = u.batchRun?.phase.name;
    const phase = phaseName?.toUpperCase();
    return {
      levelGallons: round1(gallonsOf(level)),
      levelKg: round1(level.kg),
      ...(Number.isFinite(u.capacity) ? { levelFraction: Math.min(1, u.hold.m3 / u.capacity) } : {}),
      flowGpm: round1(((u.role === 'sink' ? u.inRate : u.outRate) / M3_PER_GALLON) * 60),
      temperatureC: round1(u.role === 'feed' ? u.feedStock!.tempC : u.hold.tempC),
      kgPerHour: round1((u.role === 'sink' ? u.inKgRate : u.outKgRate) * 3600),
      ...(portFlowsNow(u.contract, u.tickPort) ? { portFlows: portFlowsNow(u.contract, u.tickPort)! } : {}),
      ...(phase && REACTOR_PHASES.has(phase) ? { phase: phase as NodeTelemetrySnapshot['phase'] } : {}),
      ...(phaseName ? { phaseName } : {})
    };
  }

  /** How a contract unit with liquid held up at the conditions it actually saw. */
  private contractReport(u: MaterialUnit, seconds = 0): DesignedUnitReport {
    const run = u.run!;
    return {
      liveEvaluations: run.evaluations,
      brokenConstraints: Object.entries(run.broken)
        .map(([id, b]) => ({ id, message: b.message, severity: b.severity, seconds: Math.round(b.seconds) }))
        .sort((a, b) => (a.severity === b.severity ? b.seconds - a.seconds : a.severity === 'ERROR' ? -1 : 1)),
      ...(run.firstError ? { evaluationError: run.firstError, evaluationErrorSeconds: Math.round(run.errorSeconds) } : {}),
      ...(Object.keys(run.shortReactions).length ? { shortReactions: Object.keys(run.shortReactions) } : {}),
      ...(Object.keys(run.heatBalance).length
        ? {
            heatBalance: Object.entries(run.heatBalance).map(([phase, h]) => ({
              phase,
              deliveredKwh: round1(h.deliveredKwh),
              neededKwh: round1(h.neededKwh),
              batches: h.batches
            }))
          }
        : {}),
      ...(u.live && Number.isFinite(u.live.capacity) ? { capacityGpm: round1((u.live.capacity / M3_PER_GALLON) * 60) } : {}),
      ...(u.batchRun ? { secondsByPhase: Object.fromEntries(Object.entries(u.batchRun.secondsByPhase).map(([k, v]) => [k, Math.round(v)])) } : {}),
      // Each outlet on its own wherever one figure would mislead: phases in their own units, and
      // several outlets (an exchanger's two sides, a separator's cuts) at their own temperatures.
      ...(u.contract && seconds > 0 && (isPhaseAware(u.contract) || u.contract.ports.filter((p) => p.direction === 'OUTLET' && p.flowDimension === 'CONTINUOUS_FLUID').length > 1)
        ? { streams: portStreams(u.contract, u.byPort, seconds) }
        : {})
    };
  }

  /** The heat a liquid unit moved: a duty it states, or a batch's heating. */
  private heatReport(u: MaterialUnit): { heat?: HeatReport } {
    if (!(u.heat.energyKwh > 1e-9) && !(u.heat.activeSeconds > 0)) return {};
    const energyKwh = round1(u.heat.energyKwh);
    return {
      heat: {
        energyKwh,
        ...(u.role === 'pass' && u.heat.activeSeconds > 0 ? { averageDutyKw: round1((u.heat.energyKwh * 3600) / u.heat.activeSeconds) } : {}),
        ...(u.heat.heatingSeconds > 0 ? { heatingTimeSeconds: Math.round(u.heat.heatingSeconds) } : {})
      }
    };
  }

  private buildSimulationResult(durationMinutes: number, wallClockExecutionTimeMs: number): SimulationResult {
    const nodeReports: Record<string, MachineOeeReport> = {};
    const totalTime = durationMinutes * 60;
    let totalPackaged = 0;
    let totalScrapped = 0;
    let fluidOutM3 = 0;
    let fluidOutKg = 0;
    const terminals: TerminalReport[] = [];

    for (const [nodeId, r] of this.nodes.entries()) {
      const operatingTime = r.busyTime;
      const plannedProductionTime = totalTime - r.downTime;
      const availability = plannedProductionTime > 0 ? operatingTime / plannedProductionTime : 1.0;
      const totalUnits = r.unitsProduced + r.unitsScrapped;
      const quality = totalUnits > 0 ? r.unitsProduced / totalUnits : 1.0;

      const unit = this.material.units.get(nodeId);
      const isLiquid = Boolean(unit && unit.role !== 'drawer');
      // Performance against the contract's own rate; liquid units have no item rate to compare against.
      const theoreticalSpeedPerMin = this.cycleOf(r)?.unitsPerMinute ?? 0;
      const theoreticalMaxUnits = (operatingTime / 60) * theoreticalSpeedPerMin;
      const performance = isLiquid || theoreticalMaxUnits <= 0 ? 1.0 : Math.min(1.0, totalUnits / theoreticalMaxUnits);
      const overallOee = availability * performance * quality;

      nodeReports[nodeId] = {
        nodeId,
        availabilityPercentage: Math.round(availability * 1000) / 10,
        performancePercentage: Math.round(performance * 1000) / 10,
        qualityPercentage: Math.round(quality * 1000) / 10,
        overallOeePercentage: Math.round(overallOee * 1000) / 10,
        totalTimeSeconds: Math.round(totalTime),
        busyTimeSeconds: Math.round(r.busyTime),
        blockedTimeSeconds: Math.round(r.blockedTime),
        starvedTimeSeconds: Math.round(r.starvedTime),
        downTimeSeconds: Math.round(r.downTime),
        unitsProduced: r.unitsProduced,
        unitsScrapped: r.unitsScrapped,
        ...(isLiquid && unit
          ? {
              fluid: {
                receivedGallons: round1(gallonsOf(unit.received)),
                deliveredGallons: round1(gallonsOf(unit.delivered)),
                levelGallons: round1(gallonsOf(unit.hold)),
                receivedKg: round1(unit.received.kg),
                deliveredKg: round1(unit.delivered.kg),
                levelKg: round1(unit.hold.kg),
                ...(unit.role === 'batch' ? { batches: unit.batches } : {}),
                temperatureC: round1(unit.role === 'sink' && unit.received.m3 > 0 ? unit.received.tempC : unit.role === 'feed' ? unit.feedStock!.tempC : unit.hold.tempC),
                ...(fractions(unit.role === 'sink' ? unit.received.comp : unit.hold.comp) ? { composition: fractions(unit.role === 'sink' ? unit.received.comp : unit.hold.comp) } : {}),
                ...(unit.heat.sent.m3 > 1e-9 && fractions(unit.heat.sent.comp) ? { averageOutletComposition: fractions(unit.heat.sent.comp) } : {}),
                ...(unit.heat.sent.m3 > 1e-9 ? { averageOutletTemperatureC: round1(unit.heat.sent.tempC) } : {}),
                ...(unit.lost.m3 > 1e-9 ? { lostGallons: round1(gallonsOf(unit.lost)), lostKg: round1(unit.lost.kg) } : {})
              },
              ...this.heatReport(unit)
            }
          : {}),
        ...(unit?.run && r.ev?.behavior.mode !== 'DISCRETE_CYCLE' ? { designedUnit: this.contractReport(unit, totalTime) } : {})
      };

      if (r.terminal) {
        // A feed or outlet: its totals, and (for a product) the line's output.
        const moved = unit ? (r.terminal === 'feed' ? unit.delivered : unit.received) : undefined;
        const report: TerminalReport = {
          nodeId,
          name: r.node.name,
          role: r.terminal,
          material: terminalMaterial(r.node),
          carries: terminalCarries(r.node),
          ...(terminalPhase(r.node) ? { phase: terminalPhase(r.node)! } : {}),
          units: r.unitsProduced,
          gallons: moved ? round1(gallonsOf(moved)) : 0,
          kg: moved ? round1(moved.kg) : 0,
          ...(moved && moved.m3 > 1e-9 ? { temperatureC: round1(moved.tempC) } : {}),
          ...(moved && componentKg(moved) ? { componentsKg: componentKg(moved) } : {})
        };
        terminals.push(report);
        nodeReports[nodeId]!.terminal = report;
        if (r.terminal === 'product') {
          totalPackaged += report.units;
          fluidOutM3 += unit?.received.m3 ?? 0;
          fluidOutKg += unit?.received.kg ?? 0;
        }
        continue;
      }

      if (unit) {
        fluidOutM3 += unit.leftLine.m3;
        fluidOutKg += unit.leftLine.kg;
      }
      // Output is what leaves the line: product outlets, and every unit at the
      // end of a line that makes items. Liquid leaving the line is reported in
      // gallons and kg instead.
      if (!this.hasDownstream(nodeId) && !isLiquid) totalPackaged += r.unitsProduced;
      totalScrapped += r.unitsScrapped;
    }

    return {
      seed: this.rng.seed,
      durationMinutes,
      simulatedTimeSeconds: totalTime,
      wallClockExecutionTimeMs: Math.round(wallClockExecutionTimeMs * 100) / 100,
      totalUnitsPackaged: totalPackaged,
      totalUnitsScrapped: totalScrapped,
      averageLineThroughputUnitsPerMin: durationMinutes > 0 ? Math.round((totalPackaged / durationMinutes) * 10) / 10 : 0,
      totalFluidDeliveredGallons: round1(fluidOutM3 / M3_PER_GALLON),
      totalFluidDeliveredKg: round1(fluidOutKg),
      terminals,
      nodeReports,
      telemetryLog: this.telemetry
    };
  }
}

/** Runs a flowsheet for `durationMinutes` and reports what happened. */
export function simulateProcess(graph: ProcessGraph, durationMinutes: number, options: { seed?: number } = {}): SimulationResult {
  return new SimulationEngine(graph, options).run(durationMinutes);
}
