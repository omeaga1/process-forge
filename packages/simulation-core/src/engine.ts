import type { ProcessGraph, ProcessNode, UnitOpContract, UnitOpEvaluation } from '@process-forge/protocol';
import { evaluateUnitOp, blockingViolations } from '@process-forge/protocol';
import { PriorityQueue } from './priority-queue.js';
import { FluidNetwork, fillerDemandGallons, isFluidEdge } from './fluid.js';
import { createRng, seedFromString, type SeededRng } from './rng.js';
import type {
  MachineOeeReport,
  MachineOperationalState,
  NodeTelemetrySnapshot,
  SimEvent,
  SimulationResult
} from './types.js';

interface InternalNodeRuntime {
  node: ProcessNode;
  state: MachineOperationalState;
  stateStartTime: number;
  busyTime: number;
  blockedTime: number;
  starvedTime: number;
  downTime: number;
  unitsProduced: number;
  unitsScrapped: number;
  /** Input queue: units waiting to be processed by this node. */
  bufferCans: number;
  maxBuffer: number;
  /**
   * Finished units that could not leave because every downstream buffer was
   * full. Kept apart from the input queue, so held output is not processed (and
   * scrapped) a second time. (The filler has no input queue and holds its
   * output in bufferCans.)
   */
  heldUnits: number;
  fluidLevelGallons: number;
  /**
   * Present when this node's behavior comes from a UnitOpContract rather than
   * one of the hardcoded machine handlers. This is what lets the engine run a
   * unit operation that did not exist when the engine was compiled.
   */
  contract?: UnitOpContract;
  contractEval?: UnitOpEvaluation;
  /**
   * Breakdowns, for a machine whose config sets both meanTimeBetweenFailures-
   * Minutes and meanTimeToRepairMinutes. Times between failures and repair
   * times are exponential with those means.
   */
  failure?: { mtbfSeconds: number; mttrSeconds: number };
  /** While FAILED: the state to go back to, and the cycle it interrupted. */
  beforeFailure?: MachineOperationalState;
  interrupted?: { type: SimEvent['type']; remainingSeconds: number };
  /** The one cycle event this machine has queued, so a failure can pause it. */
  pending?: { id: string; type: SimEvent['type']; timeSeconds: number };
}

/** Event types that are a machine's own cycle, and so pause while it is down. */
const CYCLE_EVENTS = new Set<SimEvent['type']>([
  'FILLER_CYCLE_COMPLETE',
  'CONVEYOR_TRANSFER_COMPLETE',
  'LABELER_CYCLE_COMPLETE',
  'PALLETIZER_CYCLE_COMPLETE',
  'CONTRACT_CYCLE_COMPLETE'
]);

export class SimulationEngine {
  private queue = new PriorityQueue<SimEvent>();
  private currentTimeSeconds = 0;
  private nodes = new Map<string, InternalNodeRuntime>();
  private telemetry: NodeTelemetrySnapshot[] = [];
  private eventCounter = 0;
  private lastTelemetrySnapshotMinute = -1;
  /** Round-robin position per node with more than one outgoing edge. */
  private routeCursor = new Map<string, number>();
  /** Liquid: reactors, tanks, pumps, and what pipe-fed fillers draw. */
  private readonly fluid: FluidNetwork;
  /** Seconds between fluid steps. */
  private static readonly FLUID_DT = 1;
  /** Edges that carry containers or parts, not liquid. */
  private readonly discreteEdges: ProcessGraph['edges'];

  private readonly rng: SeededRng;
  /**
   * Breakdowns draw from their own stream, so turning them on for one machine
   * does not change any other random draw (rejects, inspection failures).
   */
  private readonly failureRng: SeededRng;
  /** Cycle events paused by a breakdown; skipped when they come due. */
  private readonly cancelled = new Set<string>();

  /**
   * @param options.seed Seed for the simulation's random draws (machine
   * rejects, inspection failures). Omit it and the seed is derived from the
   * graph id, so the same graph is reproducible by identity without the caller
   * having to supply a number. Supply one explicitly to compare two designs
   * under identical random draws, which is the only way a throughput difference
   * between them means anything.
   */
  constructor(
    private readonly graph: ProcessGraph,
    options: { seed?: number } = {}
  ) {
    this.rng = createRng(options.seed ?? seedFromString(graph.id));
    this.failureRng = createRng(((this.rng.seed ^ 0x9e3779b9) >>> 0) || 1);
    this.discreteEdges = graph.edges.filter((e) => !isFluidEdge(e, graph));
    this.fluid = new FluidNetwork(graph);
    this.initializeNodes();
  }

