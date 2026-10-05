export type MachineOperationalState = 'IDLE' | 'BUSY' | 'BLOCKED' | 'STARVED' | 'FAILED';

export interface SimEvent {
  id: string;
  timeSeconds: number;
  nodeId: string;
  type:
    | 'CYCLE_COMPLETE'
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
  /** Liquid units: kg held. */
  levelKg?: number;
  /** Liquid units: the level as a fraction of capacity, 0..1. */
  levelFraction?: number;
  /** Liquid units: gallons per minute leaving right now. */
  flowGpm?: number;
  /** Liquid units: °C of what the unit holds (a pass-through unit: what it last sent). */
  temperatureC?: number;
  /** Designed batch units: the name of the phase it is in. */
  phaseName?: string;
  /** Batch units whose phases are named Filling, Heating, Reacting, Discharging (the built-in batch reactor): the phase, for the canvas. */
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
    /** The same in kg: mass is what the engine conserves; gallons follow from each parcel's density. */
    receivedKg: number;
    deliveredKg: number;
    levelKg: number;
    /** Batch units: batches completed (fully discharged). */
    batches?: number;
    /** °C of what the unit holds at the end of the run. */
    temperatureC: number;
    /** °C of everything it sent on, mixed by heat content. Absent if it sent nothing. */
    averageOutletTemperatureC?: number;
    /** Designed units: gallons no outlet took (vented, evaporated). */
    lostGallons?: number;
    lostKg?: number;
    /** Mass fractions by component of what it holds at the end (a pass-through unit: what it last sent). */
    composition?: Record<string, number>;
    /** Mass fractions of everything it sent on. */
    averageOutletComposition?: Record<string, number>;
  };
  /** Units that state a duty, and batch units that heat or cool their batch. */
  heat?: HeatReport;
  /** Liquid units: how the unit's contract held up at the conditions it actually saw. */
  designedUnit?: DesignedUnitReport;
}

export interface DesignedUnitReport {
  /** Times it was evaluated: at live inlet conditions (once per second of flow), or at each batch phase's start. */
  liveEvaluations: number;
  /** Constraints broken at some point in the run, with for how long. ERROR ones first. */
  brokenConstraints: { id: string; message: string; severity: 'ERROR' | 'WARNING'; seconds: number }[];
  /** The first live evaluation that failed (it kept its last good values), and for how long. */
  evaluationError?: string;
  evaluationErrorSeconds?: number;
  /** Its capacity at the end of the run, gal/min, when it declares one. */
  capacityGpm?: number;
  /** Designed batch units: seconds spent in each phase over the run. */
  secondsByPhase?: Record<string, number>;
  /** Reactions that ran short of a co-reactant at some point (they stopped when it ran out). */
  shortReactions?: string[];
  /**
   * Batch HOLD phases whose duty × time did not match the heat the batch took
   * (m·cp·ΔT of what was in the vessel) by more than 5%: the worst batch, and
   * how many batches. The phase's time does not follow from the batch's own
   * properties; write it from batch.massKg and batch.cpKjPerKgK.
   */
  heatBalance?: { phase: string; deliveredKwh: number; neededKwh: number; batches: number }[];
}

export interface HeatReport {
  /** Heat moved over the run, kWh (heating and cooling both count). */
  energyKwh: number;
  /** Continuous units with a duty: average duty while liquid was flowing through, kW. */
  averageDutyKw?: number;
  /** Batch units: time spent in phases that change the batch's temperature. */
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
  /** kg supplied or received. */
  kg: number;
  /** Liquid outlets: °C of what arrived, mixed by heat content. Liquid feeds: °C supplied. */
  temperatureC?: number;
  /** Liquid outlets and feeds with a composition: kg of each component received or supplied. */
  componentsKg?: Record<string, number>;
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
  /** The same liquid output in kg. */
  totalFluidDeliveredKg: number;
  /** Every feed and outlet on the flowsheet, with its totals. Empty when there are none. */
  terminals: TerminalReport[];
  nodeReports: Record<string, MachineOeeReport>;
  telemetryLog: NodeTelemetrySnapshot[];
}
