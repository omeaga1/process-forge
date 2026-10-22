import React from 'react';
import { DISPLAY_FONT, SITE as D } from '../palette.js';
import { RELEASES_PAGE } from '../../downloads/latestRelease.js';
import { GUTTER, LINE, LineCard, mono } from '../ui.js';
import { PageLink } from '../router.js';
import type { LandingActions } from './types.js';

/**
 * The front page tells one story: what ProcessForge is, the line running,
 * and three beats of how it works. One download button, in the hero; the
 * depth lives a click away on the other pages.
 */

const BEATS: { n: string; title: string; text: string; to: string; link: string }[] = [
  { n: '01', title: 'Draw the line', text: 'Drop units on the canvas and pipe them nozzle to nozzle: liquids, gases and solids, and the bottles, cases and pallets they end up in.', to: '/studio', link: 'The studio' },
  { n: '02', title: 'Run it', text: 'Watch it fill, back up and starve. Every unit reports its busy, blocked and starved time, and the line tells you what sets its pace.', to: '/studio#canvas', link: 'What a run shows' },
  { n: '03', title: 'Design what’s missing', text: 'Describe a machine no simulator ships. Your AI writes it as equations and limits, and the engine checks it before it goes on the line.', to: '/example', link: 'A worked example' }
];

const WORDMARK = [...'ProcessForge'];

export const HomePage: React.FC<LandingActions> = ({ primary, devStudio, releaseTag, fileLabel }) => {
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
          Lay out a process or packaging line, pipe it up and run it. When a machine you need doesn&rsquo;t exist, your AI designs it and the engine checks the
          numbers before it reaches your flowsheet.
        </p>
        <div style={{ display: 'flex', gap: '12px 22px', marginTop: 30, flexWrap: 'wrap', alignItems: 'center' }}>
          {primary}
          <PageLink to="/claude" className="pf-nav-link" style={{ fontSize: 15, fontWeight: 600, color: D.text.primary, textDecoration: 'none' }}>
            Or use it from Claude <span aria-hidden style={{ color: D.jade.glow }}>→</span>
          </PageLink>
          {devStudio}
        </div>
        <div style={{ ...mono, fontSize: 11, color: D.text.muted, marginTop: 14 }}>
          {fileLabel} · free and open source ·{' '}
          <PageLink to="/download" className="pf-nav-link" style={{ color: D.text.secondary, textDecoration: 'none' }}>
            other platforms
          </PageLink>
        </div>
      </header>

      <section aria-label="The line, running" style={{ maxWidth: 1180, margin: '0 auto', padding: `clamp(40px, 6vw, 64px) ${GUTTER} 0` }}>
        <LineCard {...LINE} />
      </section>

      <section aria-label="How it works" style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(56px, 9vw, 104px) ${GUTTER} 0` }}>
        <ol className="pf-beats" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'clamp(24px, 4vw, 48px)' }}>
          {BEATS.map((b) => (
            <li key={b.n} style={{ borderTop: `1px solid ${D.border.strong}`, paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ ...mono, fontSize: 12, color: D.jade.glow }}>{b.n}</span>
              <span style={{ fontFamily: DISPLAY_FONT, fontSize: 'clamp(1.5rem, 2.4vw, 1.85rem)', fontWeight: 560, letterSpacing: '-0.02em', lineHeight: 1.1, color: D.text.primary }}>{b.title}</span>
              <span style={{ fontSize: 15, lineHeight: 1.6, color: D.text.secondary, flex: 1 }}>{b.text}</span>
              <PageLink to={b.to} className="pf-nav-link" style={{ fontSize: 14, fontWeight: 600, color: D.jade.glow, textDecoration: 'none' }}>
                {b.link} →
              </PageLink>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
};