  /** The seed this run used. Reported on the result so a run can be replayed. */
  public get seed(): number {
    return this.rng.seed;
  }

  private initializeNodes(): void {
    for (const node of this.graph.nodes) {
      let maxBuffer = 100;
      let initialFluid = 0;

      if (node.kind === 'ROTARY_FILLER') {
        const cfg = node.config as { bufferQueueCapacity?: number };
        maxBuffer = cfg.bufferQueueCapacity ?? 50;
      } else if (node.kind === 'SURGE_TANK') {
        const cfg = node.config as { capacityGallons?: number; initialLevelGallons?: number };
        maxBuffer = cfg.capacityGallons ?? 1000;
        initialFluid = cfg.initialLevelGallons ?? 500;
      } else if (node.kind === 'CONVEYOR') {
        const cfg = node.config as { maxItemCapacity?: number };
        maxBuffer = cfg.maxItemCapacity ?? 48;
      }

      // A node whose config carries a contract is executed generically. The
      // contract is evaluated once, up front, so that a physically incoherent
      // unit op fails before the clock starts rather than partway through a run.
      const contractCfg = node.config as { contract?: UnitOpContract; bufferCapacity?: number };
      const contract = contractCfg.contract;
      let contractEval: UnitOpEvaluation | undefined;
      if (contract) {
        contractEval = evaluateUnitOp(contract);
        if (contractEval.error) {
          throw new Error(
            `Node "${node.id}" contract "${contract.id}" failed to evaluate at ` +
              `${contractEval.error.path}: ${contractEval.error.message}`
          );
        }
        const blocking = blockingViolations(contractEval);
        if (blocking.length > 0) {
          throw new Error(
            `Node "${node.id}" contract "${contract.id}" is not physically valid: ` +
              blocking.map((c) => c.message).join(' | ')
          );
        }
        maxBuffer = contractCfg.bufferCapacity ?? maxBuffer;
      }

      const cfg = node.config as { meanTimeBetweenFailuresMinutes?: unknown; meanTimeToRepairMinutes?: unknown };
      const mtbf = typeof cfg.meanTimeBetweenFailuresMinutes === 'number' ? cfg.meanTimeBetweenFailuresMinutes : 0;
      const mttr = typeof cfg.meanTimeToRepairMinutes === 'number' ? cfg.meanTimeToRepairMinutes : 0;
      const steppedKind =
        node.kind === 'ROTARY_FILLER' ||
        node.kind === 'CONVEYOR' ||
        node.kind === 'LABELER' ||
        node.kind === 'PALLETIZER' ||
        contractEval?.behavior.mode === 'DISCRETE_CYCLE';

      this.nodes.set(node.id, {
        node,
        ...(steppedKind && mtbf > 0 && mttr > 0 ? { failure: { mtbfSeconds: mtbf * 60, mttrSeconds: mttr * 60 } } : {}),
        state: 'IDLE',
        stateStartTime: 0,
        busyTime: 0,
        blockedTime: 0,
        starvedTime: 0,
        downTime: 0,
        unitsProduced: 0,
        unitsScrapped: 0,
        bufferCans: 0,
        maxBuffer,
        heldUnits: 0,
        fluidLevelGallons: initialFluid,
        ...(contract ? { contract, contractEval } : {})
      });
    }
  }

  private scheduleEvent(
    delaySeconds: number,
    nodeId: string,
    type: SimEvent['type'],
    payload?: Record<string, unknown>
  ): void {
    const timeSeconds = this.currentTimeSeconds + delaySeconds;
    const id = `evt-${++this.eventCounter}`;
    this.queue.enqueue(
      {
        id,
        timeSeconds,
        nodeId,
        type,
        payload
      },
      timeSeconds
    );
    if (CYCLE_EVENTS.has(type)) {
      const runtime = this.nodes.get(nodeId);
      if (runtime) runtime.pending = { id, type, timeSeconds };
    }
  }

  private setNodeState(runtime: InternalNodeRuntime, newState: MachineOperationalState): void {
    if (runtime.state === newState) return;
    this.creditElapsed(runtime);
    runtime.state = newState;
  }

  /**
   * Adds the time since the last state change to the current state's bucket.
   *
   * Split out of setNodeState so finalization can call it directly:
   * setNodeState returns early on an unchanged state, so a node that is IDLE
   * all run would otherwise end with zero seconds in every bucket.
   */
  private creditElapsed(runtime: InternalNodeRuntime): void {
    const duration = this.currentTimeSeconds - runtime.stateStartTime;
    switch (runtime.state) {
      case 'BUSY':
        runtime.busyTime += duration;
        break;
      case 'BLOCKED':
        runtime.blockedTime += duration;
        break;
      case 'STARVED':
        runtime.starvedTime += duration;
        break;
      case 'FAILED':
        runtime.downTime += duration;
        break;
      case 'IDLE':
        runtime.starvedTime += duration;
        break;
    }
    runtime.stateStartTime = this.currentTimeSeconds;
  }

