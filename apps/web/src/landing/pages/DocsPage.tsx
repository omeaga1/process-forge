import React, { useMemo } from 'react';
import { SITE as D } from '../palette.js';
import { MCP_TOOLS, MCP_TOOL_COUNT, PageHeader, REPO, Section, card, mono, textLink } from '../ui.js';
import { PageLink } from '../router.js';
import { runColdBrew } from '../coldBrew.js';
import { COMPONENTS, EQUIPMENT_CATEGORIES, EXAMPLE_LINES, STANDARD_EQUIPMENT_CATALOG } from '@process-forge/protocol';

/**
 * The reference: the unit palette, the example lines, how a unit is
 * designed, every MCP tool, how the library works, and what the engine
 * doesn't model yet. The other pages show; this one lists.
 */

const LOOP: { n: string; title: string; text: string; to: string; link: string }[] = [
  {
    n: '1',
    title: 'Describe it',
    text: 'Tell Claude what the equipment does. It checks the ProcessForge Library for units like it, and asks for your operating conditions instead of assuming them.',
    to: '/library',
    link: 'The library'
  },
  {
    n: '2',
    title: 'The engine checks it',
    text: 'Claude writes the unit as parameters, equations and limits. ProcessForge checks the schema, the units, the physics, the energy balance and the drawing, and sends back what to fix.',
    to: '/example',
    link: 'The worked example'
  },
  {
    n: '3',
    title: 'Simulate the line',
    text: 'It lands on your flowsheet, drawn from a kit and piped. Run the line, read the stream table, and set every unit from a spec sheet that shows which check runs closest to its limit.',
    to: '/example#app',
    link: 'In the app'
  },
  {
    n: '4',
    title: 'Share it',
    text: 'Publish it to the ProcessForge Library, and the next engineer who asks Claude for something like it starts from your design.',
    to: '/library#publish',
    link: 'How publishing works'
  }
];

/** The example lines the studio opens with, by the key an MCP client names them with. */
const EXAMPLES: { key: string; title: string; text: string }[] = [
  { key: 'beverage-bottling-line', title: 'Beverage bottling & carbonation', text: 'Carbonator, isobaric filler and capper, spiral accumulation table, sleeve labeler.' },
  { key: 'paint-canning-line', title: 'Paint canning & packaging', text: 'Batch reactor to surge tank, piston filler, conveyor, labeler and robotic palletizer.' },
  { key: 'juice-concentration-line', title: 'Apple juice concentration', text: 'Pumps, a preheater, a vacuum evaporator and its surface condenser, on cooling water.' },
  { key: 'spray-drying-line', title: 'Spray drying & recovery', text: 'Maltodextrin solution and hot air to powder, with the fines recovered at the baghouse.' }
];

/** What design_unit_op hands Claude from the library, alongside the brief. */
const SEEN = `"fromTheLibrary": {
  "checked": true,
  "matches": [
    {
      "name": "Coffee freeze concentrator",
      "author": "…",
      "similarity": 0.67,
      "sharedWords": ["freeze", "concentrator", "coffee"],
      "engineChecked": true
    }
  ],
  "instruction": "Before you design, tell the engineer that the
    ProcessForge Library already has units like this … and ask
    whether to start from one."
}`;

const LIMITS: [string, string][] = [
  ['Pressure', "No pressure network: flow is capped by each unit's rated capacity."],
  ['Properties', `IAPWS-IF97 for water and steam, ideal gas for gases, and a database of ${COMPONENTS.length} components. Other liquids use the density and heat capacity you give.`],
  ['Items', 'Whole items split evenly down each branch.'],
  ['The library', 'Engine-checked on publish, not reviewed by ProcessForge.'],
  ['Subscriptions', 'Claude Pro and ChatGPT Plus work through an MCP client. In-app AI is billed per use.'],
  ['The model matters', 'Smaller models write designs the engine rejects more often.']
];

const CONTENTS: [string, string][] = [
  ['palette', 'Units'],
  ['examples', 'Example lines'],
  ['design', 'Designing a unit'],
  ['tools', 'MCP tools'],
  ['library', 'The library'],
  ['limits', 'Limits']
];

