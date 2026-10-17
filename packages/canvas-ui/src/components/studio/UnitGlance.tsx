import React, { useDeferredValue, useMemo } from 'react';
import { Meter } from '@base-ui/react/meter';
import { Info, TriangleAlert } from 'lucide-react';
import { resolvePanel, type ResolvedPanelWidget, type UnitOpContract, type UnitOpEvaluation } from '@process-forge/protocol';
import { formatQuantity } from '../../model/parameterUi.js';
// The pf-glance-* and pf-meter-* rules live in the primitives' stylesheet.
import '../../ui/index.js';

/**
 * A unit's panel at a glance, generated from its contract: the figures,
 * check gauges and notes the contract lays out (contract.panel),
 * drawn from the app's own catalog, so a unit an AI designs gets a panel
 * without shipping any UI. A contract with no panel gets a gauge for every
 * check with a limit.
 */
export interface UnitGlanceProps {
  contract: UnitOpContract;
  /** The evaluation already worked out for the contract; worked out here when absent. */
  evaluation?: UnitOpEvaluation;
  /** A gauge picked: show that check. */
  onPickCheck?: (id: string) => void;
}

const STATUS_WORD = { ok: 'Passes', tight: 'Close to limit', warning: 'Warning', error: 'Fails' } as const;

export const UnitGlance: React.FC<UnitGlanceProps> = ({ contract, evaluation, onPickCheck }) => {
  // Resolving evaluates the contract: let typing stay ahead of it.
  const deferred = useDeferredValue(contract);
  const panel = useMemo(() => resolvePanel(deferred, deferred === contract ? evaluation : undefined), [deferred, contract, evaluation]);
  if (!panel.widgets.length) return null;
  return (
    <div className="pf-glance" aria-label="At a glance">
      {panel.widgets.map((w, i) => (
        <Widget key={i} w={w} onPickCheck={onPickCheck} />
      ))}
    </div>
  );
};

const unitText = (u: string) => (u && u !== '-' ? u : '');

const Widget: React.FC<{ w: ResolvedPanelWidget } & Pick<UnitGlanceProps, 'onPickCheck'>> = ({ w, onPickCheck }) => {
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
