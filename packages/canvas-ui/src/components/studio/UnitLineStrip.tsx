import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { nodePortPhase, terminalRole, TERMINAL_ROLE_LABEL, type ProcessGraph, type ProcessNode } from '@process-forge/protocol';
import { simulateProcess, type NodeTelemetrySnapshot, type SimulationResult } from '@process-forge/simulation-core';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import { streamFigures, type StreamFigure } from '../../model/lineStreams.js';
import { formatQuantity } from '../../model/parameterUi.js';

/** Minutes of line the strip runs to show what moves where. */
const ESTIMATE_MINUTES = 20;

/** A short background run of the whole line, redone when the flowsheet changes: the same engine as Run. */
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

const STATE_TEXT: Record<string, { label: string; warn: boolean }> = {
  BUSY: { label: 'Working', warn: false },
  BLOCKED: { label: 'Blocked', warn: true },
  STARVED: { label: 'Starved', warn: true },
  IDLE: { label: 'Idle', warn: false },
  FAILED: { label: 'Down', warn: true }
};

export interface UnitLineStripProps {
  node: ProcessNode;
  graph: ProcessGraph;
  bottleneckNodeId?: string | null;
  live?: NodeTelemetrySnapshot | undefined;
  onOpenUnit?: (nodeId: string) => void;
}

interface Lane {
  key: string;
  port: string;
  peerId?: string;
  peer?: string;
  color: string;
  phase: string;
  figure?: StreamFigure;
}

/**
 * Where the unit sits in the line, drawn: what comes in on the left, the unit
 * in the middle, what goes out on the right, each stream with its flow and
 * temperature from a short run of the line. A feed or a product is the same
 * picture with one side empty.
 */
