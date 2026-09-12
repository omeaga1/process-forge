import React, { useState, useEffect } from 'react';
import { OsakaJadePalette } from '@process-forge/theme';
import type { ProcessGraph, BottleneckAnalysis } from '@process-forge/protocol';
import type { ChatMessage, PlantTelemetryState } from '../../types.js';
import {
  getAiConfig,
  PROVIDER_METADATA,
  type AiModelConfig
} from '../../ai/aiModelManager.js';
import { dispatchMasterOrchestratorMessage } from '../../ai/aiDispatch.js';
import { AiModelModal } from '../modals/AiModelModal.js';
import { Cpu, Zap, Loader2, ShoppingBag } from 'lucide-react';

interface MasterOrchestratorDockProps {
  graph: ProcessGraph;
  bottlenecks: BottleneckAnalysis;
  telemetry: PlantTelemetryState;
  isRunning: boolean;
  onToggleSimulation: () => void;
  onResetSimulation: () => void;
  onOpenForgeHub: () => void;
  onBroadcastContext: () => void;
}

export const MasterOrchestratorDock: React.FC<MasterOrchestratorDockProps> = ({
  graph,
  bottlenecks,
  telemetry,
  isRunning,
  onToggleSimulation,
  onResetSimulation,
  onOpenForgeHub,
  onBroadcastContext
}) => {
  const [inputText, setInputText] = useState('');
  const [aiConfig, setAiConfig] = useState<AiModelConfig>(getAiConfig());
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    setAiConfig(getAiConfig());
  }, []);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: 'master-init',
      sender: 'master_orchestrator',
      senderTitle: 'Lead Orchestration Engineer (Master Agent)',
      text: `Process simulation initialized for "${graph.name}". I am monitoring whole-plant mass balance and line bottlenecks across all ${graph.nodes.length} unit operations.`,
      timestamp: '14:26',
      modelBadge: PROVIDER_METADATA[getAiConfig().provider]?.badgeName || 'Offline (Local)',
      isOffline: getAiConfig().provider === 'offline',
      suggestedPrompts: [
        'Where are the bottlenecks in this line?',
        'Audit mass and volumetric conservation',
        'Broadcast boundary context to sub-agents'
      ]
    }
  ]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isProcessing) return;

    if (text.toLowerCase().includes('broadcast')) {
      onBroadcastContext();
    }

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

      const agentMsg: ChatMessage = {
        id: `mst-${Date.now() + 1}`,
        sender: 'master_orchestrator',
        senderTitle: 'Lead Orchestration Engineer (Master Agent)',
        text: res.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelBadge: res.senderBadge,
        isOffline: res.isOfflineSolver
      };

      setChatHistory((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      console.error('Master orchestrator dispatch error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

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
        zIndex: 10
      }}
    >
      {/* Header with Title & Playback Controls */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
          backgroundColor: OsakaJadePalette.background.base
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: OsakaJadePalette.jade.glow, fontWeight: 700, textTransform: 'uppercase' }}>
                Master Orchestrator
              </span>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(true)}
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 10,
                  backgroundColor: aiConfig.provider === 'offline' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(16, 185, 129, 0.15)',
                  color: aiConfig.provider === 'offline' ? OsakaJadePalette.text.secondary : OsakaJadePalette.jade.glow,
                  border: `1px solid ${aiConfig.provider === 'offline' ? OsakaJadePalette.border.default : OsakaJadePalette.jade.glow}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  cursor: 'pointer'
                }}
                title="Configure AI Model / Provider"
              >
                {aiConfig.provider === 'offline' ? <Zap size={10} /> : <Cpu size={10} />}
                <span>{PROVIDER_METADATA[aiConfig.provider]?.badgeName || 'Offline'}</span>
              </button>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
              Plant Systems Console
            </div>
          </div>

          <button
            onClick={onOpenForgeHub}
            style={{
              backgroundColor: OsakaJadePalette.jade.muted,
              color: OsakaJadePalette.jade.glow,
              border: `1px solid ${OsakaJadePalette.jade[600]}`,
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            <ShoppingBag size={13} />
            <span>ForgeHub</span>
          </button>
        </div>

        {/* Simulation Playback Bar */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onToggleSimulation}
            style={{
              flex: 1,
              backgroundColor: isRunning ? OsakaJadePalette.status.blocked : OsakaJadePalette.jade[500],
              color: OsakaJadePalette.text.inverse,
              border: 'none',
              borderRadius: 6,
              padding: '8px 0',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            {isRunning ? '⏸ Pause Simulation' : '▶ Run Simulation'}
          </button>

          <button
            onClick={onResetSimulation}
            style={{
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              color: OsakaJadePalette.text.secondary,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ⏮ Reset
          </button>
        </div>
      </div>

      {/* Whole-Plant Telemetry Dashboard Banner */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
          backgroundColor: OsakaJadePalette.background.surfaceElevated,
          fontSize: 11
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: OsakaJadePalette.text.muted }}>PLANT OUTPUT:</span>
          <span style={{ fontWeight: 700, color: OsakaJadePalette.jade.glow }}>
            {telemetry.totalPackaged} CANS
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: OsakaJadePalette.text.muted }}>ACTIVE BOTTLENECK:</span>
          <span style={{ fontWeight: 700, color: OsakaJadePalette.status.blocked }}>
            {bottlenecks.bottleneckNodeId ? bottlenecks.bottleneckNodeId.toUpperCase() : 'NONE'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: OsakaJadePalette.text.muted }}>THROUGHPUT CAP:</span>
          <span style={{ fontWeight: 600, color: OsakaJadePalette.text.primary }}>
            {Math.round(bottlenecks.maximumSystemThroughputUnitsPerMin)} cans/min
          </span>
        </div>
      </div>

      {/* Chat History with Master Orchestrator */}
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
        {/* Offline Notification Banner */}
        {aiConfig.provider === 'offline' && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${OsakaJadePalette.border.default}`,
              fontSize: 10,
              lineHeight: 1.4,
              color: OsakaJadePalette.text.secondary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6
            }}
          >
            <div>
              <strong style={{ color: OsakaJadePalette.text.primary }}>Offline Mode: </strong>
              Local simulation physics running. Connect MCP or OAuth to consult Master Agent.
            </div>
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: OsakaJadePalette.jade.glow,
                fontWeight: 700,
                fontSize: 10,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Connect AI
            </button>
          </div>
        )}

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

              {msg.suggestedPrompts && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {msg.suggestedPrompts.map((p) => (
                    <button
                      key={p}
                      onClick={() => handleSendMessage(p)}
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
              {aiConfig.provider === 'offline'
                ? 'Auditing kinematics & conservation...'
                : `Consulting ${PROVIDER_METADATA[aiConfig.provider]?.badgeName}...`}
            </span>
          </div>
        )}
      </div>

      {/* Chat Input Bar */}
      <div
        style={{
          padding: 12,
          borderTop: `1px solid ${OsakaJadePalette.border.default}`,
          display: 'flex',
          gap: 8,
          backgroundColor: OsakaJadePalette.background.base,
          alignItems: 'center'
        }}
      >
        {aiConfig.provider === 'offline' ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              fontSize: 11,
              color: OsakaJadePalette.text.muted
            }}
          >
            <span>Orchestrator offline. Connect MCP or OAuth.</span>
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              style={{
                padding: '4px 10px',
                borderRadius: 5,
                backgroundColor: OsakaJadePalette.jade.glow,
                color: OsakaJadePalette.background.base,
                border: 'none',
                fontWeight: 700,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              Connect AI
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder={isProcessing ? 'Processing...' : 'Ask Lead Orchestration Engineer...'}
              value={inputText}
              disabled={isProcessing}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isProcessing && handleSendMessage()}
              style={{
                flex: 1,
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                borderRadius: 6,
                padding: '8px 10px',
                color: OsakaJadePalette.text.primary,
                fontSize: 12,
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
                padding: '8px 12px',
                fontWeight: 700,
                fontSize: 11,
                cursor: isProcessing || !inputText.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              Send
            </button>
          </>
        )}
      </div>

      {/* AI Model & Provider Modal */}
      <AiModelModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onConfigChanged={(cfg) => setAiConfig(cfg)}
      />
    </div>
  );
};
