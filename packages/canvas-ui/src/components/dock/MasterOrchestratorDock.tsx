import React, { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import type { ProcessGraph, ProcessNode, BottleneckAnalysis } from '@process-forge/protocol';
import type { ChatMessage, PlantTelemetryState } from '../../types.js';
import {
  getAiConfig,
  getAiConnection,
  getLlmCredentials,
  isAgentChatUnlocked,
  PROVIDER_METADATA,
  type AiModelConfig
} from '../../ai/aiModelManager.js';
import { dispatchMasterOrchestratorMessage } from '../../ai/aiDispatch.js';
import { useAssistantRoute } from '../../ai/assistantRoute.js';
import { createDefaultProcessNode } from '../../utils/nodeFactory.js';
import { draftingRadius, tint } from '@process-forge/theme';
import { AiModelModal } from '../modals/AiModelModal.js';
import { McpAssistantPanel } from './McpAssistantPanel.js';
import { SplitFlap } from './SplitFlap.js';
import { unitTag } from '../../model/unitTag.js';
import { AgentChat } from './AgentChat.js';
import { RunDigest, type RunView } from './RunDigest.js';
import { supportsAgent } from '../../ai/agent/agentLoop.js';
import type { AgentHost } from '../../ai/agent/agentTools.js';
import { Cpu, Loader2, ChevronRight, ChevronLeft, Sparkles, KeyRound } from 'lucide-react';

interface MasterOrchestratorDockProps {
  graph: ProcessGraph;
  bottlenecks: BottleneckAnalysis;
  telemetry: PlantTelemetryState;
  onAddNode?: (node: ProcessNode) => void;
  onOpenPopOutStudio?: (nodeId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** The open flowsheet, for the assistant's tools. Without it the chat cannot act on the flowsheet. */
  agentHost?: AgentHost;
  /** The run at the canvas playhead: the board and the run digest follow it. */
  run?: RunView;
}

export const MasterOrchestratorDock: React.FC<MasterOrchestratorDockProps> = ({
  graph,
  bottlenecks,
  telemetry,
  onAddNode,
  onOpenPopOutStudio,
  isCollapsed = false,
  onToggleCollapse,
  agentHost,
  run
}) => {
  const { palette, font, size, weight, space, radius: r, motion } = useTheme();
  const OsakaJadePalette = palette;
  const [inputText, setInputText] = useState('');
  const [aiConfig, setAiConfig] = useState<AiModelConfig>(getAiConfig());
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lockStatus, setLockStatus] = useState(() => isAgentChatUnlocked(getAiConnection(), getLlmCredentials()));
  const route = useAssistantRoute();
  // OpenRouter or OpenAI in the app: the assistant that works on the flowsheet with tools.
  const agentCreds = getLlmCredentials();
  const agentMode = route === 'api-key' && Boolean(agentHost) && supportsAgent(agentCreds) && lockStatus.unlocked;

  const refreshAiState = () => {
    setAiConfig(getAiConfig());
    setLockStatus(isAgentChatUnlocked(getAiConnection(), getLlmCredentials()));
  };

  useEffect(() => {
    refreshAiState();
  }, []);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  /**
   * The engineer answered a clarification. Create exactly the option they
   * picked, and clear the question off the message it was asked on, so the
   * same choice cannot be made twice from a stale bubble.
   */
  const resolveClarification = (
    messageId: string,
    option: NonNullable<ChatMessage['clarification']>['options'][number],
    flowRateGpm?: number
  ) => {
    const node = createDefaultProcessNode(option.kind, {
      name: option.name,
      ...(flowRateGpm !== undefined ? { flowRateGpm } : {})
    });
    onAddNode?.(node);
    setChatHistory((prev) => [
      ...prev.map((m) => (m.id === messageId ? { ...m, clarification: undefined } : m)),
      {
        id: `mst-${Date.now()}`,
        sender: 'master_orchestrator',
        senderTitle: 'Equipment Specialist',
        text: `Added ${option.label}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelBadge: 'Engineer choice',
        isOffline: true,
        createdNode: node
      }
    ]);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      senderTitle: 'Lead Process Engineer',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatHistory((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsProcessing(true);

    try {
      const bnNode = bottlenecks.bottleneckNodeId
        ? graph.nodes.find((n) => n.id === bottlenecks.bottleneckNodeId)
        : undefined;

      const res = await dispatchMasterOrchestratorMessage(
        text,
        {
          graphName: graph.name,
          nodeCount: graph.nodes.length,
          totalPackaged: telemetry.totalPackaged,
          averageRatePerMin: telemetry.averageRatePerMin,
          bottleneckNodeName: bnNode?.name,
          maxThroughput: bottlenecks.maximumSystemThroughputUnitsPerMin
        },
        aiConfig
      );

      if (res.createdNode) {
        onAddNode?.(res.createdNode);
      }

      const agentMsg: ChatMessage = {
        id: `mst-${Date.now() + 1}`,
        sender: 'master_orchestrator',
        senderTitle: 'Equipment Specialist',
        text: res.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelBadge: res.senderBadge,
        isOffline: res.isOfflineSolver,
        createdNode: res.createdNode,
        ...(res.clarification ? { clarification: res.clarification } : {})
      };

      setChatHistory((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      console.error('Master orchestrator dispatch error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isCollapsed) {
    return (
      <div
        style={{
          width: 42,
          height: '100%',
          backgroundColor: OsakaJadePalette.background.surface,
          borderLeft: `1px solid ${OsakaJadePalette.border.default}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0',
          gap: 16,
          flexShrink: 0,
          zIndex: 10,
          cursor: 'pointer',
          userSelect: 'none'
        }}
        onClick={onToggleCollapse}
        title="Expand the assistant (Alt+D)"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.();
          }}
          style={{
            backgroundColor: 'transparent',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            borderRadius: 6,
            padding: '6px',
            color: OsakaJadePalette.jade.glow,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Expand Studio Dock"
        >
          <ChevronLeft size={16} />
        </button>
        <div
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: OsakaJadePalette.text.secondary,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Cpu size={13} color={OsakaJadePalette.jade.glow} />
          <span>ENGINEER STUDIO</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 360,
        height: '100%',
        backgroundColor: OsakaJadePalette.background.surface,
        borderLeft: `1px solid ${OsakaJadePalette.border.default}`,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: OsakaJadePalette.text.primary,
        zIndex: 10,
        flexShrink: 0
      }}
    >
      {/* Header with Clean Title & Dock Controls */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
          backgroundColor: OsakaJadePalette.background.surfaceElevated
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: tint(palette.jade[500], 0.12),
                border: `1px solid ${OsakaJadePalette.jade[600]}40`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: OsakaJadePalette.jade.glow,
                flexShrink: 0
              }}
            >
              <Sparkles size={15} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary, lineHeight: 1.2 }}>
                Process Copilot
              </div>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 10,
                  fontWeight: 600,
                  color: OsakaJadePalette.text.secondary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  marginTop: 2
                }}
                title="Configure AI & MCP Tools"
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: r.full,
                    backgroundColor: lockStatus.unlocked ? OsakaJadePalette.jade.glow : OsakaJadePalette.streams.continuousFluid,
                    display: 'inline-block'
                  }}
                />
                <span>
                  {route === 'claude-desktop'
                    ? 'MCP client'
                    : lockStatus.unlocked
                      ? `${PROVIDER_METADATA[aiConfig.provider]?.badgeName || 'AI Assistant'} · your account`
                      : 'Local Solver'}
                </span>
                <span style={{ fontSize: size['2xs'], color: OsakaJadePalette.text.muted }}>• Tools</span>
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                title="Collapse Studio Dock"
                style={{
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: 6,
                  padding: '5px 7px',
                  color: OsakaJadePalette.text.secondary,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11
                }}
              >
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* The line at a glance, as a departure board: each figure flips when the run changes it. */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
          backgroundColor: OsakaJadePalette.background.base
        }}
      >
        {(() => {
          const limitName = bottlenecks.bottleneckNodeId ? graph.nodes.find((n) => n.id === bottlenecks.bottleneckNodeId)?.name : undefined;
          // The unit's tag (P-227) when it has one; its name otherwise.
          const limit = bottlenecks.bottleneckNodeId ? (limitName ? unitTag(limitName) ?? limitName : 'NONE') : 'NONE';
          const rate = telemetry.averageRatePerMin;
          // A line that makes no items (a powder or liquid line) is read in kg.
          // Decided by the whole run, so the board does not switch from units to kg as the first kg arrive.
          const bulk = run ? run.result.totalUnitsPackaged === 0 && run.result.totalFluidDeliveredKg > 0 : telemetry.totalPackaged === 0 && (telemetry.productKg ?? 0) > 0;
          // kg/h reaching the product outlets right now.
          const kgNow = run
            ? graph.nodes.reduce((a, n) => a + ((n.kind === 'TERMINAL' && (n.config as { role?: string }).role === 'product' ? run.snapshot.get(n.id)?.kgPerHour : 0) ?? 0), 0)
            : 0;
          const kgPerHour = bulk && telemetry.simulatedTimeSeconds > 0 ? (telemetry.productKg! / telemetry.simulatedTimeSeconds) * 3600 : 0;
          const cell = (label: string, unit: string, flap: React.ReactNode, title?: string) => (
            <div title={title} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: OsakaJadePalette.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: font.mono }}>
                {label}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
                {flap}
                <span style={{ fontSize: 10, color: OsakaJadePalette.text.muted, fontFamily: font.mono }}>{unit}</span>
              </span>
            </div>
          );
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
              {bulk ? (
                <>
                  {cell('Line output', 'kg', <SplitFlap label="Line output" value={String(Math.round(telemetry.productKg ?? 0))} width={5} />, 'Product delivered so far, kg')}
                  {cell('Shift average', 'kg/h', <SplitFlap label="Shift average" value={kgPerHour.toFixed(kgPerHour < 100 ? 1 : 0)} width={5} />)}
                </>
              ) : (
                <>
                  {cell('Line output', 'units', <SplitFlap label="Line output" value={String(telemetry.totalPackaged)} width={5} />)}
                  {cell('Shift average', '/min', <SplitFlap label="Shift average" value={rate > 0 ? rate.toFixed(rate < 100 ? 1 : 0) : '0'} width={5} />)}
                </>
              )}
              {bulk
                ? cell('Product now', 'kg/h', <SplitFlap label="Product now" value={kgNow.toFixed(kgNow < 100 ? 1 : 0)} width={5} color={OsakaJadePalette.text.secondary} />, 'kg/h reaching the product outlets at this moment of the run')
                : cell('Capacity', '/min', <SplitFlap label="Capacity" value={String(Math.round(bottlenecks.maximumSystemThroughputUnitsPerMin))} width={5} color={OsakaJadePalette.text.secondary} />)}
              {cell(
                'Limited by',
                '',
                <SplitFlap
                  label="Limited by"
                  value={limit.toUpperCase()}
                  width={6}
                  align="left"
                  color={bottlenecks.bottleneckNodeId ? OsakaJadePalette.status.blocked : OsakaJadePalette.jade.glow}
                />,
                limitName ?? 'Nothing limits the line in the static analysis'
              )}
            </div>
          );
        })()}
      </div>

      {run && <RunDigest graph={graph} run={run} />}

      {agentMode && agentHost && <AgentChat host={agentHost} modelLabel={agentCreds.modelId} />}

      {/* Chat history: only when the assistant runs in the app. */}
      {route !== 'claude-desktop' && !agentMode && (
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        {chatHistory.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
                backgroundColor: isUser ? OsakaJadePalette.jade.muted : OsakaJadePalette.background.surfaceElevated,
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${isUser ? OsakaJadePalette.jade[600] : OsakaJadePalette.border.default}`,
                fontSize: 12,
                lineHeight: '1.4'
              }}
            >
              <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, marginBottom: 4, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{msg.senderTitle}</span>
                <span
                  style={{
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontSize: 8,
                    fontWeight: 700,
                    backgroundColor: msg.isOffline ? tint(palette.text.primary, 0.06) : tint(palette.jade[500], 0.15),
                    color: msg.isOffline ? OsakaJadePalette.text.muted : OsakaJadePalette.jade.glow,
                    border: `1px solid ${msg.isOffline ? OsakaJadePalette.border.default : OsakaJadePalette.jade[600]}`
                  }}
                >
                  {msg.modelBadge || (isUser ? 'Operator' : 'AI Orchestrator')}
                </span>
                <span>• {msg.timestamp}</span>
              </div>
              <div>{msg.text}</div>

              {msg.clarification && (
                <div
                  role="group"
                  aria-label="Which equipment should be added?"
                  style={{
                    marginTop: 10,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6
                  }}
                >
                  {msg.clarification.options.map((option) => (
                    <button
                      key={option.kind}
                      onClick={() =>
                        resolveClarification(msg.id, option, msg.clarification?.flowRateGpm)
                      }
                      title={`Add ${option.name}`}
                      style={{
                        padding: '5px 10px',
                        borderRadius: draftingRadius.soft,
                        backgroundColor: 'transparent',
                        color: OsakaJadePalette.text.primary,
                        border: `1px solid ${OsakaJadePalette.border.default}`,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Add {option.label}
                    </button>
                  ))}
                </div>
              )}

              {msg.createdNode && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    backgroundColor: tint(palette.jade[500], 0.12),
                    border: `1px solid ${OsakaJadePalette.jade[600]}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: OsakaJadePalette.jade.glow }}>
                    <Sparkles size={13} />
                    <span>Flowsheet Equipment Placed</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                    {msg.createdNode.name}
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary }}>
                    Kind: {msg.createdNode.kind.replace(/_/g, ' ')} • Sub-Agent Initialized
                  </div>
                  {onOpenPopOutStudio && (
                    <button
                      onClick={() => onOpenPopOutStudio(msg.createdNode!.id)}
                      style={{
                        marginTop: 4,
                        alignSelf: 'flex-start',
                        padding: '5px 10px',
                        borderRadius: 4,
                        backgroundColor: OsakaJadePalette.jade.glow,
                        color: OsakaJadePalette.background.base,
                        border: 'none',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Open Unit-Op Studio →
                    </button>
                  )}
                </div>
              )}

              {msg.suggestedPrompts && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {msg.suggestedPrompts.map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        if (!lockStatus.unlocked) {
                          setIsAiModalOpen(true);
                        } else {
                          handleSendMessage(p);
                        }
                      }}
                      style={{
                        fontSize: 10,
                        backgroundColor: OsakaJadePalette.background.surface,
                        color: OsakaJadePalette.jade.glow,
                        border: `1px solid ${OsakaJadePalette.border.default}`,
                        borderRadius: 10,
                        padding: '3px 8px',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {isProcessing && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '6px 10px',
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: OsakaJadePalette.text.secondary
            }}
          >
            <Loader2 size={12} className="animate-spin" color={OsakaJadePalette.jade.glow} />
            <span>
              Consulting {PROVIDER_METADATA[aiConfig.provider]?.badgeName || 'Solver Engine'}...
            </span>
          </div>
        )}
      </div>
      )}

      {/* Offline Solver Status Banner (Unobtrusive) */}
      {route === 'none' && (
        <div
          style={{
            padding: '6px 14px',
            backgroundColor: tint(palette.jade[500], 0.05),
            borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: OsakaJadePalette.text.secondary
          }}
        >
          <span>No assistant: standard equipment from plain requests</span>
          <button
            onClick={() => setIsAiModalOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              color: OsakaJadePalette.jade.glow,
              fontWeight: 600,
              fontSize: 11,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: 0
            }}
          >
            <KeyRound size={11} />
            <span>Connect an AI model</span>
          </button>
        </div>
      )}

      {route === 'claude-desktop' && (
        <McpAssistantPanel
          graph={graph}
          bottleneckNodeId={bottlenecks.bottleneckNodeId}
          {...(onOpenPopOutStudio ? { onOpenUnit: onOpenPopOutStudio } : {})}
        />
      )}

      {/* Chat Input Bar */}
      {route !== 'claude-desktop' && !agentMode && (
      <div
        style={{
          padding: space[3],
          borderTop: `1px solid ${OsakaJadePalette.border.default}`,
          display: 'flex',
          gap: space[2],
          backgroundColor: OsakaJadePalette.background.base,
          alignItems: 'center'
        }}
      >
        <input
          type="text"
          placeholder={isProcessing ? 'Calculating...' : 'Query plant solver, ask bottleneck, or type "add pump"...'}
          value={inputText}
          disabled={isProcessing}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isProcessing && handleSendMessage()}
          style={{
            flex: 1,
            backgroundColor: OsakaJadePalette.background.surfaceElevated,
            border: `1px solid ${OsakaJadePalette.border.default}`,
            borderRadius: r.md,
            padding: `${space[2]}px ${space[2.5]}px`,
            color: OsakaJadePalette.text.primary,
            fontSize: size.sm,
            fontFamily: font.sans,
            outline: 'none',
            opacity: isProcessing ? 0.6 : 1
          }}
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={isProcessing || !inputText.trim()}
          style={{
            backgroundColor: isProcessing || !inputText.trim() ? OsakaJadePalette.background.surfaceElevated : OsakaJadePalette.jade[500],
            color: isProcessing || !inputText.trim() ? OsakaJadePalette.text.muted : OsakaJadePalette.text.inverse,
            border: 'none',
            borderRadius: r.md,
            padding: `${space[2]}px ${space[3]}px`,
            fontWeight: weight.bold,
            fontSize: size.xs,
            cursor: isProcessing || !inputText.trim() ? 'not-allowed' : 'pointer',
            transition: `all ${motion.fast}`
          }}
        >
          Send
        </button>
      </div>
      )}

      {/* AI Model & Provider Modal */}
      <AiModelModal
        isOpen={isAiModalOpen}
        onClose={() => {
          setIsAiModalOpen(false);
          refreshAiState();
        }}
        onConfigChanged={(cfg) => {
          setAiConfig(cfg);
          refreshAiState();
        }}
      />
    </div>
  );
};