export const UnitLineStrip: React.FC<UnitLineStripProps> = ({ node, graph, bottleneckNodeId, live, onOpenUnit }) => {
  const { palette, font } = useTheme();
  const { result, running } = useLineRun(graph);
  const figures = useMemo(() => (result ? streamFigures(graph, result) : new Map<string, StreamFigure>()), [graph, result]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setNarrow((e?.contentRect.width ?? 999) < 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const phaseColor = (phase?: string, items?: boolean) =>
    items ? palette.streams.discreteContainer : phase === 'GAS' ? palette.streams.gas : phase === 'SOLID' ? palette.streams.solid : palette.streams.continuousFluid;

  const lanes = (dir: 'in' | 'out'): Lane[] =>
    (dir === 'in' ? node.inputs : node.outputs).flatMap((p) => {
      const items = String(p.flowDimension).startsWith('DISCRETE');
      const phase = items ? undefined : nodePortPhase(node, p.id);
      const base = { port: p.name, color: phaseColor(phase, items), phase: items ? 'items' : (phase ?? 'liquid').toLowerCase() };
      const edges = graph.edges.filter((e) => (dir === 'in' ? e.targetNodeId === node.id && e.targetPortId === p.id : e.sourceNodeId === node.id && e.sourcePortId === p.id));
      if (!edges.length) return [{ key: p.id, ...base }];
      return edges.map((e) => {
        const peerId = dir === 'in' ? e.sourceNodeId : e.targetNodeId;
        const f = figures.get(e.id);
        return { key: e.id, ...base, peerId, peer: byId.get(peerId)?.name ?? '?', ...(f ? { figure: f } : {}) };
      });
    });
  const ins = lanes('in');
  const outs = lanes('out');
  const role = terminalRole(node);
  const liveState = live ? STATE_TEXT[live.state] : undefined;
  const isBottleneck = bottleneckNodeId === node.id;

  const flowText = (f?: StreamFigure) => {
    if (!f) return null;
    const main = f.itemsPerMinute !== undefined ? [formatQuantity(f.itemsPerMinute), 'items/min'] : f.kgPerHour !== undefined ? [formatQuantity(f.kgPerHour), 'kg/h'] : null;
    return (
      <span style={{ fontFamily: font.mono, fontVariantNumeric: 'tabular-nums', display: 'flex', flexWrap: 'wrap', columnGap: 8, alignItems: 'baseline' }}>
        {main && (
          <span style={{ whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: palette.text.primary }}>{main[0]}</span>{' '}
            <span style={{ fontSize: 11, color: palette.text.muted }}>{main[1]}</span>
          </span>
        )}
        {f.temperatureC !== undefined && <span style={{ fontSize: 12, color: palette.text.secondary, whiteSpace: 'nowrap' }}>{formatQuantity(f.temperatureC)} °C</span>}
      </span>
    );
  };

  const LaneCard: React.FC<{ lane: Lane; dir: 'in' | 'out' }> = ({ lane, dir }) => {
    const edge = narrow ? 'borderTop' : dir === 'in' ? 'borderRight' : 'borderLeft';
    return (
      <div
        style={{
          position: 'relative',
          padding: '9px 12px',
          borderRadius: 10,
          background: palette.background.surface,
          border: `1px solid ${palette.border.subtle}`,
          [edge]: `3px solid ${lane.color}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          minWidth: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lane.port}</span>
          <span style={{ fontSize: 11, color: palette.text.muted }}>{lane.phase}</span>
        </div>
        {lane.peerId ? (
          <button
            type="button"
            onClick={() => onOpenUnit?.(lane.peerId!)}
            title={`Open ${lane.peer}`}
            style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 2, padding: 0, border: 'none', background: 'none', color: palette.text.accent, fontSize: 12, cursor: onOpenUnit ? 'pointer' : 'default', maxWidth: '100%' }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir === 'in' ? 'from' : 'to'} {lane.peer}</span>
            {onOpenUnit && <ChevronRight size={12} />}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: palette.text.muted }}>{dir === 'in' ? 'Not connected' : 'Leaves the line'}</span>
        )}
        {lane.peerId && (flowText(lane.figure) ?? <span style={{ fontSize: 12, color: palette.text.muted }}>{running ? '…' : 'no flow in a run'}</span>)}
      </div>
    );
  };

  const column = (list: Lane[], dir: 'in' | 'out', empty: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {list.length ? list.map((l) => <LaneCard key={l.key} lane={l} dir={dir} />) : <div style={{ fontSize: 12, color: palette.text.muted, padding: '10px 4px', textAlign: narrow ? 'left' : dir === 'in' ? 'right' : 'left' }}>{empty}</div>}
    </div>
  );

  const connector = (
    <div aria-hidden style={{ display: 'grid', placeItems: 'center', color: palette.text.muted }}>
      <svg width={narrow ? 14 : 28} height={narrow ? 18 : 14} viewBox={narrow ? '0 0 14 18' : '0 0 28 14'}>
        {narrow ? <path d="M7 0 V14 M2 9 L7 15 L12 9" fill="none" stroke="currentColor" strokeWidth={1.5} /> : <path d="M0 7 H24 M18 2 L25 7 L18 12" fill="none" stroke="currentColor" strokeWidth={1.5} />}
      </svg>
    </div>
  );

  const chips = [
    role ? TERMINAL_ROLE_LABEL[role] : null,
    isBottleneck ? 'Sets the pace' : null,
    liveState ? liveState.label : null
  ].filter(Boolean) as string[];

  const unitBlock = (
    <div
      style={{
        alignSelf: 'center',
        padding: '12px 10px',
        borderRadius: 12,
        border: `1.5px solid ${isBottleneck || liveState?.warn ? palette.status.blocked : palette.jade[500]}`,
        background: palette.background.canvas,
        textAlign: 'center',
        minWidth: 0
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 650, color: palette.text.primary, lineHeight: 1.3 }}>{node.name}</div>
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginTop: 6 }}>
          {chips.map((c) => (
            <span key={c} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, background: palette.background.surface, color: palette.text.secondary }}>
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div ref={ref} aria-label="Where this unit sits in the line">
      <div
        style={
          narrow
            ? { display: 'flex', flexDirection: 'column', gap: 6 }
            : { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 26px minmax(96px, 150px) 26px minmax(0, 1fr)', alignItems: 'center' }
        }
      >
        {column(ins, 'in', role === 'feed' ? 'Start of the line' : 'No inlets')}
        {connector}
        {unitBlock}
        {connector}
        {column(outs, 'out', role ? 'End of the line' : 'No outlets')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11, color: palette.text.muted }}>
        {running && <Loader2 size={11} style={{ animation: 'pf-spin 1s linear infinite' }} />}
        {running ? 'Running the line…' : result ? `From a ${ESTIMATE_MINUTES}-minute run of the line` : 'The line could not be simulated as it stands'}
      </div>
    </div>
  );
};
