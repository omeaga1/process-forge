import React, { useDeferredValue, useMemo, useState } from 'react';
import { Meter } from '@base-ui/react/meter';
import { Info, TriangleAlert } from 'lucide-react';
import { niceValue, resolvePanel, type ResolvedPanelWidget, type UnitOpContract, type UnitOpEvaluation } from '@process-forge/protocol';
import { formatQuantity } from '../../model/parameterUi.js';
// The pf-glance-* and pf-meter-* rules live in the primitives' stylesheet.
import '../../ui/index.js';

/**
 * A unit's panel at a glance, generated from its contract: the figures,
 * check gauges, trends and notes the contract lays out (contract.panel),
 * drawn from the app's own catalog, so a unit an AI designs gets a panel
 * without shipping any UI. A contract with no panel gets a gauge for every
 * check with a limit and its main figure against what moves it most.
 */
export interface UnitGlanceProps {
  contract: UnitOpContract;
  /** The evaluation already worked out for the contract; worked out here when absent. */
  evaluation?: UnitOpEvaluation;
  /** A point on a trend picked: set that parameter to it. */
  onSetParam?: (name: string, value: number) => void;
  /** A gauge picked: show that check. */
  onPickCheck?: (id: string) => void;
}

const STATUS_WORD = { ok: 'Passes', tight: 'Close to limit', warning: 'Warning', error: 'Fails' } as const;

export const UnitGlance: React.FC<UnitGlanceProps> = ({ contract, evaluation, onSetParam, onPickCheck }) => {
  // Trends evaluate the contract a few dozen times: let typing stay ahead of them.
  const deferred = useDeferredValue(contract);
  const panel = useMemo(() => resolvePanel(deferred, deferred === contract ? evaluation : undefined), [deferred, contract, evaluation]);
  if (!panel.widgets.length) return null;
  return (
    <div className="pf-glance" aria-label="At a glance">
      {panel.widgets.map((w, i) => (
        <Widget key={i} w={w} onSetParam={onSetParam} onPickCheck={onPickCheck} />
      ))}
    </div>
  );
};

const unitText = (u: string) => (u && u !== '-' ? u : '');

const Widget: React.FC<{ w: ResolvedPanelWidget } & Pick<UnitGlanceProps, 'onSetParam' | 'onPickCheck'>> = ({ w, onSetParam, onPickCheck }) => {
  switch (w.kind) {
    case 'figure':
      return (
        <div className="pf-glance-card">
          <div className="pf-glance-label">{w.label}</div>
          <div className="pf-glance-figure">
            {formatQuantity(w.value)}
            <span className="pf-glance-unit">{unitText(w.unit)}</span>
          </div>
        </div>
      );
    case 'gauge':
      return <Gauge w={w} onPickCheck={onPickCheck} />;
    case 'trend':
      return <Trend w={w} onSetParam={onSetParam} />;
    case 'note':
      return (
        <div className="pf-glance-note" data-tone={w.tone}>
          {w.tone === 'caution' ? <TriangleAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} /> : <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
          <span>{w.text}</span>
        </div>
      );
  }
};

const Gauge: React.FC<{ w: Extract<ResolvedPanelWidget, { kind: 'gauge' }>; onPickCheck?: (id: string) => void }> = ({ w, onPickCheck }) => {
  const span = w.max - w.min || 1;
  const at = (v: number) => `${Math.min(100, Math.max(0, ((v - w.min) / span) * 100))}%`;
  // The side of the limit where the check passes, shaded.
  const safe = w.limit === undefined ? undefined : w.keep === 'below' ? { left: '0%', width: at(w.limit) } : { left: at(w.limit), width: `calc(100% - ${at(w.limit)})` };
  const body = (
    <Meter.Root
      value={Math.min(w.max, Math.max(w.min, w.value))}
      min={w.min}
      max={w.max}
      getAriaValueText={() => `${w.caption}. ${STATUS_WORD[w.status]}.`}
    >
      <div className="pf-glance-head">
        <Meter.Label className="pf-glance-label">{w.label}</Meter.Label>
        <span className="pf-glance-status" data-status={w.status}>
          {STATUS_WORD[w.status]}
        </span>
      </div>
      <Meter.Track className="pf-meter-track">
        {safe && <span className="pf-meter-safe" style={safe} aria-hidden />}
        <Meter.Indicator className="pf-meter-indicator" data-status={w.status} />
        {w.limit !== undefined && <span className="pf-meter-limit" style={{ left: at(w.limit) }} aria-hidden />}
      </Meter.Track>
      <div className="pf-glance-caption">{w.caption}</div>
      {w.message && <div className="pf-glance-message">{w.message}</div>}
    </Meter.Root>
  );
  return w.check && onPickCheck ? (
    <button type="button" className="pf-glance-card" onClick={() => onPickCheck(w.check!)} title="Show this check">
      {body}
    </button>
  ) : (
    <div className="pf-glance-card">{body}</div>
  );
};

const W = 600;
const H = 112;
const PAD = { l: 44, r: 4, t: 8, b: 16 };

