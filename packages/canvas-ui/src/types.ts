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
  createdNode?: ProcessNode;
  /**
   * An unresolved choice the engineer is being asked to make. Cleared once they
   * pick an option, so the same question cannot be answered twice.
   */
  clarification?: {
    question: string;
    options: { kind: ProcessNode['kind']; label: string; name: string; probability: number }[];
    flowRateGpm?: number;
  };
}

export interface CanvasNodeData extends Record<string, unknown> {
  processNode: ProcessNode;
  state: MachineOperationalState;
  unitsProduced: number;
  unitsScrapped: number;
  bufferLevel: number;
  instantaneousRate: number;
  /** Liquid units, from the simulation. */
  levelFraction?: number;
  levelGallons?: number;
  flowGpm?: number;
  phase?: 'FILLING' | 'REACTING' | 'DISCHARGING';
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
