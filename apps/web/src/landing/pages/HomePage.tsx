import React from 'react';
import { DISPLAY_FONT, SITE as D } from '../palette.js';
import { RELEASES_PAGE } from '../../downloads/latestRelease.js';
import { Clip, GUTTER, HERO_CLIP, MCP_TOOL_COUNT, mono } from '../ui.js';
import { PageLink } from '../router.js';
import { DRAWING_KITS, STANDARD_EQUIPMENT_CATALOG } from '@process-forge/protocol';
import type { LandingActions } from './types.js';

/**
 * The front page: what ProcessForge is, the line running, and where to go
 * next. The detail lives on its own pages (the studio, the worked example,
 * Claude & MCP, the library), so this one stays short.
 */

/** Where to go from here: one card per page, each with a number read from the code. */
const NEXT: { to: string; kicker: string; title: string; text: string; stat: string }[] = [
  { to: '/studio', kicker: 'THE STUDIO', title: 'Build, run and read a line', text: 'The canvas, the palette, the drawings, and what happens when a unit doesn\u2019t exist yet.', stat: `${STANDARD_EQUIPMENT_CATALOG.length} units · ${DRAWING_KITS.length} kits` },
  { to: '/example', kicker: 'WORKED EXAMPLE', title: 'Cold brew, from one sentence', text: 'A freeze concentrator Claude designed, simulated in this page. Set its conditions yourself.', stat: 'live engine' },
  { to: '/claude', kicker: 'CLAUDE & MCP', title: 'Bring your AI', text: 'Claude works on your open canvas, or use the assistant in the app with any model.', stat: `${MCP_TOOL_COUNT} tools` },
  { to: '/library', kicker: 'LIBRARY', title: 'Start from someone\u2019s design', text: 'Units other engineers published, searchable, ready to drop on a flowsheet.', stat: 'shared units' }
];

const WORDMARK = [...'ProcessForge'];

export const HomePage: React.FC<LandingActions> = ({ primary, secondary, devStudio, releaseTag, fileLabel }) => {
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
          <span>See what changed</span>
          <span aria-hidden style={{ color: D.jade.glow }}>→</span>
        </a>
        <h1 className="pf-wordmark" aria-label="ProcessForge" style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: 'clamp(3.4rem, 13vw, 10.5rem)', lineHeight: 0.9, letterSpacing: '-0.035em', color: D.text.primary }}>
          {/* Each letter is struck hot and cools to ink, one after another, as the page opens. */}
          {WORDMARK.map((ch, i) => (
            <span key={i} aria-hidden className={i >= 7 ? 'pf-letter pf-letter-forge' : 'pf-letter'} style={{ animationDelay: `${0.08 + i * 0.065}s` }}>
              {ch}
            </span>
          ))}
        </h1>
        <p className="pf-descriptor" style={{ margin: 'clamp(14px, 2vw, 22px) 0 0', fontSize: 'clamp(1.25rem, 2.8vw, 1.9rem)', lineHeight: 1.25, fontWeight: 500, letterSpacing: '-0.015em', color: D.text.primary, maxWidth: '36ch', textWrap: 'balance' }}>
          Production line simulation, machine by machine.
        </p>
        <p style={{ margin: '18px 0 0', fontSize: 'clamp(1rem, 1.9vw, 1.12rem)', lineHeight: 1.6, color: D.text.secondary, maxWidth: '58ch' }}>
          Lay out a process or packaging line, pipe it up and run it. When a machine you need isn&rsquo;t in the palette, Claude designs it and the simulator checks
          the numbers before it goes on your flowsheet.
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
          <Clip src={HERO_CLIP.src} title={HERO_CLIP.title} priority />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 13, color: D.text.muted }}>
            <span>A carbonated soft-drink line from syrup and CO2 to finished pallets, every machine a unit Claude designed and drew, running in the desktop app.</span>
            <span style={{ ...mono, fontSize: 11, letterSpacing: '0.1em' }}>RECORDED FROM THE CURRENT BUILD</span>
          </div>
        </div>
      </header>

      <nav aria-label="Explore" style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(48px, 8vw, 80px) ${GUTTER} 0` }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
          {NEXT.map((n) => (
            <li key={n.to} style={{ display: 'flex' }}>
              <PageLink to={n.to} className="pf-feature pf-next" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, padding: '18px 20px', borderRadius: 14, border: `1px solid ${D.border.default}`, background: D.background.surface, color: D.text.primary, textDecoration: 'none' }}>
                <span style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>{n.kicker}</span>
                <span style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-0.01em' }}>{n.title}</span>
                <span style={{ fontSize: 14, lineHeight: 1.55, color: D.text.secondary, flex: 1 }}>{n.text}</span>
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, ...mono, fontSize: 12, color: D.text.muted }}>
                  {n.stat}
                  <span aria-hidden className="pf-next-arrow" style={{ color: D.jade.glow, fontSize: 15 }}>
                    →
                  </span>
                </span>
              </PageLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
};
