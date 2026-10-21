import React, { useEffect, useMemo, useState } from 'react';
import { fontFamily } from '@process-forge/theme';
import { SITE as D } from './palette.js';
import { COMPONENTS, EXAMPLE_LINES, STANDARD_EQUIPMENT_CATALOG, componentHvap, componentPsat, componentRhoLiquid } from '@process-forge/protocol';
import { simulateProcess } from '@process-forge/simulation-core';
import { runColdBrew } from './coldBrew.js';

/**
 * The studio, a tile per thing it does. The figures on the run and balance
 * tiles come from the real engine, run in the page: the bottling example for
 * an hour, and the cold-brew line of the worked example.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };

function Tile({ kicker, title, text, art, wide = false }: { kicker: string; title: string; text: React.ReactNode; art: React.ReactNode; wide?: boolean }) {
  return (
    <li className={`pf-feature pf-bento-tile${wide ? ' pf-bento-wide' : ''}`} style={{ border: `1px solid ${D.border.default}`, borderRadius: 16, background: D.background.surface, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ minHeight: 150, borderBottom: `1px solid ${D.border.subtle}`, background: `radial-gradient(ellipse 80% 70% at 30% 0%, ${D.jade.glow}12, transparent 70%), ${D.background.base}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>{art}</div>
      <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>{kicker}</span>
        <span style={{ fontSize: 17, fontWeight: 650, color: D.text.primary, letterSpacing: '-0.01em' }}>{title}</span>
        <span style={{ fontSize: 14, lineHeight: 1.55, color: D.text.secondary }}>{text}</span>
      </div>
    </li>
  );
}

/** A feed, a pipe and a vessel: one nozzle slides along the shell, the feed's arrow shows its resize handles. */
const FlowsheetArt: React.FC = () => (
  <svg viewBox="0 0 420 150" role="img" aria-label="A feed piped to a vessel, its nozzle being moved along the shell" style={{ width: '100%', maxWidth: 460, height: 'auto' }}>
    <defs>
      <pattern id="pf-grid" width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.8" fill={D.border.strong} />
      </pattern>
    </defs>
    <rect x="0" y="0" width="420" height="150" fill="url(#pf-grid)" opacity="0.6" />
    {/* Feed arrow, selected, with its resize handles. */}
    <rect x="20" y="52" width="96" height="40" rx="2" fill="none" stroke={D.jade.glow} strokeDasharray="3 3" opacity="0.7" />
    <path d="M26 58 H96 L110 72 L96 86 H26 Z" fill={`${D.jade[500]}22`} stroke={D.jade[400]} strokeWidth="1.5" />
    <text x="34" y="76" fill={D.text.primary} fontSize="10" fontFamily={fontFamily.mono}>
      FEED
    </text>
    {[
      [20, 52],
      [116, 52],
      [20, 92],
      [116, 92]
    ].map(([x, y]) => (
      <rect key={`${x}-${y}`} x={x! - 3} y={y! - 3} width="6" height="6" rx="1" fill={D.background.base} stroke={D.jade.glow} strokeWidth="1.2" />
    ))}
    {/* The pipe, flowing. */}
    <path d="M110 72 H190 V40 H248" fill="none" stroke={D.streams.continuousFluid} strokeWidth="2" opacity="0.35" />
    <path className="pf-flow" d="M110 72 H190 V40 H248" fill="none" stroke={D.streams.continuousFluid} strokeWidth="2" strokeDasharray="6 8" />
    {/* Vessel. */}
    <path d="M250 30 Q250 14 290 14 Q330 14 330 30 V112 Q330 128 290 128 Q250 128 250 112 Z" fill={`${D.jade[500]}14`} stroke={D.jade[400]} strokeWidth="1.5" />
    <rect x="254" y="76" width="72" height="44" rx="10" fill={`${D.jade[500]}30`} />
    <circle cx="250" cy="40" r="4" fill={D.background.base} stroke={D.streams.continuousFluid} strokeWidth="1.5" />
    {/* The nozzle being dragged round the shell. */}
    <g className="pf-nozzle-drag">
      <line x1="330" y1="0" x2="350" y2="0" stroke={D.jade.glow} strokeWidth="2" />
      <circle cx="330" cy="0" r="5" fill={D.background.base} stroke={D.jade.glow} strokeWidth="1.8" />
      <circle cx="330" cy="0" r="10" fill="none" stroke={D.jade.glow} strokeOpacity="0.35" />
    </g>
    <path d="M362 50 V106" stroke={D.text.muted} strokeDasharray="2 3" />
    <text x="368" y="82" fill={D.text.muted} fontSize="9" fontFamily={fontFamily.mono}>
      drag
    </text>
  </svg>
);

