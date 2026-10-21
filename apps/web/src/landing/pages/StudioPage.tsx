import React, { useMemo } from 'react';
import { SITE as D } from '../palette.js';
import { GUTTER, MCP_TOOL_COUNT, PageHeader, Section, card, mono } from '../ui.js';
import { PageLink } from '../router.js';
import { runColdBrew } from '../coldBrew.js';
import { StudioFeatures } from '../StudioFeatures.js';
import { KitGallery } from '../KitGallery.js';
import { COMPONENTS, DRAWING_KITS, EQUIPMENT_CATEGORIES, EXAMPLE_LINES, STANDARD_EQUIPMENT_CATALOG } from '@process-forge/protocol';

/**
 * The studio, in full: what the canvas does, the units it ships and draws,
 * and the AI loop for the unit nobody ships. The front page only points
 * here. Every count on it is read from the code it describes.
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

export const StudioPage: React.FC = () => {
  const run = useMemo(() => runColdBrew(), []);
  return (
    <>
      <PageHeader kicker="THE STUDIO" title="Everything the studio does, on one canvas.">
        Build the line, run it and read it, in the desktop app or the same studio in the browser. When a machine isn&rsquo;t in the palette, your AI designs it and the
        engine checks it.
      </PageHeader>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(32px, 5vw, 48px) ${GUTTER} 0` }}>
        <dl className="pf-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 1, margin: 0, border: `1px solid ${D.border.subtle}`, borderRadius: 14, overflow: 'hidden', background: D.border.subtle }}>
          {[
            [String(STANDARD_EQUIPMENT_CATALOG.length), 'standard units, each with its model'],
            [String(MCP_TOOL_COUNT), 'MCP tools for Claude and other clients'],
            [String(DRAWING_KITS.length), 'drawing kits for the units it designs'],
            [String(COMPONENTS.length), 'components in the property database'],
            ['Apache-2.0', 'free and open source, app and server']
          ].map(([k, v]) => (
            <div key={v} style={{ background: D.background.base, padding: '18px 20px' }}>
              <dt style={{ ...mono, fontSize: 24, fontWeight: 600, color: D.text.primary, whiteSpace: 'nowrap' }}>{k}</dt>
              <dd style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.45, color: D.text.secondary }}>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Section id="canvas" n="01" kicker="ON THE CANVAS" title="Build the line, run it, read it.">
        <StudioFeatures />
      </Section>

      <Section
        id="drawings"
        n="02"
        kicker="DRAWN LIKE THE EQUIPMENT"
        title="Designed units look like the machines they model."
        note={`A unit your AI designs is drawn from one of ${DRAWING_KITS.length} parametric kits and shaped by its own numbers: heads on the turret, lanes on the conveyor, layers on the pallet, a nozzle on every port. These are drawn by the engine, in this page.`}
      >
        <KitGallery />
      </Section>

      <Section id="palette" n="03" kicker="THE PALETTE" title="Process and packaging on the same sheet." note="Liquids, gases and solids with temperatures, compositions and reactions, and the bottles, cans, cases and pallets they end up in.">
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

        <h3 style={{ margin: '36px 0 0', fontSize: 16, fontWeight: 650, color: D.text.primary }}>Open an example line</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
          {EXAMPLES.map((e) => (
            <li key={e.key} className="pf-feature" style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ ...mono, fontSize: 11, color: D.jade.glow }}>{EXAMPLE_LINES[e.key]?.nodes.length ?? 0} units</span>
              <span style={{ fontSize: 15, fontWeight: 650 }}>{e.title}</span>
              <span style={{ fontSize: 13, lineHeight: 1.55, color: D.text.secondary }}>{e.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="loop" n="04" kicker="WHEN THE UNIT DOESN'T EXIST" title="Your AI designs it. The engine checks it.">
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
    </>
  );
};
