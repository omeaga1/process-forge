import React, { useMemo } from 'react';
import { OsakaJadeDarkPalette as D } from '@process-forge/theme';
import { RELEASES_PAGE } from '../../downloads/latestRelease.js';
import { CLIPS, Clip, GUTTER, MCP_TOOL_COUNT, card, mono } from '../ui.js';
import { PageLink } from '../router.js';
import { runColdBrew } from '../coldBrew.js';
import { STANDARD_EQUIPMENT_CATALOG } from '@process-forge/protocol';
import type { LandingActions } from './types.js';

/**
 * The front page: what ProcessForge is, the loop in four steps, and where to
 * go next. Everything else has a page of its own.
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
    text: 'It lands on your flowsheet, drawn and piped. Run the line, read the stream table, and set every unit from a spec sheet that shows which check runs closest to its limit.',
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
          <span>Claude checks the ProcessForge Library before it designs</span>
          <span aria-hidden style={{ color: D.jade.glow }}>→</span>
        </a>
        <div style={{ ...mono, fontSize: 12, letterSpacing: '0.18em', color: D.jade.glow }}>OPEN-SOURCE PROCESS SIMULATION</div>
        <h1 style={{ margin: '14px 0 0', fontSize: 'clamp(2.2rem, 5.6vw, 3.8rem)', fontWeight: 680, letterSpacing: '-0.04em', lineHeight: 1.02, maxWidth: '20ch' }}>
          Describe the equipment. <span style={{ color: D.jade[400] }}>The engine checks the physics.</span>
        </h1>
        <p style={{ margin: '20px 0 0', fontSize: 'clamp(1rem, 2vw, 1.14rem)', lineHeight: 1.6, color: D.text.secondary, maxWidth: '58ch' }}>
          Simulators ship models of the equipment everyone has. ProcessForge is for the unit nobody sells a model of: your AI designs it, the engine checks
          every number, and you simulate it on your flowsheet.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          {primary}
          {secondary}
          {devStudio}
        </div>
        <div style={{ ...mono, fontSize: 11, color: D.text.muted, marginTop: 12 }}>
          {fileLabel} · free and open source ·{' '}
          <PageLink to="/download" className="pf-nav-link" style={{ color: D.text.secondary, textDecoration: 'none' }}>
            other platforms and install steps
          </PageLink>
        </div>
        <div style={{ marginTop: 'clamp(36px, 6vw, 56px)' }}>
          <Clip src={CLIPS[0]!.src} title="Cold-brew freeze concentration" priority />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 13, color: D.text.muted }}>
            <span>The desktop app running a unit Claude designed: a cold-brew freeze concentrator.</span>
            <span style={{ ...mono, fontSize: 11, letterSpacing: '0.1em' }}>RECORDED FROM THE CURRENT BUILD</span>
          </div>
        </div>
      </header>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(48px, 8vw, 88px) ${GUTTER} 0` }} aria-labelledby="pf-loop">
        <h2 id="pf-loop" style={{ margin: 0, fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', fontWeight: 650, letterSpacing: '-0.025em' }}>
          How it works
        </h2>
        <ol style={{ listStyle: 'none', padding: 0, margin: '22px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
          {LOOP.map((s) => (
            <li key={s.n} className="pf-feature" style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ ...mono, fontSize: 12, color: D.jade.glow }}>{s.n}</span>
              <span style={{ fontSize: 17, fontWeight: 650 }}>{s.title}</span>
              <span style={{ fontSize: 14, lineHeight: 1.55, color: D.text.secondary, flex: 1 }}>{s.text}</span>
              <PageLink to={s.to} className="pf-nav-link" style={{ fontSize: 13, color: D.jade.glow, textDecoration: 'none' }}>
                {s.link} →
              </PageLink>
            </li>
          ))}
        </ol>
      </section>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(40px, 6vw, 64px) ${GUTTER} 0` }}>
        <PageLink
          to="/example"
          className="pf-feature"
          style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 18, alignItems: 'center', textDecoration: 'none', color: D.text.primary }}
        >
          <span>
            <span style={{ ...mono, display: 'block', fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>WORKED EXAMPLE</span>
            <span style={{ display: 'block', fontSize: 20, fontWeight: 650, marginTop: 6 }}>Cold brew, freeze-concentrated, from one sentence to a simulated line</span>
            <span style={{ display: 'block', fontSize: 14, color: D.text.secondary, marginTop: 6 }}>Walk through it step by step, then set its operating conditions yourself. →</span>
          </span>
          <span style={{ ...mono, display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '4px 18px', fontSize: 12, color: D.text.secondary, justifyContent: 'start' }}>
            <span style={{ color: D.text.primary, fontSize: 20 }}>{Math.round(run.concentrateKg)}</span>
            <span style={{ color: D.text.primary, fontSize: 20 }}>{run.concentrateTdsPct.toFixed(0)}%</span>
            <span style={{ color: D.text.primary, fontSize: 20 }}>{run.dutyKw.toFixed(0)}</span>
            <span>kg/h concentrate</span>
            <span>TDS, from 5%</span>
            <span>kW to freeze it</span>
          </span>
        </PageLink>
      </section>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(40px, 6vw, 64px) ${GUTTER} 0` }}>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1, margin: 0, border: `1px solid ${D.border.subtle}`, borderRadius: 12, overflow: 'hidden', background: D.border.subtle }}>
          {[
            ['0', 'numbers guessed: the engine computes every one'],
            [String(MCP_TOOL_COUNT), 'MCP tools for Claude and other clients'],
            [String(STANDARD_EQUIPMENT_CATALOG.length), 'standard units to pipe them to, each with its model'],
            ['Apache-2.0', 'free and open source, app and server']
          ].map(([k, v]) => (
            <div key={v} style={{ background: D.background.base, padding: '16px 18px' }}>
              <dt style={{ ...mono, fontSize: 22, fontWeight: 600, color: D.text.primary }}>{k}</dt>
              <dd style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.45, color: D.text.secondary }}>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
};
