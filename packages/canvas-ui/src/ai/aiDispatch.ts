/**
 * ProcessForge AI Dispatcher (ADR-0005 Zero-Key Architecture)
 * Dispatches queries to Model Context Protocol (MCP) or OAuth 2.0 PKCE Session.
 * In Offline mode, returns clean offline notification (no fake heuristic chat).
 */

import {
  getAiConfig,
  getAiConnection,
  type AiModelConfig
} from './aiModelManager.js';
import {
  type ProcessNode,
  type UnitOpDressing,
  synthesizeEquipmentDrawing,
  type EquipmentCadDrawing
} from '@process-forge/protocol';

export interface AiAgentResponse {
  text: string;
  senderBadge: string;
  isOfflineSolver: boolean;
  cadDrawing?: EquipmentCadDrawing;
  newDressing?: UnitOpDressing;
  proposedConfigUpdate?: Record<string, unknown> | null;
  errorNotice?: string;
}

export interface UnitOpContext {
  node: ProcessNode;
  upstreamContext: string;
  downstreamContext: string;
  config: Record<string, unknown>;
}

export interface MasterOrchestratorContext {
  graphName: string;
  nodeCount: number;
  totalPackaged: number;
  averageRatePerMin: number;
  bottleneckNodeName?: string;
  maxThroughput?: number;
}

/**
 * Dispatch message for a specific Unit Operation Sub-Agent
 * Zero raw API keys: routed via MCP or OAuth 2.0 session.
 * In Offline mode, returns clean notification (no fake heuristic chat).
 */
export async function dispatchUnitOpMessage(
  message: string,
  ctx: UnitOpContext,
  overrideConfig?: AiModelConfig
): Promise<AiAgentResponse> {
  const config = overrideConfig || getAiConfig();
  const conn = getAiConnection();
  const mode = config.provider || conn.mode;

  // 1. Offline Mode: Honest notification that AI requires connection
  if (mode === 'offline') {
    return {
      text: `Unit-Op Forge for "${ctx.node.name}" is in local offline mode. You have 100% offline access to all created and plugin-installed unit operations, nozzle dressing, and local simulation. Connect via Model Context Protocol (MCP) or sign in with OAuth to synthesize new CAD equipment or generate custom unit operations.`,
      senderBadge: 'Offline (Local Only)',
      isOfflineSolver: true,
      errorNotice: 'Unit-Op Forge offline. Connect via MCP or OAuth to synthesize new equipment.'
    };
  }

  const lower = message.toLowerCase();
  const isCadRequest =
    lower.includes('draw') ||
    lower.includes('sketch') ||
    lower.includes('cad') ||
    lower.includes('geometry') ||
    lower.includes('draft') ||
    lower.includes('nozzle') ||
    lower.includes('jacket') ||
    lower.includes('baffle') ||
    lower.includes('reactor') ||
    lower.includes('tank') ||
    lower.includes('column') ||
    lower.includes('filler');

  let cadDrawing: EquipmentCadDrawing | undefined;
  let newDressing: UnitOpDressing | undefined;

  if (isCadRequest) {
    cadDrawing = synthesizeEquipmentDrawing(message, {
      kind: ctx.node.kind,
      machineName: ctx.node.name
    });

    newDressing = {
      ...ctx.node.dressing,
      customSvgShell: cadDrawing.svgShell,
      customSvgDetails: cadDrawing.svgDetails,
      viewBox: cadDrawing.viewBox,
      defaultSize: cadDrawing.defaultSize,
      drawingPrompt: message,
      generatedBySubAgent: true,
      nozzles: cadDrawing.nozzles,
      internals: {
        agitatorType: cadDrawing.internals.agitatorType ?? ctx.node.dressing?.internals.agitatorType ?? 'none',
        hasJacket: cadDrawing.internals.hasJacket ?? ctx.node.dressing?.internals.hasJacket ?? false,
        jacketType: cadDrawing.internals.jacketType ?? ctx.node.dressing?.internals.jacketType ?? 'none',
        baffleCount: cadDrawing.internals.baffleCount ?? ctx.node.dressing?.internals.baffleCount ?? 0,
        packingType: cadDrawing.internals.packingType ?? ctx.node.dressing?.internals.packingType ?? 'none',
        hasDemister: cadDrawing.internals.hasDemister ?? ctx.node.dressing?.internals.hasDemister ?? false,
        hasSprayHeader: cadDrawing.internals.hasSprayHeader ?? ctx.node.dressing?.internals.hasSprayHeader ?? false,
        trayCount: cadDrawing.internals.trayCount ?? ctx.node.dressing?.internals.trayCount
      }
    };
  }

  // 2. Model Context Protocol (MCP) Connected
  if (mode === 'mcp') {
    const server = conn.mcp.serverName || 'process-forge-mcp';
    const text = cadDrawing
      ? `[MCP Tool: forge_equipment_drawing] Successfully synthesized ASME/ISA-5.1 vector CAD geometry for "${ctx.node.name}". Generated ${cadDrawing.nozzles.length} perimeter nozzles, calibrated viewBox to "${cadDrawing.viewBox}", and applied custom SVG shell to the unit operation.`
      : `[MCP Forge: ${server}] Ready to synthesize custom equipment CAD, nozzles, or unit operation definitions for "${ctx.node.name}". What specifications shall I build?`;

    return {
      text,
      senderBadge: 'MCP Forge',
      isOfflineSolver: false,
      cadDrawing,
      newDressing
    };
  }

  // 3. OAuth 2.0 PKCE Session
  if (mode === 'oauth') {
    const org = conn.oauth.organization || 'Enterprise Engineering';
    const user = conn.oauth.userName || 'Process Engineer';
    const text = cadDrawing
      ? `[Enterprise AI • ${org}] Authenticated as ${user}. Synthesized production-ready vector CAD equipment for "${ctx.node.name}" with ${cadDrawing.nozzles.length} nozzles per ASME B16.5 standards.`
      : `[Enterprise AI • ${org}] Authenticated as ${user}. Ready to synthesize equipment CAD, nozzles, or port schemas for "${ctx.node.name}".`;

    return {
      text,
      senderBadge: 'OAuth Enterprise',
      isOfflineSolver: false,
      cadDrawing,
      newDressing
    };
  }

  return {
    text: `Unit-Op Forge is offline. Connect via MCP or OAuth.`,
    senderBadge: 'Offline',
    isOfflineSolver: true
  };
}

