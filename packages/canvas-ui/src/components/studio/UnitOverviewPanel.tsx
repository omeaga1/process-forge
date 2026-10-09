import React, { useEffect, useMemo, useState } from 'react';
import { nodePortPhase, terminalRole, terminalMaterial, TERMINAL_ROLE_LABEL, type ProcessGraph, type ProcessNode } from '@process-forge/protocol';
import { simulateProcess, type NodeTelemetrySnapshot, type SimulationResult } from '@process-forge/simulation-core';
import { ArrowDownRight, ArrowUpRight, Gauge, Info, Loader2, ChevronRight } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import { describeUnitBehavior, formatRate } from '../../model/unitBehavior.js';
import { streamFigures, terminalFigure, type StreamFigure } from '../../model/lineStreams.js';
import { formatQuantity } from '../../model/parameterUi.js';
import { tint } from '@process-forge/theme';

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

/** Minutes of line the overview runs to show what moves where. */
const ESTIMATE_MINUTES = 20;

/**
 * The line's streams as the engine has them: a short run of the whole
 * flowsheet, in the background, redone when the flowsheet changes. It is the
 * same engine and the same contracts as Run, so every figure on the overview
 * is one the simulation would give.
 */
function useLineRun(graph: ProcessGraph): { result: SimulationResult | null; running: boolean } {
  const [state, setState] = useState<{ result: SimulationResult | null; running: boolean }>({ result: null, running: true });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, running: true }));
    const t = setTimeout(() => {
      try {
        const result = simulateProcess(graph, ESTIMATE_MINUTES);
        if (!cancelled) setState({ result, running: false });
      } catch {
        if (!cancelled) setState({ result: null, running: false });
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [graph]);
  return state;
}

/**
 * What comes in, what the unit does with it, and what goes out, with the
 * figures on every connection: kg/h, °C and what the stream is made of. A
 * feed or an outlet leads with what it supplies or receives.
 */
export const UnitOverviewPanel: React.FC<UnitOverviewPanelProps> = ({ node, graph, bottleneckNodeId, live, onOpenUnit }) => {
  const { palette, font, radius: r, theme } = useTheme();
  // Coloured text on its own tint: on the light theme the colour needs deepening to read (WCAG AA).
  const readable = (c: string) => (theme === 'light' ? `color-mix(in srgb, ${c} 55%, ${palette.text.primary})` : c);
  const behavior = useMemo(() => describeUnitBehavior(node, graph), [node, graph]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const { result, running } = useLineRun(graph);
  const figures = useMemo(() => (result ? streamFigures(graph, result) : new Map<string, StreamFigure>()), [graph, result]);
  const role = terminalRole(node);
  const isBottleneck = bottleneckNodeId === node.id;

  const COMPONENT_COLORS = [palette.streams.continuousFluid, palette.text.gold, palette.jade[400], palette.streams.solid, palette.streams.gas, palette.status.blocked, palette.streams.hot];
  const colorFor = (i: number) => COMPONENT_COLORS[i % COMPONENT_COLORS.length]!;
  const phaseColor = (phase?: string, items?: boolean) =>
    items ? palette.streams.discreteContainer : phase === 'GAS' ? palette.streams.gas : phase === 'SOLID' ? palette.streams.solid : palette.streams.continuousFluid;

  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: palette.text.secondary };
  const card: React.CSSProperties = { borderRadius: r.lg, border: `1px solid ${palette.border.default}`, background: palette.background.surface };
  const chip = (text: string, tone: 'ok' | 'warn' | 'muted', icon?: React.ReactNode) => {
    const c = tone === 'ok' ? palette.jade[500] : tone === 'warn' ? palette.status.blocked : palette.text.muted;
    // Text bright enough to read on its own tint (WCAG AA).
    const fg = tone === 'ok' ? readable(palette.jade.glow) : tone === 'warn' ? readable(palette.status.blocked) : palette.text.secondary;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: r.full, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', color: fg, background: tint(c, 0.12) }}>
        {icon}
        {text}
      </span>
    );
  };

  /** A stream's composition as one bar, with its parts named underneath. */
  const CompositionBar: React.FC<{ comp: [string, number][] }> = ({ comp }) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: palette.border.subtle }}>
        {comp.map(([c, x], i) => (
          <div key={c} title={`${c} ${formatQuantity(x * 100)} %`} style={{ width: `${x * 100}%`, background: colorFor(i) }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 4, fontSize: 12, color: palette.text.secondary }}>
        {comp.slice(0, 5).map(([c, x], i) => (
          <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: colorFor(i) }} />
            {c} <span style={{ fontFamily: font.mono, color: palette.text.primary }}>{formatQuantity(x * 100)} %</span>
          </span>
        ))}
      </div>
    </div>
  );

  /** The figures for one stream, in its own units. */
  const Figures: React.FC<{ f?: StreamFigure | undefined; big?: boolean }> = ({ f, big }) => {
    if (!f) return <span style={{ fontSize: 12, color: palette.text.muted }}>{running ? 'working it out…' : 'nothing moves here in a run'}</span>;
    const main =
      f.itemsPerMinute !== undefined
        ? { v: formatQuantity(f.itemsPerMinute), u: 'items/min' }
        : f.kgPerHour !== undefined
          ? { v: formatQuantity(f.kgPerHour), u: 'kg/h' }
          : undefined;
    const second = [
      f.temperatureC !== undefined ? `${formatQuantity(f.temperatureC)} °C` : '',
      f.acfm !== undefined && f.phase === 'GAS' ? `${formatQuantity(f.acfm)} ACFM` : f.gallonsPerMinute !== undefined && f.phase !== 'GAS' && f.phase !== 'SOLID' ? `${formatQuantity(f.gallonsPerMinute)} gal/min` : ''
    ].filter(Boolean);
    return (
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {main && (
          <div style={{ fontFamily: font.mono, fontSize: big ? 22 : 15, fontWeight: 700, color: palette.text.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
            {main.v} <span style={{ fontSize: big ? 12 : 11, fontWeight: 500, color: palette.text.muted }}>{main.u}</span>
          </div>
        )}
        {second.length > 0 && <div style={{ fontFamily: font.mono, fontSize: 12, color: palette.text.secondary, marginTop: 2 }}>{second.join(' · ')}</div>}
      </div>
    );
  };

  const peerLink = (id: string, prefix: string, port?: string) => {
    const n = byId.get(id);
    if (!n) return null;
    return (
      <button
        type="button"
        onClick={() => onOpenUnit?.(id)}
        title={`Open ${n.name}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: 0, border: 'none', background: 'none', color: palette.text.accent, fontSize: 12, fontWeight: 600, cursor: onOpenUnit ? 'pointer' : 'default', textAlign: 'left' }}
      >
        {prefix} <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>{n.name}</span>
        {port ? <span style={{ color: palette.text.muted, fontWeight: 500 }}> · {port}</span> : null}
        <ChevronRight size={12} />
      </button>
    );
  };

  /** One connection of this unit: what it is, where it goes, what it carries. */
  const StreamRow: React.FC<{ port: Port; dir: 'in' | 'out' }> = ({ port, dir }) => {
    const items = String(port.flowDimension).startsWith('DISCRETE');
    const phase = items ? undefined : nodePortPhase(node, port.id);
    const edges = graph.edges.filter((e) => (dir === 'in' ? e.targetNodeId === node.id && e.targetPortId === port.id : e.sourceNodeId === node.id && e.sourcePortId === port.id));
    const color = phaseColor(phase, items);
    const f = edges.length ? figures.get(edges[0]!.id) : undefined;
    const sum = edges.length > 1 && f ? { ...f, ...(f.kgPerHour !== undefined ? { kgPerHour: edges.reduce((a, e) => a + (figures.get(e.id)?.kgPerHour ?? 0), 0) } : {}) } : f;
    const Arrow = dir === 'in' ? ArrowDownRight : ArrowUpRight;
    return (
      <div style={{ ...card, padding: '10px 12px', borderLeft: `3px solid ${color}` }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Arrow size={15} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: palette.text.primary }}>{port.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: readable(color), padding: '1px 6px', borderRadius: r.full, background: tint(color, 0.14) }}>
                {items ? 'items' : (phase ?? 'liquid').toLowerCase()}
              </span>
            </div>
            <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {edges.length === 0 ? (
                <span style={{ fontSize: 12, color: palette.text.muted }}>{dir === 'in' ? 'Not connected' : 'Not piped on: leaves the line here'}</span>
              ) : (
                edges.map((e) => <div key={e.id}>{peerLink(dir === 'in' ? e.sourceNodeId : e.targetNodeId, dir === 'in' ? 'from' : 'to')}</div>)
              )}
            </div>
          </div>
          {edges.length > 0 && <Figures f={sum} />}
        </div>
        {sum?.composition && sum.composition.length > 1 && <CompositionBar comp={sum.composition} />}
      </div>
    );
  };

  const source = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: palette.text.muted }}>
      {running ? <Loader2 size={12} style={{ animation: 'pf-spin 1s linear infinite' }} /> : <Info size={12} />}
      {running
        ? 'Running the line to work out the streams…'
        : result
          ? `Figures from a ${ESTIMATE_MINUTES}-minute run of this line, by the same engine as Run.`
          : 'The line could not be simulated as it stands.'}
    </div>
  );

  const liveState = live ? STATE_TEXT[live.state] ?? { label: live.state, tone: 'muted' as const } : null;

  // ---- a feed or an outlet: what it supplies or receives, first ----------------
  if (role) {
    const t = result ? terminalFigure(node.id, result) : undefined;
    const isFeed = role === 'feed';
    const items = node.outputs.concat(node.inputs).some((p) => String(p.flowDimension).startsWith('DISCRETE'));
    const edges = graph.edges.filter((e) => (isFeed ? e.sourceNodeId === node.id : e.targetNodeId === node.id));
    const color = phaseColor(t?.phase, items);
    const tiles = t
      ? [
          t.itemsPerMinute !== undefined
            ? { label: isFeed ? 'Supplies' : 'Receives', value: formatQuantity(t.itemsPerMinute), unit: 'items/min' }
            : { label: isFeed ? 'Supplies' : 'Receives', value: formatQuantity(t.kgPerHour ?? 0), unit: 'kg/h' },
          ...(t.temperatureC !== undefined ? [{ label: 'Temperature', value: formatQuantity(t.temperatureC), unit: '°C' }] : []),
          ...(t.gallonsPerMinute !== undefined && t.phase !== 'GAS' && t.phase !== 'SOLID' && !items ? [{ label: 'Volume', value: formatQuantity(t.gallonsPerMinute), unit: 'gal/min' }] : []),
          ...(t.totalKg !== undefined ? [{ label: `In ${ESTIMATE_MINUTES} min`, value: formatQuantity(t.totalKg), unit: 'kg' }] : t.totalUnits !== undefined ? [{ label: `In ${ESTIMATE_MINUTES} min`, value: formatQuantity(t.totalUnits), unit: 'items' }] : [])
        ]
      : [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 450, lineHeight: 1.55, color: palette.text.secondary, textWrap: 'pretty' }}>{behavior.headline}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {chip(TERMINAL_ROLE_LABEL[role], role === 'waste' ? 'warn' : 'ok')}
            {chip(role === 'product' ? "Counts as the line's output" : role === 'feed' ? 'Start of the line' : 'Totalled apart from the output', 'muted')}
          </div>
        </div>

        <div style={{ ...card, overflow: 'hidden', borderTop: `3px solid ${color}` }}>
          <div style={{ padding: '12px 14px 4px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: palette.text.primary }}>{terminalMaterial(node)}</span>
            <span style={{ fontSize: 12, color: palette.text.muted }}>{items ? 'items' : (t?.phase ?? 'liquid').toLowerCase()}</span>
          </div>
          {tiles.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(tiles.length, 4)}, minmax(0, 1fr))` }}>
              {tiles.map((x, i) => (
                <div key={x.label} style={{ padding: '8px 14px 12px', borderLeft: i ? `1px solid ${palette.border.subtle}` : 'none' }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: palette.text.muted }}>{x.label}</div>
                  <div style={{ fontFamily: font.mono, fontSize: i === 0 ? 22 : 17, fontWeight: 700, color: palette.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                    {x.value} <span style={{ fontSize: 11, fontWeight: 500, color: palette.text.muted }}>{x.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '6px 14px 14px', fontSize: 13, color: palette.text.muted }}>
              {running ? 'Working out what arrives here…' : edges.length ? 'Nothing reaches it in a run of the line.' : `Pipe it ${isFeed ? 'into a unit' : 'from a unit'} to see what moves.`}
            </div>
          )}
          {t?.composition && t.composition.length > 1 && (
            <div style={{ padding: '0 14px 12px' }}>
              <CompositionBar comp={t.composition} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={label}>{isFeed ? 'Feeds' : 'Comes from'}</div>
          {edges.length === 0 ? (
            <div style={{ ...card, padding: '10px 12px', fontSize: 13, color: palette.text.muted }}>Not connected yet.</div>
          ) : (
            edges.map((e) => {
              const other = isFeed ? e.targetNodeId : e.sourceNodeId;
              const n = byId.get(other);
              const port = isFeed ? n?.inputs.find((p) => p.id === e.targetPortId)?.name : n?.outputs.find((p) => p.id === e.sourcePortId)?.name;
              return (
                <div key={e.id} style={{ ...card, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {isFeed ? <ArrowUpRight size={15} color={color} /> : <ArrowDownRight size={15} color={color} />}
                  <div style={{ flex: 1 }}>{peerLink(other, isFeed ? 'into' : 'from', port)}</div>
                  <Figures f={figures.get(e.id)} />
                </div>
              );
            })
          )}
        </div>
        {source}
      </div>
    );
  }

  // ---- a unit -------------------------------------------------------------------
  const rate = formatRate(behavior.capacityPerMin, behavior.rateUnit);
  const unitTiles = [
    ...(behavior.capacityPerMin !== null ? [{ label: `${behavior.rateUnit === 'gal' ? 'Most it moves' : 'Top rate'}${behavior.uptime !== undefined ? `, after breakdowns (${formatQuantity(behavior.uptime * 100)}% up)` : ''}`, value: rate.value, unit: rate.per.trim().startsWith('/') ? `items${rate.per.trim()}` : rate.per.trim() || 'items/min' }] : []),
    ...(behavior.keyFigures ?? []).slice(0, 5).map((f) => {
      // A dimensionless share (0..1) reads as a percentage.
      const share = (!f.unit || f.unit === '-') && Number.isFinite(f.value) && f.value >= 0 && f.value <= 1 && /share|fraction|efficien|ratio|yield|recovery/i.test(f.label);
      return { label: f.label, value: !Number.isFinite(f.value) ? '—' : share ? formatQuantity(f.value * 100) : formatQuantity(f.value), unit: share ? '%' : f.unit === '-' ? '' : f.unit };
    })
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 450, lineHeight: 1.55, color: palette.text.secondary, textWrap: 'pretty' }}>{behavior.headline}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {behavior.simulated ? chip('Simulated', 'ok', <Gauge size={11} />) : chip('Not simulated yet', 'warn', <Info size={11} />)}
          {behavior.role === 'source' && chip('Start of the line', 'muted')}
          {behavior.role === 'end' && chip('End of the line', 'muted')}
          {behavior.role === 'unconnected' && chip('Not connected', 'warn')}
          {isBottleneck && chip('Sets the pace of the line', 'warn')}
          {liveState && behavior.simulated && chip(`Now: ${liveState.label}`, liveState.tone)}
        </div>
      </div>

      {node.inputs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={label}>Comes in</div>
          {node.inputs.map((p) => (
            <StreamRow key={p.id} port={p} dir="in" />
          ))}
        </div>
      )}

      {unitTiles.length > 0 && (
        <div style={{ ...card, background: tint(palette.jade[500], 0.05), borderColor: isBottleneck ? palette.status.blocked : tint(palette.jade[500], 0.4) }}>
          <div style={{ ...label, padding: '10px 14px 0' }}>In the unit</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(unitTiles.length, 3)}, minmax(0, 1fr))` }}>
            {unitTiles.map((x, i) => (
              <div key={x.label} style={{ padding: '6px 14px 12px', borderLeft: i % 3 ? `1px solid ${palette.border.subtle}` : 'none', borderTop: i >= 3 ? `1px solid ${palette.border.subtle}` : 'none' }}>
                <div style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: palette.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                  {x.value} <span style={{ fontSize: 11, fontWeight: 500, color: palette.text.muted }}>{x.unit}</span>
                </div>
                <div style={{ fontSize: 12, color: palette.text.secondary, marginTop: 1 }}>{x.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {node.outputs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={label}>Goes out</div>
          {node.outputs.map((p) => (
            <StreamRow key={p.id} port={p} dir="out" />
          ))}
        </div>
      )}

      {source}

      <details>
        <summary style={{ ...label, cursor: 'pointer', listStyle: 'revert' }}>How the simulation models it</summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {behavior.details.map((d) => (
            <li key={d} style={{ fontSize: 13, lineHeight: 1.5, color: palette.text.secondary }}>
              {d}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
};
