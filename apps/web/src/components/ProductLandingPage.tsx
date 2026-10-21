import React, { useRef } from 'react';
import { RELEASES_PAGE } from '../downloads/latestRelease.js';
import { fontFamily } from '@process-forge/theme';
import { CANVAS_HOVER, DISPLAY_FONT_HREF, SITE as D } from '../landing/palette.js';

// Drafting paper: a fine grid every 24px, a heavier line every 120px.
const GRID = `linear-gradient(${D.border.subtle}99 1px, transparent 1px), linear-gradient(90deg, ${D.border.subtle}99 1px, transparent 1px), linear-gradient(${D.border.subtle}55 1px, transparent 1px), linear-gradient(90deg, ${D.border.subtle}55 1px, transparent 1px)`;
import { ProcessForgeEmblem, ThemeScope } from '@process-forge/canvas-ui';
import { GUTTER, MCPB, REPO, mono } from '../landing/ui.js';
import { PageLink, useLocation, useScrollOnVisit, type PageId } from '../landing/router.js';
import { useDownloads } from '../landing/useDownloads.js';
import { HomePage } from '../landing/pages/HomePage.js';
import { StudioPage } from '../landing/pages/StudioPage.js';
import { ExamplePage } from '../landing/pages/ExamplePage.js';
import { LibraryPage } from '../landing/pages/LibraryPage.js';
import { ClaudePage } from '../landing/pages/ClaudePage.js';
import { DownloadPage } from '../landing/pages/DownloadPage.js';

/**
 * The public site, in the studio's own Osaka Jade: a short front page and a
 * page each for the studio, the worked example, the ProcessForge Library, Claude & MCP,
 * and the download (landing/router.tsx).
 *
 * Nothing on it is a mock-up. The worked example is computed by the real
 * engine in the page, the library is searched live, and the clips are
 * recordings of the current studio (scripts/record-landing.mjs).
 */

export interface ProductLandingPageProps {
  /**
   * Opens the studio in this page. Only in development: ProcessForge is a
   * desktop app, and the public site is the place to download it.
   */
  onLaunchStudio?: () => void;
}

const NAV: [string, string, PageId][] = [
  ['Studio', '/studio', 'studio'],
  ['Worked example', '/example', 'example'],
  ['Library', '/library', 'library'],
  ['Claude & MCP', '/claude', 'claude'],
  ['Download', '/download', 'download']
];

