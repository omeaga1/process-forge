import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { evaluateUnitOp, blockingViolations, WAX_COOLING_BELT_CONTRACT } from '@process-forge/protocol';
import { useInView } from './useInView.js';

/**
 * Designing a unit nobody ships, as a short replay: the description, the
 * AI's first draft, the engine's verdict, the revision, the verdict again.
 * The verdicts and figures are the engine's own, evaluated here on the
 * example contract at the draft's and the revision's belt speeds.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };
const STEP_MS = 1100;

type Who = 'you' | 'ai' | 'engine-no' | 'engine-yes';

export const DesignLoop: React.FC = () => {
  const c = WAX_COOLING_BELT_CONTRACT;
  const steps = useMemo(() => {
    const draft = evaluateUnitOp(c, { parameterOverrides: { beltSpeedMPerMin: 3 } });
    const revised = evaluateUnitOp(c, { parameterOverrides: { beltSpeedMPerMin: 6 } });
    const d = draft.derived;
    const r = revised.derived;
    const f = (v: number | undefined) => (v === undefined ? '—' : Math.round(v).toLocaleString());
    const out: { who: Who; label: string; text: React.ReactNode }[] = [
      { who: 'you', label: 'You', text: '“A water-cooled steel belt that solidifies molten wax. 16 m by 1.2 m, fed at 0.55 kg/s.”' },
      {
        who: 'ai',
        label: 'Your AI · draft',
        text: (
          <>
            A contract with {c.parameters.length} parameters, {c.derived.length} equations and {c.constraints.length} limits, running the belt at{' '}
            <span style={mono}>3 m/min</span>.
          </>
        )
      },
      {
        who: blockingViolations(draft).length ? 'engine-no' : 'engine-yes',
        label: blockingViolations(draft).length ? 'Engine · rejected' : 'Engine · accepted',
        text: (
          <>
            The wax needs <span style={mono}>{f(d.conductionTimeS)} s</span> to lose its heat but spends only{' '}
            <span style={mono}>{f(d.residenceTimeS)} s</span> on the belt: its core would still be molten at the scraper. Sent back
            with the reason.
          </>
        )
      },
      { who: 'ai', label: 'Your AI · revision', text: <>A faster belt lays a thinner layer: <span style={mono}>6 m/min</span>.</> },
      {
        who: blockingViolations(revised).length ? 'engine-no' : 'engine-yes',
        label: blockingViolations(revised).length ? 'Engine · rejected' : 'Engine · accepted',
        text: (
          <>
            All {c.constraints.length} limits hold: conduction <span style={mono}>{f(r.conductionTimeS)} s</span> within{' '}
            <span style={mono}>{f(r.residenceTimeS)} s</span> on the belt, cooling duty <span style={mono}>{f(r.totalDutyKw)} kW</span>. It goes on the
            flowsheet and runs like any other unit.
          </>
        )
      }
    ];
    return out;
  }, [c]);

  // The limits the contract declares, as the engine judged them at the
  // draft's and the revision's belt speed.
  const verdicts = useMemo(() => {
    const at = (speed: number) => new Map(evaluateUnitOp(c, { parameterOverrides: { beltSpeedMPerMin: speed } }).constraints.map((k) => [k.id, k.satisfied]));
    return { draft: at(3), revised: at(6) };
  }, [c]);

  const [shown, setShown] = useState(0);
  const [ref, inView] = useInView<HTMLDivElement>();
  const timer = useRef(0);

  useEffect(() => {
    if (!inView || shown >= steps.length) return;
    timer.current = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 250 : STEP_MS);
    return () => window.clearTimeout(timer.current);
  }, [inView, shown, steps.length]);

  const color: Record<Who, string> = { you: D.text.secondary, ai: D.jade[400], 'engine-no': D.status.failed, 'engine-yes': D.jade.glow };

  return (
    <div ref={ref} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
    <div style={{ border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.surface, padding: '18px 20px' }}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
        {steps.map((s, i) => {
          const visible = i < shown;
          const isEngine = s.who.startsWith('engine');
          return (
            <li
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '22px minmax(0, 1fr)',
                gap: 12,
                paddingBottom: i === steps.length - 1 ? 0 : 16,
                opacity: visible ? 1 : 0,
                transform: visible ? 'none' : 'translateY(6px)',
                transition: 'opacity .35s ease, transform .35s ease'
              }}
            >
              <span style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    marginTop: 4,
                    borderRadius: isEngine ? 3 : 999,
                    background: isEngine ? color[s.who] : 'transparent',
                    border: `2px solid ${color[s.who]}`,
                    boxShadow: isEngine ? `0 0 10px ${color[s.who]}88` : 'none',
                    zIndex: 1
                  }}
                />
                {i < steps.length - 1 && <span style={{ position: 'absolute', top: 18, bottom: -2, width: 1, background: D.border.strong }} />}
              </span>
              <div>
                <div style={{ ...mono, fontSize: 10.5, letterSpacing: '0.1em', color: color[s.who], textTransform: 'uppercase' }}>{s.label}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: s.who === 'you' ? D.text.primary : D.text.secondary, marginTop: 3 }}>{s.text}</div>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => setShown(0)}
        disabled={shown < steps.length}
        className="pf-ghost-btn"
        style={{
          marginTop: 16,
          fontFamily: fontFamily.sans,
          fontSize: 12.5,
          padding: '6px 12px',
          borderRadius: 8,
          border: `1px solid ${D.border.strong}`,
          background: 'transparent',
          color: shown < steps.length ? D.text.muted : D.text.primary,
          cursor: shown < steps.length ? 'default' : 'pointer'
        }}
      >
        ↺ Replay
      </button>
    </div>

    {/* The contract's limits, judged as the replay reaches each verdict. */}
    <div style={{ border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.canvas, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div style={{ ...mono, fontSize: 10.5, letterSpacing: '0.12em', color: D.text.muted }}>THE CONTRACT’S LIMITS</div>
        <div style={{ ...mono, fontSize: 12, color: D.text.secondary }}>
          belt speed{' '}
          <span style={{ color: D.jade.glow, transition: 'color .3s' }}>{shown >= 4 ? '6' : '3'} m/min</span>
        </div>
      </div>
      <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
        {c.constraints.map((k) => {
          const judged = shown >= 5 ? verdicts.revised : shown >= 3 ? verdicts.draft : null;
          const ok = judged?.get(k.id);
          const hard = k.severity === 'ERROR';
          const tone = ok === undefined ? D.text.muted : ok ? D.jade.glow : hard ? D.status.failed : D.status.blocked;
          const name = k.id.replace(/-/g, ' ').replace(/^./, (ch) => ch.toUpperCase());
          return (
            <li key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${D.border.subtle}` }}>
              <span
                aria-hidden="true"
                style={{
                  ...mono,
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: ok === undefined ? D.text.muted : D.text.inverse,
                  background: ok === undefined ? 'transparent' : tone,
                  border: `1px solid ${tone}`,
                  transition: 'background .3s, border-color .3s'
                }}
              >
                {ok === undefined ? '' : ok ? '✓' : hard ? '✕' : '!'}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: ok === false ? D.text.primary : D.text.secondary }}>{name}</span>
              <span style={{ ...mono, fontSize: 10, letterSpacing: '0.06em', color: D.text.muted }}>{hard ? 'MUST HOLD' : 'WARNING'}</span>
            </li>
          );
        })}
      </ul>
      <div style={{ fontSize: 12, color: D.text.muted, marginTop: 10, lineHeight: 1.5 }}>
        Judged by the engine, in this page, on the example contract. A limit marked must hold blocks the design until it does.
      </div>
    </div>
    </div>
  );
};
