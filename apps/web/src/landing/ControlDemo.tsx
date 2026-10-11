import React, { useMemo, useState } from 'react';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { UnitGlance } from '@process-forge/canvas-ui';
import { evaluateUnitOp, WAX_COOLING_BELT_CONTRACT, type UnitOpContract } from '@process-forge/protocol';
import { Crosshair, LineChart, Lock, Ruler, Table2, ShieldAlert } from 'lucide-react';

/**
 * A unit's spec sheet and its panel at a glance, live: three of the wax
 * belt's settings, and the panel its contract lays out, drawn by the app's
 * own component and worked out by the engine in this page. Then what else
 * the sheet does, in one line each.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };

const KNOBS: { name: string; step: number; from: number; to: number }[] = [
  { name: 'beltSpeedMPerMin', step: 0.25, from: 2, to: 14 },
  { name: 'waxMassFlowKgPerS', step: 0.05, from: 0.2, to: 1.2 },
  { name: 'coolingWaterFlowKgPerS', step: 0.5, from: 3, to: 20 }
];

const FEATURES: { icon: React.ElementType; title: string; text: string }[] = [
  { icon: Ruler, title: 'Any unit you like', text: 'Type 40 psi into a bar field or 120 °F into a °C one. Drag a setting’s name to scrub it through its range.' },
  { icon: Crosshair, title: 'Specify a result', text: 'Name the result you want and the setting to vary. The engine solves for the value.' },
  { icon: Lock, title: 'Held results', text: 'Keep a concentrate at 65 Brix while you change everything else, the way a simulator’s design spec does. Claude’s edits respect the hold too.' },
  { icon: LineChart, title: 'Sensitivity studies', text: 'Step one setting across a range, plot any result, and copy the table into a spreadsheet.' },
  { icon: Table2, title: 'Stream table', text: 'Flow, temperature and composition on every pipe, averaged over the run, as on a real PFD.' },
  { icon: ShieldAlert, title: 'Off-spec diversion', text: 'Product made while a must-hold check is broken is marked off spec and kept out of the line totals.' }
];

export const ControlDemo: React.FC = () => {
  const base = WAX_COOLING_BELT_CONTRACT;
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(KNOBS.map((k) => [k.name, base.parameters.find((p) => p.name === k.name)!.value])));
  const contract = useMemo<UnitOpContract>(
    () => ({ ...base, parameters: base.parameters.map((p) => (p.name in values ? { ...p, value: values[p.name]! } : p)) }),
    [base, values]
  );
  const evaluation = useMemo(() => evaluateUnitOp(contract), [contract]);
  const set = (name: string, v: number) => setValues((x) => ({ ...x, [name]: v }));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* data-theme: the page is dark whatever the studio's theme, and the panel draws from the --pf-* variables. */}
      <div data-theme="dark" className="pf-control-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 0.8fr) minmax(0, 1.6fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.surface, padding: '18px 20px' }}>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>SPEC SHEET · WAX COOLING BELT</div>
          <div style={{ display: 'grid', gap: 18, marginTop: 16 }}>
            {KNOBS.map((k) => {
              const p = base.parameters.find((x) => x.name === k.name)!;
              const v = values[k.name]!;
              return (
                <label key={k.name} style={{ display: 'grid', gap: 6 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, color: D.text.primary }}>
                    <span>{p.label}</span>
                    <span style={{ ...mono, color: D.jade.glow }}>
                      {v.toLocaleString('en-US', { maximumFractionDigits: 2 })} <span style={{ color: D.text.muted }}>{p.unit}</span>
                    </span>
                  </span>
                  <input
                    type="range"
                    className="pf-range"
                    min={k.from}
                    max={k.to}
                    step={k.step}
                    value={v}
                    onChange={(e) => set(k.name, Number(e.target.value))}
                    aria-valuetext={`${v} ${p.unit}`}
                  />
                </label>
              );
            })}
          </div>
          <p style={{ margin: '18px 0 0', fontSize: 13, lineHeight: 1.55, color: D.text.secondary }}>
            {evaluation.physicallyValid ? (
              <>Every must-hold check passes. Slow the belt below about 3.6 m/min and the wax is still molten at the scraper.</>
            ) : (
              <span style={{ color: D.status.failed }}>A must-hold check fails: the simulation would refuse to run this belt.</span>
            )}
          </p>
        </div>
        <div style={{ border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.base, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', margin: '2px 4px 12px' }}>
            <span style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.text.muted }}>AT A GLANCE</span>
            <span style={{ fontSize: 12, color: D.text.muted }}>Laid out by the contract the AI wrote. Click the chart to set the belt speed.</span>
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
