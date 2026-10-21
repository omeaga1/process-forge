import React, { useEffect, useState } from 'react';
import { fontFamily } from '@process-forge/theme';
import { SITE as D } from './palette.js';
import { useInView } from './useInView.js';

/**
 * What driving ProcessForge from an MCP client looks like: pick a request and
 * watch the tool calls it becomes. An illustration of the server's real
 * tools and their arguments (packages/mcp-server), not a live session.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };
const STEP_MS = 900;

interface Call {
  tool: string;
  args: string;
  result: string;
}
interface Script {
  label: string;
  ask: string;
  calls: Call[];
  reply: string;
}

const SCRIPTS: Script[] = [
  {
    label: 'Design a unit',
    ask: 'Design a freeze concentrator for our cold brew and put it on my flowsheet.',
    calls: [
      { tool: 'design_unit_op', args: '{ "description": "scraped-surface freeze concentrator for cold-brew coffee" }', result: 'Nothing like it in the ProcessForge Library yet · brief, with the operating conditions to ask you for' },
      { tool: 'validate_unit_op', args: '{ "contract": { … 15 parameters, 15 equations, 8 limits } }', result: 'ACCEPTED · 84 kW refrigeration · 0.214 kg/s of ice' },
      { tool: 'add_unit_op_to_flowsheet', args: '{ "contract": { … } }', result: 'Placed "Cold-Brew Freeze Concentrator", drawn, three nozzles' }
    ],
    reply: 'On your canvas. Chiller, column and losses are my assumptions, marked “Assumed: confirm”. Publish it to the library?'
  },
  {
    label: 'Simulate the line',
    ask: 'Run it for an hour. What comes out?',
    calls: [
      { tool: 'simulate_process_line', args: '{ "durationMinutes": 60 }', result: 'Concentrate 154.3 kg/h at 30% TDS, −3.4 °C · melt water 772.3 kg/h · 84 kW · no check broken' }
    ],
    reply: 'About six times stronger than the cold brew, and the mass balance closes: 926.7 kg in, 926.6 kg out. The wash column runs at 91% of its ice limit, the tightest margin.'
  },
  {
    label: 'Push it harder',
    ask: 'What if we feed it 6 gal/min instead of 4?',
    calls: [
      { tool: 'compare_scenarios', args: '{ "changes": { "feed": { "supplyRate": 6 } } }', result: 'Breaks chillerKeepsUp (124 kW > 120 kW) and columnIceLoad' },
      { tool: 'explore_unit_op', args: '{ "contract": { … }, "parameters": ["chillerCapacityKw", "columnDiameterM"] }', result: 'Passes from 124 kW of chiller and a 0.75 m column' }
    ],
    reply: 'Not as it stands: you need about 125 kW of chiller and a 0.75 m wash column. Nothing on your flowsheet has changed; say the word and I’ll update the unit.'
  }
];

export const McpDemo: React.FC = () => {
  const [pick, setPick] = useState(0);
  const [shown, setShown] = useState(0);
  const [ref, inView] = useInView<HTMLDivElement>();
  const script = SCRIPTS[pick]!;
  const total = script.calls.length + 2; // the ask, each call, the reply

  useEffect(() => {
    if (!inView || shown >= total) return;
    const t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 200 : STEP_MS);
    return () => window.clearTimeout(t);
  }, [inView, shown, total]);

  const reveal = (i: number): React.CSSProperties => ({
    opacity: i < shown ? 1 : 0,
    transform: i < shown ? 'none' : 'translateY(6px)',
    transition: 'opacity .3s ease, transform .3s ease'
  });

  return (
    <div ref={ref}>
      <div role="tablist" aria-label="Example requests" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {SCRIPTS.map((s, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === pick}
            onClick={() => {
              setPick(i);
              setShown(0);
            }}
            className="pf-chip"
            style={{
              fontFamily: fontFamily.sans,
              fontSize: 13,
              padding: '6px 11px',
              borderRadius: 999,
              cursor: 'pointer',
              border: `1px solid ${i === pick ? D.jade.glow : D.border.default}`,
              background: i === pick ? `${D.jade.glow}1a` : 'transparent',
              color: i === pick ? D.text.primary : D.text.secondary
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ border: `1px solid ${D.border.default}`, borderRadius: 12, background: D.background.base, padding: 14, minHeight: 250 }}>
        <div style={{ ...reveal(0), display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: '12px 12px 4px 12px', background: D.background.surfaceElevated, color: D.text.primary, fontSize: 14, lineHeight: 1.5 }}>
            {script.ask}
          </div>
        </div>
        {script.calls.map((c, i) => (
          <div key={`${pick}-${i}`} style={{ ...reveal(i + 1), marginTop: 10, border: `1px solid ${D.border.subtle}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ ...mono, fontSize: 12, padding: '7px 10px', background: D.background.surface, color: D.jade.glow, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ color: D.text.muted }}>tool</span> {c.tool}
              <span style={{ color: D.text.muted, overflowWrap: 'anywhere' }}>{c.args}</span>
            </div>
            <div style={{ ...mono, fontSize: 12, padding: '6px 10px', color: D.text.secondary }}>
              <span style={{ color: D.status.busy }}>✓</span> {c.result}
            </div>
          </div>
        ))}
        <div style={{ ...reveal(script.calls.length + 1), marginTop: 12, fontSize: 14, lineHeight: 1.55, color: D.text.secondary }}>{script.reply}</div>
      </div>
      <div style={{ fontSize: 12, color: D.text.muted, marginTop: 8 }}>An illustration of the server’s tools, not a live session.</div>
    </div>
  );
};
