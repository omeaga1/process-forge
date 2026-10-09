import React, { useMemo, useState } from 'react';
import type { ProcessGraph, ProcessNode } from '@process-forge/protocol';
import { terminalRole } from '@process-forge/protocol';
import { Monitor, Play, Pause, RotateCcw, ChevronRight } from 'lucide-react';
import { tint } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import type { PlantTelemetryState } from '../../types.js';
import { describeUnitBehavior } from '../../model/unitBehavior.js';
import { Button } from '../../ui/index.js';
import type { RunView } from '../dock/RunDigest.js';
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
  /** The run at the playhead: each unit shows its state and flow as the run plays. */
  run?: RunView;
  /** The line's product is bulk (liquid, powder): read in kg. */
  bulkLine?: boolean;
}

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1));

/** The line on a phone: what it is making, and every unit with what it does and what flows through it now. */
export const MobileFieldView: React.FC<MobileFieldViewProps> = ({
  graph,
  telemetry,
  isRunning,
  onToggleSimulation,
  onResetSimulation,
  onSwitchToCanvas,
  onUpdateNodeConfig,
  onUpdateNodeDressing,
  run,
  bulkLine
}) => {
  const { palette, font } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode = selectedId ? graph.nodes.find((n) => n.id === selectedId) ?? null : null;
  const behaviors = useMemo(() => new Map(graph.nodes.map((n) => [n.id, describeUnitBehavior(n, graph)])), [graph]);
  const t = telemetry.simulatedTimeSeconds;

  const stats = bulkLine
    ? [
        { label: 'Product so far', value: `${fmt(telemetry.productKg ?? 0)} kg` },
        { label: 'Average', value: `${t > 0 ? fmt(((telemetry.productKg ?? 0) / t) * 3600) : '0'} kg/h` },
        { label: 'Units', value: String(graph.nodes.filter((n) => n.kind !== 'TERMINAL').length) }
      ]
    : [
        { label: 'Finished', value: `${telemetry.totalPackaged.toLocaleString()}` },
        { label: 'Average', value: `${telemetry.averageRatePerMin.toFixed(1)} /min` },
        { label: 'Units', value: String(graph.nodes.filter((n) => n.kind !== 'TERMINAL').length) }
      ];

  const stateColor = (state?: string) =>
    state === 'RUNNING' || state === 'BUSY'
      ? palette.status.busy
      : state === 'STARVED'
        ? palette.status.starved
        : state === 'BLOCKED'
          ? palette.status.blocked
          : state === 'DOWN' || state === 'FAILED'
            ? palette.status.failed
            : palette.status.idle;

  const subtitle = (n: ProcessNode) => {
    const role = terminalRole(n);
    if (role) return `${role[0]!.toUpperCase()}${role.slice(1)} · ${(n.config as { material?: string }).material ?? 'stream'}`;
    return behaviors.get(n.id)?.headline ?? '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', backgroundColor: palette.background.canvas, color: palette.text.primary, overflow: 'hidden', fontFamily: font.sans }}>
      <div style={{ padding: '12px 16px', backgroundColor: palette.background.surface, borderBottom: `1px solid ${palette.border.default}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: isRunning ? palette.jade.glow : palette.text.secondary }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: isRunning ? palette.jade.glow : palette.text.muted }} />
              {isRunning ? 'Running' : t > 0 ? 'Paused' : 'Not run yet'}
              <span style={{ fontFamily: font.mono, color: palette.text.muted }}>{clock(t)}</span>
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>{graph.name}</h2>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <Button iconOnly icon={<Monitor size={15} />} label="Open the canvas" onClick={onSwitchToCanvas} />
            <Button iconOnly icon={<RotateCcw size={15} />} label="Reset the run" onClick={onResetSimulation} />
            <Button variant={isRunning ? 'warning' : 'primary'} icon={isRunning ? <Pause size={15} /> : <Play size={15} />} onClick={onToggleSimulation}>
              {isRunning ? 'Pause' : 'Run'}
            </Button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ padding: '8px 10px', borderRadius: 8, backgroundColor: palette.background.base, border: `1px solid ${palette.border.subtle}` }}>
              <div style={{ fontSize: 11, color: palette.text.muted }}>{s.label}</div>
              <div style={{ marginTop: 2, fontFamily: font.mono, fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {graph.nodes.map((n) => {
          const snap = run?.snapshot.get(n.id);
          const flow = snap?.kgPerHour;
          return (
            <button
              key={n.id}
              type="button"
              className="pf-focus"
              onClick={() => setSelectedId(n.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 12px 12px 14px',
                borderRadius: 10,
                border: `1px solid ${palette.border.default}`,
                borderLeft: `3px solid ${stateColor(snap?.state)}`,
                backgroundColor: palette.background.surface,
                color: palette.text.primary,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: font.sans
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</span>
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: palette.text.secondary,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {subtitle(n)}
                </div>
              </div>
              {snap && flow !== undefined && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(flow)}</div>
                  <div style={{ fontSize: 10.5, color: palette.text.muted }}>kg/h</div>
                </div>
              )}
              {snap && (
                <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: stateColor(snap.state), backgroundColor: tint(stateColor(snap.state), 0.14), textTransform: 'capitalize', flexShrink: 0 }}>
                  {snap.state.toLowerCase()}
                </span>
              )}
              <ChevronRight size={16} color={palette.text.muted} style={{ flexShrink: 0 }} />
            </button>
          );
        })}
      </div>

      <MobileUnitOpSheet
        node={selectedNode}
        isOpen={selectedNode !== null}
        onClose={() => setSelectedId(null)}
        graph={graph}
        {...(onUpdateNodeConfig ? { onUpdateConfig: onUpdateNodeConfig } : {})}
        {...(onUpdateNodeDressing ? { onUpdateDressing: onUpdateNodeDressing } : {})}
      />
    </div>
  );
};