const SEGMENTS: [keyof Pick<RunRow, 'busy' | 'blocked' | 'starved' | 'down'>, string, string][] = [
  ['busy', D.status.busy, 'busy'],
  ['blocked', D.status.blocked, 'blocked'],
  ['starved', D.status.starved, 'starved'],
  ['down', D.status.failed, 'down']
];

interface RunRow {
  name: string;
  busy: number;
  blocked: number;
  starved: number;
  down: number;
  oee: number;
}

/** The bottling example, an hour in the real engine: each unit's time, busy, blocked and starved. */
const RunArt: React.FC = () => {
  const [rows, setRows] = useState<RunRow[] | null>(null);
  const [cpm, setCpm] = useState<number | null>(null);
  useEffect(() => {
    // After first paint: the run takes a few tens of milliseconds.
    const t = window.setTimeout(() => {
      const line = EXAMPLE_LINES['beverage-bottling-line']!;
      const r = simulateProcess(line, 60, { seed: 1 });
      setRows(
        line.nodes.map((n) => {
          const rep = r.nodeReports[n.id];
          const total = rep?.totalTimeSeconds || 1;
          return {
            name: n.name,
            busy: (rep?.busyTimeSeconds ?? 0) / total,
            blocked: (rep?.blockedTimeSeconds ?? 0) / total,
            starved: (rep?.starvedTimeSeconds ?? 0) / total,
            down: (rep?.downTimeSeconds ?? 0) / total,
            oee: rep?.overallOeePercentage ?? 0
          };
        })
      );
      setCpm(r.averageLineThroughputUnitsPerMin);
    }, 50);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 9 }} role="img" aria-label="Time each unit of the bottling example spent busy, blocked and starved over an hour, and its OEE">
      <div style={{ ...mono, display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: '0.1em', color: D.text.muted }}>
        <span>BOTTLING EXAMPLE · ENGINE RUN</span>
        <span>OEE</span>
      </div>
      {(rows ?? [null, null, null, null]).map((row, i) => (
        <div key={row?.name ?? i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 44px', gap: 8, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...mono, fontSize: 10, color: D.text.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row?.name ?? ' '}</div>
            <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: D.background.surfaceElevated, marginTop: 3 }}>
              {row && SEGMENTS.map(([k, c]) => <span key={k} style={{ width: `${row[k] * 100}%`, background: c }} />)}
            </div>
          </div>
          <span style={{ ...mono, fontSize: 10, color: D.text.muted, textAlign: 'right' }}>{row ? `${row.oee.toFixed(0)}%` : ''}</span>
        </div>
      ))}
      <div style={{ ...mono, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, color: D.text.muted, marginTop: 2 }}>
        {SEGMENTS.slice(0, 3).map(([k, c, label]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: c }} />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>{cpm !== null ? `${cpm.toFixed(0)} bottles/min, 1 h run` : ''}</span>
      </div>
    </div>
  );
};

