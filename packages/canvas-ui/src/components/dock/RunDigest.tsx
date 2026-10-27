import React from 'react';
import { terminalRole, type ProcessGraph } from '@process-forge/protocol';
import type { NodeTelemetrySnapshot, SimulationResult } from '@process-forge/simulation-core';
import { tint } from '@process-forge/theme';
import { compareRuns, lineLosses, type RunComparison, type RunSide } from '@process-forge/tools';
import { Pin, PinOff } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import { unitTag } from '../../model/unitTag.js';

export interface RunView {
  result: SimulationResult;
  /** The flowsheet the run was made on (it may have changed since). */
  graph: ProcessGraph;
  /** Seconds into the run the canvas is showing. */
  timeSeconds: number;
  /** Every unit's recorded state at that moment. */
  snapshot: Map<string, NodeTelemetrySnapshot>;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 10) / 10)}`;
const runLengthLabel = (min: number) => (min >= 60 && min % 60 === 0 ? `${min / 60} h` : `${min} min`);
const kg = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1));

/**
 * The run as it plays, in the copilot: how far in it is, what every outlet
 * has received so far and is receiving now, and every check a unit broke.
 * Follows the same playhead as the canvas, so it moves with the line.
 */
export const RunDigest: React.FC<{
  graph: ProcessGraph;
  run: RunView;
  stale?: boolean;
  onSeek?: (fraction: number) => void;
  /** The run pinned to compare against, and pinning this one or letting it go. */
  pinned?: RunSide | null;
  onPin?: () => void;
  onUnpin?: () => void;
}> = ({ graph, run, stale, onSeek, pinned, onPin, onUnpin }) => {
  const { palette, font } = useTheme();
  const { result, timeSeconds, snapshot } = run;
  const outlets = graph.nodes
    .map((n) => ({ n, role: terminalRole(n) }))
    .filter((x): x is { n: (typeof graph.nodes)[number]; role: 'product' | 'byproduct' | 'waste' } => x.role !== null && x.role !== 'feed');
  const roleColor = { product: palette.jade.glow, byproduct: palette.status.blocked, waste: palette.status.failed } as const;
  const progress = result.simulatedTimeSeconds > 0 ? Math.min(1, timeSeconds / result.simulatedTimeSeconds) : 0;
  const checks: { unit: string; message: string; severity: 'ERROR' | 'WARNING'; seconds?: number }[] = [
    ...graph.nodes.flatMap((n) => (result.nodeReports[n.id]?.designedUnit?.brokenConstraints ?? []).map((c) => ({ unit: unitTag(n.name) ?? n.name, ...c }))),
    // A duty the unit's streams do not bear out: the engine's own heat balance, not a check the contract wrote.
    ...(result.balance?.energy ?? []).filter((e) => e.verdict === 'mismatch').map((e) => ({ unit: unitTag(e.name) ?? e.name, message: e.note, severity: 'WARNING' as const }))
  ];
  const mass = result.balance?.mass;
  // Where the end of the line's time went: running, and each unit (and phase) it waited on.
  const losses = React.useMemo(() => lineLosses(graph, result), [graph, result]);
  const isPinned = pinned?.result === result;
  // This run against the pinned one: what moved, beside what was changed in between.
  const vs = React.useMemo(() => (pinned && !isPinned ? compareRuns(pinned, { graph: run.graph, result }) : undefined), [pinned, isPinned, run.graph, result]);

  const label: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: palette.text.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontFamily: font.mono
  };

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: `1px solid ${palette.border.default}` }}>
      {stale && (
        <div role="note" style={{ fontSize: 12, lineHeight: 1.4, padding: '6px 8px', color: palette.status.blocked, backgroundColor: tint(palette.status.blocked, 0.08), borderLeft: `2px solid ${palette.status.blocked}` }}>
          These figures are from before your last edit. Run again for the line as it is now.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: stale ? 0.55 : 1 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={label}>This run</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: palette.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
              {clock(timeSeconds)} / {clock(result.simulatedTimeSeconds)}
            </span>
            {onPin && onUnpin && (
              <button
                type="button"
                onClick={isPinned ? onUnpin : onPin}
                aria-pressed={isPinned}
                title={isPinned ? 'Unpin this run' : pinned ? 'Pin this run instead' : 'Pin this run, change the line, run again: see what moved'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px',
                  fontSize: 11,
                  border: `1px solid ${isPinned ? palette.jade[400] : palette.border.default}`,
                  borderRadius: 4,
                  background: isPinned ? tint(palette.jade[400], 0.12) : 'transparent',
                  color: isPinned ? palette.jade.glow : palette.text.secondary,
                  cursor: 'pointer'
                }}
              >
                {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
                {isPinned ? 'Pinned' : 'Pin'}
              </button>
            )}
          </span>
        </div>
        {onSeek ? (
          // The run's timeline: drag (or arrow keys) to any moment; the canvas and every figure follow.
          <div
            role="slider"
            tabIndex={0}
            aria-label="Moment of the run"
            aria-valuemin={0}
            aria-valuemax={Math.round(result.simulatedTimeSeconds)}
            aria-valuenow={Math.round(timeSeconds)}
            aria-valuetext={clock(timeSeconds)}
            title="Drag to any moment of the run"
            onPointerDown={(e) => {
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              const at = (x: number) => {
                const r = el.getBoundingClientRect();
                onSeek(r.width > 0 ? (x - r.left) / r.width : 0);
              };
              at(e.clientX);
              const move = (ev: PointerEvent) => at(ev.clientX);
              const up = () => {
                el.removeEventListener('pointermove', move);
                el.removeEventListener('pointerup', up);
              };
              el.addEventListener('pointermove', move);
              el.addEventListener('pointerup', up);
            }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 0.1 : 0.02;
              if (e.key === 'ArrowRight') onSeek(Math.min(1, progress + step));
              else if (e.key === 'ArrowLeft') onSeek(Math.max(0, progress - step));
              else if (e.key === 'Home') onSeek(0);
              else if (e.key === 'End') onSeek(1);
              else return;
              e.preventDefault();
            }}
            style={{ position: 'relative', height: 14, cursor: 'pointer', touchAction: 'none', outlineOffset: 2 }}
          >
            <div style={{ position: 'absolute', left: 0, right: 0, top: 5, height: 4, backgroundColor: palette.border.default }}>
              <div style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: palette.jade[400] }} />
            </div>
            <div style={{ position: 'absolute', top: 1, left: `calc(${progress * 100}% - 3px)`, width: 6, height: 12, backgroundColor: palette.jade[300] ?? palette.jade[400], boxShadow: `0 0 0 2px ${palette.background.surface}` }} />
          </div>
        ) : (
          <div style={{ height: 3, borderRadius: 2, backgroundColor: palette.border.default, overflow: 'hidden' }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: palette.jade[400], transition: 'width 0.3s linear' }} />
          </div>
        )}
      </div>

      {isPinned && <span style={{ fontSize: 12, color: palette.text.muted }}>Change the line and run again to compare.</span>}

      {vs && (
        <div data-testid="run-compare" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={label}>Against pinned run</span>
            {onUnpin && (
              <button type="button" onClick={onUnpin} style={{ padding: 0, fontSize: 11, border: 'none', background: 'none', color: palette.text.muted, cursor: 'pointer', textDecoration: 'underline' }}>
                Unpin
              </button>
            )}
          </div>
          <span style={{ fontSize: 12, color: palette.text.secondary, lineHeight: 1.4 }} title={vs.changes.map((c) => (c.unit ? `${c.unit}: ${c.what}` : c.what)).join('\n')}>
            {vs.changes.length === 0
              ? 'Nothing changed on the flowsheet.'
              : vs.changes.slice(0, 2).map((c, i) => (
                  <span key={i}>
                    {i > 0 && '; '}
                    {c.unit && <span style={{ fontFamily: font.mono, color: palette.text.primary }}>{unitTag(c.unit) ?? c.unit} </span>}
                    {c.what}
                  </span>
                ))}
            {vs.changes.length > 2 && <span style={{ color: palette.text.muted }}> +{vs.changes.length - 2} more</span>}
          </span>
          {vs.minutes.before !== vs.minutes.after && (
            <span style={{ fontSize: 11, color: palette.status.blocked }}>
              Pinned run was {runLengthLabel(vs.minutes.before)}, this one {runLengthLabel(vs.minutes.after)}.
            </span>
          )}
          {compareRows(vs).map((row) => (
            <div
              key={row.name}
              title={row.title}
              style={{ display: 'grid', gridTemplateColumns: '1fr auto 52px', gap: 8, fontSize: 12, color: palette.text.secondary, paddingLeft: row.indent ? 8 : 0 }}
            >
              <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
              <span style={{ fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: palette.text.muted }}>{row.before}</span> → <span style={{ color: palette.text.primary }}>{row.after}</span>
                <span style={{ fontSize: 10, color: palette.text.muted }}> {row.unit}</span>
              </span>
              <span
                style={{
                  textAlign: 'right',
                  fontFamily: font.mono,
                  fontVariantNumeric: 'tabular-nums',
                  color: row.delta === null ? palette.text.muted : row.good ? palette.jade.glow : palette.status.failed
                }}
              >
                {row.delta ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {outlets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {outlets.map(({ n, role }) => {
            const s = snapshot.get(n.id);
            const items = (s?.unitsProduced ?? 0) > 0;
            return (
              <div
                key={n.id}
                style={{ display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 8, alignItems: 'center', padding: '6px 0' }}
                title={`${n.name} (${role})`}
              >
                <span style={{ alignSelf: 'stretch', borderRadius: 2, backgroundColor: roleColor[role] }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, color: palette.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</span>
                  <span style={{ fontSize: 10, color: palette.text.muted, textTransform: 'capitalize' }}>{role}</span>
                </span>
                <span style={{ textAlign: 'right', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ display: 'block', fontSize: 12, color: palette.text.primary }}>
                    {items ? `${(s?.unitsProduced ?? 0).toLocaleString()} units` : `${kg(s?.levelKg ?? 0)} kg`}
                  </span>
                  <span style={{ fontSize: 10, color: palette.text.muted }}>
                    {items ? `${(s?.instantaneousRatePerMin ?? 0).toFixed(1)} /min` : `${kg(s?.kgPerHour ?? 0)} kg/h now`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {losses && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={label}>Where the time went</span>
            <span style={{ fontSize: 11, color: palette.text.muted }} title={losses.summary}>
              {unitTag(losses.unit) ?? losses.unit} waited {losses.starvedPercent + losses.blockedPercent}%
            </span>
          </div>
          {/* The end of the line's run, as one bar: running, then each wait by its cause. */}
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.border.default }}>
            <div title={`Running ${losses.runningPercent}%`} style={{ width: `${losses.runningPercent}%`, backgroundColor: palette.status.busy }} />
            {losses.causes.slice(0, 3).map((c, i) => (
              <div
                key={i}
                title={`${c.unit}: ${c.doing} ${c.percentOfRun}%`}
                style={{ width: `${c.percentOfRun}%`, backgroundColor: c.wait === 'starved' ? palette.status.starved : palette.status.blocked, opacity: 1 - i * 0.25 }}
              />
            ))}
          </div>
          {losses.causes.slice(0, 3).map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, fontSize: 12, color: palette.text.secondary }} title={c.unit}>
              <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ fontFamily: font.mono, color: palette.text.primary }}>{unitTag(c.unit) ?? c.unit}</span> {c.doing.toLowerCase()}
              </span>
              <span style={{ fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>{c.percentOfRun}%</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={label}>Checks</span>
        {mass && (mass.inKg > 0 || mass.outKg > 0) && (
          <span
            style={{ fontSize: 11, fontFamily: font.mono, fontVariantNumeric: 'tabular-nums', color: mass.closes ? palette.text.secondary : palette.status.failed }}
            title="The whole run's mass balance: what came in = what went out + what units hold more than they started with."
          >
            Whole run: mass {mass.closes ? 'balances' : 'does not balance'}, {kg(mass.inKg)} kg in = {kg(mass.outKg)} out
            {Math.abs(mass.accumulatedKg) >= 0.05 ? ` ${mass.accumulatedKg >= 0 ? '+' : '−'} ${kg(Math.abs(mass.accumulatedKg))} held` : ''}
            {mass.closes ? '' : ` (${kg(mass.closureKg)} kg unaccounted)`}
          </span>
        )}
        {checks.length === 0 ? (
          <span style={{ fontSize: 12, color: palette.jade.glow }}>Every unit kept to its contract, and every duty matches its streams.</span>
        ) : (
          checks.slice(0, 6).map((c, i) => {
            const color = c.severity === 'ERROR' ? palette.status.failed : palette.status.blocked;
            return (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  lineHeight: 1.4,
                  color: palette.text.secondary,
                  padding: '6px 8px',
                  borderRadius: 6,
                  backgroundColor: tint(color, 0.08),
                  borderLeft: `2px solid ${color}`
                }}
              >
                <span style={{ fontFamily: font.mono, color, fontWeight: 700 }}>{c.unit}</span> {c.message}
                {c.seconds !== undefined && <span style={{ color: palette.text.muted }}> ({c.seconds} s)</span>}
              </div>
            );
          })
        )}
      </div>
      </div>
    </div>
  );
};

interface CompareRow {
  name: string;
  title: string;
  before: string;
  after: string;
  unit: string;
  /** Null when the figure did not move. */
  delta: string | null;
  /** Moved the right way: more rate or OEE, less waiting. */
  good: boolean;
  indent?: boolean;
}

/** The comparison as rows: rate, the end of the line's OEE and waiting, then what it waited on. */
function compareRows(vs: RunComparison): CompareRow[] {
  const rate = vs.per === '/min' ? (v: number) => v.toFixed(1) : (v: number) => v.toLocaleString();
  const pts = (before: number, after: number) => (before === after ? null : `${signed(after - before)} pts`);
  return [
    {
      name: 'Rate',
      title: 'Product out, over the whole run',
      before: rate(vs.rate.before),
      after: rate(vs.rate.after),
      unit: vs.per,
      delta: vs.rate.before === vs.rate.after ? null : vs.rate.changePercent === null ? 'new' : `${signed(vs.rate.changePercent)}%`,
      good: vs.rate.after > vs.rate.before
    },
    ...(vs.oee
      ? [{ name: `OEE ${unitTag(vs.oee.unit) ?? vs.oee.unit}`, title: `${vs.oee.unit}, the end of the line`, before: String(vs.oee.before), after: String(vs.oee.after), unit: '%', delta: pts(vs.oee.before, vs.oee.after), good: vs.oee.after > vs.oee.before }]
      : []),
    ...(vs.waited
      ? [{ name: 'Waited', title: `Time ${vs.waited.unit} waited, starved or blocked`, before: String(vs.waited.before), after: String(vs.waited.after), unit: '%', delta: pts(vs.waited.before, vs.waited.after), good: vs.waited.after < vs.waited.before }]
      : []),
    ...vs.causes.slice(0, 3).map((c) => ({
      name: `${unitTag(c.unit) ?? c.unit} ${c.doing.toLowerCase()}`,
      title: `Waiting on ${c.unit} (${c.wait})`,
      before: String(c.before),
      after: String(c.after),
      unit: '%',
      delta: pts(c.before, c.after),
      good: c.after < c.before,
      indent: true
    }))
  ];
}