  /**
   * Runs the simulation for the requested duration in minutes.
   */
  public run(durationMinutes: number): SimulationResult {
    const startWallClock = performance.now();
    const maxTimeSeconds = durationMinutes * 60;

    // Bootstrap initial events for machine nodes
    for (const runtime of this.nodes.values()) {
      if (runtime.node.kind === 'ROTARY_FILLER') {
        this.startFillerCycle(runtime);
      } else if (runtime.node.kind === 'LABELER') {
        this.setNodeState(runtime, 'STARVED');
      } else if (runtime.node.kind === 'PALLETIZER') {
        this.setNodeState(runtime, 'STARVED');
      }

      // Contract-defined nodes. A node with no inbound edge is a source and
      // starts cycling immediately; anything downstream waits for material.
      if (runtime.contractEval?.behavior.mode === 'DISCRETE_CYCLE') {
        if (this.isSourceNode(runtime.node.id)) {
          this.setNodeState(runtime, 'BUSY');
          this.scheduleEvent(
            runtime.contractEval.behavior.cycleSeconds,
            runtime.node.id,
            'CONTRACT_CYCLE_COMPLETE'
          );
        } else {
          this.setNodeState(runtime, 'STARVED');
        }
      }
    }

    if (this.fluid.active) this.scheduleEvent(SimulationEngine.FLUID_DT, '__fluid__', 'FLUID_TICK');
    for (const runtime of this.nodes.values()) {
      if (runtime.failure) this.scheduleEvent(this.drawExponential(runtime.failure.mtbfSeconds), runtime.node.id, 'MACHINE_FAILURE');
    }

    // Main discrete-event loop
    while (!this.queue.isEmpty()) {
      const event = this.queue.dequeue();
      if (!event || event.timeSeconds > maxTimeSeconds) {
        break;
      }

      this.currentTimeSeconds = event.timeSeconds;
      this.handleEvent(event);

      // Record periodic telemetry snapshot once per simulation minute
      const currentMinute = Math.floor(this.currentTimeSeconds / 60);
      if (currentMinute > this.lastTelemetrySnapshotMinute) {
        this.recordTelemetrySnapshot();
        this.lastTelemetrySnapshotMinute = currentMinute;
      }
    }

    this.currentTimeSeconds = maxTimeSeconds;

    // Finalize: every node's trailing time lands in the bucket it was in.
    for (const runtime of this.nodes.values()) {
      this.creditElapsed(runtime);
    }

    const endWallClock = performance.now();

    return this.buildSimulationResult(durationMinutes, endWallClock - startWallClock);
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

    if (event.type === 'MACHINE_FAILURE') {
      this.handleFailure(runtime);
      return;
    }
    if (event.type === 'MACHINE_REPAIRED') {
      this.handleRepair(runtime);
      return;
    }

    switch (event.type) {
      case 'FILLER_CYCLE_COMPLETE': {
        const cfg = runtime.node.config as {
          nozzleCount?: number;
          fillTimePerCycleSeconds?: number;
          indexTimePerCycleSeconds?: number;
          rejectRatePercentage?: number;
        };
        const nozzles = cfg.nozzleCount ?? 10;
        const rejectRate = (cfg.rejectRatePercentage ?? 0.5) / 100;
        const rejected = this.rng.next() < rejectRate ? 1 : 0;
        const produced = nozzles - rejected;

        runtime.unitsProduced += produced;
        runtime.unitsScrapped += rejected;

        // Route cans downstream. Whatever does not fit is held, and the
        // filler blocks until a downstream machine makes room.
        if (this.hasDownstream(runtime.node.id)) {
          const held = produced - this.routeUnits(runtime, produced);
          if (held > 0) {
            runtime.bufferCans += held;
            this.setNodeState(runtime, 'BLOCKED');
          } else {
            this.setNodeState(runtime, 'BUSY');
          }
        }

        // Next cycle, unless blocked. A pipe-fed filler needs the product for it.
        if (runtime.state === 'BUSY') this.startFillerCycle(runtime);
        break;
      }

      case 'CONVEYOR_TRANSFER_COMPLETE': {
        if (runtime.bufferCans > 0) {
          // A conveyor at the end of a line discharges off the end.
          const moved = this.hasDownstream(runtime.node.id) ? this.routeUnits(runtime, 1) : 1;
          if (moved > 0) {
            runtime.bufferCans--;
            runtime.unitsProduced++;
            this.unblockUpstreamIfWaiting(runtime.node.id);
          } else {
            this.setNodeState(runtime, 'BLOCKED');
          }

          if (runtime.bufferCans > 0 && runtime.state !== 'BLOCKED') {
            this.setNodeState(runtime, 'BUSY');
            const cfg = runtime.node.config as { speedMetersPerSecond?: number; lengthMeters?: number };
            const speed = cfg.speedMetersPerSecond ?? 0.5;
            const length = cfg.lengthMeters ?? 10;
            const transitTimePerItem = Math.max(0.1, (length / speed) / Math.max(1, runtime.maxBuffer));
            this.scheduleEvent(transitTimePerItem, runtime.node.id, 'CONVEYOR_TRANSFER_COMPLETE');
          } else if (runtime.bufferCans === 0) {
            this.setNodeState(runtime, 'IDLE');
          }
        } else {
          this.setNodeState(runtime, 'IDLE');
        }
        break;
      }

      case 'LABELER_CYCLE_COMPLETE': {
        const cfg = runtime.node.config as {
          maxSpeedUnitsPerMinute?: number;
          opticalInspectionFailRate?: number;
        };
        const speedPerMin = cfg.maxSpeedUnitsPerMinute ?? 40;
        const failRate = (cfg.opticalInspectionFailRate ?? 0.2) / 100;

        if (runtime.bufferCans > 0) {
          runtime.bufferCans--;
          const failed = this.rng.next() < failRate;
          if (failed) {
            runtime.unitsScrapped++;
          } else if (!this.hasDownstream(runtime.node.id) || this.routeUnits(runtime, 1) > 0) {
            runtime.unitsProduced++;
          } else {
            // Was: downstream.bufferCans++ with no capacity check -- measured
            // at 17,351 in a buffer of 100. Now the labeled can waits here and
            // the labeler blocks, the same discipline as the filler.
            runtime.heldUnits = 1;
            this.unblockUpstreamIfWaiting(runtime.node.id);
            this.setNodeState(runtime, 'BLOCKED');
            break;
          }

          // Unblock upstream machine if it was waiting on this buffer
          this.unblockUpstreamIfWaiting(runtime.node.id);

          // Continue labeling next can if available
          if (runtime.bufferCans > 0) {
            this.setNodeState(runtime, 'BUSY');
            const cycleSec = 60 / speedPerMin;
            this.scheduleEvent(cycleSec, runtime.node.id, 'LABELER_CYCLE_COMPLETE');
          } else {
            this.setNodeState(runtime, 'STARVED');
          }
        } else {
          this.setNodeState(runtime, 'STARVED');
        }
        break;
      }

      case 'PALLETIZER_CYCLE_COMPLETE': {
        const cfg = runtime.node.config as {
          containersPerLayer?: number;
          cycleSecondsPerLayer?: number;
        };
        const cpl = cfg.containersPerLayer ?? 20;

        if (runtime.bufferCans >= cpl) {
          runtime.bufferCans -= cpl;
          runtime.unitsProduced += cpl;
          this.unblockUpstreamIfWaiting(runtime.node.id);

          if (runtime.bufferCans >= cpl) {
            this.setNodeState(runtime, 'BUSY');
            this.scheduleEvent(
              cfg.cycleSecondsPerLayer ?? 30,
              runtime.node.id,
              'PALLETIZER_CYCLE_COMPLETE'
            );
          } else {
            this.setNodeState(runtime, 'STARVED');
          }
        } else {
          this.setNodeState(runtime, 'STARVED');
        }
        break;
      }

      case 'CONTRACT_CYCLE_COMPLETE': {
        this.handleContractCycle(runtime);
        break;
      }

      default:
        break;
    }
  }

