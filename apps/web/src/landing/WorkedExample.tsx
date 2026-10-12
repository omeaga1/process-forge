import React, { useEffect, useMemo, useState } from 'react';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { EquipmentFigure, TerminalArrow, terminalColor } from '@process-forge/canvas-ui';
import { drawingToDressing, executeDesignUnitOp, executeValidateUnitOp } from '@process-forge/protocol';
import { COLD_BREW_CONTRACT, COLD_BREW_FEED, COLD_BREW_PROMPT, runColdBrew } from './coldBrew.js';
import { useInView } from './useInView.js';

/**
 * The worked example, step by step: the request, the questions the design
 * brief makes the AI ask, the contract it writes, the engine's verdict, the
 * unit on the flowsheet, and an hour of the line. Every list, verdict and
 * figure below is worked out in this page by the same engine the app and the
 * MCP server run; only the chat wording is written out.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };
const STEP_MS = 6000;

const STEPS = [
  { key: 'ask', title: 'Ask', caption: 'In Claude, or any MCP client' },
  { key: 'brief', title: 'It asks you first', caption: 'Operating conditions are yours to give' },
  { key: 'contract', title: 'The contract', caption: 'Parameters, equations and limits' },
  { key: 'verdict', title: 'The engine checks it', caption: 'Five gates, every number computed' },
  { key: 'flowsheet', title: 'On the flowsheet', caption: 'Drawn, piped and ready to run' },
  { key: 'run', title: 'Simulated', caption: 'An hour of the line' }
] as const;

const fmt = (v: number, digits = 1) => v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

function Bubble({ who, children }: { who: 'you' | 'claude' | 'engine'; children: React.ReactNode }) {
  const you = who === 'you';
  return (
    <div style={{ display: 'flex', justifyContent: you ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '88%',
          padding: '10px 14px',
          borderRadius: 12,
          fontSize: 14,
          lineHeight: 1.55,
          color: D.text.primary,
          background: you ? D.background.surfaceActive : who === 'engine' ? D.background.base : D.background.surfaceElevated,
          border: `1px solid ${who === 'engine' ? D.jade[600] : D.border.default}`
        }}
      >
        <div style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', color: who === 'engine' ? D.jade.glow : D.text.muted, marginBottom: 4 }}>
          {who === 'you' ? 'YOU' : who === 'claude' ? 'CLAUDE' : 'PROCESSFORGE ENGINE'}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Counts up to a value once shown. */
