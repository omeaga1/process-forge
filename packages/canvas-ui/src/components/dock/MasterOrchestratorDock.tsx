import React, { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import { terminalRole, type ProcessGraph, type ProcessNode, type BottleneckAnalysis } from '@process-forge/protocol';
import type { SteadyResult } from '@process-forge/simulation-core';
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
import { liquidLimit } from '@process-forge/tools';
import { Button, Tooltip } from '../../ui/index.js';
import { supportsAgent } from '../../ai/agent/agentLoop.js';
import type { AgentHost } from '../../ai/agent/agentTools.js';
import { Loader2, ChevronRight, ChevronLeft, Sparkles, Check, ArrowUp, Gauge, PackagePlus, Waves, ArrowUpRight } from 'lucide-react';

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
  /** The line's product is bulk (liquid, powder): read in kg before a run as well as during one. */
  bulkLine?: boolean;
  /** The line solved at steady state, before a run: the board reads its figures rather than zeros. */
  steady?: SteadyResult | null;
  /** The run shown was made on a flowsheet that has since changed. */
  stale?: boolean;
  /** Move the run's playhead to a fraction of it (the digest's timeline). */
  onSeek?: (fraction: number) => void;
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
  run,
  bulkLine,
  steady,
  stale,
  onSeek
}) => {
  const { palette, font } = useTheme();
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
        senderTitle: 'Copilot',
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
      senderTitle: 'You',
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
          limitSummary: limitTitle,
          maxThroughput: bottlenecks.maximumSystemThroughputUnitsPerMin,
          bulk: Boolean(bulkLine),
          productKg: telemetry.productKg ?? 0,
          simulatedSeconds: telemetry.simulatedTimeSeconds
        },
        aiConfig
      );

      if (res.createdNode) {
        onAddNode?.(res.createdNode);
      }

      const agentMsg: ChatMessage = {
        id: `mst-${Date.now() + 1}`,
        sender: 'master_orchestrator',
        senderTitle: 'Copilot',
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
      <Tooltip content="Open the Process Copilot · Alt+D" side="left">
        <button
          type="button"
          className="pf-focus pf-dock-rail"
          onClick={onToggleCollapse}
          aria-label="Open the Process Copilot"
          style={{
            width: 44,
            height: '100%',
            backgroundColor: OsakaJadePalette.background.surface,
            border: 'none',
            borderLeft: `1px solid ${OsakaJadePalette.border.default}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '14px 0',
            gap: 14,
            flexShrink: 0,
            zIndex: 10,
            cursor: 'pointer',
            color: OsakaJadePalette.text.secondary,
            fontFamily: font.sans
          }}
        >
          <ChevronLeft size={16} color={OsakaJadePalette.jade.glow} />
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 8 }}>
            PROCESS COPILOT
          </span>
        </button>
      </Tooltip>
    );
  }

  // What limits the line, worked out once: the board shows it and the offline answer says it.
  // A liquid line no unit holds back: what sets its rate (a feed's supply, a unit at its rating), as the MCP tools say it.
  const lineLimit = !bottlenecks.bottleneckNodeId && run ? liquidLimit(graph, run.result, run.result.durationMinutes) : undefined;
  // Before a run, the steady state: the product rate it settles to, and what holds it there
  // (a unit at its rating, else the feed that reaches a product).
  const solved = !run && steady?.status === 'converged' ? steady : undefined;
  const productIds = new Set(graph.nodes.filter((n) => terminalRole(n) === 'product').map((n) => n.name));
  const steadyProduct = solved ? solved.streams.filter((x) => productIds.has(x.to)).reduce((a, x) => a + x.kgPerHour, 0) : 0;
  const steadyLimit = solved
    ? (solved.units.filter((u) => (u.capacityUsedPercent ?? 0) >= 95).sort((a, b) => (b.capacityUsedPercent ?? 0) - (a.capacityUsedPercent ?? 0))[0]?.nodeId ??
      graph.nodes.find((n) => terminalRole(n) === 'feed' && (((n.config as { supplyRate?: number }).supplyRate ?? 0) > 0 || (n.config as { supplyKgPerHour?: number }).supplyKgPerHour !== undefined) && solved.streams.some((x) => x.from === n.name && x.kgPerHour > 0))?.id)
    : undefined;
  const limitId = bottlenecks.bottleneckNodeId ?? (lineLimit?.by !== 'none' ? lineLimit?.nodeId : undefined) ?? steadyLimit;
  const limitName = limitId ? graph.nodes.find((n) => n.id === limitId)?.name : undefined;
  const limitTitle = lineLimit ? lineLimit.summary : limitName ? (solved && !bottlenecks.bottleneckNodeId ? limitName + ' holds the line at its steady state' : limitName + ' limits the line') : 'Nothing limits the line';

  return (
    <div
      style={{
        width: 360,
        height: '100%',
        backgroundColor: OsakaJadePalette.background.surface,
        borderLeft: `1px solid ${OsakaJadePalette.border.subtle}`,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: font.sans,
        color: OsakaJadePalette.text.primary,
        zIndex: 10,
        flexShrink: 0
      }}
    >
      {/* Header: what it is, and who answers. */}
      <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            color: OsakaJadePalette.jade.glow,
            background: `linear-gradient(140deg, ${tint(palette.jade[500], 0.22)}, ${tint(palette.jade[500], 0.06)})`,
            border: `1px solid ${tint(palette.jade[500], 0.3)}`
          }}
        >
          <Sparkles size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.01em', color: OsakaJadePalette.text.primary }}>Process Copilot</div>
          <button
            type="button"
            onClick={() => setIsAiModalOpen(true)}
            title="Choose who answers"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2, padding: 0, border: 'none', background: 'none', fontSize: 11, color: OsakaJadePalette.text.muted, cursor: 'pointer' }}
          >
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: route === 'none' ? OsakaJadePalette.text.muted : OsakaJadePalette.jade.glow }} />
            {route === 'claude-desktop'
              ? 'Claude, through MCP'
              : lockStatus.unlocked
                ? `${PROVIDER_METADATA[aiConfig.provider]?.badgeName || 'AI model'} · your account`
                : 'Offline · answers from the line'}
          </button>
        </div>
        {onToggleCollapse && <Button variant="ghost" size="sm" iconOnly icon={<ChevronRight size={15} />} label="Hide the Process Copilot · Alt+D" onClick={onToggleCollapse} />}
      </div>

      {/* The line at a glance, as a departure board: each figure flips when the run changes it. */}
      <div style={{ padding: '0 16px 14px', borderBottom: `1px solid ${OsakaJadePalette.border.subtle}` }}>
        {(() => {
          // The unit's tag (P-227) when it has one; its name otherwise.
          const limit = limitId ? (limitName ? unitTag(limitName) ?? limitName : 'NONE') : 'NONE';
          const rate = telemetry.averageRatePerMin;
          // A line that makes no items (a powder or liquid line) is read in kg.
          // Decided by the whole run, so the board does not switch from units to kg as the first kg arrive.
          const bulk = run ? run.result.totalUnitsPackaged === 0 && run.result.totalFluidDeliveredKg > 0 : bulkLine ?? (telemetry.totalPackaged === 0 && (telemetry.productKg ?? 0) > 0);
          // kg/h reaching the product outlets right now.
          const kgNow = run
            ? graph.nodes.reduce((a, n) => a + ((n.kind === 'TERMINAL' && (n.config as { role?: string }).role === 'product' ? run.snapshot.get(n.id)?.kgPerHour : 0) ?? 0), 0)
            : steadyProduct;
          const kgPerHour = bulk && telemetry.simulatedTimeSeconds > 0 ? ((telemetry.productKg ?? 0) / telemetry.simulatedTimeSeconds) * 3600 : solved ? steadyProduct : 0;
          const cell = (label: string, unit: string, flap: React.ReactNode, title?: string) => (
            <div title={title} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, padding: '10px 12px', background: OsakaJadePalette.background.base }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: OsakaJadePalette.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: font.mono }}>
                {label}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
                {flap}
                <span style={{ fontSize: 10, color: OsakaJadePalette.text.muted, fontFamily: font.mono }}>{unit}</span>
              </span>
            </div>
          );
          const limitColor = bottlenecks.bottleneckNodeId || lineLimit?.by === 'unit' ? OsakaJadePalette.status.blocked : lineLimit?.by === 'feed' ? OsakaJadePalette.text.secondary : OsakaJadePalette.jade.glow;
          return (
            <div style={{ border: `1px solid ${OsakaJadePalette.border.subtle}`, borderRadius: 12, overflow: 'hidden' }}>
              {/* Hairlines between the cells come from the gap over the frame colour. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: OsakaJadePalette.border.subtle }}>
                {bulk ? (
                  <>
                    {cell('Line output', 'kg', <SplitFlap label="Line output" value={String(Math.round(telemetry.productKg ?? 0))} width={5} />, 'Product delivered so far, kg')}
                    {cell('Shift average', 'kg/h', <SplitFlap label="Shift average" value={kgPerHour.toFixed(kgPerHour < 100 ? 1 : 0)} width={5} />)}
                    {cell('Product now', 'kg/h', <SplitFlap label="Product now" value={kgNow.toFixed(kgNow < 100 ? 1 : 0)} width={5} color={OsakaJadePalette.text.secondary} />, 'kg/h reaching the product outlets at this moment of the run')}
                  </>
                ) : (
                  <>
                    {cell('Line output', 'units', <SplitFlap label="Line output" value={String(telemetry.totalPackaged)} width={5} />)}
                    {cell('Shift average', '/min', <SplitFlap label="Shift average" value={rate > 0 ? rate.toFixed(rate < 100 ? 1 : 0) : '0'} width={5} />)}
                    {cell('Capacity', '/min', <SplitFlap label="Capacity" value={String(Math.round(bottlenecks.maximumSystemThroughputUnitsPerMin))} width={5} color={OsakaJadePalette.text.secondary} />)}
                  </>
                )}
                {cell('Limited by', '', <SplitFlap label="Limited by" value={limit.toUpperCase()} width={6} align="left" color={limitColor} />, limitTitle)}
              </div>
              {/* The limit in words: the whole name, clickable, with why. */}
              <button
                type="button"
                onClick={() => limitId && onOpenPopOutStudio?.(limitId)}
                disabled={!limitId || !onOpenPopOutStudio}
                title={limitTitle}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 12px',
                  border: 'none',
                  borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
                  background: tint(limitColor, 0.06),
                  color: OsakaJadePalette.text.secondary,
                  fontSize: 12,
                  textAlign: 'left',
                  cursor: limitId && onOpenPopOutStudio ? 'pointer' : 'default'
                }}
              >
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, background: limitColor }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {limitName ? (
                    <>
                      <b style={{ color: OsakaJadePalette.text.primary, fontWeight: 600 }}>{limitName}</b> sets the pace
                    </>
                  ) : (
                    'Nothing limits the line'
                  )}
                  {solved ? ' · steady state' : run ? ' · this run' : ''}
                </span>
                {limitId && onOpenPopOutStudio && <ArrowUpRight size={13} />}
              </button>
            </div>
          );
        })()}
      </div>

      {run && <RunDigest graph={graph} run={run} stale={stale} {...(onSeek ? { onSeek } : {})} />}

      {agentMode && agentHost && <AgentChat host={agentHost} modelLabel={agentCreds.modelId} />}

      {/* Chat history: only when the assistant runs in the app. */}
      {route !== 'claude-desktop' && !agentMode && (
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}
      >
        {chatHistory.length === 0 && (
          <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 650, color: OsakaJadePalette.text.primary }}>Ask about this line</div>
              <div style={{ fontSize: 12, color: OsakaJadePalette.text.muted, marginTop: 3 }}>
                {lockStatus.unlocked ? 'Questions, changes, new equipment.' : 'Limits and standard equipment, offline.'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${OsakaJadePalette.border.subtle}`, borderRadius: 12, overflow: 'hidden' }}>
              {[
                { q: 'What limits the line?', Icon: Gauge },
                { q: 'Add a surge tank', Icon: Waves },
                { q: 'Add a pump', Icon: PackagePlus }
              ].map(({ q, Icon }, i) => (
                <button
                  key={q}
                  type="button"
                  className="pf-copilot-suggest"
                  onClick={() => void handleSendMessage(q)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    border: 'none',
                    borderTop: i ? `1px solid ${OsakaJadePalette.border.subtle}` : 'none',
                    background: 'transparent',
                    color: OsakaJadePalette.text.primary,
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <Icon size={15} color={OsakaJadePalette.jade.glow} />
                  <span style={{ flex: 1 }}>{q}</span>
                  <ChevronRight size={14} color={OsakaJadePalette.text.muted} />
                </button>
              ))}
            </div>
          </div>
        )}
        {chatHistory.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'stretch',
                maxWidth: isUser ? '85%' : '100%',
                backgroundColor: isUser ? tint(palette.jade[500], 0.16) : 'transparent',
                padding: isUser ? '8px 12px' : '2px 0',
                borderRadius: isUser ? '14px 14px 4px 14px' : 0,
                fontSize: 13,
                lineHeight: 1.5,
                color: OsakaJadePalette.text.primary
              }}
            >
              <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted, marginBottom: 4, display: isUser ? 'none' : 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={11} color={OsakaJadePalette.jade.glow} />
                <span style={{ fontWeight: 600, color: OsakaJadePalette.text.secondary }}>{msg.senderTitle}</span>
                {!isUser && msg.modelBadge && (
                  <span style={{ padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 600, backgroundColor: tint(palette.text.primary, 0.06), color: OsakaJadePalette.text.muted }}>{msg.modelBadge}</span>
                )}
                <span>{msg.timestamp}</span>
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
                    <Check size={13} />
                    <span>Equipment placed on the flowsheet</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                    {msg.createdNode.name}
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary, textTransform: 'capitalize' }}>{msg.createdNode.kind.replace(/_/g, ' ').toLowerCase()}</div>
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
                      Open the unit
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

      {route === 'claude-desktop' && (
        <McpAssistantPanel
          graph={graph}
          bottleneckNodeId={bottlenecks.bottleneckNodeId}
          {...(onOpenPopOutStudio ? { onOpenUnit: onOpenPopOutStudio } : {})}
        />
      )}

      {/* Composer: one rounded field with its send button inside. */}
      {route !== 'claude-desktop' && !agentMode && (
        <div style={{ padding: '10px 12px 12px', borderTop: `1px solid ${OsakaJadePalette.border.subtle}` }}>
          <div
            className="pf-copilot-composer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 4px 4px 12px',
              borderRadius: 12,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              background: OsakaJadePalette.background.base
            }}
          >
            <input
              type="text"
              placeholder={isProcessing ? 'Working…' : 'Ask, or "add a pump"'}
              value={inputText}
              disabled={isProcessing}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isProcessing && handleSendMessage()}
              aria-label="Ask the Process Copilot"
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: OsakaJadePalette.text.primary, fontSize: 13, padding: '6px 0', opacity: isProcessing ? 0.6 : 1 }}
            />
            <Button
              variant="primary"
              size="sm"
              iconOnly
              label="Send"
              icon={isProcessing ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={15} />}
              onClick={() => handleSendMessage()}
              disabled={isProcessing || !inputText.trim()}
            />
          </div>
          {route === 'none' && (
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              style={{ marginTop: 6, padding: 0, border: 'none', background: 'none', fontSize: 11, color: OsakaJadePalette.text.muted, cursor: 'pointer' }}
            >
              Connect an AI model for open questions →
            </button>
          )}
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