  /**
   * No inbound pipe that carries units. A unit fed only liquid it does not
   * consume (a designed cycle unit with a feedstock pipe) still starts on its
   * own; before, any inbound pipe made it wait forever for units.
   */
  private drawExponential(mean: number): number {
    // Never exactly 0 or infinite: u is in [0, 1).
    return -Math.log(1 - this.failureRng.next()) * mean;
  }

  /**
   * A breakdown: the machine stops, the cycle it was in pauses where it is,
   * and it comes back after an exponentially distributed repair.
   */
  private handleFailure(runtime: InternalNodeRuntime): void {
    if (!runtime.failure) return;
    runtime.beforeFailure = runtime.state;
    if (runtime.pending) {
      this.cancelled.add(runtime.pending.id);
      runtime.interrupted = {
        type: runtime.pending.type,
        remainingSeconds: Math.max(0, runtime.pending.timeSeconds - this.currentTimeSeconds)
      };
      delete runtime.pending;
    }
    this.setNodeState(runtime, 'FAILED');
    this.scheduleEvent(this.drawExponential(runtime.failure.mttrSeconds), runtime.node.id, 'MACHINE_REPAIRED');
  }

  /** Back from repair: finish the interrupted cycle, or pick up where it stood. */
  private handleRepair(runtime: InternalNodeRuntime): void {
    if (!runtime.failure) return;
    const before = runtime.beforeFailure ?? 'IDLE';
    delete runtime.beforeFailure;
    const interrupted = runtime.interrupted;
    delete runtime.interrupted;

    if (interrupted) {
      this.setNodeState(runtime, 'BUSY');
      this.scheduleEvent(interrupted.remainingSeconds, runtime.node.id, interrupted.type);
    } else {
      // It was waiting (starved, blocked or idle): wait again, and take any
      // work that arrived while it was down.
      this.setNodeState(runtime, before === 'BUSY' ? 'IDLE' : before);
      if (runtime.state === 'BLOCKED') this.resumeBlocked(runtime);
      else if (runtime.node.kind === 'ROTARY_FILLER') this.startFillerCycle(runtime);
      else this.triggerDownstreamMachine(runtime);
    }
    this.scheduleEvent(this.drawExponential(runtime.failure.mtbfSeconds), runtime.node.id, 'MACHINE_FAILURE');
  }