function CountUp({ to, digits = 1, play }: { to: number; digits?: number; play: boolean }) {
  const [v, setV] = useState(play ? 0 : to);
  useEffect(() => {
    if (!play || typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setV(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1200);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, play]);
  return <>{fmt(v, digits)}</>;
}

/** A pipe between two things on the mini flowsheet, flowing. */
function Pipe({ vertical = false, length = 56 }: { vertical?: boolean; length?: number }) {
  const w = vertical ? 12 : length;
  const h = vertical ? length : 12;
  return (
    <svg width={w} height={h} aria-hidden style={{ flexShrink: 0, overflow: 'visible' }}>
      <line x1={vertical ? 6 : 0} y1={vertical ? 0 : 6} x2={vertical ? 6 : w} y2={vertical ? h : 6} stroke={D.border.strong} strokeWidth={3} strokeLinecap="round" />
      <line className="pf-flow" x1={vertical ? 6 : 0} y1={vertical ? 0 : 6} x2={vertical ? 6 : w} y2={vertical ? h : 6} stroke={D.streams.continuousFluid} strokeWidth={2} strokeDasharray="6 8" strokeLinecap="round" />
    </svg>
  );
}

export const WorkedExample: React.FC = () => {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));

  // What the engine says, worked out here.
  const brief = useMemo(() => executeDesignUnitOp({ description: 'scraped-surface freeze concentrator for cold-brew coffee' }).operatingConditions, []);
  const verdict = useMemo(() => executeValidateUnitOp({ contract: COLD_BREW_CONTRACT }), []);
  const run = useMemo(() => runColdBrew(), []);
  const dressing = useMemo(() => drawingToDressing(COLD_BREW_CONTRACT.drawing!, COLD_BREW_CONTRACT.ports), []);

  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!inView || !auto || reduced) return;
    const t = window.setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => window.clearTimeout(t);
  }, [inView, auto, step]);
  useEffect(() => setSeen((s) => (s.has(step) ? s : new Set([...s, step]))), [step]);

  const confirmed = new Set(COLD_BREW_CONTRACT.provenance?.engineerConfirmed ?? []);
  const operating = COLD_BREW_CONTRACT.parameters.filter((p) => p.ui?.group === 'Operating conditions');
  const param = (name: string) => COLD_BREW_CONTRACT.parameters.find((p) => p.name === name)!;
  const derived = (name: string) => verdict.derived?.[name] ?? 0;
  const gates: [string, boolean][] = [
    ['Schema', verdict.gates.schema.passed],
    ['Expressions and units', verdict.gates.staticAnalysis.passed],
    ['Physics at the design point', verdict.gates.physical.passed],
    ['Drawing and nozzles', verdict.gates.drawing.passed],
    ['Energy and phases', verdict.gates.physicsAlignment.passed]
  ];

  const pane = (() => {
    switch (STEPS[step]!.key) {
      case 'ask':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <Bubble who="you">{COLD_BREW_PROMPT}</Bubble>
            <Bubble who="claude">
              Nothing in the standard library freezes water out of coffee, so I&rsquo;ll design the unit. Asking ProcessForge for the design
              brief: <code style={{ ...mono, color: D.jade.glow }}>design_unit_op</code>
            </Bubble>
          </div>
        );
      case 'brief':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <Bubble who="engine">
              <div style={{ marginBottom: 6 }}>{brief.instruction.split('. ')[0]}.</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: D.text.secondary, fontSize: 13 }}>
                {brief.ask.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Bubble>
            <Bubble who="claude">
              <div>Before I write it, what are your operating conditions? Where you don&rsquo;t know one I&rsquo;ll propose it and mark it.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {operating.map((p) => (
                  <span
                    key={p.name}
                    style={{ ...mono, fontSize: 11, padding: '3px 8px', borderRadius: 999, border: `1px solid ${confirmed.has(p.name) ? D.jade[500] : D.border.glowAmber + '88'}`, color: confirmed.has(p.name) ? D.jade.glow : D.text.gold }}
                  >
                    {p.label}: {p.value} {p.unit === '-' ? '' : p.unit} · {confirmed.has(p.name) ? 'yours' : 'assumed: confirm'}
                  </span>
                ))}
              </div>
            </Bubble>
          </div>
        );
      case 'contract': {
        const lines = [
          '"parameters": [',
          ...['targetTdsPct', 'glycolSupplyC', 'chillerCapacityKw'].map((n) => {
            const p = param(n);
            return `  { "name": "${p.name}", "value": ${p.value}, "unit": "${p.unit}", "ui": { "group": "Operating conditions" } },`;
          }),
          '  …',
          '"derived": [',
          ...['iceKgPerS', 'latentKw', 'refrigKw', 'freezerCapacityKw'].map((n) => {
            const d = COLD_BREW_CONTRACT.derived.find((x) => x.name === n)!;
            return `  { "name": "${d.name}", "unit": "${d.unit}", "expr": "${d.expr}" },`;
          }),
          '  …',
          '"constraints": [',
          ...['freezerCanRemoveHeat', 'chillerKeepsUp', 'columnIceLoad'].map((id) => {
            const c = COLD_BREW_CONTRACT.constraints.find((x) => x.id === id)!;
            return `  { "id": "${c.id}", "expr": "${c.expr}", "severity": "${c.severity}" },`;
          }),
          '  …'
        ];
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <Bubble who="claude">
              The unit as a contract: {COLD_BREW_CONTRACT.parameters.length} parameters, {COLD_BREW_CONTRACT.derived.length} equations,{' '}
              {COLD_BREW_CONTRACT.constraints.length} limits and a drawing. Checking it: <code style={{ ...mono, color: D.jade.glow }}>validate_unit_op</code>
            </Bubble>
            <pre
              tabIndex={0}
              aria-label="An excerpt of the contract"
              style={{ ...mono, margin: 0, padding: '12px 14px', borderRadius: 10, border: `1px solid ${D.border.default}`, background: D.background.base, fontSize: 12, lineHeight: 1.65, color: D.text.secondary, overflowX: 'auto' }}
            >
              {lines.map((l, i) => (
                <div key={i} className="pf-type" style={{ animationDelay: `${i * 90}ms`, color: /^"/.test(l) ? D.jade.glow : undefined }}>
                  {l}
                </div>
              ))}
            </pre>
          </div>
        );
      }
      case 'verdict':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <Bubble who="engine">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ ...mono, fontSize: 18, fontWeight: 700, color: verdict.verdict === 'ACCEPTED' ? D.jade.glow : D.status.failed }}>{verdict.verdict}</span>
                <span style={{ fontSize: 12, color: D.text.muted }}>at the design point: {COLD_BREW_FEED.gpm} gal/min of 5% TDS cold brew at 4 °C</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 6 }}>
                {gates.map(([g, ok], i) => (
                  <li key={g} className="pf-type" style={{ animationDelay: `${i * 160}ms`, display: 'flex', gap: 8, fontSize: 13 }}>
                    <span style={{ color: ok ? D.jade.glow : D.status.failed }} aria-hidden>
                      {ok ? '✓' : '✗'}
                    </span>
                    {g}
                    <span style={{ color: D.text.muted }}>{ok ? 'passes' : 'fails'}</span>
                  </li>
                ))}
              </ul>
              <div style={{ ...mono, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 12, fontSize: 12, color: D.text.secondary }}>
                <span>
                  Ice frozen out <b style={{ color: D.text.primary }}>{fmt(derived('iceKgPerS'), 3)} kg/s</b>
                </span>
                <span>
                  Refrigeration <b style={{ color: D.text.primary }}>{fmt(derived('refrigKw'))} kW</b>
                </span>
                <span>
                  Freezer can remove <b style={{ color: D.text.primary }}>{fmt(derived('freezerCapacityKw'), 0)} kW</b>
                </span>
                <span>
                  Concentrate freezes at <b style={{ color: D.text.primary }}>{fmt(derived('freezeC'))} °C</b>
                </span>
              </div>
            </Bubble>
          </div>
        );
      case 'flowsheet':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <Bubble who="claude">
              Placed it on your flowsheet with <code style={{ ...mono, color: D.jade.glow }}>add_unit_op_to_flowsheet</code>, fed it, and piped the
              concentrate to a product outlet and the melt water to a byproduct.
            </Bubble>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0,
                padding: '18px 10px',
                borderRadius: 12,
                border: `1px solid ${D.border.default}`,
                backgroundColor: D.background.canvas,
                backgroundImage: `radial-gradient(${D.border.default} 1px, transparent 1px)`,
                backgroundSize: '18px 18px',
                overflowX: 'auto'
              }}
            >
              <div style={{ display: 'grid', justifyItems: 'center', gap: 4, flexShrink: 0 }}>
                <TerminalArrow role="feed" color={terminalColor('feed', D)} fill={`${terminalColor('feed', D)}22`} width={62} height={30} />
                <span style={{ fontSize: 11, color: D.text.secondary }}>Cold brew</span>
              </div>
              <Pipe length={34} />
              <div style={{ display: 'grid', justifyItems: 'center', gap: 4, flexShrink: 0 }}>
                <EquipmentFigure kind="CUSTOM_UNIT_OP" dressing={dressing} width={170} isRunning />
                <span style={{ fontSize: 11, color: D.text.primary, fontWeight: 600 }}>Freeze concentrator</span>
              </div>
              <Pipe length={34} />
              <div style={{ display: 'grid', gap: 14, flexShrink: 0 }}>
                {(['byproduct', 'product'] as const).map((role) => (
                  <div key={role} style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
                    <TerminalArrow role={role} color={terminalColor(role, D)} fill={`${terminalColor(role, D)}22`} width={62} height={30} />
                    <span style={{ fontSize: 11, color: D.text.secondary }}>{role === 'product' ? 'Concentrate' : 'Melt water'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 'run':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <Bubble who="engine">
              <div style={{ fontSize: 13, color: D.text.secondary, marginBottom: 10 }}>
                {run.minutes} minutes simulated: the unit evaluated every second at the stream that reached it.{' '}
                {run.broken.length ? `Broke: ${run.broken.join(', ')}.` : 'No check broken.'}
              </div>
              <table style={{ ...mono, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: D.text.muted, textAlign: 'left' }}>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Stream</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500, textAlign: 'right' }}>kg/h</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500, textAlign: 'right' }}>TDS</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500, textAlign: 'right' }}>°C</th>
                  </tr>
                </thead>
                <tbody style={{ color: D.text.primary }}>
                  {[
                    ['Cold brew in', run.feedKg, 5, COLD_BREW_FEED.temperatureC],
                    ['Concentrate', run.concentrateKg, run.concentrateTdsPct, run.concentrateC],
                    ['Melt water', run.meltKg, run.meltKg ? (100 * run.meltSolidsKg) / run.meltKg : 0, run.meltC]
                  ].map(([name, kg, tds, c]) => (
                    <tr key={name as string} style={{ borderTop: `1px solid ${D.border.subtle}` }}>
                      <td style={{ padding: '6px', ...{ fontFamily: fontFamily.sans } }}>{name}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>
                        <CountUp to={(kg as number) * (60 / run.minutes)} digits={1} play={step === 5} />
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{(tds as number) > 0 && (tds as number) < 0.01 ? '<0.01' : fmt(tds as number, (tds as number) < 1 ? 2 : 1)}%</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{fmt(c as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ ...mono, fontSize: 12, color: D.text.secondary, marginTop: 10 }}>
                Refrigeration <b style={{ color: D.text.primary }}><CountUp to={run.dutyKw} digits={1} play={step === 5} /> kW</b> · in{' '}
                {fmt(run.feedKg, 1)} kg = out {fmt(run.concentrateKg + run.meltKg, 1)} kg
              </div>
            </Bubble>
            <Bubble who="claude">
              About six times stronger, at {fmt(run.concentrateC)} °C so the aroma stays. The chiller and wash column are still my assumptions; set them on the
              unit&rsquo;s panel and the engine re-checks it.
            </Bubble>
          </div>
        );
    }
  })();

  return (
    <div ref={ref} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 0.75fr) minmax(0, 2fr)', gap: 16, alignItems: 'start' }} className="pf-worked">
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }} aria-label="Steps of the worked example">
        {STEPS.map((s, i) => {
          const on = i === step;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => {
                  setStep(i);
                  setAuto(false);
                }}
                aria-current={on ? 'step' : undefined}
                className="pf-step"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'grid',
                  gridTemplateColumns: '26px 1fr',
                  gap: 10,
                  alignItems: 'start',
                  padding: '10px 12px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  border: `1px solid ${on ? D.jade[600] : D.border.subtle}`,
                  background: on ? D.background.surfaceElevated : 'transparent',
                  color: D.text.primary,
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <span
                  style={{ ...mono, width: 24, height: 24, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: on || seen.has(i) ? D.jade.glow : D.text.muted, border: `1px solid ${on ? D.jade.glow : D.border.strong}` }}
                >
                  {i + 1}
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{s.title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: D.text.muted, marginTop: 2 }}>{s.caption}</span>
                </span>
                {on && auto && inView && <span key={step} className="pf-step-progress" aria-hidden style={{ animationDuration: `${STEP_MS}ms` }} />}
              </button>
            </li>
          );
        })}
        <li style={{ marginTop: 4 }}>
          <button type="button" className="pf-ghost-btn" onClick={() => setAuto((a) => !a)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: `1px solid ${D.border.strong}`, background: 'transparent', color: D.text.secondary, cursor: 'pointer' }}>
            {auto ? 'Pause the walkthrough' : 'Play the walkthrough'}
          </button>
        </li>
      </ol>
      <div
        key={step}
        className="pf-pop"
        role="region"
        aria-live="polite"
        aria-label={STEPS[step]!.title}
        style={{ minHeight: 360, border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.surface, padding: 16 }}
      >
        {pane}
      </div>
    </div>
  );
};
