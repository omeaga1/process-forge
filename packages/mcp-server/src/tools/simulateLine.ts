import { bottleneckAdvice } from './bottleneckAdvice.js';
import { validateProcessGraph, type ProcessGraph } from '@process-forge/protocol';
import { SimulationEngine } from '@process-forge/simulation-core';
import { AVAILABLE_TEMPLATES } from '../templates.js';

export interface SimulateLineParams {
  graph?: ProcessGraph;
  templateName?: string;
  durationMinutes?: number;
}

export interface SimulationResultPayload {
  success: boolean;
  facilityName: string;
  durationMinutes: number;
  simulatedSeconds: number;
  totalUnitsPackaged: number;
  totalUnitsScrapped: number;
  overallThroughputPpm: number;
  identifiedBottleneckNodeId: string;
  identifiedBottleneckMachine: string;
  machineMetrics: Array<{
    nodeId: string;
    machineName: string;
    produced: number;
    scrapped: number;
    starvedSeconds: number;
    blockedSeconds: number;
    /** Reactors, tanks, pumps: gallons in, out and held at the end. */
    liquid?: { receivedGallons: number; deliveredGallons: number; levelGallons: number; batches?: number };
  }>;
  engineeringDiagnosis: string;
}

export function executeSimulateLine(params: SimulateLineParams): SimulationResultPayload {
  let graphToRun: ProcessGraph;

  if (params.graph) {
    graphToRun = params.graph;
  } else if (params.templateName && AVAILABLE_TEMPLATES[params.templateName]) {
    graphToRun = AVAILABLE_TEMPLATES[params.templateName]!;
  } else {
    graphToRun = AVAILABLE_TEMPLATES['sherwin-williams-paint-line']!;
  }

  const duration = params.durationMinutes && params.durationMinutes > 0 ? params.durationMinutes : 30;

  // Run the deterministic engine
  const engine = new SimulationEngine(graphToRun);
  const result = engine.run(duration);

  // Validate topology and calculate bottlenecks
  const validation = validateProcessGraph(graphToRun);
  const bottleneckId = validation.bottlenecks.bottleneckNodeId ?? 'unknown-bottleneck';
  const bottleneckNode = graphToRun.nodes.find((n) => n.id === bottleneckId);
  const bottleneckName = bottleneckNode ? bottleneckNode.name : bottleneckId;

  // Compile machine metrics
  const machineMetrics = graphToRun.nodes.map((node) => {
    const report = result.nodeReports[node.id];
    return {
      nodeId: node.id,
      machineName: node.name,
      produced: report?.unitsProduced ?? 0,
      scrapped: report?.unitsScrapped ?? 0,
      starvedSeconds: Math.round((report?.starvedTimeSeconds ?? 0) * 10) / 10,
      blockedSeconds: Math.round((report?.blockedTimeSeconds ?? 0) * 10) / 10,
      ...(report?.fluid ? { liquid: report.fluid } : {})
    };
  });

  const liquid = result.totalFluidDeliveredGallons > 0 ? ` ${result.totalFluidDeliveredGallons} gal of liquid left the line from units with no outlet.` : '';
  const diagnosis = `Simulated ${duration} minutes: ${result.totalUnitsPackaged} units finished, ${result.averageLineThroughputUnitsPerMin}/min on average.${liquid} ${bottleneckAdvice(bottleneckNode, validation.bottlenecks.maximumSystemThroughputUnitsPerMin)}`;

  return {
    success: true,
    facilityName: (graphToRun.metadata?.facility as string) || graphToRun.name,
    durationMinutes: duration,
    simulatedSeconds: result.simulatedTimeSeconds,
    totalUnitsPackaged: result.totalUnitsPackaged,
    totalUnitsScrapped: result.totalUnitsScrapped,
    overallThroughputPpm: result.averageLineThroughputUnitsPerMin,
    identifiedBottleneckNodeId: bottleneckId,
    identifiedBottleneckMachine: bottleneckName,
    machineMetrics,
    engineeringDiagnosis: diagnosis
  };
}