  private isSourceNode(nodeId: string): boolean {
    return !this.discreteEdges.some((e) => e.targetNodeId === nodeId);
  }

  /**
   * Starts a filler cycle. A filler fed by a pipe draws one cycle's product
   * from its bowl first, and waits (starved) until the bowl has it; a filler
   * with no feed pipe fills on its own, as before.
   */
  private startFillerCycle(runtime: InternalNodeRuntime): void {
    if (runtime.state === 'FAILED') return;
    const cfg = runtime.node.config as { fillTimePerCycleSeconds?: number; indexTimePerCycleSeconds?: number };
    const cycleTime = (cfg.fillTimePerCycleSeconds ?? 10) + (cfg.indexTimePerCycleSeconds ?? 2);
    if (this.fluid.isPipeFedFiller(runtime.node.id)) {
      const need = fillerDemandGallons(runtime.node);
      if (this.fluid.bowl(runtime.node.id) + 1e-6 < need) {
        this.setNodeState(runtime, 'STARVED');
        return;
      }
      this.fluid.draw(runtime.node.id, need);
    }
    this.setNodeState(runtime, 'BUSY');
    this.scheduleEvent(cycleTime, runtime.node.id, 'FILLER_CYCLE_COMPLETE');
  }

  /** One step of the liquid, then the states it implies and the fillers it can restart. */
  private handleFluidTick(): void {
    this.fluid.tick(this.currentTimeSeconds, SimulationEngine.FLUID_DT);
    for (const unit of this.fluid.units.values()) {
      const runtime = this.nodes.get(unit.id);
      if (!runtime) continue;
      if (unit.role === 'filler') {
        if (runtime.state === 'STARVED') this.startFillerCycle(runtime);
        continue;
      }
      this.setNodeState(runtime, this.fluid.stateOf(unit));
      if (unit.role === 'reactor') runtime.unitsProduced = unit.batches;
    }
    this.scheduleEvent(SimulationEngine.FLUID_DT, '__fluid__', 'FLUID_TICK');
  }

  /**
   * Generic handler for a contract-defined unit operation in DISCRETE_CYCLE
   * mode. Deliberately mirrors the filler's backpressure discipline rather than
   * the labeler's: capacity is checked before any transfer, and the node blocks
   * when downstream is full. A contract-defined node therefore participates in
   * bottleneck analysis on the same terms as a built-in one.
   */
  private handleContractCycle(runtime: InternalNodeRuntime): void {
    const evaluation = runtime.contractEval;
    if (!evaluation || evaluation.behavior.mode !== 'DISCRETE_CYCLE') return;

    const { cycleSeconds, unitsPerCycle, scrapFraction } = evaluation.behavior;
    const isSource = this.isSourceNode(runtime.node.id);

    // Determine how many units this cycle can act on.
    let available: number;
    if (isSource) {
      available = unitsPerCycle;
    } else {
      if (runtime.bufferCans <= 0) {
        this.setNodeState(runtime, 'STARVED');
        return;
      }
      available = Math.min(unitsPerCycle, runtime.bufferCans);
      runtime.bufferCans -= available;
    }
    // Consuming input frees room upstream. Without this a filler blocked
    // behind a contract node stayed blocked for the rest of the run.
    if (!isSource) this.unblockUpstreamIfWaiting(runtime.node.id);

    // Scrap is a deterministic fraction, not a coin flip, so that a
    // contract-defined node does not reintroduce the nondeterminism that the
    // hardcoded handlers suffer from.
    const scrapped = Math.floor(available * scrapFraction);
    const produced = available - scrapped;
    runtime.unitsScrapped += scrapped;

    if (this.hasDownstream(runtime.node.id)) {
      const transferred = this.routeUnits(runtime, produced);
      runtime.unitsProduced += transferred;

      const heldBack = produced - transferred;
      if (heldBack > 0) {
        // Downstream is full: hold the remainder and block, exactly as the
        // filler does. This is what makes backpressure propagate.
        runtime.heldUnits += heldBack;
        this.setNodeState(runtime, 'BLOCKED');
      } else {
        this.setNodeState(runtime, 'BUSY');
      }
    } else {
      // Terminal node: everything produced leaves the system.
      runtime.unitsProduced += produced;
      this.setNodeState(runtime, 'BUSY');
    }

    if (runtime.state === 'BUSY') {
      this.scheduleEvent(cycleSeconds, runtime.node.id, 'CONTRACT_CYCLE_COMPLETE');
    }
  }

