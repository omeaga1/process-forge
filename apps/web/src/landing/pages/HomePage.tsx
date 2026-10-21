import React, { useMemo } from 'react';
import { OsakaJadeDarkPalette as D } from '@process-forge/theme';
import { RELEASES_PAGE } from '../../downloads/latestRelease.js';
import { CLIPS, Clip, GUTTER, MCP_TOOLS, MCP_TOOL_COUNT, Section, card, mono } from '../ui.js';
import { PageLink } from '../router.js';
import { runColdBrew } from '../coldBrew.js';
import { StudioFeatures } from '../StudioFeatures.js';
import { KitGallery } from '../KitGallery.js';
import { COMPONENTS, DRAWING_KITS, EQUIPMENT_CATEGORIES, EXAMPLE_LINES, STANDARD_EQUIPMENT_CATALOG } from '@process-forge/protocol';
import type { LandingActions } from './types.js';

/**
 * The front page: what ProcessForge is, what the studio does, the units it
 * ships and draws, the AI loop for the unit nobody ships, and where to go
 * next. Every count on it is read from the code it describes.
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

export const HomePage: React.FC<LandingActions> = ({ primary, secondary, devStudio, releaseTag, fileLabel }) => {
  const run = useMemo(() => runColdBrew(), []);
  return (
    <>
      <header style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(40px, 7vw, 80px) ${GUTTER} 0` }}>
        <a
          className="pf-pill"
          href={RELEASES_PAGE}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 10px', borderRadius: 999, border: `1px solid ${D.border.strong}`, background: `${D.background.surface}cc`, color: D.text.secondary, fontSize: 13, textDecoration: 'none', marginBottom: 22, maxWidth: '100%', flexWrap: 'wrap' }}
        >
          <span className="pf-dot" aria-hidden />
          <span style={{ color: D.text.primary, fontWeight: 600 }}>{releaseTag ? `${releaseTag} is out` : 'Latest release'}</span>
          <span>Designed units now drawn like the standard palette</span>
          <span aria-hidden style={{ color: D.jade.glow }}>→</span>
        </a>
        <div style={{ ...mono, fontSize: 12, letterSpacing: '0.18em', color: D.jade.glow }}>OPEN-SOURCE PROCESS SIMULATION</div>
        <h1 className="pf-hero-title" style={{ margin: '16px 0 0', fontSize: 'clamp(2.6rem, 7.2vw, 5.4rem)', fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1, maxWidth: '22ch' }}>
          <span style={{ display: 'block' }}>Simulate the whole line.</span>
          <span style={{ display: 'block', paddingBottom: '0.1em' }}>
            <span className="pf-hero-accent">Even the units</span>{' '}
            <span style={{ position: 'relative', whiteSpace: 'nowrap' }}>
              <span className="pf-hero-accent">nobody models.</span>
              {/* A pen stroke under the claim, drawn once as the page opens. */}
              <svg aria-hidden className="pf-hero-stroke" viewBox="0 0 300 16" preserveAspectRatio="none" style={{ position: 'absolute', left: '-2%', bottom: '-0.2em', width: '96%', height: '0.22em', overflow: 'visible' }}>
                <path d="M3 11 C 70 3, 150 2, 297 8" fill="none" stroke={D.jade.glow} strokeWidth="5" strokeLinecap="round" pathLength="1" />
              </svg>
            </span>
          </span>
        </h1>
        <p style={{ margin: '26px 0 0', fontSize: 'clamp(1.05rem, 2.1vw, 1.22rem)', lineHeight: 1.6, color: D.text.secondary, maxWidth: '58ch' }}>
          <span style={{ color: D.text.primary }}>Your AI designs the equipment no simulator ships. The engine checks the physics.</span> ProcessForge is a flowsheet
          editor and simulator for process and packaging lines: pipe up standard units, run the line, read its balance, and drop in what you designed, drawn and piped.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          {primary}
          {secondary}
          {devStudio}
        </div>
        <div style={{ ...mono, fontSize: 11, color: D.text.muted, marginTop: 12 }}>
          {fileLabel} · Windows, macOS, Linux · free and open source ·{' '}
          <PageLink to="/download" className="pf-nav-link" style={{ color: D.text.secondary, textDecoration: 'none' }}>
            other platforms and install steps
          </PageLink>
        </div>
        <div className="pf-hero-clip" style={{ marginTop: 'clamp(36px, 6vw, 56px)', position: 'relative' }}>
          <Clip src={CLIPS[0]!.src} title="Cold-brew freeze concentration" priority />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 13, color: D.text.muted }}>
            <span>The desktop app running a unit Claude designed: a cold-brew freeze concentrator.</span>
            <span style={{ ...mono, fontSize: 11, letterSpacing: '0.1em' }}>RECORDED FROM THE CURRENT BUILD</span>
          </div>
        </div>
      </header>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(40px, 6vw, 64px) ${GUTTER} 0` }}>
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

      <Section id="studio" n="01" kicker="THE STUDIO" title="Build the line, run it, read it." note="Everything happens on one canvas, in the desktop app or the same studio in the browser.">
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

      <Section id="ai" n="05" kicker="BRING YOUR AI" title="Two ways in, one engine judging." note="Either way, nothing reaches your flowsheet until the engine has checked it.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 12 }}>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>CLAUDE DESKTOP, CURSOR, ANY MCP CLIENT</span>
            <span style={{ fontSize: 18, fontWeight: 650 }}>On the subscription you already have</span>
            <span style={{ fontSize: 14, lineHeight: 1.55, color: D.text.secondary }}>
              Claude works straight on your open canvas with {MCP_TOOL_COUNT} tools: it reads the line, builds and pipes it, designs and draws units, runs studies, and
              publishes to the library. One click installs it in Claude Desktop, and it keeps itself up to date.
            </span>
            <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
              {MCP_TOOLS.map(([group, tools]) => (
                <div key={group} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '8px 12px', borderRadius: 8, background: D.background.base, border: `1px solid ${D.border.subtle}` }}>
                  <span style={{ color: D.text.primary }}>{group}</span>
                  <span style={{ ...mono, color: D.text.muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {tools.slice(0, 2).join(', ')} +{tools.length - 2}
                  </span>
                </div>
              ))}
            </div>
            <PageLink to="/claude" className="pf-nav-link" style={{ fontSize: 13, color: D.jade.glow, textDecoration: 'none', marginTop: 4 }}>
              See a session, and every tool →
            </PageLink>
          </div>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>OPENROUTER, IN THE APP</span>
            <span style={{ fontSize: 18, fontWeight: 650 }}>The assistant inside ProcessForge</span>
            <span style={{ fontSize: 14, lineHeight: 1.55, color: D.text.secondary }}>
              Sign in to OpenRouter from the app and pick any model, paid per use. The key is issued for this app only, and on desktop it is kept in the OS keychain. The in-app
              assistant designs units with the same checks, and sees the drawings it makes.
            </span>
            <span style={{ fontSize: 14, lineHeight: 1.55, color: D.text.secondary }}>No account needed for the rest: save projects to a local file, or sign in with Google to keep them in the cloud.</span>
            <PageLink to="/download" className="pf-nav-link" style={{ fontSize: 13, color: D.jade.glow, textDecoration: 'none', marginTop: 'auto' }}>
              Install steps →
            </PageLink>
          </div>
        </div>
      </Section>
    </>
  );
};
