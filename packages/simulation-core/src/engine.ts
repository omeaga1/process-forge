import type { ProcessGraph, ProcessNode } from '@process-forge/protocol';
import { PriorityQueue } from './priority-queue.js';
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
  bufferCans: number;
  maxBuffer: number;
  fluidLevelGallons: number;
}

export class SimulationEngine {
  private queue = new PriorityQueue<SimEvent>();
  private currentTimeSeconds = 0;
  private nodes = new Map<string, InternalNodeRuntime>();
  private telemetry: NodeTelemetrySnapshot[] = [];
  private eventCounter = 0;

  constructor(private readonly graph: ProcessGraph) {
    this.initializeNodes();
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
      }

      this.nodes.set(node.id, {
        node,
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
        fluidLevelGallons: initialFluid
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
    this.queue.enqueue(
      {
        id: `evt-${++this.eventCounter}`,
        timeSeconds,
        nodeId,
        type,
        payload
      },
      timeSeconds
    );
  }

  private setNodeState(runtime: InternalNodeRuntime, newState: MachineOperationalState): void {
    if (runtime.state === newState) return;

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

    runtime.state = newState;
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
        this.setNodeState(runtime, 'BUSY');
        const cfg = runtime.node.config as {
          fillTimePerCycleSeconds?: number;
          indexTimePerCycleSeconds?: number;
        };
        const cycleTime = (cfg.fillTimePerCycleSeconds ?? 10) + (cfg.indexTimePerCycleSeconds ?? 2);
        this.scheduleEvent(cycleTime, runtime.node.id, 'FILLER_CYCLE_COMPLETE');
      } else if (runtime.node.kind === 'LABELER') {
        this.setNodeState(runtime, 'STARVED');
      } else if (runtime.node.kind === 'PALLETIZER') {
        this.setNodeState(runtime, 'STARVED');
      }
    }

    // Main discrete-event loop
    while (!this.queue.isEmpty()) {
      const event = this.queue.dequeue();
      if (!event || event.timeSeconds > maxTimeSeconds) {
        break;
      }

      this.currentTimeSeconds = event.timeSeconds;
      this.handleEvent(event);

      // Record periodic telemetry snapshot every 60 simulation seconds
      if (Math.floor(this.currentTimeSeconds) % 60 === 0) {
        this.recordTelemetrySnapshot();
      }
    }

    this.currentTimeSeconds = maxTimeSeconds;

    // Finalize all remaining node state timers
    for (const runtime of this.nodes.values()) {
      this.setNodeState(runtime, 'IDLE');
    }

    const endWallClock = performance.now();

    return this.buildSimulationResult(durationMinutes, endWallClock - startWallClock);
  }

  private handleEvent(event: SimEvent): void {
    const runtime = this.nodes.get(event.nodeId);
    if (!runtime) return;

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
        const rejected = Math.random() < rejectRate ? 1 : 0;
        const produced = nozzles - rejected;

        runtime.unitsProduced += produced;
        runtime.unitsScrapped += rejected;

        // Route cans to downstream machine
        const downstream = this.findDownstreamRuntime(runtime.node.id);
        if (downstream) {
          if (downstream.bufferCans + produced <= downstream.maxBuffer) {
            downstream.bufferCans += produced;
            this.setNodeState(runtime, 'BUSY');

            // Wake downstream machine if it was starved
            if (downstream.state === 'STARVED' || downstream.state === 'IDLE') {
              this.triggerDownstreamMachine(downstream);
            }
          } else {
            // Downstream buffer full: machine is blocked
            this.setNodeState(runtime, 'BLOCKED');
          }
        }

        // Schedule next filler cycle if not blocked
        if (runtime.state === 'BUSY') {
          const cycleTime = (cfg.fillTimePerCycleSeconds ?? 10) + (cfg.indexTimePerCycleSeconds ?? 2);
          this.scheduleEvent(cycleTime, runtime.node.id, 'FILLER_CYCLE_COMPLETE');
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
          const failed = Math.random() < failRate;
          if (failed) {
            runtime.unitsScrapped++;
          } else {
            runtime.unitsProduced++;
            const downstream = this.findDownstreamRuntime(runtime.node.id);
            if (downstream) {
              downstream.bufferCans++;
              if (downstream.state === 'STARVED' || downstream.state === 'IDLE') {
                this.triggerDownstreamMachine(downstream);
              }
            }
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

      default:
        break;
    }
  }

  private triggerDownstreamMachine(downstream: InternalNodeRuntime): void {
    if (downstream.node.kind === 'LABELER' && downstream.bufferCans > 0) {
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
    for (const edge of this.graph.edges) {
      if (edge.targetNodeId === currentNodeId) {
        const upstream = this.nodes.get(edge.sourceNodeId);
        if (upstream && upstream.state === 'BLOCKED') {
          this.setNodeState(upstream, 'BUSY');
          if (upstream.node.kind === 'ROTARY_FILLER') {
            const cfg = upstream.node.config as {
              fillTimePerCycleSeconds?: number;
              indexTimePerCycleSeconds?: number;
            };
            const cycleTime =
              (cfg.fillTimePerCycleSeconds ?? 10) + (cfg.indexTimePerCycleSeconds ?? 2);
            this.scheduleEvent(cycleTime, upstream.node.id, 'FILLER_CYCLE_COMPLETE');
          }
        }
      }
    }
  }

  private findDownstreamRuntime(nodeId: string): InternalNodeRuntime | undefined {
    const edge = this.graph.edges.find((e) => e.sourceNodeId === nodeId);
    if (!edge) return undefined;
    return this.nodes.get(edge.targetNodeId);
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
          this.currentTimeSeconds > 0 ? (r.unitsProduced / this.currentTimeSeconds) * 60 : 0
      });
    }
  }

  private buildSimulationResult(
    durationMinutes: number,
    wallClockExecutionTimeMs: number
  ): SimulationResult {
    const nodeReports: Record<string, MachineOeeReport> = {};
    const totalSimTime = durationMinutes * 60;
    let totalPackaged = 0;
    let totalScrapped = 0;

    for (const [nodeId, r] of this.nodes.entries()) {
      const totalTime = Math.max(
        totalSimTime,
        r.busyTime + r.blockedTime + r.starvedTime + r.downTime
      );
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
      }

      const theoreticalMaxUnits = (operatingTime / 60) * theoreticalSpeedPerMin;
      const performance =
        theoreticalMaxUnits > 0 ? Math.min(1.0, totalUnits / theoreticalMaxUnits) : 1.0;

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
        unitsScrapped: r.unitsScrapped
      };

      if (r.node.kind === 'PALLETIZER' || !this.findDownstreamRuntime(nodeId)) {
        totalPackaged = Math.max(totalPackaged, r.unitsProduced);
      }
      totalScrapped += r.unitsScrapped;
    }

    return {
      durationMinutes,
      simulatedTimeSeconds: totalSimTime,
      wallClockExecutionTimeMs: Math.round(wallClockExecutionTimeMs * 100) / 100,
      totalUnitsPackaged: totalPackaged,
      totalUnitsScrapped: totalScrapped,
      averageLineThroughputUnitsPerMin:
        durationMinutes > 0 ? Math.round((totalPackaged / durationMinutes) * 10) / 10 : 0,
      nodeReports,
      telemetryLog: this.telemetry
    };
  }
}

/**
 * High-level runner to execute a simulation scenario.
 */
export function simulateProcess(graph: ProcessGraph, durationMinutes: number): SimulationResult {
  const engine = new SimulationEngine(graph);
  return engine.run(durationMinutes);
}
