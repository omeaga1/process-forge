import {
  getAiConfig,
  getAiConnection,
  getLlmCredentials,
  type AiModelConfig,
  type LlmCredentials,
  callLlmModel
} from './aiModelManager.js';
import {
  type ProcessNode,
  type UnitOpDressing,
  type NodeKind,
  synthesizeEquipmentDrawing,
  heuristicProvider as decisions,
  isDrawingRequest,
  isCreationRequest,
  equipmentKind,
  isActionable,
  hasSignal,
  runnersUp,
  type EquipmentCadDrawing
} from '@process-forge/protocol';
import { createDefaultProcessNode } from '../utils/nodeFactory.js';

export interface AiAgentResponse {
  text: string;
  senderBadge: string;
  isOfflineSolver: boolean;
  cadDrawing?: EquipmentCadDrawing;
  newDressing?: UnitOpDressing;
  proposedConfigUpdate?: Record<string, unknown> | null;
  errorNotice?: string;
  createdNode?: ProcessNode;
  /**
   * Set instead of `createdNode` when the request named more than one kind of
   * equipment and the decision was too close to act on. The dispatcher has
   * never had this outcome before: the ladder it replaces always picked
   * whichever branch it tested first, so "add a reactor with a feed pump"
   * silently became a pump. Now the engineer is asked.
   */
  clarification?: KindClarification;
}

/** A question back to the engineer when a creation request is ambiguous. */
export interface KindClarification {
  question: string;
  options: {
    kind: NodeKind;
    label: string;
    /** Default tag-style name the node is created with if this option is chosen. */
    name: string;
    probability: number;
  }[];
  /** Carried through so the chosen node is created with what was asked for. */
  flowRateGpm?: number;
}

/** Default names, as the ladder assigned them. */
const DEFAULT_NODE_NAMES: Partial<Record<NodeKind, string>> = {
  PUMP: 'Centrifugal Pump P-003',
  BATCH_REACTOR: 'Batch Reactor R-101',
  SURGE_TANK: 'Surge Buffer Tank T-200',
  HEAT_EXCHANGER: 'Shell & Tube Exchanger E-100',
  SEPARATOR: 'Flash Separation Drum V-100',
  DISTILLATION_COLUMN: 'Distillation Column C-100',
  ROTARY_FILLER: 'Rotary Container Filler F-300',
  CONVEYOR: 'Accumulation Conveyor CV-400',
  LABELER: 'High-Speed Labeler L-500',
  PALLETIZER: 'Automated Palletizer PZ-600'
};

const KIND_LABELS: Partial<Record<NodeKind, string>> = {
  PUMP: 'a pump',
  BATCH_REACTOR: 'a batch reactor',
  SURGE_TANK: 'a surge tank',
  HEAT_EXCHANGER: 'a heat exchanger',
  SEPARATOR: 'a separator',
  DISTILLATION_COLUMN: 'a distillation column',
  ROTARY_FILLER: 'a rotary filler',
  CONVEYOR: 'a conveyor',
  LABELER: 'a labeler',
  PALLETIZER: 'a palletizer'
};

