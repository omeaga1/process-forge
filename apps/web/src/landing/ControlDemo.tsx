import React, { useDeferredValue, useMemo, useState } from 'react';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { UnitGlance } from '@process-forge/canvas-ui';
import { evaluateUnitOp } from '@process-forge/protocol';
import { Crosshair, LineChart, Lock, Ruler, Table2, ShieldAlert } from 'lucide-react';
import { COLD_BREW_CONTRACT, COLD_BREW_FEED, atFeed, runColdBrew, withValues } from './coldBrew.js';

/**
 * The worked example's operating conditions, yours to set: the unit's panel
 * as the app draws it (its own component, laid out by the contract), and an
 * hour of the line run again by the engine at every change. Then what else
 * the spec sheet does, in one line each.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };

const KNOBS: { name: string; label: string; unit: string; step: number; from: number; to: number }[] = [
  { name: 'feedGpm', label: 'Cold-brew feed', unit: 'gal/min', step: 0.5, from: 1, to: 8 },
  { name: 'glycolSupplyC', label: 'Glycol supply', unit: '°C', step: 1, from: -30, to: -4 },
  { name: 'targetTdsPct', label: 'Target strength', unit: '% TDS', step: 1, from: 10, to: 45 },
  { name: 'chillerCapacityKw', label: 'Chiller capacity', unit: 'kW', step: 5, from: 40, to: 250 },
  { name: 'columnDiameterM', label: 'Wash column diameter', unit: 'm', step: 0.05, from: 0.3, to: 1.2 }
];

const START: Record<string, number> = {
  feedGpm: COLD_BREW_FEED.gpm,
  ...Object.fromEntries(KNOBS.filter((k) => k.name !== 'feedGpm').map((k) => [k.name, COLD_BREW_CONTRACT.parameters.find((p) => p.name === k.name)!.value]))
};

const FEATURES: { icon: React.ElementType; title: string; text: string }[] = [
  { icon: Ruler, title: 'Any unit you like', text: 'Type 40 psi into a bar field or 120 °F into a °C one. Drag a setting’s name to scrub it through its range.' },
  { icon: Crosshair, title: 'Specify a result', text: 'Name the result you want and the setting to vary. The engine solves for the value.' },
  { icon: Lock, title: 'Held results', text: 'Keep the concentrate at 30% TDS while you change everything else, the way a simulator’s design spec does. Claude’s edits respect the hold too.' },
  { icon: LineChart, title: 'Sensitivity studies', text: 'Step one setting across a range, plot any result, and copy the table into a spreadsheet.' },
  { icon: Table2, title: 'Stream table', text: 'Flow, temperature and composition on every pipe, averaged over the run, as on a real PFD.' },
  { icon: ShieldAlert, title: 'Off-spec diversion', text: 'Product made while a must-hold check is broken is marked off spec and kept out of the line totals.' }
];

export const ControlDemo: React.FC = () => {
  const [values, setValues] = useState<Record<string, number>>(START);
  const set = (name: string, v: number) => setValues((x) => ({ ...x, [name]: v }));
  const feedGpm = values.feedGpm!;
  const contract = useMemo(() => {
    const { feedGpm: gpm, ...params } = values;
    return atFeed(withValues(params), gpm!);
  }, [values]);
  const evaluation = useMemo(() => evaluateUnitOp(contract), [contract]);
  // An hour of the line, run again by the engine; deferred so dragging stays smooth.
  const deferred = useDeferredValue(contract);
  const run = useMemo(() => {
    try {
      return runColdBrew(deferred, deferred.designInlet?.volumetricFlowGpm ?? COLD_BREW_FEED.gpm);
    } catch (e) {
      return { error: (e as Error).message.replace(/^Node "fc" contract "[^"]+" /, '') };
    }
  }, [deferred]);
  // The checks that fail at these conditions, with the knob each one names. An ERROR one stops the run.
  const declared = (id: string) => COLD_BREW_CONTRACT.constraints.find((c) => c.id === id)!;
  const failing = evaluation.constraints.filter((c) => !c.satisfied).map((c) => declared(c.id));
  const mustHold = failing.filter((c) => c.severity === 'ERROR');
  const broken = 'error' in run ? failing : run.broken.map(declared);
  const say = (cs: typeof failing) => cs.map((c) => c.message.replace(/\.$/, '')).join('; and ');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* data-theme: the page is dark whatever the studio's theme, and the panel draws from the --pf-* variables. */}
      <div data-theme="dark" className="pf-control-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 0.8fr) minmax(0, 1.6fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.surface, padding: '18px 20px' }}>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>OPERATING CONDITIONS · FREEZE CONCENTRATOR</div>
          <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
            {KNOBS.map((k) => {
              const v = values[k.name]!;
              return (
                <label key={k.name} style={{ display: 'grid', gap: 6 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, color: D.text.primary }}>
                    <span>{k.label}</span>
                    <span style={{ ...mono, color: v === START[k.name] ? D.jade.glow : D.text.gold }}>
                      {v.toLocaleString('en-US', { maximumFractionDigits: 2 })} <span style={{ color: D.text.muted }}>{k.unit}</span>
                    </span>
                  </span>
                  <input type="range" className="pf-range" min={k.from} max={k.to} step={k.step} value={v} onChange={(e) => set(k.name, Number(e.target.value))} aria-valuetext={`${v} ${k.unit}`} />
                </label>
              );
            })}
          </div>
          <div role="status" style={{ margin: '18px 0 0', fontSize: 13, lineHeight: 1.55, color: D.text.secondary }}>
            {mustHold.length || 'error' in run ? (
              <span style={{ color: D.status.failed }}>
                A must-hold check fails, so the engine won’t run the line: {say(mustHold.length ? mustHold : broken)}. {(mustHold[0] ?? broken[0])?.hint}
              </span>
            ) : broken.length ? (
              <span style={{ color: D.text.gold }}>
                An hour at {feedGpm} gal/min runs, with a warning: {say(broken)}. {broken[0]!.hint}
              </span>
            ) : (
              <>
                An hour of the line: {Math.round(run.concentrateKg)} kg of {run.concentrateTdsPct.toFixed(1)}% concentrate from {Math.round(run.feedKg)} kg of cold brew, every check
                holding. Try 6 gal/min.
              </>
            )}
          </div>
          {(Object.keys(START) as string[]).some((k) => values[k] !== START[k]) && (
            <button type="button" className="pf-ghost-btn" onClick={() => setValues(START)} style={{ marginTop: 12, fontSize: 12, padding: '6px 10px', borderRadius: 8, border: `1px solid ${D.border.strong}`, background: 'transparent', color: D.text.secondary, cursor: 'pointer' }}>
              Back to the design point
            </button>
          )}
        </div>
        <div style={{ border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.base, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', margin: '2px 4px 12px' }}>
            <span style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.text.muted }}>AT A GLANCE</span>
            <span style={{ fontSize: 12, color: D.text.muted }}>The app’s own panel, laid out by the contract Claude wrote. Click the chart to set the strength.</span>
          </div>
          <UnitGlance contract={contract} evaluation={evaluation} onSetParam={(name, v) => name in values && set(name, v)} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 10 }}>
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="pf-feature" style={{ border: `1px solid ${D.border.subtle}`, borderRadius: 12, padding: '14px 16px', background: `${D.background.surface}99` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 650, color: D.text.primary }}>
              <Icon size={16} color={D.jade.glow} aria-hidden />
              {title}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: D.text.secondary, marginTop: 6 }}>{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
