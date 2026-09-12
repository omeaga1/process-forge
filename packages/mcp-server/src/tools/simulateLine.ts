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
      blockedSeconds: Math.round((report?.blockedTimeSeconds ?? 0) * 10) / 10
    };
  });

  const diagnosis = `Simulation completed for ${duration} minutes. Identified primary line constraint at "${bottleneckName}" with maximum sustained processing capacity of ${validation.bottlenecks.maximumSystemThroughputUnitsPerMin} units/min. Upstream units accumulated backpressure while downstream units suffered from starvation. Recommended engineering action: size buffer accumulator or upgrade machine indexing speed.`;

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