const Trend: React.FC<{ w: Extract<ResolvedPanelWidget, { kind: 'trend' }>; onSetParam?: (name: string, value: number) => void }> = ({ w, onSetParam }) => {
  const [cursor, setCursor] = useState<number | null>(null);
  const xs = w.points.map((p) => p.x);
  const ys = [...w.points.map((p) => p.y), w.at.y];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  if (y1 - y0 < 1e-12) {
    y0 -= 1;
    y1 += 1;
  }
  const log = w.over.log && x0 > 0;
  const fx = (x: number) => {
    const t = log ? Math.log(x / x0) / Math.log(x1 / x0) : (x - x0) / (x1 - x0 || 1);
    return PAD.l + t * (W - PAD.l - PAD.r);
  };
  // A result spanning decades (a time that goes as 1/speed²) reads on a log scale; anything else on a linear one.
  const logY = y0 > 0 && y1 / y0 >= 20;
  const fy = (y: number) => {
    const t = logY ? Math.log(Math.max(y, y0) / y0) / Math.log(y1 / y0) : (y - y0) / (y1 - y0);
    return PAD.t + (1 - t) * (H - PAD.t - PAD.b);
  };
  const color = (s: string) => (s === 'ok' ? 'var(--pf-jade-500)' : s === 'warning' ? 'var(--pf-status-blocked)' : s === 'error' ? 'var(--pf-status-failed)' : 'var(--pf-text-muted)');
  // One segment per pair of samples, coloured by the verdict where it starts.
  const segments = w.points.slice(0, -1).map((p, i) => {
    const q = w.points[i + 1]!;
    return <line key={i} x1={fx(p.x)} y1={fy(p.y)} x2={fx(q.x)} y2={fy(q.y)} stroke={color(p.status)} strokeWidth={2} strokeLinecap="round" />;
  });
  const shown = cursor !== null ? w.points[cursor]! : undefined;
  const nearest = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < w.points.length; i++) if (Math.abs(fx(w.points[i]!.x) - px) < Math.abs(fx(w.points[best]!.x) - px)) best = i;
    return best;
  };
  const pick = (i: number) => onSetParam?.(w.over.name, niceValue(w.points[i]!.x));
  const unit = unitText(w.unit);
  const overUnit = unitText(w.over.unit);
  return (
    <div className="pf-glance-card" data-wide="">
      <div className="pf-glance-head">
        <span className="pf-glance-label">{w.label}</span>
        <span className="pf-glance-caption">
          {shown
            ? `${formatQuantity(shown.x)} ${overUnit} → ${formatQuantity(shown.y)} ${unit}`
            : `now ${formatQuantity(w.at.y)} ${unit} at ${formatQuantity(w.at.x)} ${overUnit}`}
        </span>
      </div>
      <svg
        className="pf-trend"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${w.label}: ${formatQuantity(w.points[0]!.y)} to ${formatQuantity(w.points[w.points.length - 1]!.y)} ${unit} as ${w.over.label.toLowerCase()} goes from ${formatQuantity(x0)} to ${formatQuantity(x1)} ${overUnit}.${onSetParam ? ' Arrow keys move along it; Enter sets that value.' : ''}`}
        tabIndex={onSetParam ? 0 : -1}
        onPointerMove={(e) => setCursor(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setCursor(null)}
        onClick={(e) => pick(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onBlur={() => setCursor(null)}
        onKeyDown={(e) => {
          const here = cursor ?? w.points.findIndex((p) => p.x >= w.at.x);
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            setCursor(Math.min(w.points.length - 1, Math.max(0, (here < 0 ? 0 : here) + (e.key === 'ArrowRight' ? 1 : -1))));
          } else if (e.key === 'Enter' && cursor !== null) pick(cursor);
        }}
      >
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--pf-border-default)" strokeWidth={1} />
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke="var(--pf-border-default)" strokeWidth={1} />
        <text x={PAD.l - 6} y={PAD.t + 8} fontSize={10} textAnchor="end" fill="var(--pf-text-muted)">
          {formatQuantity(y1)}
        </text>
        <text x={PAD.l - 6} y={H - PAD.b} fontSize={10} textAnchor="end" fill="var(--pf-text-muted)">
          {formatQuantity(y0)}
        </text>
        {logY && (
          <text x={PAD.l - 6} y={(PAD.t + H - PAD.b) / 2 + 4} fontSize={9} textAnchor="end" fill="var(--pf-text-muted)">
            log
          </text>
        )}
        {segments}
        <line x1={fx(w.at.x)} x2={fx(w.at.x)} y1={PAD.t - 4} y2={H - PAD.b} stroke="var(--pf-text-muted)" strokeDasharray="3 3" />
        <circle cx={fx(w.at.x)} cy={fy(w.at.y)} r={4} fill="var(--pf-bg-surface)" stroke="var(--pf-text-primary)" strokeWidth={2} />
        {shown && <circle cx={fx(shown.x)} cy={fy(shown.y)} r={3.5} fill={color(shown.status)} />}
        <text x={PAD.l} y={H - 2} fontSize={10} fill="var(--pf-text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatQuantity(x0)}
        </text>
        <text x={W - PAD.r} y={H - 2} fontSize={10} textAnchor="end" fill="var(--pf-text-muted)">
          {formatQuantity(x1)} {overUnit}
        </text>
      </svg>
    </div>
  );
};
