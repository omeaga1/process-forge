import React, { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import {
  type ProcessNode,
  type UnitOpDressing
} from '@process-forge/protocol';
import type { ChatMessage } from '../../types.js';
import { UnitAnim, CustomEquipmentAnim } from '../animations/EquipmentAnimations.js';
import { UnitOpDressingTab } from './UnitOpDressingTab.js';
import { UnitParametersPanel } from './UnitParametersPanel.js';
import { useAssistantRoute } from '../../ai/assistantRoute.js';
import {
  getAiConfig,
  getAiConnection,
  getLlmCredentials,
  isAgentChatUnlocked,
  PROVIDER_METADATA,
  type AiModelConfig
} from '../../ai/aiModelManager.js';
import { dispatchUnitOpMessage } from '../../ai/aiDispatch.js';
import { AiModelModal } from '../modals/AiModelModal.js';
import { Loader2, X, Check, Upload, Sliders, MessageSquare, Palette, KeyRound, Copy, Trash2, Workflow, Bookmark, BookmarkCheck } from 'lucide-react';
import type { ProcessGraph } from '@process-forge/protocol';
import type { NodeTelemetrySnapshot } from '@process-forge/simulation-core';
import { UnitOverviewPanel } from './UnitOverviewPanel.js';
import { useSavedUnitOps, saveUnitOp, removeSavedUnitOp } from '../../library/savedUnitOps.js';
import { UnitOpContractSchema } from '@process-forge/protocol';
import { draftingRadius } from '@process-forge/theme';

interface UnitOpPopOutStudioProps {
  node: ProcessNode | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateConfig: (nodeId: string, updatedConfig: Record<string, unknown>) => void;
  onUpdateDressing?: (nodeId: string, updatedDressing: UnitOpDressing) => void;
  /** Dressing plus ports: adding an inlet/outlet nozzle can add a port. */
  onUpdateShape?: (
    nodeId: string,
    shape: { dressing: UnitOpDressing; inputs: ProcessNode['inputs']; outputs: ProcessNode['outputs'] }
  ) => void;
  /** Ports of this node that have a pipe on them. */
  connectedPortIds?: ReadonlySet<string>;
  onPublishToForgeHub: (node: ProcessNode) => void;
  /** Removes the unit and its streams (undo brings them back). */
  onDelete?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
  /** Renames the unit (its tag, if the name has one, goes with it). */
  onRename?: (nodeId: string, name: string) => void;
  /** Open with the name ready to edit (right-click, Rename). */
  startRenaming?: boolean;
  onRenameStarted?: () => void;
  upstreamContext?: string;
  downstreamContext?: string;
  /** The whole flowsheet, for what feeds this unit and what it feeds. */
  graph?: ProcessGraph;
  bottleneckNodeId?: string | null;
  /** This unit at the simulation's playhead, when there is a run. */
  live?: NodeTelemetrySnapshot | undefined;
  /** Open a neighbouring unit from its name in the flow. */
  onOpenUnit?: (nodeId: string) => void;
}

type StudioTab = 'OVERVIEW' | 'CHAT' | 'PARAMETERS' | 'DRESSING';

export const UnitOpPopOutStudio: React.FC<UnitOpPopOutStudioProps> = ({
  node,
  isOpen,
  onClose,
  onDelete,
  onDuplicate,
  onRename,
  startRenaming = false,
  onRenameStarted,
  onUpdateConfig,
  onUpdateDressing,
  onUpdateShape,
  connectedPortIds,
  onPublishToForgeHub,
  upstreamContext = 'Nothing feeds this unit: it is a source.',
  downstreamContext = 'Nothing downstream: its output leaves the line.',
  graph,
  bottleneckNodeId,
  live,
  onOpenUnit
}) => {
  const { palette, radius: r } = useTheme();
  const OsakaJadePalette = palette;
  const route = useAssistantRoute();
  const savedUnits = useSavedUnitOps();
  const [activeTab, setActiveTab] = useState<StudioTab>('OVERVIEW');
  const [editingName, setEditingName] = useState<string | null>(null);
  useEffect(() => {
    setEditingName(null);
  }, [node?.id]);
  useEffect(() => {
    if (startRenaming && node) {
      setEditingName(node.name);
      onRenameStarted?.();
    }
  }, [startRenaming, node, onRenameStarted]);
  const [inputText, setInputText] = useState('');
  const [aiConfig, setAiConfig] = useState<AiModelConfig>(getAiConfig());
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lockStatus, setLockStatus] = useState(() => isAgentChatUnlocked(getAiConnection(), getLlmCredentials()));

  const refreshAiState = () => {
    setAiConfig(getAiConfig());
    setLockStatus(isAgentChatUnlocked(getAiConnection(), getLlmCredentials()));
  };

  useEffect(() => {
    if (isOpen) {
      refreshAiState();
    }
  }, [isOpen]);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  // The panel stays mounted between units, so each unit keeps its own conversation.
  useEffect(() => {
    setChatHistory([]);
    setInputText('');
  }, [node?.id]);

  if (!isOpen || !node) return null;

  const headerIconButton: React.CSSProperties = {
    background: 'none',
    border: `1px solid ${OsakaJadePalette.border.default}`,
    width: 30,
    height: 30,
    borderRadius: r.md,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  const config = node.config as Record<string, unknown>;
  const tabs: { id: StudioTab; label: string; Icon: React.ElementType }[] = [
    ...(graph ? [{ id: 'OVERVIEW' as const, label: 'How it works', Icon: Workflow }] : []),
    { id: 'PARAMETERS', label: 'Parameters', Icon: Sliders },
    { id: 'DRESSING', label: 'Drawing & nozzles', Icon: Palette },
    ...(route === 'claude-desktop' ? [] : [{ id: 'CHAT' as const, label: 'Ask AI', Icon: MessageSquare }])
  ];
  const shownTab: StudioTab = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0]!.id;

  const handleSendMessage = async (textToSend?: string) => {
    const message = textToSend || inputText;
    if (!message.trim() || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      senderTitle: 'Plant Engineer',
      text: message,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatHistory((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsProcessing(true);

    try {
      const res = await dispatchUnitOpMessage(
        message,
        {
          node,
          upstreamContext,
          downstreamContext,
          config
        },
        aiConfig
      );

      const agentMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'agent',
        senderTitle: node.name,
        text: res.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cadDrawing: res.cadDrawing,
        modelBadge: res.senderBadge,
        isOffline: res.isOfflineSolver
      };

      setChatHistory((prev) => [...prev, agentMsg]);

      if (res.newDressing) {
        onUpdateDressing?.(node.id, res.newDressing);
      }
      if (res.proposedConfigUpdate) {
        onUpdateConfig(node.id, { ...config, ...res.proposedConfigUpdate });
      }
    } catch (err: any) {
      console.error('UnitOp subagent dispatch error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(620px, 100%)',
        maxWidth: '100%',
        backgroundColor: OsakaJadePalette.background.surfaceElevated,
        borderLeft: `1px solid ${OsakaJadePalette.border.default}`,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
        color: OsakaJadePalette.text.primary,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden'
      }}
    >
      {/* Pop-Out Header with Live Animated Unit Preview */}
      <div
        style={{
          padding: '12px 18px',
          borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: OsakaJadePalette.background.surface,
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: draftingRadius.soft,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.jade.glow}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0
            }}
          >
            <UnitAnim kind={node.kind} dressing={node.dressing} isRunning={true} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: OsakaJadePalette.jade.glow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {/* What this unit is: its kind, or "designed unit" for a contract. */}
                {(node.config as { contract?: unknown }).contract !== undefined
                  ? 'Designed unit op'
                  : node.kind.replace(/_/g, ' ').toLowerCase()}
              </span>
            </div>
            {editingName !== null && onRename ? (
              <input
                autoFocus
                value={editingName}
                aria-label="Unit name"
                onChange={(e) => setEditingName(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditingName(null);
                }}
                onBlur={() => {
                  const name = editingName.trim();
                  if (name && name !== node.name) onRename(node.id, name);
                  setEditingName(null);
                }}
                style={{
                  marginTop: 2,
                  fontSize: 16,
                  fontWeight: 700,
                  width: 320,
                  maxWidth: '100%',
                  padding: '2px 6px',
                  borderRadius: r.md,
                  border: `1px solid ${OsakaJadePalette.jade[500]}`,
                  background: OsakaJadePalette.background.surface,
                  color: OsakaJadePalette.text.primary,
                  outline: 'none'
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => onRename && setEditingName(node.name)}
                title={onRename ? 'Rename this unit' : undefined}
                style={{
                  display: 'block',
                  marginTop: 2,
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  fontSize: 16,
                  fontWeight: 700,
                  color: OsakaJadePalette.text.primary,
                  textAlign: 'left',
                  cursor: onRename ? 'text' : 'default'
                }}
              >
                {node.name}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {(() => {
          // A designed unit can be kept in My unit ops, to place again in any project.
          const parsed = UnitOpContractSchema.safeParse((node.config as { contract?: unknown }).contract);
          if (!parsed.success) return null;
          const contract = parsed.data;
          const saved = savedUnits.some((u) => u.id === contract.id);
          return (
            <button
              type="button"
              onClick={() => (saved ? removeSavedUnitOp(contract.id) : saveUnitOp(contract, 'studio'))}
              title={saved ? 'In My unit ops. Click to remove it from there.' : 'Save to My unit ops, to place again in any project'}
              aria-label={saved ? 'Remove from My unit ops' : 'Save to My unit ops'}
              aria-pressed={saved}
              style={headerIconButton}
            >
              {saved ? <BookmarkCheck size={14} color={OsakaJadePalette.jade[500]} /> : <Bookmark size={14} color={OsakaJadePalette.text.secondary} />}
            </button>
          );
        })()}
        {onDuplicate && (
          <button
            type="button"
            onClick={() => onDuplicate(node.id)}
            title="Duplicate this unit (Ctrl+D)"
            aria-label="Duplicate unit"
            style={headerIconButton}
          >
            <Copy size={14} color={OsakaJadePalette.text.secondary} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(node.id)}
            title="Delete this unit and its streams (Delete). Undo with Ctrl+Z."
            aria-label="Delete unit"
            style={headerIconButton}
          >
            <Trash2 size={14} color={OsakaJadePalette.text.secondary} />
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'none',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            color: OsakaJadePalette.text.secondary,
            width: 30,
            height: 30,
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s ease'
          }}
          title="Close Studio"
        >
          <X size={15} color={OsakaJadePalette.text.secondary} />
        </button>
        </div>
      </div>

      {/* Tabs. With an MCP client as the assistant there is no chat here: the
          conversation happens in the client, which works on this unit through
          the ProcessForge tools. */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
          backgroundColor: OsakaJadePalette.background.surface,
          flexShrink: 0
        }}
      >
        {tabs.map(({ id, label, Icon }) => {
          const on = shownTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActiveTab(id)}
              style={{
                flex: 1,
                height: 40,
                padding: '0 8px',
                backgroundColor: on ? OsakaJadePalette.background.surfaceElevated : 'transparent',
                border: 'none',
                borderBottom: `2px solid ${on ? OsakaJadePalette.jade[500] : 'transparent'}`,
                color: on ? OsakaJadePalette.text.primary : OsakaJadePalette.text.muted,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Dedicated Machine Sub-Agent Chat */}
      {shownTab === 'CHAT' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chatHistory.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    backgroundColor: isUser ? OsakaJadePalette.jade.muted : OsakaJadePalette.background.surface,
                    padding: '10px 14px',
                    borderRadius: draftingRadius.soft,
                    border: `1px solid ${isUser ? OsakaJadePalette.jade[600] : OsakaJadePalette.border.default}`,
                    fontSize: 13,
                    lineHeight: '1.4'
                  }}
                >
                  <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, marginBottom: 4, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{msg.senderTitle}</span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: draftingRadius.soft,
                        fontSize: 9,
                        fontWeight: 700,
                        backgroundColor: msg.isOffline ? 'rgba(255,255,255,0.06)' : 'rgba(16,185,129,0.15)',
                        color: msg.isOffline ? OsakaJadePalette.text.muted : OsakaJadePalette.jade.glow,
                        border: `1px solid ${msg.isOffline ? OsakaJadePalette.border.default : OsakaJadePalette.jade[600]}`
                      }}
                    >
                      {msg.modelBadge || (isUser ? 'Operator' : 'Offline Solver')}
                    </span>
                    <span>• {msg.timestamp}</span>
                  </div>
                  <div>{msg.text}</div>

                  {/* CAD Drawing Preview Card */}
                  {msg.cadDrawing && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: draftingRadius.soft,
                        backgroundColor: OsakaJadePalette.background.surfaceElevated,
                        border: `1px solid ${OsakaJadePalette.jade[700]}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: OsakaJadePalette.jade[300], textTransform: 'uppercase' }}>
                          ISA-5.1 CAD Vector Symbol
                        </span>
                        <span style={{ fontSize: 10, color: OsakaJadePalette.text.muted }}>
                          {msg.cadDrawing.category} • {msg.cadDrawing.defaultSize.width}×{msg.cadDrawing.defaultSize.height}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                        {msg.cadDrawing.label}
                      </div>
                      <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary }}>
                        {msg.cadDrawing.description}
                      </div>

                      {/* Live SVG CAD Drawing preview */}
                      <div
                        style={{
                          width: '100%',
                          height: 140,
                          borderRadius: draftingRadius.soft,
                          backgroundColor: OsakaJadePalette.background.canvas,
                          border: `1px solid ${OsakaJadePalette.border.subtle}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 8
                        }}
                      >
                        <CustomEquipmentAnim
                          shellSvg={msg.cadDrawing.svgShell}
                          detailsSvg={msg.cadDrawing.svgDetails}
                          viewBox={msg.cadDrawing.viewBox}
                          stroke={OsakaJadePalette.jade[400]}
                        />
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10, color: OsakaJadePalette.text.secondary }}>
                        <span>Nozzles: {msg.cadDrawing.nozzles.length}</span>
                        <span>•</span>
                        <span>Internals: {msg.cadDrawing.internals.agitatorType || msg.cadDrawing.internals.packingType || 'Standard'}</span>
                        {msg.cadDrawing.internals.hasJacket && <span>• Jacket: {msg.cadDrawing.internals.jacketType}</span>}
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          onClick={() => {
                            if (!node) return;
                            const newDressing: UnitOpDressing = {
                              ...node.dressing,
                              customSvgShell: msg.cadDrawing!.svgShell,
                              customSvgDetails: msg.cadDrawing!.svgDetails,
                              viewBox: msg.cadDrawing!.viewBox,
                              defaultSize: msg.cadDrawing!.defaultSize,
                              drawingPrompt: msg.text,
                              generatedBySubAgent: true,
                              nozzles: msg.cadDrawing!.nozzles,
                              internals: {
                                agitatorType: msg.cadDrawing!.internals.agitatorType ?? node.dressing?.internals?.agitatorType ?? 'none',
                                hasJacket: msg.cadDrawing!.internals.hasJacket ?? node.dressing?.internals?.hasJacket ?? false,
                                jacketType: msg.cadDrawing!.internals.jacketType ?? node.dressing?.internals?.jacketType ?? 'none',
                                baffleCount: msg.cadDrawing!.internals.baffleCount ?? node.dressing?.internals?.baffleCount ?? 0,
                                packingType: msg.cadDrawing!.internals.packingType ?? node.dressing?.internals?.packingType ?? 'none',
                                hasDemister: msg.cadDrawing!.internals.hasDemister ?? node.dressing?.internals?.hasDemister ?? false,
                                hasSprayHeader: msg.cadDrawing!.internals.hasSprayHeader ?? node.dressing?.internals?.hasSprayHeader ?? false,
                                trayCount: msg.cadDrawing!.internals.trayCount ?? node.dressing?.internals?.trayCount
                              }
                            };
                            onUpdateDressing?.(node.id, newDressing);
                            setActiveTab('DRESSING');
                          }}
                          style={{
                            flex: 1,
                            backgroundColor: OsakaJadePalette.jade.glow,
                            color: OsakaJadePalette.background.base,
                            border: 'none',
                            borderRadius: draftingRadius.soft,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Check size={12} />
                          <span>Apply Equipment Dressing</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Suggested Prompts */}
                  {msg.suggestedPrompts && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                      <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, fontWeight: 600 }}>SUGGESTED ACTIONS</div>
                      {msg.suggestedPrompts.map((p, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            if (!lockStatus.unlocked) {
                              setIsAiModalOpen(true);
                            } else {
                              handleSendMessage(p);
                            }
                          }}
                          style={{
                            textAlign: 'left',
                            backgroundColor: OsakaJadePalette.background.surfaceElevated,
                            border: `1px solid ${OsakaJadePalette.border.default}`,
                            borderRadius: draftingRadius.soft,
                            padding: '6px 10px',
                            fontSize: 11,
                            color: OsakaJadePalette.text.secondary,
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
                  padding: '8px 12px',
                  borderRadius: draftingRadius.soft,
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: OsakaJadePalette.text.secondary
                }}
              >
                <Loader2 size={14} className="animate-spin" color={OsakaJadePalette.jade.glow} />
                <span>
                  Consulting {PROVIDER_METADATA[aiConfig.provider]?.badgeName || 'AI Assistant'}...
                </span>
              </div>
            )}
          </div>

          {/* Offline Solver Status Banner (Unobtrusive) */}
          {!lockStatus.unlocked && (
            <div
              style={{
                padding: '6px 14px',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: OsakaJadePalette.text.secondary
              }}
            >
              <span>No AI model: template drawings and editing only</span>
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
                <span>Connect AI Key</span>
              </button>
            </div>
          )}

          {/* Chat Input Bar */}
          <div
            style={{
              padding: 12,
              borderTop: `1px solid ${OsakaJadePalette.border.default}`,
              display: 'flex',
              gap: 8,
              backgroundColor: OsakaJadePalette.background.surface,
              alignItems: 'center'
            }}
          >
            <input
              type="text"
              placeholder={
                isProcessing
                  ? 'Calculating...'
                  : `Specify mechanical parameters or CAD geometry for ${node.name.split(' ')[0]}...`
              }
              value={inputText}
              disabled={isProcessing}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isProcessing && handleSendMessage()}
              style={{
                flex: 1,
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                borderRadius: draftingRadius.soft,
                padding: '8px 12px',
                color: OsakaJadePalette.text.primary,
                fontSize: 13,
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
                borderRadius: draftingRadius.soft,
                padding: '8px 16px',
                fontWeight: 700,
                fontSize: 12,
                cursor: isProcessing || !inputText.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Custom UnitOp Dressing & Nozzle Manager */}
      {shownTab === 'DRESSING' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <UnitOpDressingTab
            node={node}
            onUpdateDressing={(updatedDressing) => onUpdateDressing?.(node.id, updatedDressing)}
            onUpdateShape={onUpdateShape ? (shape) => onUpdateShape(node.id, shape) : undefined}
            connectedPortIds={connectedPortIds}
          />
        </div>
      )}

      {/* Parameters */}
      {shownTab === 'PARAMETERS' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 20px' }}>
          <UnitParametersPanel node={node} onUpdateConfig={onUpdateConfig} />
        </div>
      )}

      {/* Tab 4: Upstream/Downstream Boundary Context */}
      {shownTab === 'OVERVIEW' && graph && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          <UnitOverviewPanel
            node={node}
            graph={graph}
            bottleneckNodeId={bottleneckNodeId ?? null}
            live={live}
            {...(onOpenUnit ? { onOpenUnit } : {})}
          />
        </div>
      )}

      {/* Footer: One-Click Publish to ForgeHub */}
      <div
        style={{
          padding: '14px 20px',
          borderTop: `1px solid ${OsakaJadePalette.border.default}`,
          backgroundColor: OsakaJadePalette.background.surface,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span style={{ fontSize: 11, color: OsakaJadePalette.text.muted }}>
          Ready to share with community?
        </span>

        <button
          onClick={() => onPublishToForgeHub(node)}
          style={{
            backgroundColor: OsakaJadePalette.jade.muted,
            color: OsakaJadePalette.jade.glow,
            border: `1px solid ${OsakaJadePalette.jade[600]}`,
            borderRadius: draftingRadius.soft,
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Upload size={14} />
          <span>Publish to Community Library</span>
        </button>
      </div>

      {/* AI Model & Provider Modal */}
      <AiModelModal
        isOpen={isAiModalOpen}
        onClose={() => {
          setIsAiModalOpen(false);
          refreshAiState();
        }}
        onConfigChanged={(cfg: AiModelConfig) => {
          setAiConfig(cfg);
          refreshAiState();
        }}
      />
    </div>
  );
};
