import {
  getAiConfig,
  getAiConnection,
  loadLlmCredentials,
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
    case 'openrouter':
      return Boolean(creds.openrouterApiKey?.trim());
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
  // Awaited: on desktop the key lives in the OS keychain, and the synchronous
  // read deliberately does not contain it.
  const creds = await loadLlmCredentials();
  const hasCreds = hasValidCredentials(creds);
  const config = overrideConfig || getAiConfig();
  let mode = config.provider || getAiConnection().mode;
  if (hasCreds) mode = creds.provider;

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
      text: `No AI model is connected, so "${ctx.node.name}" can be edited and simulated but not redesigned by AI. Everything you have built or installed still works. Connect a model in AI settings, or use an MCP client, to design new equipment.`,
      senderBadge: 'Offline (Local Only)',
      isOfflineSolver: true,
      errorNotice: 'Unit-Op Studio offline.',
      cadDrawing,
      newDressing
    };
  }

  // 3. An AI provider in the app (Gemini, Claude, OpenAI, OpenRouter, Ollama)
  if (!hasValidCredentials(creds)) {
    if (cadDrawing) {
      return {
        text: `Matched a template drawing with ${cadDrawing.nozzles.length} nozzles for "${ctx.node.name}". Apply it below to use it on the canvas.`,
        senderBadge: 'Template drawing',
        isOfflineSolver: true,
        cadDrawing,
        newDressing
      };
    }

    return {
      text: `No AI model is connected. You can still ask for a template drawing (e.g. "draw a jacketed reactor"), and edit nozzles in the Dressing tab. Connect a model in AI settings for design help.`,
      senderBadge: 'No AI model',
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
  const creds = await loadLlmCredentials();
  const hasCreds = hasValidCredentials(creds);
  const config = overrideConfig || getAiConfig();
  let mode = config.provider || getAiConnection().mode;
  if (hasCreds) mode = creds.provider;

  // 1. No model
  //
  // Adding standard equipment needs no model: it is decided by the declared
  // questions in protocol/decisions, which run offline. Only generative work
  // needs a model.
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

  // 2. An AI provider in the app, or the offline solver without one
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