  private triggerDownstreamMachine(downstream: InternalNodeRuntime): void {
    if (downstream.state === 'FAILED') return;
    if (downstream.contractEval?.behavior.mode === 'DISCRETE_CYCLE') {
      if (downstream.bufferCans > 0 && downstream.state !== 'BUSY') {
        this.setNodeState(downstream, 'BUSY');
        this.scheduleEvent(
          downstream.contractEval.behavior.cycleSeconds,
          downstream.node.id,
          'CONTRACT_CYCLE_COMPLETE'
        );
      }
      return;
    }

    if (downstream.node.kind === 'CONVEYOR' && downstream.bufferCans > 0) {
      if (downstream.state !== 'BUSY') {
        this.setNodeState(downstream, 'BUSY');
        const cfg = downstream.node.config as { speedMetersPerSecond?: number; lengthMeters?: number };
        const speed = cfg.speedMetersPerSecond ?? 0.5;
        const length = cfg.lengthMeters ?? 10;
        const transitTimePerItem = Math.max(0.1, (length / speed) / Math.max(1, downstream.maxBuffer));
        this.scheduleEvent(transitTimePerItem, downstream.node.id, 'CONVEYOR_TRANSFER_COMPLETE');
      }
    } else if (downstream.node.kind === 'LABELER' && downstream.bufferCans > 0) {
      this.setNodeState(downstream, 'BUSY');
      const cfg = downstream.node.config as { maxSpeedUnitsPerMinute?: number };
      const speed = cfg.maxSpeedUnitsPerMinute ?? 40;
      this.scheduleEvent(60 / speed, downstream.node.id, 'LABELER_CYCLE_COMPLETE');
    } else if (downstream.node.kind === 'PALLETIZER') {
      const cfg = downstream.node.config as {
        containersPerLayer?: number;
        cycleSecondsPerLayer?: number;
      };
      const cpl = cfg.containersPerLayer ?? 20;
      if (downstream.bufferCans >= cpl) {
        this.setNodeState(downstream, 'BUSY');
        this.scheduleEvent(
          cfg.cycleSecondsPerLayer ?? 30,
          downstream.node.id,
          'PALLETIZER_CYCLE_COMPLETE'
        );
      }
    }
  }

  private unblockUpstreamIfWaiting(currentNodeId: string): void {
    for (const edge of this.discreteEdges) {
      if (edge.targetNodeId !== currentNodeId) continue;
      const upstream = this.nodes.get(edge.sourceNodeId);
      if (upstream && upstream.state === 'BLOCKED') this.resumeBlocked(upstream);
    }
  }

