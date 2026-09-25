import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { EquipmentFigure, TerminalArrow, ThemeScope } from '@process-forge/canvas-ui';
import type { NodeKind } from '@process-forge/protocol';
import {
  DEMO_DEFAULTS,
  DEMO_MINUTES,
  STAGE_LABEL,
  findConstraint,
  runDemo,
  type Constraint,
  type DemoRun,
  type DemoSettings,
  type Stage,
  type UnitFrame
} from './demoLine.js';
import { useInView } from './useInView.js';

/**
 * The live example on the landing page: a paint line the real engine runs in
 * the visitor's browser (demoLine.ts), played back minute by minute. Tanks
 * and reactors fill and empty, pipes flow only while they carry something,
 * and every unit shows the state the engine had it in at that minute.
 *
 * Move a slider and the shift is simulated again; the stage that limits the
 * line is found by rerunning it with each stage 25% faster.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };
const LIQUID = D.streams.continuousFluid;
const ITEMS = D.streams.discreteContainer;
const LIMIT = D.status.blocked;
/** Simulated minutes per second of playback: the shift plays in 8 s. */
const MINUTES_PER_SECOND = 60;

const STATE_COLOR: Record<UnitFrame['state'], string> = {
  BUSY: D.status.busy,
  BLOCKED: D.status.blocked,
  STARVED: D.status.starved,
  IDLE: D.status.idle,
  FAILED: D.status.failed
};

function stateWord(f: UnitFrame | undefined): string {
  if (!f) return 'Idle';
  if (f.phase === 'HEATING') return 'Heating';
  if (f.phase === 'REACTING') return 'Reacting';
  if (f.phase === 'DISCHARGING') return f.state === 'BLOCKED' ? 'Blocked' : 'Discharging';
  if (f.phase === 'FILLING') return 'Filling';
  return { BUSY: 'Running', BLOCKED: 'Blocked', STARVED: 'Waiting', IDLE: 'Idle', FAILED: 'Down' }[f.state];
}

const NEXT_STEP: Record<Stage, string> = {
  reactors: 'Try another reactor.',
  filler: 'Try more filler nozzles.',
  labeler: 'Try a faster labeler.'
};

const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

function Slider({ label, value, unit, min, max, step, onChange }: {
  label: string; value: number; unit: string; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, color: D.text.secondary }}>
        <span>{label}</span>
        <span style={{ ...mono, color: D.text.primary, fontWeight: 600 }}>
          {value}
          {unit && <span style={{ color: D.text.muted, fontWeight: 400 }}> {unit}</span>}
        </span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="pf-range"
        style={{ width: '100%', marginTop: 8, accentColor: D.jade.glow }}
      />
    </label>
  );
}

/** Busy, blocked and starved share of the whole shift. */
function ShiftBar({ busy, blocked, starved }: { busy: number; blocked: number; starved: number }) {
  const seg = (v: number, c: string) => <span style={{ width: `${Math.max(0, v) * 100}%`, background: c, transition: 'width 0.4s ease' }} />;
  return (
    <span style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: D.background.surfaceHover }}>
      {seg(busy, D.status.busy)}
      {seg(blocked, D.status.blocked)}
      {seg(starved, D.status.starved)}
    </span>
  );
}

