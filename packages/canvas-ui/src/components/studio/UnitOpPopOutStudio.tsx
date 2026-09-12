import React, { useState } from 'react';
import { OsakaJadePalette } from '@process-forge/theme';
import type { ProcessNode, UnitOpDressing } from '@process-forge/protocol';
import type { ChatMessage } from '../../types.js';
import { UnitAnim } from '../animations/EquipmentAnimations.js';
import { UnitOpDressingTab } from './UnitOpDressingTab.js';

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
  if (!isOpen || !node) return null;

  const [activeTab, setActiveTab] = useState<'CHAT' | 'PARAMETERS' | 'DRESSING' | 'SYSTEM_CONTEXT'>('CHAT');
  const [inputText, setInputText] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'agent',
      senderTitle: `UnitOpSubAgent [${node.name.split(' ')[0]}]`,
      text: `Hello! I am your dedicated machine software engineer for "${node.name}". I handle the mathematical state machine, dynamic cycle calculations, and port boundary contracts. How can we optimize this unit?`,
      timestamp: '14:26',
      suggestedPrompts: [
        'Recalculate cycle time for 5-gallon pails',
        'Add an automated optical reject chute',
        'Check mass balance against upstream reactor'
      ]
    }
  ]);

  const config = node.config as Record<string, unknown>;

  const handleSendMessage = (textToSend?: string) => {
    const message = textToSend || inputText;
    if (!message.trim()) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      senderTitle: 'Plant Engineer',
      text: message,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatHistory((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');

    // Simulated Sub-Agent Software Engineer Response
    setTimeout(() => {
      let agentReply = `I have analyzed your request for "${node.name}".`;
      let proposedConfigUpdate: Record<string, unknown> | null = null;

      if (message.toLowerCase().includes('5-gallon') || message.toLowerCase().includes('pail')) {
        agentReply =
          'Understood. Switching from 1-gal cans to 5-gal pails: volumetric flow requires increasing dwell time to 28.5s per fill cycle. Throughput will adjust from 45 cpm to 9 pails/min to conserve fluid mass balance.';
        proposedConfigUpdate = {
          containerVolumeGallons: 5.0,
          fillTimePerCycleSeconds: 28.5
        };
      } else if (message.toLowerCase().includes('reject') || message.toLowerCase().includes('chute')) {
        agentReply =
          'I have added an optical inspection reject gate to this unit. The defect scrap rate is set to 0.5%, with non-conforming containers diverting to a secondary gravity chute.';
        proposedConfigUpdate = {
          rejectRatePercentage: 0.5,
          rejectChuteEnabled: true
        };
      } else if (message.toLowerCase().includes('dressing') || message.toLowerCase().includes('jacket') || message.toLowerCase().includes('nozzle') || message.toLowerCase().includes('agitator')) {
        agentReply =
          'I have reconfigured the mechanical dressing for this unit: updated nozzle port elevations, installed a high-shear Rushton turbine, and attached a thermal utility jacket. You can view the live SVG model under the "Dressing & Nozzles" tab.';
        const newDressing: UnitOpDressing = {
          nozzles: node.dressing?.nozzles?.length ? node.dressing.nozzles : [
            { id: 'N1', name: 'Feed Inlet', role: 'inlet', x: 20, y: 15, position: 'top', sizeInches: 3, ratingPsi: 150 },
            { id: 'N2', name: 'Bottom Drain', role: 'drain', x: 50, y: 95, position: 'bottom', sizeInches: 2, ratingPsi: 150 }
          ],
          internals: {
            agitatorType: 'rushton',
            hasJacket: true,
            jacketType: 'steam',
            baffleCount: 4,
            packingType: 'none',
            hasDemister: false,
            hasSprayHeader: false
          }
        };
        onUpdateDressing?.(node.id, newDressing);
      } else {
        agentReply = `I have validated the kinematics for ${node.name}. Mass flow is in steady state with upstream feed (${upstreamContext}) and downstream queue (${downstreamContext}).`;
      }

      const agentMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'agent',
        senderTitle: `UnitOpSubAgent [${node.name.split(' ')[0]}]`,
        text: agentReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChatHistory((prev) => [...prev, agentMsg]);

      if (proposedConfigUpdate) {
        onUpdateConfig(node.id, { ...config, ...proposedConfigUpdate });
      }
    }, 600);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 580,
        height: '100vh',
        backgroundColor: OsakaJadePalette.background.surfaceElevated,
        borderLeft: `1px solid ${OsakaJadePalette.border.strong}`,
        boxShadow: '-8px 0 24px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        color: OsakaJadePalette.text.primary,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
          backgroundColor: OsakaJadePalette.background.surface
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 8,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.jade.glow}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden'
            }}
          >
            <UnitAnim kind={node.kind} dressing={node.dressing} isRunning={true} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: OsakaJadePalette.jade.glow, fontWeight: 700, textTransform: 'uppercase' }}>
              Unit-Op Sub-Agent Studio
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: OsakaJadePalette.text.primary, marginTop: 2 }}>
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
            fontSize: 14,
            width: 28,
            height: 28,
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ✕
        </button>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
          backgroundColor: OsakaJadePalette.background.surface
        }}
      >
        <button
          onClick={() => setActiveTab('CHAT')}
          style={{
            flex: 1,
            padding: '10px 0',
            backgroundColor: activeTab === 'CHAT' ? OsakaJadePalette.background.surfaceElevated : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'CHAT' ? `2px solid ${OsakaJadePalette.jade.glow}` : 'none',
            color: activeTab === 'CHAT' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
            fontWeight: 600,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          Sub-Agent Chat
        </button>

        <button
          onClick={() => setActiveTab('DRESSING')}
          style={{
            flex: 1,
            padding: '10px 0',
            backgroundColor: activeTab === 'DRESSING' ? OsakaJadePalette.background.surfaceElevated : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'DRESSING' ? `2px solid ${OsakaJadePalette.jade.glow}` : 'none',
            color: activeTab === 'DRESSING' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
            fontWeight: 600,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          Dressing & Nozzles
        </button>

        <button
          onClick={() => setActiveTab('PARAMETERS')}
          style={{
            flex: 1,
            padding: '10px 0',
            backgroundColor: activeTab === 'PARAMETERS' ? OsakaJadePalette.background.surfaceElevated : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'PARAMETERS' ? `2px solid ${OsakaJadePalette.jade.glow}` : 'none',
            color: activeTab === 'PARAMETERS' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
            fontWeight: 600,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          Controls
        </button>

        <button
          onClick={() => setActiveTab('SYSTEM_CONTEXT')}
          style={{
            flex: 1,
            padding: '10px 0',
            backgroundColor: activeTab === 'SYSTEM_CONTEXT' ? OsakaJadePalette.background.surfaceElevated : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'SYSTEM_CONTEXT' ? `2px solid ${OsakaJadePalette.jade.glow}` : 'none',
            color: activeTab === 'SYSTEM_CONTEXT' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
            fontWeight: 600,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          Context
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
                  <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, marginBottom: 4, fontWeight: 600 }}>
                    {msg.senderTitle} • {msg.timestamp}
                  </div>
                  <div>{msg.text}</div>

                  {/* Quick suggestion prompt pills */}
                  {msg.suggestedPrompts && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                      {msg.suggestedPrompts.map((p) => (
                        <button
                          key={p}
                          onClick={() => handleSendMessage(p)}
                          style={{
                            fontSize: 11,
                            backgroundColor: OsakaJadePalette.background.surfaceElevated,
                            color: OsakaJadePalette.jade.glow,
                            border: `1px solid ${OsakaJadePalette.border.default}`,
                            borderRadius: 14,
                            padding: '4px 10px',
                            textAlign: 'left',
                            cursor: 'pointer'
                          }}
                        >
                          ⚡ {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Chat Input Bar */}
          <div
            style={{
              padding: 12,
              borderTop: `1px solid ${OsakaJadePalette.border.default}`,
              display: 'flex',
              gap: 8,
              backgroundColor: OsakaJadePalette.background.surface
            }}
          >
            <input
              type="text"
              placeholder={`Instruct ${node.name.split(' ')[0]} Sub-Agent...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              style={{
                flex: 1,
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                borderRadius: 6,
                padding: '8px 12px',
                color: OsakaJadePalette.text.primary,
                fontSize: 13,
                outline: 'none'
              }}
            />
            <button
              onClick={() => handleSendMessage()}
              style={{
                backgroundColor: OsakaJadePalette.jade[500],
                color: OsakaJadePalette.text.inverse,
                border: 'none',
                borderRadius: 6,
                padding: '8px 14px',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer'
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
            These dynamic controls were generated by this machine&apos;s Sub-Agent to parameterize its internal physics and discrete cycle.
          </div>

          {Object.entries(config).map(([key, val]) => {
            if (typeof val === 'number') {
              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: OsakaJadePalette.text.primary, fontWeight: 600 }}>{key}</span>
                    <span style={{ color: OsakaJadePalette.jade.glow, fontFamily: 'monospace' }}>{val}</span>
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
                    style={{ accentColor: OsakaJadePalette.jade[500] }}
                  />
                </div>
              );
            }
            return null;
          })}
        </div>
      )}

      {/* Tab 3: Upstream/Downstream Boundary Context */}
      {activeTab === 'SYSTEM_CONTEXT' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
            Context passed down from the Master Orchestrator (Lead Systems Engineer) to help this unit maintain flow continuity:
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
            cursor: 'pointer'
          }}
        >
          🚀 Publish to ForgeHub
        </button>
      </div>
    </div>
  );
};