/** The cold-brew line's mass balance, closed by the engine in the page. */
const BalanceArt: React.FC = () => {
  const run = useMemo(() => runColdBrew(), []);
  const out = run.concentrateKg + run.meltKg;
  return (
    <div style={{ width: '100%', maxWidth: 360, ...mono }}>
      <svg viewBox="0 0 320 70" aria-hidden style={{ width: '100%', height: 'auto' }}>
        <path d="M20 35 H120" stroke={D.streams.cold} strokeWidth="2" />
        <rect x="120" y="10" width="80" height="40" rx="8" fill={`${D.jade[500]}1c`} stroke={D.jade[400]} strokeWidth="1.5" />
        <path d="M200 26 H300" stroke={D.streams.cold} strokeWidth="2" />
        <path d="M200 44 H300" stroke={D.streams.continuousFluid} strokeWidth="2" />
        <path d="M250 44 V64 H100 V35" fill="none" stroke={D.text.muted} strokeDasharray="3 4" />
        <text x="150" y="60" textAnchor="middle" fill={D.text.muted} fontSize="9" fontFamily={fontFamily.mono}>
          recycle
        </text>
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', fontSize: 12, marginTop: 8 }}>
        <span style={{ color: D.text.muted }}>in</span>
        <span style={{ color: D.text.primary }}>{run.feedKg.toFixed(1)} kg</span>
        <span style={{ color: D.text.muted }}>out</span>
        <span style={{ color: D.text.primary }}>{out.toFixed(1)} kg</span>
        <span style={{ color: D.jade.glow }}>balance</span>
        <span style={{ color: D.jade.glow }}>closes</span>
      </div>
    </div>
  );
};

/** A spec sheet's range gauges: where each value sits between its limits. */
const GaugeArt: React.FC = () => (
  <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12, ...mono }} aria-hidden>
    {[
      ['Refrigeration duty', 0.7, false],
      ['Wash column ice load', 0.91, true],
      ['Concentrate outlet', 0.42, false]
    ].map(([label, at, tight]) => (
      <div key={label as string}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: tight ? D.text.gold : D.text.secondary }}>
          <span>{label as string}</span>
          <span>{tight ? 'closest to its limit' : ''}</span>
        </div>
        <div style={{ position: 'relative', height: 6, borderRadius: 3, background: D.background.surfaceElevated, marginTop: 5 }}>
          <span style={{ position: 'absolute', left: '8%', right: '8%', top: 0, bottom: 0, borderRadius: 3, background: `${D.jade[500]}40` }} />
          <span style={{ position: 'absolute', top: -3, left: `calc(${(at as number) * 100}% - 2px)`, width: 4, height: 12, borderRadius: 2, background: tight ? D.status.blocked : D.jade.glow }} />
        </div>
      </div>
    ))}
  </div>
);

/** The Process Copilot's offline questions, as the studio offers them. */
const CopilotArt: React.FC = () => (
  <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 8 }} aria-hidden>
    <div style={{ ...mono, fontSize: 10, letterSpacing: '0.1em', color: D.text.muted }}>ASK ABOUT THIS LINE</div>
    {['What limits the line?', 'Add a surge tank', 'Add a pump'].map((q, i) => (
      <div key={q} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 9, border: `1px solid ${i === 0 ? `${D.jade.glow}66` : D.border.default}`, background: i === 0 ? `${D.jade.glow}10` : D.background.surface, fontSize: 13, color: D.text.primary }}>
        {q}
        <span style={{ color: D.text.muted }}>›</span>
      </div>
    ))}
  </div>
);

/** Property calls a contract makes by name, evaluated here by the component database. */
const ComponentsArt: React.FC = () => {
  const calls: [string, string][] = [
    ["psat('ethanol', 78.3)", `${componentPsat('ethanol', 78.3).toFixed(1)} kPa`],
    ["hvap('water', 100)", `${componentHvap('water', 100).toFixed(0)} kJ/kg`],
    ["rho_liquid('glycerol', 25)", `${componentRhoLiquid('glycerol', 25).toFixed(0)} kg/m³`]
  ];
  return (
    <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 6, ...mono, fontSize: 12 }} aria-hidden>
      {calls.map(([call, value]) => (
        <div key={call} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 10px', borderRadius: 7, background: D.background.surface, border: `1px solid ${D.border.subtle}` }}>
          <span style={{ color: D.jade.glow }}>{call}</span>
          <span style={{ color: D.text.primary }}>{value}</span>
        </div>
      ))}
    </div>
  );
};

