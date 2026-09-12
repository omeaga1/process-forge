import { z } from 'zod';
import { ProcessNodeSchema, type ProcessNode } from './nodes.js';
import { ProcessEdgeSchema } from './streams.js';

export const ProcessGraphSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  nodes: z.array(ProcessNodeSchema),
  edges: z.array(ProcessEdgeSchema),
  metadata: z.record(z.unknown()).default({})
});
export type ProcessGraph = z.infer<typeof ProcessGraphSchema>;

export type DiagnosticSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface GraphDiagnostic {
  severity: DiagnosticSeverity;
  nodeId?: string;
  edgeId?: string;
  code: string;
  message: string;
}

export interface BottleneckAnalysis {
  bottleneckNodeId: string | null;
  maximumSystemThroughputUnitsPerMin: number;
  utilizationByNode: Record<string, number>;
}

export interface GraphValidationResult {
  valid: boolean;
  diagnostics: GraphDiagnostic[];
  bottlenecks: BottleneckAnalysis;
}

/**
 * Validates a process simulation graph against physical and topological constraints.
 */
export function validateProcessGraph(graph: ProcessGraph): GraphValidationResult {
  const diagnostics: GraphDiagnostic[] = [];
  const nodeMap = new Map<string, ProcessNode>();

  for (const node of graph.nodes) {
    if (nodeMap.has(node.id)) {
      diagnostics.push({
        severity: 'ERROR',
        nodeId: node.id,
        code: 'DUPLICATE_NODE_ID',
        message: `Node with id "${node.id}" is defined more than once.`
      });
    }
    nodeMap.set(node.id, node);
  }

  // Edge validations
  for (const edge of graph.edges) {
    const sourceNode = nodeMap.get(edge.sourceNodeId);
    const targetNode = nodeMap.get(edge.targetNodeId);

    if (!sourceNode) {
      diagnostics.push({
        severity: 'ERROR',
        edgeId: edge.id,
        code: 'MISSING_SOURCE_NODE',
        message: `Edge "${edge.id}" references non-existent source node "${edge.sourceNodeId}".`
      });
      continue;
    }

    if (!targetNode) {
      diagnostics.push({
        severity: 'ERROR',
        edgeId: edge.id,
        code: 'MISSING_TARGET_NODE',
        message: `Edge "${edge.id}" references non-existent target node "${edge.targetNodeId}".`
      });
      continue;
    }

    const sourcePort = sourceNode.outputs.find((p) => p.id === edge.sourcePortId);
    const targetPort = targetNode.inputs.find((p) => p.id === edge.targetPortId);

    if (!sourcePort) {
      diagnostics.push({
        severity: 'ERROR',
        edgeId: edge.id,
        nodeId: sourceNode.id,
        code: 'MISSING_SOURCE_PORT',
        message: `Source port "${edge.sourcePortId}" not found on node "${sourceNode.name}".`
      });
    }

    if (!targetPort) {
      diagnostics.push({
        severity: 'ERROR',
        edgeId: edge.id,
        nodeId: targetNode.id,
        code: 'MISSING_TARGET_PORT',
        message: `Target port "${edge.targetPortId}" not found on node "${targetNode.name}".`
      });
    }

    // Port dimension compatibility checks
    if (sourcePort && targetPort) {
      if (sourcePort.flowDimension !== targetPort.flowDimension) {
        diagnostics.push({
          severity: 'ERROR',
          edgeId: edge.id,
          code: 'FLOW_DIMENSION_MISMATCH',
          message: `Flow dimension mismatch on edge "${edge.id}": Source "${sourcePort.flowDimension}" cannot connect to Target "${targetPort.flowDimension}". Use a conversion unit (e.g. FillingMachine).`
        });
      }
    }
  }

  // Bottleneck & Capacity Analysis
  const bottleneckAnalysis = computeBottlenecks(graph);

  const hasErrors = diagnostics.some((d) => d.severity === 'ERROR');

  return {
    valid: !hasErrors,
    diagnostics,
    bottlenecks: bottleneckAnalysis
  };
}

function computeBottlenecks(
  graph: ProcessGraph
): BottleneckAnalysis {
  const capacities: Record<string, number> = {};

  for (const node of graph.nodes) {
    if (node.kind === 'ROTARY_FILLER') {
      const config = node.config as {
        nozzleCount?: number;
        fillTimePerCycleSeconds?: number;
        indexTimePerCycleSeconds?: number;
      };
      const nozzles = config.nozzleCount ?? 1;
      const cycleTime = (config.fillTimePerCycleSeconds ?? 10) + (config.indexTimePerCycleSeconds ?? 2);
      const cansPerMinute = (nozzles / cycleTime) * 60;
      capacities[node.id] = cansPerMinute;
    } else if (node.kind === 'LABELER') {
      const config = node.config as { maxSpeedUnitsPerMinute?: number };
      capacities[node.id] = config.maxSpeedUnitsPerMinute ?? 60;
    } else if (node.kind === 'PALLETIZER') {
      const config = node.config as {
        containersPerLayer?: number;
        cycleSecondsPerLayer?: number;
      };
      const cpl = config.containersPerLayer ?? 20;
      const sec = config.cycleSecondsPerLayer ?? 30;
      capacities[node.id] = (cpl / sec) * 60;
    }
  }

  const capacityEntries = Object.entries(capacities);
  if (capacityEntries.length === 0) {
    return {
      bottleneckNodeId: null,
      maximumSystemThroughputUnitsPerMin: 0,
      utilizationByNode: {}
    };
  }

  // Minimum capacity determines the bottleneck constraint of the line
  capacityEntries.sort((a, b) => a[1] - b[1]);
  const [bottleneckNodeId, minCapacity] = capacityEntries[0]!;

  const utilizationByNode: Record<string, number> = {};
  for (const [nodeId, cap] of capacityEntries) {
    utilizationByNode[nodeId] = cap > 0 ? (minCapacity / cap) * 100 : 100;
  }

  return {
    bottleneckNodeId,
    maximumSystemThroughputUnitsPerMin: minCapacity,
    utilizationByNode
  };
}
