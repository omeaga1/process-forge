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
    | 'MACHINE_REPAIRED'
    | 'FEED_ARRIVAL';
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
  /** Liquid units: °C of what the unit holds (a pass-through unit: what it last sent). */
  temperatureC?: number;
  /** Batch reactors: where the batch is. HEATING: coming up to reaction temperature on its jacket. */
  phase?: 'FILLING' | 'HEATING' | 'REACTING' | 'DISCHARGING';
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
  /** Feeds and outlets (TERMINAL nodes): what came in or went out there. */
  terminal?: TerminalReport;
  /** Liquid units only. */
  fluid?: {
    receivedGallons: number;
    deliveredGallons: number;
    levelGallons: number;
    /** Batch reactors: batches completed (fully discharged). */
    batches?: number;
    /** °C of what the unit holds at the end of the run. */
    temperatureC: number;
    /** Volume-weighted °C of everything it sent on. Absent if it sent nothing. */
    averageOutletTemperatureC?: number;
    /** Designed units: gallons no outlet took (vented, evaporated). */
    lostGallons?: number;
  };
  /** Heat exchangers with a target temperature, batch reactors with a reaction temperature, designed units with a duty. */
  heat?: HeatReport;
  /** Designed continuous units: how the design held up at the conditions it actually saw. */
  designedUnit?: DesignedUnitReport;
}

export interface DesignedUnitReport {
  /** Times it was evaluated at live inlet conditions (once per second of flow). */
  liveEvaluations: number;
  /** Constraints broken at some point in the run, with for how long. ERROR ones first. */
  brokenConstraints: { id: string; message: string; severity: 'ERROR' | 'WARNING'; seconds: number }[];
  /** The first live evaluation that failed (it kept its last good values), and for how long. */
  evaluationError?: string;
  evaluationErrorSeconds?: number;
  /** Its capacity at the end of the run, gal/min, when it declares one. */
  capacityGpm?: number;
}

export interface HeatReport {
  /** Heat moved over the run, kWh (heating and cooling both count). */
  energyKwh: number;
  /** Heat exchangers: the outlet temperature it is set to reach. */
  targetTemperatureC?: number;
  /** Heat exchangers: average duty while liquid was flowing through, kW. */
  averageDutyKw?: number;
  /** Heat exchangers: the rated duty, kW. Absent if none is set (unlimited). */
  ratedDutyKw?: number;
  /** Heat exchangers: share of flowing time the rated duty was too small to reach the target. */
  dutyLimitedPercentage?: number;
  /** Batch reactors: the jacket duty, kW. Absent if none is set (batches reach temperature at once). */
  jacketDutyKw?: number;
  /** Batch reactors: time spent bringing batches to reaction temperature. */
  heatingTimeSeconds?: number;
}

/** One feed, product, byproduct or waste arrow's totals over the run. */
export interface TerminalReport {
  nodeId: string;
  name: string;
  role: 'feed' | 'product' | 'byproduct' | 'waste';
  material: string;
  carries: 'liquid' | 'items';
  /** Items supplied (a feed) or received (an outlet). */
  units: number;
  /** Gallons supplied or received. */
  gallons: number;
  /** Liquid outlets: volume-weighted °C of what arrived. Liquid feeds: °C supplied. */
  temperatureC?: number;
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
  /**
   * Liquid output, in gallons: what reached a product outlet, plus what left
   * the line from a unit with no outlet pipe.
   */
  totalFluidDeliveredGallons: number;
  /** Every feed and outlet on the flowsheet, with its totals. Empty when there are none. */
  terminals: TerminalReport[];
  nodeReports: Record<string, MachineOeeReport>;
  telemetryLog: NodeTelemetrySnapshot[];
}
