import React, { useState } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import type { ProcessGraph, ProcessNode } from '@process-forge/protocol';
import type { PlantTelemetryState } from '../../types.js';
import {
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  ChevronRight,
  Monitor
} from 'lucide-react';
import { MobileUnitOpSheet } from './MobileUnitOpSheet.js';

export interface MobileFieldViewProps {
  graph: ProcessGraph;
  telemetry: PlantTelemetryState;
  isRunning: boolean;
  onToggleSimulation: () => void;
  onResetSimulation: () => void;
  onSwitchToCanvas: () => void;
  onUpdateNodeConfig?: (nodeId: string, config: any) => void;
  onUpdateNodeDressing?: (nodeId: string, dressing: any) => void;
}

export const MobileFieldView: React.FC<MobileFieldViewProps> = ({
  graph,
  telemetry,
  isRunning,
  onToggleSimulation,
  onResetSimulation,
  onSwitchToCanvas,
  onUpdateNodeConfig,
  onUpdateNodeDressing
}) => {
  const { palette, elevation, space, radius: r } = useTheme();
  const OsakaJadePalette = palette;
  const [selectedNode, setSelectedNode] = useState<ProcessNode | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: OsakaJadePalette.background.canvas,
        color: OsakaJadePalette.text.primary,
        overflow: 'hidden',
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"
      }}
    >
      {/* Top Mobile Field Header */}
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: OsakaJadePalette.background.surface,
          borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: isRunning ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
                  boxShadow: isRunning ? `0 0 8px ${OsakaJadePalette.jade.glow}` : 'none'
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: isRunning ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.secondary, textTransform: 'uppercase' }}>
                {isRunning ? 'Running' : 'Paused'}
              </span>
              <span style={{ fontSize: 11, color: OsakaJadePalette.text.muted }}>•</span>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: OsakaJadePalette.text.secondary }}>
                {formatTime(telemetry.simulatedTimeSeconds)}
              </span>
            </div>
            <h2 style={{ margin: '2px 0 0 0', fontSize: 16, fontWeight: 800, color: OsakaJadePalette.text.primary }}>
              {graph.name}
            </h2>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onSwitchToCanvas}
              title="Switch to Desktop Canvas"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 10px',
                borderRadius: 6,
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.secondary,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Monitor size={13} />
              <span>Canvas</span>
            </button>

            <button
              onClick={onResetSimulation}
              title="Reset Simulation"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 8px',
                borderRadius: 6,
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.secondary,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={13} />
            </button>

            <button
              onClick={onToggleSimulation}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 6,
                backgroundColor: isRunning ? OsakaJadePalette.background.surfaceElevated : OsakaJadePalette.jade[500],
                border: isRunning ? `1px solid ${OsakaJadePalette.border.default}` : 'none',
                color: isRunning ? OsakaJadePalette.text.primary : OsakaJadePalette.text.inverse,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: isRunning ? 'none' : `0 0 10px ${OsakaJadePalette.jade.glow}44`
              }}
            >
              {isRunning ? <Pause size={13} /> : <Play size={13} />}
              <span>{isRunning ? 'Pause' : 'Start'}</span>
            </button>
          </div>
        </div>

        {/* Live Line KPIs Quick Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
            paddingTop: 4
          }}
        >
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.border.subtle}`
            }}
          >
            <div style={{ fontSize: 9, color: OsakaJadePalette.text.muted, textTransform: 'uppercase' }}>Throughput</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.jade.glow }}>
              {isRunning ? `${Math.round(telemetry.averageRatePerMin)} CPM` : '0 CPM'}
            </div>
          </div>

          <div
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.border.subtle}`
            }}
          >
            <div style={{ fontSize: 9, color: OsakaJadePalette.text.muted, textTransform: 'uppercase' }}>Packaged</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
              {telemetry.totalPackaged} Units
            </div>
          </div>

          <div
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.border.subtle}`
            }}
          >
            <div style={{ fontSize: 9, color: OsakaJadePalette.text.muted, textTransform: 'uppercase' }}>Equipment</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
              {graph.nodes.length} Units
            </div>
          </div>
        </div>
      </div>

      {/* Active Bottleneck Banner */}
      {telemetry.activeBottleneck && (
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            borderBottom: `1px solid ${OsakaJadePalette.border.glowAmber}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12
          }}
        >
          <AlertTriangle size={16} color={OsakaJadePalette.border.glowAmber} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ color: OsakaJadePalette.text.primary }}>Chokepoint Alarm: </strong>
            <span style={{ color: OsakaJadePalette.text.secondary }}>
              Labeler LB-500 accumulation at 92% buffer capacity
            </span>
          </div>
        </div>
      )}

      {/* Equipment Feed Scroll List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: OsakaJadePalette.text.muted, textTransform: 'uppercase', paddingLeft: 4 }}>
          Equipment Stream ({graph.nodes.length} Units)
        </div>

        {graph.nodes.map((node, index) => {
          const isBottleneck = node.id === telemetry.activeBottleneck;
          const isBlocked = isRunning && node.id === 'rotary-filler-300';
          const statusText = isBottleneck ? 'Bottleneck' : isBlocked ? 'Backpressure' : isRunning ? 'Nominal' : 'Standby';
          const statusColor = isBottleneck ? OsakaJadePalette.border.glowAmber : isBlocked ? OsakaJadePalette.status.failed : isRunning ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted;

          return (
            <div
              key={node.id}
              onClick={() => setSelectedNode(node)}
              style={{
                padding: `${space[3]}px`,
                borderRadius: r.md,
                backgroundColor: OsakaJadePalette.background.surface,
                border: isBottleneck ? `1px solid ${OsakaJadePalette.border.glowAmber}` : `1px solid ${OsakaJadePalette.border.default}`,
                boxShadow: isBottleneck ? elevation.glowWarning : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: space[2],
                cursor: 'pointer',
                transition: 'background-color 0.15s ease'
              }}
            >
              {/* Machine Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: OsakaJadePalette.jade.glow,
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      padding: '2px 6px',
                      borderRadius: 4
                    }}
                  >
                    #{index + 1}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                      {node.name}
                    </div>
                    <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted }}>
                      {node.kind.replace('_', ' ')}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      backgroundColor: `${statusColor}22`,
                      color: statusColor,
                      border: `1px solid ${statusColor}44`
                    }}
                  >
                    {statusText}
                  </span>
                  <ChevronRight size={16} color={OsakaJadePalette.text.muted} />
                </div>
              </div>

              {/* Machine Telemetry Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: 6,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  fontSize: 11
                }}
              >
                <div>
                  <span style={{ color: OsakaJadePalette.text.muted }}>Sub-Agent: </span>
                  <span style={{ color: OsakaJadePalette.jade.glow, fontWeight: 600 }}>
                    {node.assignedSubAgentId ?? `Agent ${node.name.split(' ')[0]}`}
                  </span>
                </div>

                <div>
                  <span style={{ color: OsakaJadePalette.text.muted }}>Nozzles: </span>
                  <span style={{ color: OsakaJadePalette.text.primary, fontWeight: 600 }}>
                    {node.dressing?.nozzles?.length ?? 2} ASME
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Slide-Up Mobile Bottom Sheet for Unit-Op inspection */}
      <MobileUnitOpSheet
        node={selectedNode}
        isOpen={selectedNode !== null}
        onClose={() => setSelectedNode(null)}
        onUpdateConfig={onUpdateNodeConfig}
        onUpdateDressing={onUpdateNodeDressing}
      />
    </div>
  );
};
