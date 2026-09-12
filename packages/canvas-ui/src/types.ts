import type {
  ProcessNode,
  ProcessEdge,
  GraphDiagnostic,
  BottleneckAnalysis,
  EquipmentCadDrawing
} from '@process-forge/protocol';
import type { MachineOperationalState } from '@process-forge/simulation-core';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'master_orchestrator' | 'system';
  senderTitle: string;
  text: string;
  timestamp: string;
  suggestedPrompts?: string[];
  proposedDiff?: Record<string, unknown>;
  cadDrawing?: EquipmentCadDrawing;
  modelBadge?: string;
  isOffline?: boolean;
}

export interface CanvasNodeData extends Record<string, unknown> {
  processNode: ProcessNode;
  state: MachineOperationalState;
  unitsProduced: number;
  unitsScrapped: number;
  bufferLevel: number;
  instantaneousRate: number;
  activeSubAgentId: string;
  subAgentChatHistory: ChatMessage[];
  onOpenPopOutStudio?: (nodeId: string) => void;
}

export interface CanvasEdgeData extends Record<string, unknown> {
  processEdge: ProcessEdge;
  isBackpressureBlocked: boolean;
  activeFlowRate: number;
}

export interface PlantTelemetryState {
  simulatedTimeSeconds: number;
  totalPackaged: number;
  totalScrapped: number;
  averageRatePerMin: number;
  activeBottleneck: string | null;
  diagnostics: GraphDiagnostic[];
  bottlenecks: BottleneckAnalysis;
}
