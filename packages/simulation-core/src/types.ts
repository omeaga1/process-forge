export type MachineOperationalState = 'IDLE' | 'BUSY' | 'BLOCKED' | 'STARVED' | 'FAILED';

export interface SimEvent {
  id: string;
  timeSeconds: number;
  nodeId: string;
  type:
    | 'REACTOR_CYCLE_START'
    | 'REACTOR_DISCHARGE_COMPLETE'
    | 'FILLER_CYCLE_START'
    | 'FILLER_CYCLE_COMPLETE'
    | 'CONVEYOR_TRANSFER_COMPLETE'
    | 'LABELER_CYCLE_COMPLETE'
    | 'PALLETIZER_CYCLE_COMPLETE'
    | 'CONTRACT_CYCLE_COMPLETE'
    | 'FLUID_TICK'
    | 'MACHINE_FAILURE'
    | 'MACHINE_REPAIRED';
  payload?: Record<string, unknown>;
}

export interface NodeTelemetrySnapshot {
  timeSeconds: number;
  nodeId: string;
  state: MachineOperationalState;
  unitsProduced: number;
  unitsScrapped: number;
  bufferLevel: number;
  instantaneousRatePerMin: number;
  /** Liquid units: gallons held (a tank's level, a reactor's contents). */
  levelGallons?: number;
  /** Liquid units: the level as a fraction of capacity, 0..1. */
  levelFraction?: number;
  /** Liquid units: gallons per minute leaving right now. */
  flowGpm?: number;
  /** Batch reactors: where the batch is. */
  phase?: 'FILLING' | 'REACTING' | 'DISCHARGING';
}

export interface MachineOeeReport {
  nodeId: string;
  availabilityPercentage: number;
  performancePercentage: number;
  qualityPercentage: number;
  overallOeePercentage: number;
  totalTimeSeconds: number;
  busyTimeSeconds: number;
  blockedTimeSeconds: number;
  starvedTimeSeconds: number;
  downTimeSeconds: number;
  unitsProduced: number;
  unitsScrapped: number;
  /** Liquid units only. */
  fluid?: {
    receivedGallons: number;
    deliveredGallons: number;
    levelGallons: number;
    /** Batch reactors: batches completed (fully discharged). */
    batches?: number;
  };
}

export interface SimulationResult {
  /**
   * The seed this run used. Pass it back to simulateProcess to replay the run
   * exactly. Present so that a reported result is reproducible by whoever
   * receives it, not only by whoever produced it.
   */
  seed: number;
  durationMinutes: number;
  simulatedTimeSeconds: number;
  wallClockExecutionTimeMs: number;
  totalUnitsPackaged: number;
  totalUnitsScrapped: number;
  averageLineThroughputUnitsPerMin: number;
  /** Liquid that left the line from a unit with no outlet pipe, in gallons. */
  totalFluidDeliveredGallons: number;
  nodeReports: Record<string, MachineOeeReport>;
  telemetryLog: NodeTelemetrySnapshot[];
}