  /**
   * Gives a blocked node another chance to push its held output downstream,
   * and restarts it if everything got out.
   * Every kind is handled, including contract nodes, so a node is never BUSY
   * without an event scheduled.
   */
  private resumeBlocked(upstream: InternalNodeRuntime): void {
    if (upstream.state === 'FAILED') return;
    const id = upstream.node.id;

    if (upstream.node.kind === 'ROTARY_FILLER') {
      upstream.bufferCans -= this.routeUnits(upstream, upstream.bufferCans);
      if (upstream.bufferCans > 0) return; // still full downstream: stay blocked
      this.startFillerCycle(upstream);
      return;
    }

    if (upstream.node.kind === 'CONVEYOR') {
      this.setNodeState(upstream, 'BUSY');
      const cfg = upstream.node.config as { speedMetersPerSecond?: number; lengthMeters?: number };
      const transit = Math.max(
        0.1,
        (cfg.lengthMeters ?? 10) / (cfg.speedMetersPerSecond ?? 0.5) / Math.max(1, upstream.maxBuffer)
      );
      this.scheduleEvent(transit, id, 'CONVEYOR_TRANSFER_COMPLETE');
      return;
    }

    // Labeler and contract nodes hold finished units in heldUnits.
    if (upstream.heldUnits > 0) {
      const moved = this.routeUnits(upstream, upstream.heldUnits);
      upstream.heldUnits -= moved;
      upstream.unitsProduced += moved;
      if (upstream.heldUnits > 0) return;
    }

    if (upstream.node.kind === 'LABELER') {
      if (upstream.bufferCans > 0) {
        this.setNodeState(upstream, 'BUSY');
        const cfg = upstream.node.config as { maxSpeedUnitsPerMinute?: number };
        this.scheduleEvent(60 / (cfg.maxSpeedUnitsPerMinute ?? 40), id, 'LABELER_CYCLE_COMPLETE');
      } else {
        this.setNodeState(upstream, 'STARVED');
      }
      return;
    }

    if (upstream.contractEval?.behavior.mode === 'DISCRETE_CYCLE') {
      if (this.isSourceNode(id) || upstream.bufferCans > 0) {
        this.setNodeState(upstream, 'BUSY');
        this.scheduleEvent(upstream.contractEval.behavior.cycleSeconds, id, 'CONTRACT_CYCLE_COMPLETE');
      } else {
        this.setNodeState(upstream, 'STARVED');
      }
    }
  }

  private downstreamRuntimes(nodeId: string): InternalNodeRuntime[] {
    const out: InternalNodeRuntime[] = [];
    for (const e of this.discreteEdges) {
      if (e.sourceNodeId !== nodeId) continue;
      const target = this.nodes.get(e.targetNodeId);
      if (target) out.push(target);
    }
    return out;
  }

  private hasDownstream(nodeId: string): boolean {
    return this.discreteEdges.some((e) => e.sourceNodeId === nodeId && this.nodes.has(e.targetNodeId));
  }

  /**
   * Moves up to `count` units from `from` into its downstream buffers and
   * returns how many moved. Every transfer is capacity-checked here, so no
   * handler can overfill a buffer.
   *
   * With several outgoing edges, units are dealt round-robin to targets that
   * have room.
   */
  private routeUnits(from: InternalNodeRuntime, count: number): number {
    const targets = this.downstreamRuntimes(from.node.id);
    if (targets.length === 0 || count <= 0) return 0;

    let cursor = this.routeCursor.get(from.node.id) ?? 0;
    let moved = 0;
    let misses = 0;
    const touched = new Set<InternalNodeRuntime>();
    while (moved < count && misses < targets.length) {
      const target = targets[cursor % targets.length]!;
      cursor++;
      if (target.bufferCans < target.maxBuffer) {
        target.bufferCans++;
        moved++;
        misses = 0;
        touched.add(target);
      } else {
        misses++;
      }
    }
    this.routeCursor.set(from.node.id, cursor % targets.length);

    for (const target of touched) {
      if (target.state === 'STARVED' || target.state === 'IDLE') this.triggerDownstreamMachine(target);
    }
    return moved;
  }

  private recordTelemetrySnapshot(): void {
    for (const r of this.nodes.values()) {
      this.telemetry.push({
        timeSeconds: this.currentTimeSeconds,
        nodeId: r.node.id,
        state: r.state,
        unitsProduced: r.unitsProduced,
        unitsScrapped: r.unitsScrapped,
        bufferLevel: r.bufferCans,
        instantaneousRatePerMin:
          this.currentTimeSeconds > 0 ? (r.unitsProduced / this.currentTimeSeconds) * 60 : 0,
        ...this.fluidTelemetry(r.node.id)
      });
    }
  }

  private fluidTelemetry(nodeId: string): Partial<NodeTelemetrySnapshot> {
    const u = this.fluid.units.get(nodeId);
    if (!u) return {};
    return {
      levelGallons: Math.round(u.level * 10) / 10,
      ...(Number.isFinite(u.capacity) ? { levelFraction: Math.min(1, u.level / u.capacity) } : {}),
      flowGpm: Math.round(u.outRate * 60 * 10) / 10,
      ...(u.phase ? { phase: u.phase } : {})
    };
  }

