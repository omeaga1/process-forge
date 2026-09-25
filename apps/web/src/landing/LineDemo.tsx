import React, { useEffect, useRef, useState } from 'react';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { EquipmentFigure, TerminalArrow, ThemeScope } from '@process-forge/canvas-ui';
import type { NodeKind } from '@process-forge/protocol';
import {
  DEMO_DEFAULTS,
  STAGE_LABEL,
  findConstraint,
  runDemo,
  type Constraint,
  type DemoRun,
  type DemoSettings,
  type Stage
} from './demoLine.js';

/**
 * The live example on the landing page: a paint line the real engine runs in
 * the visitor's browser (demoLine.ts). Move a slider and the shift is
 * simulated again, and the stage that limits the line is found by rerunning
 * it with each stage 25% faster.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };
const LIQUID = D.streams.continuousFluid;
const ITEMS = D.streams.discreteContainer;
const LIMIT = D.status.blocked;

const NEXT_STEP: Record<Stage, string> = {
  reactors: 'Add a reactor.',
  filler: 'Give the filler more nozzles.',
  labeler: 'Run the labeler faster.'
};

function Slider({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, color: D.text.secondary }}>
        <span>{label}</span>
        <span style={{ ...mono, color: D.text.primary, fontWeight: 600 }}>
          {value}
          <span style={{ color: D.text.muted, fontWeight: 400 }}> {unit}</span>
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', marginTop: 8, accentColor: D.jade.glow }}
      />
    </label>
  );
}

/** Busy, blocked and starved share of the shift, as one bar. */
function StateBar({ busy, blocked, starved }: { busy: number; blocked: number; starved: number }) {
  const seg = (v: number, c: string) => <span style={{ width: `${Math.max(0, v) * 100}%`, background: c, transition: 'width 0.35s ease' }} />;
  return (
    <span style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', background: D.background.surfaceHover, width: '100%' }}>
      {seg(busy, D.status.busy)}
      {seg(blocked, D.status.blocked)}
      {seg(starved, D.status.starved)}
    </span>
  );
}

function Unit({
  kind,
  name,
  share,
  limit,
  count = 1
}: {
  kind: NodeKind;
  name: string;
  share?: { busy: number; blocked: number; starved: number };
  limit: boolean;
  count?: number;
}) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        width: 118,
        padding: '10px 10px 9px',
        borderRadius: 8,
        border: `1px solid ${limit ? LIMIT : D.border.default}`,
        background: limit ? `${LIMIT}12` : D.background.surface,
        boxShadow: limit ? `0 0 22px ${LIMIT}33` : 'none',
        transition: 'border-color 0.3s, box-shadow 0.3s, background 0.3s',
        position: 'relative'
      }}
    >
      {limit && (
        <span
          style={{
            ...mono,
            position: 'absolute',
            top: -9,
            left: 10,
            fontSize: 9,
            letterSpacing: '0.1em',
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 4,
            background: LIMIT,
            color: D.text.inverse
          }}
        >
          LIMIT
        </span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: count > 1 ? 2 : 0, minHeight: 64, justifyContent: 'center' }}>
        {Array.from({ length: count }, (_, i) => (
          <EquipmentFigure key={i} kind={kind} width={count > 2 ? 34 : count > 1 ? 44 : 62} isRunning />
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: D.text.primary, marginTop: 8, lineHeight: 1.25 }}>{name}</div>
      <div style={{ marginTop: 7 }}>{share ? <StateBar {...share} /> : <StateBar busy={0} blocked={0} starved={0} />}</div>
      <div style={{ ...mono, fontSize: 10.5, color: D.text.muted, marginTop: 4 }}>
        {share ? `${Math.round(share.busy * 100)}% busy` : '…'}
      </div>
    </div>
  );
}

function Pipe({ color, items = false }: { color: string; items?: boolean }) {
  // Liquid runs as a solid line with a moving sheen; items as a moving row of dashes.
  const pattern = items
    ? `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 16px)`
    : `repeating-linear-gradient(90deg, ${color} 0 10px, ${color}66 10px 16px)`;
  return (
    <span
      aria-hidden="true"
      className="pf-demo-pipe"
      style={{ flex: '1 0 18px', alignSelf: 'center', height: items ? 3 : 2, backgroundImage: pattern, backgroundSize: '16px 100%', minWidth: 18 }}
    />
  );
}

