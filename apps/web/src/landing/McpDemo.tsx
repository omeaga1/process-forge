import React, { useEffect, useState } from 'react';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
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
    label: 'Add a feed and an outlet',
    ask: 'Pipe a latex feed into the reactor, and send the line to a product outlet.',
    calls: [
      { tool: 'add_standard_unit_op', args: '{ "unit": "feed", "material": "Latex base", "connectTo": "R-101" }', result: 'Added "Feed: Latex base", piped into Reactor R-101 (liquid)' },
      { tool: 'add_standard_unit_op', args: '{ "unit": "product", "material": "Filled cans", "connectFrom": "L-400" }', result: 'Added "Product: Filled cans", piped from Labeler L-400 (items)' }
    ],
    reply: 'Done. The feed supplies whatever R-101 draws, and only what reaches the product outlet counts as output.'
  },
  {
    label: 'Find the bottleneck',
    ask: 'What is holding my line back?',
    calls: [
      { tool: 'get_open_flowsheet', args: '{}', result: '6 units, 5 streams' },
      { tool: 'simulate_process_line', args: '{ "graph": { … }, "durationMinutes": 480 }', result: '11.9 cans/min over 8 h · Reactor R-101 busy 100%' }
    ],
    reply: 'The reactor: one 1,000 gal batch about every 80 minutes, and everything after it waits for the next one. A second reactor in parallel nearly doubles the line.'
  },
  {
    label: 'Pull from the cloud',
    ask: 'Find a case packer in the community library and put it after the labeler.',
    calls: [
      { tool: 'search_community_unit_ops', args: '{ "query": "case packer" }', result: 'PackSys Automatic 24-Can Case Packer · PackSys Global' },
      { tool: 'add_community_unit_op', args: '{ "id": "plugin-case-packer", "connectFrom": "L-400" }', result: 'Added, piped from Labeler L-400 (items)' }
    ],
    reply: 'Placed it as its author published it. Community listings are not reviewed by ProcessForge, so check its settings before trusting the results.'
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
              fontSize: 12.5,
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
          <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: '12px 12px 4px 12px', background: D.background.surfaceElevated, color: D.text.primary, fontSize: 13.5, lineHeight: 1.5 }}>
            {script.ask}
          </div>
        </div>
        {script.calls.map((c, i) => (
          <div key={`${pick}-${i}`} style={{ ...reveal(i + 1), marginTop: 10, border: `1px solid ${D.border.subtle}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ ...mono, fontSize: 11.5, padding: '7px 10px', background: D.background.surface, color: D.jade.glow, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ color: D.text.muted }}>tool</span> {c.tool}
              <span style={{ color: D.text.muted, overflowWrap: 'anywhere' }}>{c.args}</span>
            </div>
            <div style={{ ...mono, fontSize: 11.5, padding: '6px 10px', color: D.text.secondary }}>
              <span style={{ color: D.status.busy }}>✓</span> {c.result}
            </div>
          </div>
        ))}
        <div style={{ ...reveal(script.calls.length + 1), marginTop: 12, fontSize: 13.5, lineHeight: 1.55, color: D.text.secondary }}>{script.reply}</div>
      </div>
      <div style={{ fontSize: 11.5, color: D.text.muted, marginTop: 8 }}>An illustration of the server’s tools, not a live session.</div>
    </div>
  );
};
