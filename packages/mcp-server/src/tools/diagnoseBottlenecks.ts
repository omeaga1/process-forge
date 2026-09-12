import { validateProcessGraph, type ProcessGraph, type GraphDiagnostic } from '@process-forge/protocol';
import { AVAILABLE_TEMPLATES } from '../templates.js';

export interface DiagnoseBottlenecksParams {
  graph?: ProcessGraph;
  templateName?: string;
}

export interface DiagnosticReportPayload {
  success: boolean;
  graphName: string;
  totalNodes: number;
  totalEdges: number;
  isValidTopology: boolean;
  bottleneckNodeId: string;
  bottleneckMachineName: string;
  maxLineThroughputPpm: number;
  unbalancedFlows: Array<{
    sourceNode: string;
    targetNode: string;
    issue: string;
  }>;
  diagnostics: GraphDiagnostic[];
  actionableRecommendations: string[];
}

export function executeDiagnoseBottlenecks(params: DiagnoseBottlenecksParams): DiagnosticReportPayload {
  let graphToAudit: ProcessGraph;

  if (params.graph) {
    graphToAudit = params.graph;
  } else if (params.templateName && AVAILABLE_TEMPLATES[params.templateName]) {
    graphToAudit = AVAILABLE_TEMPLATES[params.templateName]!;
  } else {
    graphToAudit = AVAILABLE_TEMPLATES['sherwin-williams-paint-line']!;
  }

  const validation = validateProcessGraph(graphToAudit);
  const bottleneckId = validation.bottlenecks.bottleneckNodeId ?? 'unknown-bottleneck';
  const bottleneckNode = graphToAudit.nodes.find((n) => n.id === bottleneckId);
  const bottleneckName = bottleneckNode ? bottleneckNode.name : bottleneckId;

  // Build actionable recommendations based on findings
  const recommendations: string[] = [];

  if (validation.bottlenecks.bottleneckNodeId) {
    recommendations.push(
      `Primary Bottleneck at [${bottleneckName}]: Maximum speed is clamped at ${validation.bottlenecks.maximumSystemThroughputUnitsPerMin} units/min. Consider parallelizing this station or upgrading nozzle/label drive motors.`
    );
  }

  // Check for accumulation buffers
  const conveyorBuffers = graphToAudit.nodes.filter((n) => n.kind === 'CONVEYOR');
  if (conveyorBuffers.length === 0) {
    recommendations.push(
      'No accumulation buffers detected between filling and downstream packaging. Add an accumulation table to isolate filler micro-stoppages from packaging jams.'
    );
  } else {
    recommendations.push(
      `Conveyor accumulation capacity currently covers ~${conveyorBuffers.length * 48} units of transient surge buffer.`
    );
  }

  // Check mass balance across nodes
  const unbalancedFlows: Array<{ sourceNode: string; targetNode: string; issue: string }> = [];
  for (const diag of validation.diagnostics) {
    if (diag.severity === 'ERROR') {
      unbalancedFlows.push({
        sourceNode: diag.nodeId || 'Unknown',
        targetNode: 'Downstream',
        issue: diag.message
      });
    }
  }

  return {
    success: true,
    graphName: graphToAudit.name,
    totalNodes: graphToAudit.nodes.length,
    totalEdges: graphToAudit.edges.length,
    isValidTopology: validation.valid,
    bottleneckNodeId: bottleneckId,
    bottleneckMachineName: bottleneckName,
    maxLineThroughputPpm: validation.bottlenecks.maximumSystemThroughputUnitsPerMin,
    unbalancedFlows,
    diagnostics: validation.diagnostics,
    actionableRecommendations: recommendations
  };
}
