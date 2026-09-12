import React, { useState } from 'react';
import { OsakaJadePalette } from '@process-forge/theme';
import type { ProcessGraph, BottleneckAnalysis } from '@process-forge/protocol';
import type { ChatMessage, PlantTelemetryState } from '../../types.js';

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
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: 'master-init',
      sender: 'master_orchestrator',
      senderTitle: 'Lead Orchestration Engineer (Master Agent)',
      text: `Process simulation initialized for "${graph.name}". I am monitoring whole-plant mass balance and line bottlenecks across all ${graph.nodes.length} unit operations.`,
      timestamp: '14:26',
      suggestedPrompts: [
        'Where are the bottlenecks in this line?',
        'Audit mass and volumetric conservation',
        'Broadcast boundary context to sub-agents'
      ]
    }
  ]);

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      senderTitle: 'Lead Process Engineer',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatHistory((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');

    setTimeout(() => {
      let reply = '';
      if (text.toLowerCase().includes('bottleneck')) {
        const bnId = bottlenecks.bottleneckNodeId;
        const bnNode = graph.nodes.find((n) => n.id === bnId);
        reply = bnNode
          ? `Analysis complete: The primary line bottleneck is "${bnNode.name}". It is capping plant throughput at ${Math.round(bottlenecks.maximumSystemThroughputUnitsPerMin)} units/min. Upstream filler is experiencing backpressure buffer stalls.`
          : 'No severe bottlenecks detected. All unit operations are operating within balanced margins.';
      } else if (text.toLowerCase().includes('audit') || text.toLowerCase().includes('conservation')) {
        reply =
          'Mass Balance Audit: Upstream batch reactor yields 50 gpm latex paint. Surge tank ST-200 smooths discharge to 45 gpm. At 1.0 gal/can, required discrete rate is 45 cans/min. The mass balance is conserved with zero mathematical drift.';
      } else if (text.toLowerCase().includes('broadcast')) {
        onBroadcastContext();
        reply =
          'I have broadcasted boundary conditions (inlet flow, fluid temperature, viscosity) to all active Unit-Op Sub-Agents. Their internal cycle calculators have re-synchronized.';
      } else {
        reply = `Systems check: ${graph.nodes.length} units online. Total packaged output is ${telemetry.totalPackaged} units at ${Math.round(telemetry.averageRatePerMin)} units/min.`;
      }

      const agentMsg: ChatMessage = {
        id: `mst-${Date.now() + 1}`,
        sender: 'master_orchestrator',
        senderTitle: 'Lead Orchestration Engineer (Master Agent)',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChatHistory((prev) => [...prev, agentMsg]);
    }, 500);
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
            <div style={{ fontSize: 10, color: OsakaJadePalette.jade.glow, fontWeight: 700, textTransform: 'uppercase' }}>
              Master Orchestrator
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
              cursor: 'pointer'
            }}
          >
            🏪 ForgeHub
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
              <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, marginBottom: 4, fontWeight: 600 }}>
                {msg.senderTitle} • {msg.timestamp}
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
          backgroundColor: OsakaJadePalette.background.base
        }}
      >
        <input
          type="text"
          placeholder="Ask Lead Orchestration Engineer..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          style={{
            flex: 1,
            backgroundColor: OsakaJadePalette.background.surfaceElevated,
            border: `1px solid ${OsakaJadePalette.border.default}`,
            borderRadius: 6,
            padding: '8px 10px',
            color: OsakaJadePalette.text.primary,
            fontSize: 12,
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
            padding: '8px 12px',
            fontWeight: 700,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};
