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
    | 'CONTRACT_CYCLE_COMPLETE';
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
}

export interface SimulationResult {
  durationMinutes: number;
  simulatedTimeSeconds: number;
  wallClockExecutionTimeMs: number;
  totalUnitsPackaged: number;
  totalUnitsScrapped: number;
  averageLineThroughputUnitsPerMin: number;
  nodeReports: Record<string, MachineOeeReport>;
  telemetryLog: NodeTelemetrySnapshot[];
}
