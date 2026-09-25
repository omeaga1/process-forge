import { z } from 'zod';
import { ProcessNodeSchema, type ProcessNode } from './nodes.js';
import { ProcessEdgeSchema } from './streams.js';
import { terminalRole, terminalSupplyRate } from './terminals.js';

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

  // Liquid units limit a line in gallons a minute; a pipe-fed filler turns
  // gallons into containers, so their capacity is counted in its containers.
  const isLiquidPipe = (e: ProcessGraph['edges'][number]) => {
    const port = graph.nodes.find((n) => n.id === e.sourceNodeId)?.outputs.find((p) => p.id === e.sourcePortId);
    return port ? String(port.flowDimension).startsWith('CONTINUOUS') : false;
  };
  const liquidPipes = graph.edges.filter(isLiquidPipe);
  const onLiquidPath = new Set(liquidPipes.flatMap((e) => [e.sourceNodeId, e.targetNodeId]));
  const pipeFedFiller = graph.nodes.find(
    (n) => n.kind === 'ROTARY_FILLER' && liquidPipes.some((e) => e.targetNodeId === n.id)
  );
  const gallonsPerContainer = (pipeFedFiller?.config as { containerVolumeGallons?: number } | undefined)
    ?.containerVolumeGallons;
  const perContainer = typeof gallonsPerContainer === 'number' && gallonsPerContainer > 0 ? gallonsPerContainer : 1;

  for (const node of graph.nodes) {
    // Defaults match the simulation engine's, so the figures agree with a run.
    if (node.kind === 'ROTARY_FILLER') {
      const config = node.config as {
        nozzleCount?: number;
        fillTimePerCycleSeconds?: number;
        indexTimePerCycleSeconds?: number;
      };
      const nozzles = config.nozzleCount ?? 10;
      const cycleTime = (config.fillTimePerCycleSeconds ?? 10) + (config.indexTimePerCycleSeconds ?? 2);
      const cansPerMinute = (nozzles / cycleTime) * 60;
      capacities[node.id] = cansPerMinute;
    } else if (pipeFedFiller && onLiquidPath.has(node.id) && node.kind === 'BATCH_REACTOR') {
      // One batch every fill + reaction + discharge.
      const c = node.config as {
        batchVolumeGallons?: number;
        fillDurationMinutes?: number;
        reactionDurationMinutes?: number;
        dischargeRateGpm?: number;
      };
      const batch = c.batchVolumeGallons ?? 800;
      const cycleMin = (c.fillDurationMinutes ?? 15) + (c.reactionDurationMinutes ?? 30) + batch / Math.max(1e-6, c.dischargeRateGpm ?? 50);
      capacities[node.id] = batch / cycleMin / perContainer;
    } else if (pipeFedFiller && onLiquidPath.has(node.id) && node.kind === 'PUMP') {
      const gpm = (node.config as { designFlowRateGpm?: number }).designFlowRateGpm;
      if (typeof gpm === 'number' && gpm > 0) capacities[node.id] = gpm / perContainer;
    } else if (pipeFedFiller && onLiquidPath.has(node.id) && node.kind === 'SURGE_TANK') {
      const gpm = (node.config as { maxDischargeRateGpm?: number }).maxDischargeRateGpm;
      if (typeof gpm === 'number' && gpm > 0 && liquidPipes.some((e) => e.sourceNodeId === node.id)) {
        capacities[node.id] = gpm / perContainer;
      }
    } else if (node.kind === 'TERMINAL' && terminalRole(node) === 'feed' && terminalSupplyRate(node) > 0) {
      // A feed with a supply rate limits everything downstream of it. Liquid
      // is counted in the filler's containers, like the other liquid units.
      const liquid = liquidPipes.some((e) => e.sourceNodeId === node.id);
      if (!liquid) capacities[node.id] = terminalSupplyRate(node);
      else if (pipeFedFiller) capacities[node.id] = terminalSupplyRate(node) / perContainer;
    } else if (node.kind === 'LABELER') {
      const config = node.config as { maxSpeedUnitsPerMinute?: number };
      capacities[node.id] = config.maxSpeedUnitsPerMinute ?? 40;
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