export const DocsPage: React.FC = () => {
  const run = useMemo(() => runColdBrew(), []);
  return (
    <>
      <PageHeader kicker="DOCS" title="The reference.">
        Every unit in the palette, every tool Claude gets, and how the pieces fit. For the code and the full tool reference, see the{' '}
        <a href={REPO} target="_blank" rel="noopener noreferrer" style={textLink}>
          repository
        </a>
        .
      </PageHeader>

      <nav aria-label="On this page" style={{ maxWidth: 1120, margin: '0 auto', padding: '24px clamp(16px, 4vw, 32px) 0', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {CONTENTS.map(([id, label]) => (
          <PageLink key={id} to={`/docs#${id}`} className="pf-tool pf-nav-link" style={{ ...mono, fontSize: 12, textDecoration: 'none' }}>
            {label}
          </PageLink>
        ))}
      </nav>

      <Section id="palette" n="01" kicker="THE PALETTE" title="Process and packaging on the same sheet." note="Liquids, gases and solids with temperatures, compositions and reactions, and the bottles, cans, cases and pallets they end up in.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 12 }}>
          {EQUIPMENT_CATEGORIES.map((c) => {
            const units = STANDARD_EQUIPMENT_CATALOG.filter((u) => u.category === c.id);
            return (
              <div key={c.id} style={{ ...card, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 650 }}>{c.label}</span>
                  <span style={{ ...mono, fontSize: 11, color: D.text.muted }}>{units.length}</span>
                </div>
                <div style={{ fontSize: 13, color: D.text.secondary, marginTop: 4 }}>{c.description}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {units.map((u) => (
                    <span key={u.id} className="pf-tool" title={u.model} style={{ ...mono, fontSize: 11 }}>
                      {u.short}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

      </Section>

      <Section id="examples" n="02" kicker="EXAMPLE LINES" title="Lines the studio opens with." note="Open one from the studio hub, or have an MCP client open it by its key.">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
          {EXAMPLES.map((e) => (
            <li key={e.key} className="pf-feature" style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ ...mono, fontSize: 11, color: D.jade.glow }}>{e.key} · {EXAMPLE_LINES[e.key]?.nodes.length ?? 0} units</span>
              <span style={{ fontSize: 15, fontWeight: 650 }}>{e.title}</span>
              <span style={{ fontSize: 13, lineHeight: 1.55, color: D.text.secondary }}>{e.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="design" n="03" kicker="DESIGNING A UNIT" title="When the unit doesn’t exist.">
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
          {LOOP.map((s) => (
            <li key={s.n} className="pf-feature" style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ ...mono, width: 26, height: 26, borderRadius: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: D.jade.glow, border: `1px solid ${D.jade.glow}66` }}>{s.n}</span>
              <span style={{ fontSize: 17, fontWeight: 650 }}>{s.title}</span>
              <span style={{ fontSize: 14, lineHeight: 1.55, color: D.text.secondary, flex: 1 }}>{s.text}</span>
              <PageLink to={s.to} className="pf-nav-link" style={{ fontSize: 13, color: D.jade.glow, textDecoration: 'none' }}>
                {s.link} →
              </PageLink>
            </li>
          ))}
        </ol>

        <PageLink
          to="/example"
          className="pf-feature"
          style={{ ...card, marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 18, alignItems: 'center', textDecoration: 'none', color: D.text.primary, background: `linear-gradient(120deg, ${D.jade.glow}14, ${D.background.surface} 55%)` }}
        >
          <span>
            <span style={{ ...mono, display: 'block', fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>WORKED EXAMPLE</span>
            <span style={{ display: 'block', fontSize: 20, fontWeight: 650, marginTop: 6 }}>Cold brew, freeze-concentrated, from one sentence to a simulated line</span>
            <span style={{ display: 'block', fontSize: 14, color: D.text.secondary, marginTop: 6 }}>Walk through it step by step, then set its operating conditions yourself. →</span>
          </span>
          <span style={{ ...mono, display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '4px 18px', fontSize: 12, color: D.text.secondary, justifyContent: 'start' }}>
            <span style={{ color: D.text.primary, fontSize: 22 }}>{Math.round(run.concentrateKg)}</span>
            <span style={{ color: D.text.primary, fontSize: 22 }}>{run.concentrateTdsPct.toFixed(0)}%</span>
            <span style={{ color: D.text.primary, fontSize: 22 }}>{run.dutyKw.toFixed(0)}</span>
            <span>kg/h concentrate</span>
            <span>TDS, from 5%</span>
            <span>kW to freeze it</span>
          </span>
        </PageLink>
      </Section>
      <Section id="tools" n="04" kicker="MCP TOOLS" title={`${MCP_TOOL_COUNT} tools, one engine.`} note="Every number a tool returns is computed by the engine, never estimated by the model.">
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 16 }}>
            {MCP_TOOLS.map(([group, tools]) => (
              <div key={group}>
                <div style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow, marginBottom: 8 }}>{group.toUpperCase()}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tools.map((t) => (
                    <code key={t} className="pf-tool" style={mono}>
                      {t}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p style={{ margin: '16px 0 0', fontSize: 13, color: D.text.muted }}>
            What each one takes and returns:{' '}
            <a href={`${REPO}/tree/main/packages/mcp-server#readme`} target="_blank" rel="noopener noreferrer" style={textLink}>
              the MCP server&rsquo;s README
            </a>
            .
          </p>
        </div>
      </Section>

      <Section id="library" n="05" kicker="THE LIBRARY" title="What Claude sees, and how to publish.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={{ fontSize: 15, lineHeight: 1.65, color: D.text.secondary }}>
            <p style={{ margin: 0 }}>
              When you ask Claude for a unit, <code style={{ ...mono, color: D.jade.glow }}>design_unit_op</code> searches the library with your description and
              returns the closest matches alongside the brief. Claude shows you them before it writes anything: start from one with{' '}
              <code style={{ ...mono, color: D.jade.glow }}>add_community_unit_op</code>, or have it design a new one.
            </p>
            <p style={{ margin: '12px 0 0' }}>
              To publish from the app, sign in with Google, open the unit and choose <b>More actions → Publish to the ProcessForge Library</b>. From Claude,{' '}
              <code style={{ ...mono, color: D.jade.glow }}>publish_unit_op</code> opens the same dialog in the app, filled in, and you confirm there.
            </p>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: D.text.muted }}>
              Listings are what their authors wrote. ProcessForge records whether the engine accepted a unit when it was published, but does not review or certify it.
            </p>
          </div>
          <pre tabIndex={0} aria-label="What design_unit_op returns from the library" style={{ ...mono, margin: 0, padding: '14px 16px', borderRadius: 12, border: `1px solid ${D.border.default}`, background: D.background.surface, fontSize: 12, lineHeight: 1.6, color: D.text.secondary, overflowX: 'auto' }}>
            {SEEN}
          </pre>
        </div>
      </Section>

      <Section id="limits" n="06" kicker="LIMITS" title="What it doesn’t do yet.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 10 }}>
          {LIMITS.map(([k, t]) => (
            <div key={k} style={{ border: `1px solid ${D.border.default}`, borderRadius: 10, padding: '12px 14px', background: D.background.surface }}>
              <div style={{ fontSize: 13, fontWeight: 650, color: D.text.primary }}>{k}</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: D.text.secondary, marginTop: 4 }}>{t}</div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
};