function Unit({ kind, name, frames, shift, limit }: {
  kind: NodeKind;
  name: string;
  /** One per drawing: several for reactors in parallel. */
  frames: (UnitFrame | undefined)[];
  shift?: { busy: number; blocked: number; starved: number };
  limit: boolean;
}) {
  const lead = frames[0];
  const color = STATE_COLOR[lead?.state ?? 'IDLE'];
  const n = frames.length;
  return (
    <div
      style={{
        flex: '0 0 auto', width: 124, padding: '12px 10px 10px', borderRadius: 10, position: 'relative',
        border: `1px solid ${limit ? LIMIT : D.border.default}`,
        background: limit ? `${LIMIT}10` : D.background.surface,
        boxShadow: limit ? `0 0 26px ${LIMIT}30` : 'none',
        transition: 'border-color .3s, box-shadow .3s, background .3s'
      }}
    >
      {limit && (
        <span style={{ ...mono, position: 'absolute', top: -9, left: 10, fontSize: 9, letterSpacing: '0.1em', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: LIMIT, color: D.text.inverse }}>
          LIMIT
        </span>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: n > 1 ? '1fr 1fr' : '1fr', gap: 4, justifyItems: 'center', alignItems: 'center', minHeight: 70 }}>
        {frames.map((f, i) => (
          <EquipmentFigure
            key={i}
            kind={kind}
            width={n > 1 ? 44 : 64}
            isRunning={f?.state === 'BUSY'}
            {...(f?.level !== undefined ? { levelFraction: f.level } : {})}
          />
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: D.text.primary, marginTop: 8, lineHeight: 1.25 }}>{name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 11, color }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: color, boxShadow: `0 0 8px ${color}`, transition: 'background .2s' }} />
        <span style={{ transition: 'color .2s' }}>{stateWord(lead)}</span>
        {lead?.level !== undefined && kind === 'SURGE_TANK' && <span style={{ ...mono, color: D.text.muted }}>{Math.round(lead.level * 100)}%</span>}
      </div>
      <div style={{ marginTop: 8 }} title="The whole shift: busy, blocked, waiting">
        {shift ? <ShiftBar {...shift} /> : <ShiftBar busy={0} blocked={0} starved={0} />}
      </div>
    </div>
  );
}

function Pipe({ color, items = false, flowing }: { color: string; items?: boolean; flowing: boolean }) {
  const pattern = items
    ? `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 16px)`
    : `repeating-linear-gradient(90deg, ${color} 0 10px, ${color}66 10px 16px)`;
  return (
    <span
      aria-hidden="true"
      className={flowing ? 'pf-demo-pipe pf-flowing' : 'pf-demo-pipe'}
      style={{
        flex: '1 0 18px', alignSelf: 'center', minWidth: 18, height: items ? 3 : 2,
        backgroundImage: pattern, backgroundSize: '16px 100%',
        opacity: flowing ? 1 : 0.28, transition: 'opacity .25s'
      }}
    />
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" aria-label={label} title={label} onClick={onClick} className="pf-icon-btn"
      style={{
        width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        border: `1px solid ${D.border.strong}`, background: D.background.surfaceElevated, color: D.text.primary, cursor: 'pointer'
      }}
    >
      {children}
    </button>
  );
}

