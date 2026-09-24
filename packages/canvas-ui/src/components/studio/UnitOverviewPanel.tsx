import React, { useMemo } from 'react';
import type { ProcessGraph, ProcessNode } from '@process-forge/protocol';
import type { NodeTelemetrySnapshot } from '@process-forge/simulation-core';
import { ArrowRight, Droplets, Package, CircleSlash, Flag, Gauge, Info } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import { describeUnitBehavior, formatRate } from '../../model/unitBehavior.js';

interface UnitOverviewPanelProps {
  node: ProcessNode;
  graph: ProcessGraph;
  bottleneckNodeId?: string | null;
  /** The unit's state at the simulation's playhead, when there is a run. */
  live?: NodeTelemetrySnapshot | undefined;
  onOpenUnit?: (nodeId: string) => void;
}

type Port = ProcessNode['inputs'][number];

const STATE_TEXT: Record<string, { label: string; tone: 'ok' | 'warn' | 'muted' }> = {
  BUSY: { label: 'Working', tone: 'ok' },
  BLOCKED: { label: 'Blocked: the next unit is full', tone: 'warn' },
  STARVED: { label: 'Starved: waiting for input', tone: 'warn' },
  IDLE: { label: 'Idle', tone: 'muted' },
  FAILED: { label: 'Down', tone: 'warn' }
};

/**
 * What goes in, what the unit does to it, and what comes out -- with the
 * numbers the engine uses, the units on either side, and live figures while
 * the simulation runs.
 */