export const ProductLandingPage: React.FC<ProductLandingPageProps> = ({ onLaunchStudio }) => {
  const loc = useLocation();
  const page = loc.page;
  const top = useRef<HTMLDivElement>(null);
  useScrollOnVisit(loc, top);
  const { platform, releaseTag, downloadUrl, fileLabel } = useDownloads();

  const sans: React.CSSProperties = { fontFamily: fontFamily.sans };
  const primary = (
    <a
      className="pf-cta-primary"
      href={downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...sans, display: 'inline-flex', alignItems: 'center', padding: '12px 22px', borderRadius: 9, background: D.jade.glow, color: D.text.inverse, fontWeight: 650, fontSize: 16, textDecoration: 'none', boxShadow: `0 6px 18px -8px ${D.jade.glow}aa` }}
    >
      Download for {platform.name}
    </a>
  );
  const secondaryStyle: React.CSSProperties = { ...sans, display: 'inline-flex', alignItems: 'center', padding: '12px 22px', borderRadius: 9, background: 'transparent', color: D.text.primary, border: `1px solid ${D.border.strong}`, fontWeight: 600, fontSize: 16, cursor: 'pointer', textDecoration: 'none' };
  const secondary = (
    <a className="pf-cta-secondary" href={MCPB} style={secondaryStyle}>
      Add to Claude Desktop
    </a>
  );
  const devStudio = onLaunchStudio && (
    <button className="pf-cta-secondary" onClick={onLaunchStudio} style={secondaryStyle}>
      Open the studio (development)
    </button>
  );

  const body = (() => {
    switch (page) {
      case 'studio':
        return <StudioPage />;
      case 'example':
        return <ExamplePage />;
      case 'library':
        return <LibraryPage />;
      case 'claude':
        return <ClaudePage />;
      case 'download':
        return <DownloadPage />;
      default:
        return <HomePage primary={primary} secondary={secondary} devStudio={devStudio} releaseTag={releaseTag} fileLabel={fileLabel} />;
    }
  })();

  return (
    // flexShrink 0: the app's frame is a fixed-height flex column, and a
    // shrinking page painted its background only one screen deep.
    <div
      ref={top}
      className="pf-landing"
      style={{
        minHeight: '100vh',
        flexShrink: 0,
        backgroundColor: D.background.base,
        backgroundImage: GRID,
        backgroundSize: '120px 120px, 120px 120px, 24px 24px, 24px 24px',
        color: D.text.primary,
        ...sans
      }}
    >
      {/* The title's display face, for the site only. */}
      <link rel="stylesheet" href={DISPLAY_FONT_HREF} />
      <style>{`
        .pf-landing a:focus-visible, .pf-landing button:focus-visible, .pf-landing input:focus-visible { outline: 2px solid ${D.jade.glow}; outline-offset: 2px; }
        .pf-landing .pf-cta-primary { transition: transform .15s ease, filter .15s ease; }
        .pf-landing .pf-cta-primary:hover { filter: brightness(1.08); transform: translateY(-1px); }
        .pf-landing .pf-cta-secondary:hover, .pf-landing .pf-copy:hover { background: ${D.background.surfaceHover} !important; }
        .pf-landing .pf-nav-link:hover { color: ${D.jade.glow} !important; }
        .pf-landing .pf-ghost-btn:not(:disabled):hover { border-color: ${D.jade.glow} !important; color: ${D.jade.glow} !important; }
        @keyframes pf-pop-in { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }
        .pf-landing .pf-pop { animation: pf-pop-in .25s ease; }
        @media (max-width: 820px) { .pf-landing .pf-control-grid, .pf-landing .pf-worked { grid-template-columns: 1fr !important; } }
        @keyframes pf-flow { to { stroke-dashoffset: -28; } }
        .pf-landing .pf-flow { animation: pf-flow 1.1s linear infinite; }
        @keyframes pf-type-in { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: none; } }
        .pf-landing .pf-type { opacity: 0; animation: pf-type-in .35s ease forwards; }
        @keyframes pf-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .pf-landing .pf-step-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: ${D.jade.glow}; transform-origin: left; animation: pf-progress linear forwards; }
        .pf-landing .pf-step:hover, .pf-landing .pf-tile:hover { border-color: ${D.jade[600]} !important; }
        .pf-landing .pf-reveal { opacity: 0; transform: translateY(18px); transition: opacity .6s ease, transform .6s cubic-bezier(.2,.7,.2,1); }
        .pf-landing .pf-reveal[data-in] { opacity: 1; transform: none; }
        .pf-landing .pf-feature { transition: border-color .15s ease, transform .15s ease; }
        .pf-landing .pf-feature:hover { border-color: ${D.jade[500]}88 !important; transform: translateY(-2px); }
        .pf-landing .pf-pill:hover { border-color: ${D.jade.glow} !important; }
        .pf-landing .pf-tool { display: inline-block; padding: 3px 8px; border-radius: 6px; border: 1px solid ${D.border.subtle}; background: ${D.background.base}; color: ${D.text.secondary}; font-size: 12px; }
        .pf-landing .pf-range { width: 100%; accent-color: ${D.jade.glow}; cursor: pointer; }
        .pf-landing [id] { scroll-margin-top: 72px; }
        .pf-landing .pf-nav-link[aria-current="page"] { color: ${D.text.primary} !important; box-shadow: inset 0 -2px 0 ${D.jade.glow}; }
        @keyframes pf-glow-pulse { 0%, 100% { box-shadow: 0 0 0 0 ${D.jade.glow}55; } 50% { box-shadow: 0 0 0 5px ${D.jade.glow}00; } }
        .pf-landing .pf-dot { width: 7px; height: 7px; border-radius: 4px; background: ${D.jade.glow}; animation: pf-glow-pulse 2.4s ease-in-out infinite; }
        .pf-landing .pf-wordmark { font-optical-sizing: auto; white-space: nowrap; }
        .pf-landing .pf-letter { --pf-ink: ${D.text.primary}; display: inline-block; opacity: 0; font-variation-settings: 'opsz' 144, 'wght' 640, 'SOFT' 30; animation: pf-strike 1.5s cubic-bezier(.2,.7,.2,1) forwards; }
        .pf-landing .pf-letter-forge { --pf-ink: ${D.jade.glow}; font-style: italic; }
        @keyframes pf-strike {
          0% { opacity: 0; transform: translateY(-0.35em) scaleY(1.12); color: ${D.text.gold}; text-shadow: 0 0 18px ${D.text.gold}aa, 0 0 42px ${D.text.gold}55; font-variation-settings: 'opsz' 144, 'wght' 220, 'SOFT' 100; }
          18% { opacity: 1; transform: translateY(0.02em) scaleY(0.94); color: ${D.jade[500]}; text-shadow: 0 0 14px ${D.jade[500]}88, 0 0 34px ${D.jade[500]}44; }
          32% { transform: none; }
          55% { color: ${D.jade.glow}; text-shadow: 0 0 6px ${D.jade.glow}33; font-variation-settings: 'opsz' 144, 'wght' 700, 'SOFT' 40; }
          100% { opacity: 1; transform: none; color: var(--pf-ink); text-shadow: none; font-variation-settings: 'opsz' 144, 'wght' 640, 'SOFT' 30; }
        }
        .pf-landing .pf-wordmark:hover .pf-letter-forge { color: ${D.jade[500]} !important; transition: color .3s ease; }
        .pf-landing .pf-next .pf-next-arrow { transition: transform .15s ease; }
        .pf-landing .pf-next:hover .pf-next-arrow { transform: translateX(3px); }
        .pf-landing .pf-bento-wide { grid-column: span 2; }
        @media (max-width: 960px) { .pf-landing .pf-bento { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
        @media (max-width: 620px) { .pf-landing .pf-bento { grid-template-columns: 1fr !important; } .pf-landing .pf-bento-wide { grid-column: auto; } .pf-landing .pf-stats > div:last-child { grid-column: 1 / -1; } }
        @keyframes pf-nozzle-slide { 0%, 12% { transform: translateY(40px); } 45%, 60% { transform: translateY(100px); } 92%, 100% { transform: translateY(40px); } }
        .pf-landing .pf-nozzle-drag { transform: translateY(40px); animation: pf-nozzle-slide 5s cubic-bezier(.6,0,.3,1) infinite; }
        .pf-landing .pf-kit-art svg { width: 100%; height: 100%; max-width: 100%; }
        .pf-landing .pf-kit:hover .pf-kit-art { background-color: ${CANVAS_HOVER} !important; }
        @media (prefers-reduced-motion: reduce) { .pf-landing * { animation: none !important; transition: none !important; } .pf-landing .pf-reveal, .pf-landing .pf-type { opacity: 1; transform: none; } .pf-landing .pf-letter { opacity: 1; transform: none; color: var(--pf-ink); text-shadow: none; font-variation-settings: 'opsz' 144, 'wght' 640, 'SOFT' 30; } }
      `}</style>
      <ThemeScope mode="light">
        {/* Nav: stays in reach while the page scrolls. */}
        <nav aria-label="ProcessForge" style={{ position: 'sticky', top: 0, zIndex: 10, background: `${D.background.base}cc`, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: `1px solid ${D.border.subtle}` }}>
          <div style={{ maxWidth: 1120, margin: '0 auto', padding: `12px ${GUTTER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <PageLink to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: D.text.primary }} aria-label="ProcessForge home">
              <ProcessForgeEmblem size={28} />
              <span style={{ fontSize: 16, fontWeight: 650, letterSpacing: '-0.01em' }}>
                Process<span style={{ color: D.jade.glow }}>Forge</span>
              </span>
            </PageLink>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              {NAV.map(([label, to, id]) => (
                <PageLink key={id} to={to} className="pf-nav-link" aria-current={page === id ? 'page' : undefined} style={{ ...sans, fontSize: 14, color: D.text.secondary, textDecoration: 'none', padding: '4px 0' }}>
                  {label}
                </PageLink>
              ))}
              <a className="pf-nav-link" href={REPO} target="_blank" rel="noopener noreferrer" style={{ ...sans, fontSize: 14, color: D.text.secondary, textDecoration: 'none' }}>
                GitHub
              </a>
            </div>
          </div>
        </nav>

        <main key={page}>{body}</main>

        {/* Close: the call to action once more, on every page but the download itself. */}
        {page !== 'download' && (
          <section style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(64px, 10vw, 112px) ${GUTTER} clamp(48px, 7vw, 72px)`, textAlign: 'center' }}>
            <ProcessForgeEmblem size={44} />
            <h2 style={{ margin: '16px auto 0', fontSize: 'clamp(1.6rem, 3.4vw, 2.2rem)', fontWeight: 650, letterSpacing: '-0.025em', maxWidth: '22ch' }}>Simulate the unit nobody sells a model of.</h2>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              {primary}
              {secondary}
            </div>
          </section>
        )}
        {page === 'download' && <div style={{ height: 'clamp(48px, 7vw, 72px)' }} />}

        <footer style={{ borderTop: `1px solid ${D.border.default}` }}>
          <div style={{ maxWidth: 1120, margin: '0 auto', padding: `18px ${GUTTER}`, display: 'flex', flexWrap: 'wrap', gap: '8px 24px', justifyContent: 'space-between', ...mono, fontSize: 12 }}>
            <span style={{ color: D.text.muted }}>ProcessForge · Apache-2.0</span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
              {[
                ['GitHub', REPO],
                ['Releases', RELEASES_PAGE],
                ['MCP server', `${REPO}/tree/main/packages/mcp-server#readme`],
                ['Privacy', '/privacy.html'],
                ['Code signing', '/code-signing.html']
              ].map(([k, href]) => (
                <a key={k} className="pf-nav-link" href={href} target="_blank" rel="noopener noreferrer" style={{ color: D.text.secondary, textDecoration: 'none' }}>
                  {k}
                </a>
              ))}
            </span>
          </div>
        </footer>
      </ThemeScope>
    </div>
  );
};