export const LineDemo: React.FC = () => {
  const [s, setS] = useState<DemoSettings>(DEMO_DEFAULTS);
  const [run, setRun] = useState<DemoRun | null>(null);
  const [limit, setLimit] = useState<Constraint | null>(null);
  const token = useRef(0);

  // A setting's shift is simulated a moment after the slider stops, then the
  // three what-if runs; stale results from an earlier setting are dropped.
  useEffect(() => {
    const mine = ++token.current;
    setLimit(null);
    const t1 = window.setTimeout(() => {
      if (mine !== token.current) return;
      const base = runDemo(s);
      setRun(base);
      window.setTimeout(() => {
        if (mine !== token.current) return;
        setLimit(findConstraint(s, base));
      }, 30);
    }, 140);
    return () => window.clearTimeout(t1);
  }, [s]);

  const share = (id: string) => run?.shares[id];
  const reactorShare = run
    ? (() => {
        const rs = Array.from({ length: s.reactors }, (_, i) => run.shares[`r${i + 1}`]).filter(Boolean) as { busy: number; blocked: number; starved: number }[];
        const avg = (k: 'busy' | 'blocked' | 'starved') => rs.reduce((a, r) => a + r[k], 0) / Math.max(1, rs.length);
        return { busy: avg('busy'), blocked: avg('blocked'), starved: avg('starved') };
      })()
    : undefined;
  const is = (stage: Stage) => limit?.stage === stage;
  const set = (k: keyof DemoSettings) => (v: number) => setS((prev) => ({ ...prev, [k]: v }));

  return (
    <ThemeScope mode="dark">
      <style>{`
        @keyframes pf-demo-flow { from { background-position: 0 0; } to { background-position: 32px 0; } }
        .pf-demo-pipe { animation: pf-demo-flow 1.1s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .pf-demo-pipe { animation: none; } }
      `}</style>
      <div
        style={{
          border: `1px solid ${D.border.strong}`,
          borderRadius: 12,
          background: D.background.canvas,
          backgroundImage: `radial-gradient(${D.border.default} 1px, transparent 1px)`,
          backgroundSize: '18px 18px',
          overflow: 'hidden'
        }}
      >
        {/* Readouts */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            borderBottom: `1px solid ${D.border.default}`,
            background: `${D.background.base}e6`
          }}
        >
          {[
            ['OUTPUT', run ? `${run.rate.toFixed(1)}` : '…', 'cans/min'],
            ['PER 8 H SHIFT', run ? run.total.toLocaleString() : '…', 'cans'],
            ['LIMITS THE LINE', limit ? STAGE_LABEL[limit.stage].replace('the ', '') : 'checking…', '']
          ].map(([k, v, u], i) => (
            <div key={k} style={{ padding: '14px 18px', borderRight: i < 2 ? `1px solid ${D.border.subtle}` : 'none' }}>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', color: D.text.muted }}>{k}</div>
              <div
                style={{
                  ...mono,
                  marginTop: 4,
                  fontSize: 24,
                  fontWeight: 600,
                  color: i === 2 ? (limit ? LIMIT : D.text.muted) : D.jade.glow,
                  textTransform: i === 2 ? 'capitalize' : 'none'
                }}
              >
                {v} <span style={{ fontSize: 12, fontWeight: 400, color: D.text.muted }}>{u}</span>
              </div>
            </div>
          ))}
        </div>

        {/* The line */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '26px 18px 20px', minWidth: 760 }}>
            <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
              <TerminalArrow role="feed" color={D.status.busy} fill={`${D.status.busy}22`} width={78} height={34} />
              <div style={{ fontSize: 11, color: D.text.secondary, marginTop: 6 }}>Latex base</div>
            </div>
            <Pipe color={LIQUID} />
            <Unit kind="BATCH_REACTOR" name={s.reactors > 1 ? `${s.reactors} reactors` : 'Reactor'} count={s.reactors} share={reactorShare} limit={is('reactors')} />
            <Pipe color={LIQUID} />
            <Unit kind="SURGE_TANK" name="Surge tank" share={share('tank')} limit={false} />
            <Pipe color={LIQUID} />
            <Unit kind="ROTARY_FILLER" name={`Filler, ${s.fillerNozzles} nozzles`} share={share('filler')} limit={is('filler')} />
            <Pipe color={ITEMS} items />
            <Unit kind="LABELER" name="Labeler" share={share('labeler')} limit={is('labeler')} />
            <Pipe color={ITEMS} items />
            <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
              <TerminalArrow role="product" color={D.status.starved} fill={`${D.status.starved}22`} width={78} height={34} />
              <div style={{ fontSize: 11, color: D.text.secondary, marginTop: 6 }}>Filled cans</div>
            </div>
          </div>
        </div>

        {/* Verdict */}
        <div style={{ padding: '0 18px 16px', minHeight: 44 }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: D.text.secondary, maxWidth: '70ch' }}>
            {limit ? (
              <>
                <span style={{ color: D.text.primary, fontWeight: 600 }}>
                  {STAGE_LABEL[limit.stage].charAt(0).toUpperCase() + STAGE_LABEL[limit.stage].slice(1)} {limit.stage === 'reactors' ? 'limit' : 'limits'} the line.
                </span>{' '}
                Made 25% faster, {STAGE_LABEL[limit.stage]} would add{' '}
                <span style={{ ...mono, color: D.jade.glow }}>+{limit.gain.toFixed(1)}</span> cans/min; no other stage adds more
                than <span style={{ ...mono }}>+{limit.runnerUp.toFixed(1)}</span>. {NEXT_STEP[limit.stage]}
              </>
            ) : (
              'Running the shift again with each stage 25% faster, to see which one holds the line back…'
            )}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: D.text.muted, flexWrap: 'wrap' }}>
            {[
              ['busy', D.status.busy],
              ['blocked by what follows', D.status.blocked],
              ['waiting for material', D.status.starved]
            ].map(([t, c]) => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 5, borderRadius: 2, background: c }} />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 22,
            padding: '16px 18px 18px',
            borderTop: `1px solid ${D.border.default}`,
            background: `${D.background.base}e6`
          }}
        >
          <Slider label="Reactors in parallel" value={s.reactors} unit="" min={1} max={4} step={1} onChange={set('reactors')} />
          <Slider label="Filler nozzles" value={s.fillerNozzles} unit="" min={6} max={16} step={2} onChange={set('fillerNozzles')} />
          <Slider label="Labeler speed" value={s.labelerSpeed} unit="cans/min" min={20} max={80} step={5} onChange={set('labelerSpeed')} />
        </div>
      </div>
    </ThemeScope>
  );
};