export const UnitOverviewPanel: React.FC<UnitOverviewPanelProps> = ({ node, graph, bottleneckNodeId, live, onOpenUnit }) => {
  const { palette, font, radius: r } = useTheme();
  const behavior = useMemo(() => describeUnitBehavior(node, graph), [node, graph]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const contractPorts = useMemo(() => {
    const ports = (node.config as { contract?: { ports?: { id: string; role?: string }[] } }).contract?.ports ?? [];
    return new Map(ports.map((p) => [p.id, p.role]));
  }, [node.config]);

  const peersOf = (port: Port, dir: 'in' | 'out') =>
    graph.edges
      .filter((e) =>
        dir === 'in'
          ? e.targetNodeId === node.id && (e.targetPortId === port.id || node.inputs.length === 1)
          : e.sourceNodeId === node.id && (e.sourcePortId === port.id || node.outputs.length === 1)
      )
      .map((e) => byId.get(dir === 'in' ? e.sourceNodeId : e.targetNodeId))
      .filter((n): n is ProcessNode => Boolean(n));

  const rate = formatRate(behavior.capacityPerMin, behavior.rateUnit);
  const rateLabel =
    behavior.capacityPerMin === null
      ? 'no rate limit of its own'
      : node.kind === 'BATCH_REACTOR'
        ? 'average, batch after batch'
        : behavior.rateUnit === 'gal'
          ? 'most it can move'
          : 'top rate, good units';
  const isBottleneck = bottleneckNodeId === node.id;

  const card: React.CSSProperties = {
    borderRadius: r.md,
    border: `1px solid ${palette.border.default}`,
    backgroundColor: palette.background.surface,
    padding: 10
  };
  const heading: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: palette.text.muted,
    marginBottom: 6
  };
  const chip = (text: string, tone: 'ok' | 'warn' | 'muted' | 'accent', icon?: React.ReactNode) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: tone === 'ok' ? palette.jade[500] : tone === 'warn' ? palette.status.blocked : tone === 'accent' ? palette.text.accent : palette.text.muted,
        backgroundColor:
          tone === 'ok' ? 'rgba(16, 185, 129, 0.1)' : tone === 'warn' ? 'rgba(245, 158, 11, 0.12)' : tone === 'accent' ? 'rgba(16, 185, 129, 0.08)' : palette.background.canvas
      }}
    >
      {icon}
      {text}
    </span>
  );

  const portBlock = (port: Port, dir: 'in' | 'out') => {
    const peers = peersOf(port, dir);
    const discrete = String(port.flowDimension).startsWith('DISCRETE');
    const role = contractPorts.get(port.id);
    const color = discrete ? palette.streams.discreteContainer : palette.streams.continuousFluid;
    return (
      <div key={port.id} style={{ ...card, padding: '8px 10px', borderLeft: `3px solid ${color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {discrete ? <Package size={13} color={color} /> : <Droplets size={13} color={color} />}
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {port.name}
          </span>
        </div>
        <div style={{ fontSize: 11, color: palette.text.muted, marginTop: 2 }}>
          {discrete ? 'Containers / parts' : 'Fluid'}
          {role && role !== 'MATERIAL' ? ` · ${role.toLowerCase()}` : ''}
        </div>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {peers.length === 0 ? (
            <span style={{ fontSize: 12, color: dir === 'in' ? palette.text.muted : palette.text.secondary }}>
              {dir === 'in' ? 'Not connected' : 'Leaves the line as output'}
            </span>
          ) : (
            peers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenUnit?.(p.id)}
                title={`Open ${p.name}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  color: palette.text.accent,
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: 'left',
                  cursor: onOpenUnit ? 'pointer' : 'default'
                }}
              >
                {dir === 'in' ? 'from ' : 'to '}
                <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>{p.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  };

  const column = (ports: Port[], dir: 'in' | 'out') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={heading}>{dir === 'in' ? 'In' : 'Out'}</div>
      {ports.length === 0 ? (
        <div style={{ ...card, fontSize: 12, color: palette.text.muted, display: 'flex', gap: 6, alignItems: 'center' }}>
          {dir === 'in' ? <Flag size={13} /> : <CircleSlash size={13} />}
          {dir === 'in' ? 'No inlets' : 'No outlets'}
        </div>
      ) : (
        ports.map((p) => portBlock(p, dir))
      )}
    </div>
  );

  const arrow = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 22 }}>
      <ArrowRight size={16} color={palette.text.muted} />
    </div>
  );

  const liveState = live ? STATE_TEXT[live.state] ?? { label: live.state, tone: 'muted' as const } : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* What it does, in one line. */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: palette.text.primary }}>{behavior.headline}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {behavior.simulated
            ? chip('Simulated', 'ok', <Gauge size={11} />)
            : chip('Not simulated yet', 'warn', <Info size={11} />)}
          {behavior.role === 'source' && chip('Start of the line', 'muted')}
          {behavior.role === 'end' && chip('End of the line', 'muted')}
          {behavior.role === 'unconnected' && chip('Not connected', 'warn')}
          {isBottleneck && chip('Sets the pace of the line', 'warn')}
        </div>
      </div>

      {/* In -> unit -> out. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 20px minmax(0, 0.9fr) 20px minmax(0, 1fr)', alignItems: 'start' }}>
        {column(node.inputs, 'in')}
        {arrow}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={heading}>Unit</div>
          <div
            style={{
              ...card,
              textAlign: 'center',
              padding: '12px 8px',
              borderColor: isBottleneck ? palette.status.blocked : palette.jade[600],
              backgroundColor: 'rgba(16, 185, 129, 0.05)'
            }}
          >
            <div style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, lineHeight: 1.1, color: palette.text.primary }}>
              {rate.value}
              <span style={{ fontSize: 13, color: palette.text.muted }}>{rate.per}</span>
            </div>
            <div style={{ fontSize: 11, color: palette.text.muted, marginTop: 4, lineHeight: 1.35 }}>
              {behavior.simulated ? rateLabel : 'no rate in the simulation'}
            </div>
          </div>
        </div>
        {arrow}
        {column(node.outputs, 'out')}
      </div>

      {/* Live, while there is a run. */}
      {/* Only for units the simulation steps: the rest would show zeros. */}
      {live && liveState && behavior.simulated && (
        <div>
          <div style={heading}>In the simulation now</div>
          <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            <div style={{ gridColumn: '1 / -1' }}>{chip(liveState.label, liveState.tone)}</div>
            {(live.levelGallons !== undefined
              ? [
                  ...(node.kind === 'PUMP' ? [] : [{ label: 'Holding (gal)', value: Math.round(live.levelGallons) }]),
                  ...(live.levelFraction !== undefined && node.kind !== 'PUMP'
                    ? [{ label: 'Full', value: `${Math.round(live.levelFraction * 100)}%` }]
                    : []),
                  { label: 'Flowing out (gpm)', value: Math.round((live.flowGpm ?? 0) * 10) / 10 },
                  ...(node.kind === 'BATCH_REACTOR'
                    ? [
                        { label: 'Batches done', value: live.unitsProduced },
                        { label: 'Now', value: live.phase ? live.phase.charAt(0) + live.phase.slice(1).toLowerCase() : '—' }
                      ]
                    : [])
                ]
              : [
                  { label: 'Made', value: live.unitsProduced },
                  { label: 'Scrapped', value: live.unitsScrapped },
                  { label: 'Waiting', value: live.bufferLevel },
                  { label: 'Average /min', value: Math.round(live.instantaneousRatePerMin * 10) / 10 }
                ]
            ).map((s: { label: string; value: number | string }) => (
              <div key={s.label}>
                <div style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {s.value.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: palette.text.muted }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contract units: the engine's own figures. */}
      {behavior.keyFigures && behavior.keyFigures.length > 0 && (
        <div>
          <div style={heading}>Computed by the engine</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {behavior.keyFigures.map((f) => (
              <div key={f.label} style={card}>
                <div style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 700 }}>
                  {Number.isFinite(f.value) ? f.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}{' '}
                  <span style={{ fontSize: 12, color: palette.text.muted, fontWeight: 500 }}>{f.unit}</span>
                </div>
                <div style={{ fontSize: 12, color: palette.text.secondary, marginTop: 2 }}>{f.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How the engine models it. */}
      <div>
        <div style={heading}>How the simulation models it</div>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {behavior.details.map((d) => (
            <li key={d} style={{ fontSize: 13, lineHeight: 1.5, color: palette.text.secondary }}>
              {d}
            </li>
          ))}
          {node.outputs.length > 1 && (
            <li style={{ fontSize: 13, lineHeight: 1.5, color: palette.text.secondary }}>
              With more than one outlet, output is dealt out one unit at a time to each in turn.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};