  private buildSimulationResult(
    durationMinutes: number,
    wallClockExecutionTimeMs: number
  ): SimulationResult {
    const nodeReports: Record<string, MachineOeeReport> = {};
    const totalSimTime = durationMinutes * 60;
    let totalPackaged = 0;
    let totalScrapped = 0;
    let totalFluidDelivered = 0;

    for (const [nodeId, r] of this.nodes.entries()) {
      // Every second is now attributed to a state, so the total is the run.
      const totalTime = totalSimTime;
      const operatingTime = r.busyTime;
      const plannedProductionTime = totalTime - r.downTime;

      const availability = plannedProductionTime > 0 ? operatingTime / plannedProductionTime : 1.0;
      const totalUnits = r.unitsProduced + r.unitsScrapped;
      const quality = totalUnits > 0 ? r.unitsProduced / totalUnits : 1.0;

      // Performance based on theoretical maximum capacity
      let theoreticalSpeedPerMin = 40;
      if (r.node.kind === 'ROTARY_FILLER') {
        const cfg = r.node.config as {
          nozzleCount?: number;
          fillTimePerCycleSeconds?: number;
          indexTimePerCycleSeconds?: number;
        };
        const nozzles = cfg.nozzleCount ?? 10;
        const cycle = (cfg.fillTimePerCycleSeconds ?? 10) + (cfg.indexTimePerCycleSeconds ?? 2);
        theoreticalSpeedPerMin = (nozzles / cycle) * 60;
      } else if (r.node.kind === 'LABELER') {
        const cfg = r.node.config as { maxSpeedUnitsPerMinute?: number };
        theoreticalSpeedPerMin = cfg.maxSpeedUnitsPerMinute ?? 40;
      } else if (r.node.kind === 'PALLETIZER') {
        const cfg = r.node.config as { containersPerLayer?: number; cycleSecondsPerLayer?: number };
        theoreticalSpeedPerMin = ((cfg.containersPerLayer ?? 20) / (cfg.cycleSecondsPerLayer ?? 30)) * 60;
      } else if (r.node.kind === 'CONVEYOR') {
        const cfg = r.node.config as { speedMetersPerSecond?: number; lengthMeters?: number };
        const perItem = Math.max(0.1, (cfg.lengthMeters ?? 10) / (cfg.speedMetersPerSecond ?? 0.5) / Math.max(1, r.maxBuffer));
        theoreticalSpeedPerMin = 60 / perItem;
      } else if (r.contractEval?.behavior.mode === 'DISCRETE_CYCLE') {
        theoreticalSpeedPerMin = r.contractEval.behavior.unitsPerMinute;
      }

      const theoreticalMaxUnits = (operatingTime / 60) * theoreticalSpeedPerMin;
      // Liquid units have no container rate to compare against.
      const fluidUnit = this.fluid.units.get(nodeId);
      const isLiquid = Boolean(fluidUnit && fluidUnit.role !== 'filler');
      const performance = isLiquid
        ? 1.0
        : theoreticalMaxUnits > 0
          ? Math.min(1.0, totalUnits / theoreticalMaxUnits)
          : 1.0;

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
        ...(isLiquid && fluidUnit
          ? {
              fluid: {
                receivedGallons: Math.round(fluidUnit.receivedGallons * 10) / 10,
                deliveredGallons: Math.round(fluidUnit.deliveredGallons * 10) / 10,
                levelGallons: Math.round(fluidUnit.level * 10) / 10,
                ...(fluidUnit.role === 'reactor' ? { batches: fluidUnit.batches } : {})
              }
            }
          : {})
      };
      if (fluidUnit) totalFluidDelivered += fluidUnit.leftLineGallons;

      // Output is what leaves the line: the sum over every terminal node that
      // makes units. Liquid leaving the line is reported in gallons instead.
      if (!this.hasDownstream(nodeId) && !isLiquid) {
        totalPackaged += r.unitsProduced;
      }
      totalScrapped += r.unitsScrapped;
    }

    return {
      seed: this.rng.seed,
      durationMinutes,
      simulatedTimeSeconds: totalSimTime,
      wallClockExecutionTimeMs: Math.round(wallClockExecutionTimeMs * 100) / 100,
      totalUnitsPackaged: totalPackaged,
      totalUnitsScrapped: totalScrapped,
      averageLineThroughputUnitsPerMin:
        durationMinutes > 0 ? Math.round((totalPackaged / durationMinutes) * 10) / 10 : 0,
      totalFluidDeliveredGallons: Math.round(totalFluidDelivered * 10) / 10,
      nodeReports,
      telemetryLog: this.telemetry
    };
  }
}

/**
 * High-level runner to execute a simulation scenario.
 */
export function simulateProcess(
  graph: ProcessGraph,
  durationMinutes: number,
  options: { seed?: number } = {}
): SimulationResult {
  const engine = new SimulationEngine(graph, options);
  return engine.run(durationMinutes);
}
