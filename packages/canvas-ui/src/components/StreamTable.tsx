import React, { useMemo, useState } from 'react';
import type { ProcessGraph } from '@process-forge/protocol';
import { averageStreamStates, streamStates, type NodeTelemetrySnapshot } from '@process-forge/simulation-core';
import { Check, Copy, Rows3 } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.js';
import { Button, Modal } from '../ui/index.js';
import { formatQuantity } from '../model/parameterUi.js';
import { unitTag } from '../model/unitTag.js';

interface StreamRow {
  id: string;
  number: string;
  from: string;
  to: string;
  phase: string;
  kgPerHour?: number;
  gpm?: number;
  itemsPerMin?: number;
  temperatureC?: number;
  /** What it carries, largest first: "water 88%, sugar 12%". */
  mix?: string;
  blocked: boolean;
}

/**
 * Every stream on the flowsheet in one table, as a simulator's stream report
 * lists them: where it runs from and to, its phase, and what it carries at the
 * run's playhead (mass flow, volumetric flow for a liquid, items for a
 * conveyor line, temperature). Read from the same per-port figures the pipes
 * are labelled with, so the two always agree.
 */
export const StreamTable: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  graph: ProcessGraph;
  /** The run at the playhead, per unit; empty before a run. */
  snapshots: Map<string, NodeTelemetrySnapshot>;
  simulatedSeconds: number;
  /** The whole run's telemetry, for averages up to the playhead. */
  log?: readonly NodeTelemetrySnapshot[];
  /** Shows a stream on the flowsheet: selects its pipe and brings its two units into view. */
  onShow?: (edgeId: string) => void;
}> = ({ open, onOpenChange, graph, snapshots, simulatedSeconds, log, onShow }) => {
  const { palette, font } = useTheme();
  const [copied, setCopied] = useState(false);
  const hasRun = snapshots.size > 0;
  // At the playhead, or averaged over the run so far: a line between batches can read zero at a moment.
  const [view, setView] = useState<'now' | 'average'>('now');
  const averaging = view === 'average' && hasRun && !!log?.length;

  // The same rows the MCP tools report (simulation-core's streamStates), put in words for the table.
  const rows = useMemo<StreamRow[]>(
    () =>
      (averaging ? averageStreamStates(graph, log!, simulatedSeconds) : streamStates(graph, snapshots)).map((r) => ({
        id: r.id,
        number: r.number,
        from: `${unitTag(r.from.unit) ?? r.from.unit}${r.from.port ? ` · ${r.from.port}` : ''}`,
        to: `${unitTag(r.to.unit) ?? r.to.unit}${r.to.port ? ` · ${r.to.port}` : ''}`,
        phase: PHASE_WORD[r.phase] ?? r.phase.toLowerCase(),
        ...(r.kgPerHour !== undefined ? { kgPerHour: r.kgPerHour } : {}),
        ...(r.gpm !== undefined ? { gpm: r.gpm } : {}),
        ...(r.itemsPerMin !== undefined ? { itemsPerMin: r.itemsPerMin } : {}),
        ...(r.temperatureC !== undefined ? { temperatureC: r.temperatureC } : {}),
        ...(r.composition ? { mix: mixText(r.composition) } : {}),
        blocked: r.blocked
      })),
    [graph, snapshots, averaging, log, simulatedSeconds]
  );

  const allColumns: { key: keyof StreamRow; head: string; unit?: string; num?: boolean }[] = [
    { key: 'number', head: 'Stream' },
    { key: 'from', head: 'From' },
    { key: 'to', head: 'To' },
    { key: 'phase', head: 'Phase' },
    { key: 'kgPerHour', head: 'Mass flow', unit: 'kg/h', num: true },
    { key: 'gpm', head: 'Volume flow', unit: 'gal/min', num: true },
    { key: 'itemsPerMin', head: 'Items', unit: '/min', num: true },
    { key: 'temperatureC', head: 'Temperature', unit: '°C', num: true },
    { key: 'mix', head: 'Composition (mass)' }
  ];
  // A figure no stream has (items on a liquid line) is not a column.
  const columns = allColumns.filter((c) => !(c.num || c.key === 'mix') || rows.some((r) => r[c.key] !== undefined));
  const cellText = (r: StreamRow, k: keyof StreamRow) => {
    const v = r[k];
    return typeof v === 'number' ? formatQuantity(v) : v === undefined ? '—' : String(v);
  };

  const copy = async () => {
    const head = columns.map((c) => (c.unit ? `${c.head} (${c.unit})` : c.head));
    const body = rows.map((r) => columns.map((c) => (typeof r[c.key] === 'number' ? String(Number((r[c.key] as number).toPrecision(6))) : r[c.key] === undefined ? '' : String(r[c.key]))));
    try {
      await navigator.clipboard.writeText([head, ...body].map((x) => x.join('\t')).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused: the button simply does not change.
    }
  };

  const th: React.CSSProperties = {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: palette.text.muted,
    padding: '8px 10px',
    borderBottom: `1px solid ${palette.border.default}`,
    position: 'sticky',
    top: 0,
    background: palette.background.surfaceElevated,
    whiteSpace: 'nowrap'
  };
  const td: React.CSSProperties = { padding: '6px 10px', borderBottom: `1px solid ${palette.border.subtle}`, fontSize: 13, color: palette.text.primary, verticalAlign: 'top' };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Stream table"
      description={
        !hasRun
          ? 'Every stream on the flowsheet. Run the line (Space) to fill in what each one carries.'
          : averaging
            ? `Every stream, averaged over the first ${formatTime(simulatedSeconds)} of the run (temperature and mix weighted by what flowed).`
            : `Every stream, at ${formatTime(simulatedSeconds)} into the run (the playhead).`
      }
      headerExtra={
        hasRun && log?.length ? (
          <div role="group" aria-label="Show streams" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 6, border: `1px solid ${palette.border.default}` }}>
            {(['now', 'average'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className="pf-focus"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                style={{ border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: view === v ? palette.background.surface : 'transparent', color: view === v ? palette.text.primary : palette.text.secondary }}
              >
                {v === 'now' ? 'At playhead' : 'Run average'}
              </button>
            ))}
          </div>
        ) : undefined
      }
      icon={<Rows3 size={16} />}
      width={980}
      flush
      footer={
        <Button icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={copy} disabled={!rows.length}>
          {copied ? 'Copied' : 'Copy table'}
        </Button>
      }
    >
      {rows.length === 0 ? (
        <div style={{ padding: 20, fontSize: 13, color: palette.text.muted }}>No streams yet: pipe one unit into another and they appear here.</div>
      ) : (
        <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Streams on the flowsheet</caption>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" style={{ ...th, textAlign: c.num ? 'right' : 'left' }}>
                    {c.head}
                    {c.unit ? <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> ({c.unit})</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {columns.map((c, i) =>
                    i === 0 ? (
                      <th key={c.key} scope="row" style={{ ...td, fontFamily: font.mono, fontWeight: 700, textAlign: 'left' }}>
                        {onShow ? (
                          <button
                            type="button"
                            className="pf-focus"
                            onClick={() => onShow(r.id)}
                            aria-label={`Show ${r.number} on the flowsheet`}
                            title="Show it on the flowsheet"
                            style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: palette.border.strong }}
                          >
                            {r.number}
                          </button>
                        ) : (
                          r.number
                        )}
                        {r.blocked && (
                          <span style={{ display: 'block', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: palette.text.secondary }}>backed up</span>
                        )}
                      </th>
                    ) : (
                      <td
                        key={c.key}
                        style={{
                          ...td,
                          ...(c.num ? { textAlign: 'right', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } : {}),
                          ...(c.key === 'from' || c.key === 'to' ? { color: palette.text.secondary } : {})
                        }}
                      >
                        {cellText(r, c.key)}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

/** A mix as words, largest first, three at most: "water 88%, sugar 12%"; a trace reads "<0.1%". */
function mixText(comp: Record<string, number>): string {
  return Object.entries(comp)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c, x]) => `${c} ${x < 0.001 ? '<0.1' : Math.round(x * 1000) / 10}%`)
    .join(', ');
}

const PHASE_WORD: Record<string, string> = { LIQUID: 'liquid', GAS: 'gas', SOLID: 'solids', ITEMS: 'items' };

function formatTime(seconds: number): string {
  if (seconds < 120) return `${Math.round(seconds)} s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}