export const LineDemo: React.FC = () => {
  const [s, setS] = useState<DemoSettings>(DEMO_DEFAULTS);
  const [run, setRun] = useState<DemoRun | null>(null);
  const [limit, setLimit] = useState<Constraint | null>(null);
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const token = useRef(0);
  const [card, seen] = useInView<HTMLDivElement>();
  const clockRef = useRef<{ start: number; from: number } | null>(null);

  // A setting's shift is simulated a moment after the slider stops, then the
  // three what-if runs; stale results from an earlier setting are dropped.
  useEffect(() => {
    const mine = ++token.current;
    setLimit(null);
    const t1 = window.setTimeout(() => {
      if (mine !== token.current) return;
      const base = runDemo(s);
      setRun(base);
      setMinute(0);
      setPlaying(true);
      window.setTimeout(() => {
        if (mine !== token.current) return;
        setLimit(findConstraint(s, base));
      }, 60);
    }, 160);
    return () => window.clearTimeout(t1);
  }, [s]);

  // Playback, on the frame clock.
  useEffect(() => {
    if (!playing || !seen || !run) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setMinute(DEMO_MINUTES - 1);
      setPlaying(false);
      return;
    }
    let raf = 0;
    clockRef.current = { start: performance.now(), from: minute };
    const step = (now: number) => {
      const c = clockRef.current!;
      const m = Math.min(DEMO_MINUTES - 1, c.from + ((now - c.start) / 1000) * MINUTES_PER_SECOND);
      setMinute(m);
      if (m >= DEMO_MINUTES - 1) setPlaying(false);
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // minute is read once, as the starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, seen, run]);

  const togglePlay = useCallback(() => {
    if (!playing && minute >= DEMO_MINUTES - 1) setMinute(0);
    setPlaying((p) => !p);
  }, [playing, minute]);

  const frame = run?.frames[Math.floor(minute)] ?? {};
  const reactorIds = Array.from({ length: s.reactors }, (_, i) => `r${i + 1}`);
  const reactorShift = run
    ? (() => {
        const rs = reactorIds.map((id) => run.shares[id]).filter(Boolean) as { busy: number; blocked: number; starved: number }[];
        const avg = (k: 'busy' | 'blocked' | 'starved') => rs.reduce((a, r) => a + r[k], 0) / Math.max(1, rs.length);
        return { busy: avg('busy'), blocked: avg('blocked'), starved: avg('starved') };
      })()
    : undefined;
  const is = (stage: Stage) => limit?.stage === stage;
  const set = (k: keyof DemoSettings) => (v: number) => setS((prev) => ({ ...prev, [k]: v }));

  const reactorsFilling = reactorIds.some((id) => frame[id]?.phase === 'FILLING' && frame[id]?.state === 'BUSY');
  const reactorsSending = reactorIds.some((id) => (frame[id]?.flow ?? 0) > 0);
  const made = frame['out']?.made ?? 0;
  const done = minute >= DEMO_MINUTES - 1;

  return (
    <ThemeScope mode="dark">
      <style>{`
        @keyframes pf-demo-flow { from { background-position: 0 0; } to { background-position: 32px 0; } }
        .pf-demo-pipe.pf-flowing { animation: pf-demo-flow .9s linear infinite; }
        .pf-icon-btn:hover { border-color: ${D.jade.glow}; color: ${D.jade.glow}; }
        @media (prefers-reduced-motion: reduce) { .pf-demo-pipe.pf-flowing { animation: none; } }
      `}</style>
      <div
        ref={card}
        style={{
          border: `1px solid ${D.border.strong}`, borderRadius: 14, overflow: 'hidden',
          background: D.background.canvas,
          backgroundImage: `radial-gradient(${D.border.default} 1px, transparent 1px)`,
          backgroundSize: '18px 18px',
          boxShadow: `0 30px 80px -30px #000c, 0 0 0 1px ${D.jade.glow}10`
        }}
      >
        {/* Transport and live counters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: `1px solid ${D.border.default}`, background: `${D.background.base}ee` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 300px', minWidth: 0 }}>
            <IconButton label={playing ? 'Pause' : done ? 'Play the shift again' : 'Play'} onClick={togglePlay}>
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" fill="currentColor" /><rect x="7" y="1.5" width="3" height="9" fill="currentColor" /></svg>
              ) : done ? (
                <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3a5 5 0 1 1-4.6 3" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M2.5 2v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7-4.5z" fill="currentColor" /></svg>
              )}
            </IconButton>
            <span style={{ ...mono, fontSize: 12, color: D.text.secondary, whiteSpace: 'nowrap' }}>
              <span style={{ color: D.text.primary }}>{clock(minute)}</span> / 08:00
            </span>
            <input
              type="range" min={0} max={DEMO_MINUTES - 1} step={1} value={Math.floor(minute)} aria-label="Time in the shift"
              onChange={(e) => { setPlaying(false); setMinute(Number(e.target.value)); }}
              style={{ flex: 1, minWidth: 80, accentColor: D.jade.glow }}
            />
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {[
              ['FILLED SO FAR', made.toLocaleString(), 'cans', D.jade.glow],
              ['SHIFT AVERAGE', run ? run.rate.toFixed(1) : '…', '/min', D.text.primary],
              ['LIMIT', limit ? STAGE_LABEL[limit.stage].replace('the ', '') : '…', '', limit ? LIMIT : D.text.muted]
            ].map(([k, v, u, c]) => (
              <div key={k}>
                <div style={{ ...mono, fontSize: 9.5, letterSpacing: '0.12em', color: D.text.muted }}>{k}</div>
                <div style={{ ...mono, fontSize: 19, fontWeight: 600, color: c, textTransform: k === 'LIMIT' ? 'capitalize' : 'none', whiteSpace: 'nowrap' }}>
                  {v}<span style={{ fontSize: 11, fontWeight: 400, color: D.text.muted }}> {u}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* The line */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '28px 18px 22px', minWidth: 780 }}>
            <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
              <TerminalArrow role="feed" color={D.status.busy} fill={`${D.status.busy}22`} width={80} height={34} />
              <div style={{ fontSize: 11, color: D.text.secondary, marginTop: 6 }}>Latex base</div>
            </div>
            <Pipe color={LIQUID} flowing={reactorsFilling} />
            <Unit kind="BATCH_REACTOR" name={s.reactors > 1 ? `${s.reactors} reactors` : 'Reactor'} frames={reactorIds.map((id) => frame[id])} {...(reactorShift ? { shift: reactorShift } : {})} limit={is('reactors')} />
            <Pipe color={LIQUID} flowing={reactorsSending} />
            <Unit kind="SURGE_TANK" name="Surge tank" frames={[frame['tank']]} {...(run?.shares['tank'] ? { shift: run.shares['tank'] } : {})} limit={false} />
            <Pipe color={LIQUID} flowing={(frame['tank']?.flow ?? 0) > 0} />
            <Unit kind="ROTARY_FILLER" name={`Filler · ${s.fillerNozzles} nozzles`} frames={[frame['filler']]} {...(run?.shares['filler'] ? { shift: run.shares['filler'] } : {})} limit={is('filler')} />
            <Pipe color={ITEMS} items flowing={frame['filler']?.state === 'BUSY'} />
            <Unit kind="LABELER" name={`Labeler · ${s.labelerSpeed}/min`} frames={[frame['labeler']]} {...(run?.shares['labeler'] ? { shift: run.shares['labeler'] } : {})} limit={is('labeler')} />
            <Pipe color={ITEMS} items flowing={frame['labeler']?.state === 'BUSY'} />
            <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
              <TerminalArrow role="product" color={D.status.starved} fill={`${D.status.starved}22`} width={80} height={34} />
              <div style={{ ...mono, fontSize: 11, color: D.text.primary, marginTop: 6 }}>{made.toLocaleString()} cans</div>
            </div>
          </div>
        </div>

        {/* Verdict */}
        <div style={{ padding: '0 18px 16px', display: 'flex', flexWrap: 'wrap', gap: '8px 24px', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: D.text.secondary, maxWidth: '68ch', minHeight: 42 }}>
            {limit ? (
              <>
                <span style={{ color: D.text.primary, fontWeight: 600 }}>
                  {STAGE_LABEL[limit.stage].charAt(0).toUpperCase() + STAGE_LABEL[limit.stage].slice(1)} {limit.stage === 'reactors' ? 'limit' : 'limits'} the line.
                </span>{' '}
                25% faster there adds <span style={{ ...mono, color: D.jade.glow }}>+{limit.gain.toFixed(1)}</span> cans/min; anywhere else, at most{' '}
                <span style={mono}>+{limit.runnerUp.toFixed(1)}</span>. {NEXT_STEP[limit.stage]}
              </>
            ) : (
              'Running the shift again with each stage 25% faster, to see which one holds the line back…'
            )}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: D.text.muted, flexWrap: 'wrap' }}>
            {[['busy', D.status.busy], ['blocked', D.status.blocked], ['waiting', D.status.starved]].map(([t, c]) => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 4, borderRadius: 2, background: c }} />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 22, padding: '16px 18px 18px', borderTop: `1px solid ${D.border.default}`, background: `${D.background.base}ee` }}>
          <Slider label="Reactors in parallel" value={s.reactors} unit="" min={1} max={4} step={1} onChange={set('reactors')} />
          <Slider label="Filler nozzles" value={s.fillerNozzles} unit="" min={6} max={16} step={2} onChange={set('fillerNozzles')} />
          <Slider label="Labeler speed" value={s.labelerSpeed} unit="cans/min" min={20} max={80} step={5} onChange={set('labelerSpeed')} />
        </div>
      </div>
    </ThemeScope>
  );
};