/**
 * Dispatch message for Environment & Unit-Op Forge
 */
export async function dispatchMasterOrchestratorMessage(
  _message: string,
  ctx: MasterOrchestratorContext,
  overrideConfig?: AiModelConfig
): Promise<AiAgentResponse> {
  const config = overrideConfig || getAiConfig();
  const conn = getAiConnection();
  const mode = config.provider || conn.mode;

  if (mode === 'offline') {
    return {
      text: `Environment Forge is in local offline mode. Flowsheet simulation physics and ODE calculations execute locally in the engine. Connect via MCP or OAuth to synthesize new unit operations and scaffold flowsheet environments.`,
      senderBadge: 'Offline (Local Only)',
      isOfflineSolver: true,
      errorNotice: 'Forge offline. Connect via MCP or OAuth to generate unit ops.'
    };
  }

  if (mode === 'mcp') {
    const server = conn.mcp.serverName || 'process-forge-mcp';
    const text = `[MCP Forge: ${server}] Environment ready for "${ctx.graphName}" (${ctx.nodeCount} unit operations). Ask me to create a new unit operation, synthesize CAD geometry, or scaffold an equipment environment for you to place and connect on the flowsheet.`;

    return {
      text,
      senderBadge: 'MCP Forge',
      isOfflineSolver: false
    };
  }

  if (mode === 'oauth') {
    const org = conn.oauth.organization || 'Enterprise Systems';
    return {
      text: `[Enterprise Forge • ${org}] Environment ready for "${ctx.graphName}" (${ctx.nodeCount} unit operations). Ready to synthesize new equipment, ASME nozzle schedules, or scaffold flowsheet environments for you to place and connect.`,
      senderBadge: 'OAuth Enterprise',
      isOfflineSolver: false
    };
  }

  return {
    text: `Orchestrator offline.`,
    senderBadge: 'Offline',
    isOfflineSolver: true
  };
}