export function defaultNodeName(kind: NodeKind): string | undefined {
  return DEFAULT_NODE_NAMES[kind];
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

function hasValidCredentials(creds: LlmCredentials): boolean {
  switch (creds.provider) {
    case 'gemini':
      return Boolean(creds.geminiApiKey?.trim());
    case 'claude':
      return Boolean(creds.claudeApiKey?.trim());
    case 'openai':
      return Boolean(creds.openaiApiKey?.trim());
    case 'ollama':
      return Boolean(creds.ollamaEndpoint?.trim() || true);
    default:
      return false;
  }
}

/**
 * Dispatch message for a specific Unit Operation Sub-Agent
 * Supports real Gemini, Claude, OpenAI, Ollama, MCP tool calls, and enterprise OAuth.
 */
export async function dispatchUnitOpMessage(
  message: string,
  ctx: UnitOpContext,
  overrideConfig?: AiModelConfig
): Promise<AiAgentResponse> {
  const creds = getLlmCredentials();
  const hasCreds = hasValidCredentials(creds);
  const config = overrideConfig || getAiConfig();
  const conn = getAiConnection();
  let mode = config.provider || conn.mode;
  if (hasCreds && mode !== 'mcp' && mode !== 'oauth') {
    mode = creds.provider;
  }

  // 1. Does the engineer actually want geometry drawn?
  //
  // This was twelve OR'd substring tests including bare 'reactor', 'tank' and
  // 'column', so "the reactor feed pump is fine, don't change anything"
  // synthesised a drawing and offered a dressing swap nobody asked for.
  // Mentioning equipment is not asking to draw it. See plan 0001 section 2.1.
  //
  // The question is declared in protocol/decisions and has fixtures; the
  // heuristic provider answers it offline, with no network and no key.
  const drawingAnswer = await decisions.ask({ message }, { q: isDrawingRequest });
  const isCadRequest = drawingAnswer.q.value > 0.5 && isActionable(drawingAnswer.q);

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

  // 2. Offline Mode
  if (mode === 'offline') {
    return {
      text: `Unit-Op Studio for "${ctx.node.name}" is in local offline mode. You have 100% offline access to all created and plugin-installed unit operations, nozzle dressing, and local simulation. Connect via Model Context Protocol (MCP) or sign in with OAuth to generate new CAD equipment or custom unit operations.`,
      senderBadge: 'Offline (Local Only)',
      isOfflineSolver: true,
      errorNotice: 'Unit-Op Studio offline.',
      cadDrawing,
      newDressing
    };
  }

  // 3. MCP Connected Mode
  if (mode === 'mcp') {
    if (conn.mcp.status === 'connected') {
      const server = conn.mcp.serverName || 'process-forge-mcp';
      const text = cadDrawing
        ? `[MCP Tool: forge_equipment_drawing] Generated ASME/ISA-5.1 vector CAD geometry for "${ctx.node.name}". Generated ${cadDrawing.nozzles.length} perimeter nozzles, calibrated viewBox to "${cadDrawing.viewBox}".`
        : `[MCP Connected: ${server}] Ready to generate custom equipment CAD, nozzles, or unit operation definitions for "${ctx.node.name}".`;

      return {
        text,
        senderBadge: 'MCP Connected',
        isOfflineSolver: false,
        cadDrawing,
        newDressing
      };
    }

    return {
      text: `[Configuration Required]: MCP server disconnected. Connect your Gemini, Claude, or OpenAI API key in AI settings to generate equipment.`,
      senderBadge: 'MCP Offline',
      isOfflineSolver: true,
      errorNotice: 'MCP server disconnected.',
      cadDrawing,
      newDressing
    };
  }

  // 4. OAuth 2.0 PKCE Enterprise Mode
  if (mode === 'oauth') {
    const org = conn.oauth.organization || 'Enterprise Engineering';
    const user = conn.oauth.userName || 'Process Engineer';
    const text = cadDrawing
      ? `[Enterprise SSO • ${org}] Authenticated as ${user}. Generated production-ready vector CAD equipment for "${ctx.node.name}" with ${cadDrawing.nozzles.length} nozzles per ASME B16.5 standards.`
      : `[Enterprise SSO • ${org}] Authenticated as ${user}. Ready to generate equipment CAD, nozzles, or port schemas for "${ctx.node.name}".`;

    return {
      text,
      senderBadge: 'Enterprise SSO',
      isOfflineSolver: false,
      cadDrawing,
      newDressing
    };
  }

  // 5. Direct LLM Provider (Gemini, Claude, OpenAI, Ollama)
  if (!hasValidCredentials(creds)) {
    if (cadDrawing) {
      return {
        text: `Generated ASME/ISA-5.1 vector CAD geometry with ${cadDrawing.nozzles.length} nozzle ports for "${ctx.node.name}". Click "Apply Equipment Dressing" below to update the canvas node symbol.`,
        senderBadge: 'CAD Synthesizer',
        isOfflineSolver: true,
        cadDrawing,
        newDressing
      };
    }

    return {
      text: `Unit-Op Studio offline solver active for "${ctx.node.name}". You can request vector CAD geometry adjustments (e.g. "add 3 nozzles" or "add cooling jacket"). To enable generative engineering explanations, connect an API key in AI Tools.`,
      senderBadge: 'Offline CAD Solver',
      isOfflineSolver: true,
      cadDrawing,
      newDressing
    };
  }

  const systemPrompt = `You are the specialized Process & Equipment Design Engineer for "${ctx.node.name}" (${ctx.node.kind}) in ProcessForge.
Upstream context: "${ctx.upstreamContext}".
Downstream context: "${ctx.downstreamContext}".
Current configuration: ${JSON.stringify(ctx.config)}.
Your job is to advise on machine sizing, ASME B16.5 nozzle placements, impeller selection, heat transfer requirements, and mass/energy flow balances.
${cadDrawing ? `You have successfully generated a CAD drawing with ${cadDrawing.nozzles.length} nozzles.` : ''}
Be concise, mathematically sound, and directly actionable.`;

  try {
    const res = await callLlmModel(creds, [{ role: 'user', content: message }], systemPrompt);
    return {
      text: res.text,
      senderBadge: `${creds.provider.toUpperCase()} (${res.model})`,
      isOfflineSolver: false,
      cadDrawing,
      newDressing
    };
  } catch (err: any) {
    return {
      text: `[${creds.provider.toUpperCase()} Error]: ${err.message || 'Failed to call model'}`,
      senderBadge: `${creds.provider.toUpperCase()} (Error)`,
      isOfflineSolver: true,
      errorNotice: err.message,
      cadDrawing,
      newDressing
    };
  }
}

/**
 * Dispatch message for Environment & Master Process Orchestrator
 */
export async function dispatchMasterOrchestratorMessage(
  message: string,
  ctx: MasterOrchestratorContext,
  overrideConfig?: AiModelConfig
): Promise<AiAgentResponse> {
  const creds = getLlmCredentials();
  const hasCreds = hasValidCredentials(creds);
  const config = overrideConfig || getAiConfig();
  const conn = getAiConnection();
  let mode = config.provider || conn.mode;
  if (hasCreds && mode !== 'mcp' && mode !== 'oauth') {
    mode = creds.provider;
  }

  // 1. Offline Mode
  //
  // This used to refuse every message, including "add a pump" -- which needs no
  // model at all. Offline is the DEFAULT with no key configured, so the product
  // claimed "100% offline and local execution" while declining to place a
  // standard pump without a connection. Adding catalogue equipment is decided by
  // the declared questions in protocol/decisions, which run offline with no
  // network and no key; only genuinely generative work needs a model.
  if (mode === 'offline') {
    const { createdNode, clarification } = await parseUnitOpToolCall('', message);
    if (clarification) {
      return {
        text: clarification.question,
        senderBadge: 'Offline (Local Only)',
        isOfflineSolver: true,
        clarification
      };
    }
    if (createdNode) {
      return {
        text: `Added ${createdNode.name} (${createdNode.kind.replace(/_/g, ' ').toLowerCase()}) with default sizing.`,
        senderBadge: 'Offline (Local Only)',
        isOfflineSolver: true,
        createdNode
      };
    }
    return {
      text: `Working offline on "${ctx.graphName}". Standard equipment can be added from a plain request ("add a surge tank"), and custom unit operations from New Unit Op. Connecting a model via MCP or an API key adds free-form engineering advice.`,
      senderBadge: 'Offline (Local Only)',
      isOfflineSolver: true
    };
  }

  // 2. MCP Mode
  if (mode === 'mcp') {
    if (conn.mcp.status === 'connected') {
      const server = conn.mcp.serverName || 'process-forge-mcp';
      return {
        text: `[MCP Connected: ${server}] Process Copilot ready for "${ctx.graphName}" (${ctx.nodeCount} unit operations).`,
        senderBadge: 'MCP Connected',
        isOfflineSolver: false
      };
    }

    return {
      text: `[Configuration Required]: MCP server disconnected. Click "Configure AI" to add your API key or start your MCP server.`,
      senderBadge: 'MCP Offline',
      isOfflineSolver: true,
      errorNotice: 'MCP server disconnected.'
    };
  }

  // 3. OAuth Mode
  if (mode === 'oauth') {
    const org = conn.oauth.organization || 'Enterprise Systems';
    return {
      text: `[Enterprise SSO • ${org}] Environment ready for "${ctx.graphName}" (${ctx.nodeCount} unit operations).`,
      senderBadge: 'Enterprise SSO',
      isOfflineSolver: false
    };
  }

  // 4. Direct LLM Provider (Offline Heuristic / Solver Fallback)
  if (!hasValidCredentials(creds)) {
    const { createdNode, clarification } = await parseUnitOpToolCall('', message);

    if (clarification) {
      return {
        text: clarification.question,
        senderBadge: 'Offline Solver',
        isOfflineSolver: true,
        clarification
      };
    }

    if (createdNode) {
      return {
        text: `Instantiated ${createdNode.name} (${createdNode.kind}) on flowsheet canvas with default industrial sizing.`,
        senderBadge: 'Offline CAD Solver',
        isOfflineSolver: true,
        createdNode
      };
    }

    const lower = message.toLowerCase();
    if (
      lower.includes('bottleneck') ||
      lower.includes('capacity') ||
      lower.includes('throughput') ||
      lower.includes('rate') ||
      lower.includes('status') ||
      lower.includes('output')
    ) {
      const bnText = ctx.bottleneckNodeName
        ? `Primary constraint identified at "${ctx.bottleneckNodeName}". Max system capacity: ${ctx.maxThroughput ? Math.round(ctx.maxThroughput) : 'Dynamic'} units/min.`
        : 'No hydraulic or discrete constraint currently limiting line throughput.';
      return {
        text: `[Plant Telemetry Solver]: ${bnText} Current packaged output: ${ctx.totalPackaged} units at ${Math.round(ctx.averageRatePerMin)} units/min.`,
        senderBadge: 'Telemetry Solver',
        isOfflineSolver: true
      };
    }

    return {
      text: `Process Copilot offline solver active for "${ctx.graphName}". You can query plant bottlenecks, throughput, or type "add pump" / "add tank". Connect an API key in AI Tools to unlock full autonomous reasoning.`,
      senderBadge: 'Offline Solver',
      isOfflineSolver: true
    };
  }

  const systemPrompt = `You are the Process Orchestrator for the "${ctx.graphName}" manufacturing plant flowsheet in ProcessForge.
Plant topology: ${ctx.nodeCount} unit operations.
Current identified bottleneck: ${ctx.bottleneckNodeName || 'None'}.
Total packaged throughput: ${ctx.totalPackaged} units. Average rate: ${ctx.averageRatePerMin} units/min.
You advise the process engineer on plant-wide throughput, debottlenecking strategies, buffer sizing, pressure drops, and flowsheet modifications.

CRITICAL FLOWSHEET ACTIONS:
If the user requests to create, add, or place an industrial unit operation or machine (e.g. pump, reactor, surge tank, heat exchanger, separator, filler, conveyor, labeler, palletizer):
1. Provide concise preliminary engineering calculations and recommendations in your response.
2. Include a tool call JSON block at the end of your response to instantiate the equipment on the flowsheet:
\`\`\`json:tool_call
{
  "action": "ADD_UNIT_OP",
  "kind": "PUMP",
  "name": "Centrifugal Pump P-003",
  "flowRateGpm": 100
}
\`\`\`
Valid kinds: PUMP, SURGE_TANK, BATCH_REACTOR, HEAT_EXCHANGER, SEPARATOR, ROTARY_FILLER, CONVEYOR, LABELER, PALLETIZER.
Be concise, technical, and executive-ready.`;

  try {
    const res = await callLlmModel(creds, [{ role: 'user', content: message }], systemPrompt);
    const { cleanText, createdNode, clarification } = await parseUnitOpToolCall(res.text, message);
    return {
      text: clarification ? `${cleanText}\n\n${clarification.question}`.trim() : cleanText,
      senderBadge: `${creds.provider.toUpperCase()} (${res.model})`,
      isOfflineSolver: false,
      createdNode,
      ...(clarification ? { clarification } : {})
    };
  } catch (err: any) {
    return {
      text: `[${creds.provider.toUpperCase()} Error]: ${err.message || 'Failed to call model'}`,
      senderBadge: `${creds.provider.toUpperCase()} (Error)`,
      isOfflineSolver: true,
      errorNotice: err.message
    };
  }
}

/**
 * Parses tool calls (e.g. ADD_UNIT_OP) emitted by the Master Orchestrator,
 * with fallback heuristic extraction if the model used conversational phrasing.
 */
export async function parseUnitOpToolCall(
  responseText: string,
  userMessage: string
): Promise<{ cleanText: string; createdNode?: ProcessNode; clarification?: KindClarification }> {
  let cleanText = responseText;
  let createdNode: ProcessNode | undefined;
  let clarification: KindClarification | undefined;

  // 1. Explicit JSON tool call block: ```json:tool_call { ... } ``` or ```json { "action": "ADD_UNIT_OP" ... } ```
  const toolCallRegex = /```(?:json:tool_call|json)\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;

  while ((match = toolCallRegex.exec(responseText)) !== null) {
    const jsonStr = match[1]?.trim() || '';
    if (jsonStr.includes('"ADD_UNIT_OP"') || jsonStr.includes('ADD_UNIT_OP')) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.action === 'ADD_UNIT_OP' && parsed.kind) {
          createdNode = createDefaultProcessNode(parsed.kind.toUpperCase() as NodeKind, {
            name: parsed.name,
            flowRateGpm: typeof parsed.flowRateGpm === 'number' ? parsed.flowRateGpm : undefined,
            configOverrides: parsed.config
          });
          // Remove the raw tool call block from user-facing text
          cleanText = cleanText.replace(match[0], '').trim();
          break;
        }
      } catch {
        // continue to heuristic fallback
      }
    }
  }

  // 2. No explicit tool call. Decide from the conversation.
  //
  // This was two first-match ladders (plan 0001 sections 2.2 and 2.4). Creation
  // intent fired on a bare 'add' or 'make' anywhere in the message, so "how do
  // I add a surge tank?" created one. Kind detection tested 'pump' before
  // 'reactor', so "add a reactor with a feed pump" silently became a pump.
  //
  // Both are now declared questions with fixtures, asked together in one call
  // -- the batch shape the real decision-model API uses.
  if (!createdNode) {
    const answers = await decisions.ask(
      { message: userMessage, response: responseText },
      { create: isCreationRequest, kind: equipmentKind }
    );

    // A model that has already confirmed an add is evidence of creation in its
    // own right; the engineer may have said something vague that the model
    // correctly interpreted.
    const modelConfirmedAdd = /unit operation added|flowsheet update summary/i.test(responseText);
    const wantsCreate =
      modelConfirmedAdd || (answers.create.value > 0.5 && isActionable(answers.create));

    // No kind signal at all means there is nothing to create and nothing
    // worth asking about -- the ladder's fall-through, preserved.
    if (wantsCreate && hasSignal(answers.kind)) {
      const flowMatch = (userMessage + ' ' + responseText).match(
        /(\d+(?:\.\d+)?)\s*(?:gpm|gal\/min|gallons per minute)/i
      );
      const flowRateGpm = flowMatch ? parseFloat(flowMatch[1]!) : undefined;

      if (isActionable(answers.kind)) {
        const kind = answers.kind.value as NodeKind;
        createdNode = createDefaultProcessNode(kind, {
          name: DEFAULT_NODE_NAMES[kind],
          flowRateGpm
        });
      } else {
        // Signal, but split. Ask rather than guess.
        const candidates = runnersUp(answers.kind, 3) as NodeKind[];
        const options = candidates.map((kind) => ({
          kind,
          label: KIND_LABELS[kind] ?? kind.replace(/_/g, ' ').toLowerCase(),
          name: DEFAULT_NODE_NAMES[kind] ?? kind.replace(/_/g, ' '),
          probability: answers.kind.probabilities[kind as keyof typeof answers.kind.probabilities] ?? 0
        }));
        clarification = {
          question: `That names ${options.map((o) => o.label).join(' and ')}. Which should I add?`,
          options,
          ...(flowRateGpm !== undefined ? { flowRateGpm } : {})
        };
      }
    }
  }

  return { cleanText, createdNode, clarification };
}


