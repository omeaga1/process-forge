import React, { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import {
  type ProcessNode,
  type UnitOpDressing
} from '@process-forge/protocol';
import type { ChatMessage } from '../../types.js';
import { UnitAnim, CustomEquipmentAnim } from '../animations/EquipmentAnimations.js';
import { UnitOpDressingTab } from './UnitOpDressingTab.js';
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
import { Loader2, X, Check, Upload, Sliders, MessageSquare, Palette, Network, KeyRound } from 'lucide-react';

interface UnitOpPopOutStudioProps {
  node: ProcessNode | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateConfig: (nodeId: string, updatedConfig: Record<string, unknown>) => void;
  onUpdateDressing?: (nodeId: string, updatedDressing: UnitOpDressing) => void;
  onPublishToForgeHub: (node: ProcessNode) => void;
  upstreamContext?: string;
  downstreamContext?: string;
}

export const UnitOpPopOutStudio: React.FC<UnitOpPopOutStudioProps> = ({
  node,
  isOpen,
  onClose,
  onUpdateConfig,
  onUpdateDressing,
  onPublishToForgeHub,
  upstreamContext = 'Reactor B-101 (45 gal/min Latex)',
  downstreamContext = 'Conveyor CV-400 (48 cans/min capacity)'
}) => {
  const { palette, radius: r } = useTheme();
  const OsakaJadePalette = palette;
  const [activeTab, setActiveTab] = useState<'CHAT' | 'PARAMETERS' | 'DRESSING' | 'SYSTEM_CONTEXT'>('CHAT');
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

  if (!isOpen || !node) return null;

  const config = node.config as Record<string, unknown>;

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
        senderTitle: `UnitOpForge [${node.name.split(' ')[0]}]`,
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
        boxShadow: '-8px 0 28px rgba(0,0,0,0.4)',
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
              borderRadius: 8,
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
                Unit-Op Studio
              </span>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(true)}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 12,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: OsakaJadePalette.jade.glow,
                  border: `1px solid ${OsakaJadePalette.jade[600]}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer'
                }}
                title="Configure AI Model / Provider"
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
                <span>{lockStatus.unlocked ? (PROVIDER_METADATA[aiConfig.provider]?.badgeName || 'AI Assistant') : 'Local Engine'}</span>
              </button>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: OsakaJadePalette.text.primary, marginTop: 2 }}>
              {node.name}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
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

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
          backgroundColor: OsakaJadePalette.background.surface,
          flexShrink: 0
        }}
      >
        <button
          onClick={() => setActiveTab('CHAT')}
          style={{
            flex: 1,
            padding: '10px 6px',
            backgroundColor: activeTab === 'CHAT' ? OsakaJadePalette.background.surfaceElevated : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'CHAT' ? `2px solid ${OsakaJadePalette.jade.glow}` : '2px solid transparent',
            color: activeTab === 'CHAT' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            whiteSpace: 'nowrap'
          }}
        >
          <MessageSquare size={13} />
          <span>Forge</span>
        </button>

        <button
          onClick={() => setActiveTab('DRESSING')}
          style={{
            flex: 1,
            padding: '10px 6px',
            backgroundColor: activeTab === 'DRESSING' ? OsakaJadePalette.background.surfaceElevated : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'DRESSING' ? `2px solid ${OsakaJadePalette.jade.glow}` : '2px solid transparent',
            color: activeTab === 'DRESSING' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            whiteSpace: 'nowrap'
          }}
        >
          <Palette size={13} />
          <span>Dressing & Nozzles</span>
        </button>

        <button
          onClick={() => setActiveTab('PARAMETERS')}
          style={{
            flex: 1,
            padding: '10px 6px',
            backgroundColor: activeTab === 'PARAMETERS' ? OsakaJadePalette.background.surfaceElevated : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'PARAMETERS' ? `2px solid ${OsakaJadePalette.jade.glow}` : '2px solid transparent',
            color: activeTab === 'PARAMETERS' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            whiteSpace: 'nowrap'
          }}
        >
          <Sliders size={13} />
          <span>Controls</span>
        </button>

        <button
          onClick={() => setActiveTab('SYSTEM_CONTEXT')}
          style={{
            flex: 1,
            padding: '10px 6px',
            backgroundColor: activeTab === 'SYSTEM_CONTEXT' ? OsakaJadePalette.background.surfaceElevated : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'SYSTEM_CONTEXT' ? `2px solid ${OsakaJadePalette.jade.glow}` : '2px solid transparent',
            color: activeTab === 'SYSTEM_CONTEXT' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            whiteSpace: 'nowrap'
          }}
        >
          <Network size={13} />
          <span>Context</span>
        </button>
      </div>

      {/* Tab 1: Dedicated Machine Sub-Agent Chat */}
      {activeTab === 'CHAT' && (
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
                    borderRadius: 8,
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
                        borderRadius: 4,
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
                        borderRadius: 8,
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
                          borderRadius: 6,
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
                            borderRadius: 6,
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
                            borderRadius: 6,
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
                  borderRadius: 8,
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
              <span>Local CAD & mechanical solver active</span>
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
                borderRadius: 6,
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
                borderRadius: 6,
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
      {activeTab === 'DRESSING' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <UnitOpDressingTab
            node={node}
            onUpdateDressing={(updatedDressing) => onUpdateDressing?.(node.id, updatedDressing)}
          />
        </div>
      )}

      {/* Tab 3: Generative Parameter Controls */}
      {activeTab === 'PARAMETERS' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
            Configure mechanical design tolerances, processing rates, and operational parameters for this Unit-Op:
          </div>

          {Object.entries(config).map(([key, val]) => {
            if (typeof val === 'number') {
              const humanized = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
              return (
                <div
                  key={key}
                  style={{
                    backgroundColor: OsakaJadePalette.background.surface,
                    border: `1px solid ${OsakaJadePalette.border.default}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: OsakaJadePalette.text.primary, fontWeight: 600, fontSize: 13 }}>
                        {humanized}
                      </div>
                      <div style={{ color: OsakaJadePalette.text.muted, fontSize: 10, fontFamily: 'monospace' }}>
                        {key}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(100, val * 2)}
                        value={val}
                        onChange={(e) => {
                          const newNum = parseFloat(e.target.value) || 0;
                          onUpdateConfig(node.id, { ...config, [key]: newNum });
                        }}
                        style={{
                          width: 75,
                          padding: '4px 6px',
                          borderRadius: 4,
                          backgroundColor: OsakaJadePalette.background.surfaceElevated,
                          border: `1px solid ${OsakaJadePalette.border.subtle}`,
                          color: OsakaJadePalette.jade.glow,
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          textAlign: 'right'
                        }}
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(100, val * 2)}
                    value={val}
                    onChange={(e) => {
                      const newNum = parseFloat(e.target.value);
                      onUpdateConfig(node.id, { ...config, [key]: newNum });
                    }}
                    style={{ accentColor: OsakaJadePalette.jade[500], width: '100%' }}
                  />
                </div>
              );
            }
            return null;
          })}
        </div>
      )}

      {/* Tab 4: Upstream/Downstream Boundary Context */}
      {activeTab === 'SYSTEM_CONTEXT' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
            Upstream and downstream flowsheet boundary conditions:
          </div>

          <div style={{ backgroundColor: OsakaJadePalette.background.surface, padding: 12, borderRadius: 8, border: `1px solid ${OsakaJadePalette.border.default}` }}>
            <div style={{ fontSize: 10, color: OsakaJadePalette.jade.glow, fontWeight: 700 }}>UPSTREAM FEED CONTEXT</div>
            <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>{upstreamContext}</div>
          </div>

          <div style={{ backgroundColor: OsakaJadePalette.background.surface, padding: 12, borderRadius: 8, border: `1px solid ${OsakaJadePalette.border.default}` }}>
            <div style={{ fontSize: 10, color: OsakaJadePalette.status.starved, fontWeight: 700 }}>DOWNSTREAM SINK CONTEXT</div>
            <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>{downstreamContext}</div>
          </div>
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
            borderRadius: 6,
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