/** A sweep: one setting across a range, the result against a target. */
const StudyArt: React.FC = () => {
  const pts = Array.from({ length: 9 }, (_, i) => {
    const x = i / 8;
    return [24 + x * 280, 100 - 70 * (1 - Math.exp(-2.6 * x))] as const;
  });
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 320 120" aria-hidden style={{ width: '100%', maxWidth: 360, height: 'auto' }}>
      <path d="M24 10 V100 H306" fill="none" stroke={D.border.strong} />
      <path d="M24 52 H306" stroke={D.text.gold} strokeDasharray="4 4" opacity="0.8" />
      <text x="30" y="46" fill={D.text.gold} fontSize="9" fontFamily={fontFamily.mono}>
        target
      </text>
      <path d={path} fill="none" stroke={D.jade.glow} strokeWidth="2" />
      {pts.map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="3" fill={D.background.base} stroke={D.jade.glow} strokeWidth="1.4" />
      ))}
      <path d="M118 52 V100" stroke={D.text.gold} strokeDasharray="2 3" />
      <circle cx="118" cy="52" r="5" fill={D.text.gold} />
      <text x="28" y="114" fill={D.text.muted} fontSize="9" fontFamily={fontFamily.mono}>
        steam duty →
      </text>
    </svg>
  );
};

export const StudioFeatures: React.FC = () => (
  <ul className="pf-bento" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
    <Tile
      wide
      kicker="FLOWSHEET"
      title="Draw the line the way it is piped"
      text={`Drag any of ${STANDARD_EQUIPMENT_CATALOG.length} standard units onto the canvas and pipe them nozzle to nozzle. Move a nozzle anywhere on the outline, resize a feed or outlet arrow, and the pipes follow. Export the sheet as a PNG for the report.`}
      art={<FlowsheetArt />}
    />
    <Tile
      kicker="RUN IT"
      title="Items and liquid in one event loop"
      text="Choose how long the run lasts, then scrub through it. Every unit reports busy, blocked and starved time, the bottleneck and OEE. Runs are seeded, so the same line gives the same answer."
      art={<RunArt />}
    />
    <Tile
      kicker="HEAT & MASS BALANCE"
      title="Solved at steady state, audited every run"
      text="Solve the line's balance with recycles converged by Wegstein, and pipes show their solved state before you run. Every run closes its own heat and mass balance and leads with its status."
      art={<BalanceArt />}
    />
    <Tile
      kicker="SPEC SHEETS"
      title="A spec sheet for every unit"
      text="Laid out from the unit's contract: settings, streams, equations and checks, with range gauges that show which limit it runs closest to."
      art={<GaugeArt />}
    />
    <Tile
      kicker="PROCESS COPILOT"
      title="Ask the line what limits it"
      text="The Copilot reads the board: what sets the pace, where a buffer would help, which unit to add. The basics answer offline, with no model at all."
      art={<CopilotArt />}
    />
    <Tile
      kicker="PROPERTIES"
      title="Looked up, not recalled"
      text={`A component database of ${COMPONENTS.length}, from the Poling, PSRK and CRC tables, that a unit's equations call by name.`}
      art={<ComponentsArt />}
    />
    <Tile
      wide
      kicker="STUDIES"
      title="Sweep a setting, or solve for a target"
      text="“What steam duty gives 50 °Brix?” The engine runs full simulations to answer. A multi-step change is tried on a copy first and shown as a diff, before and after."
      art={<StudyArt />}
    />
  </ul>
);
