import React, { useState, useEffect } from 'react';
import {
  fetchLatestInstaller,
  RELEASES_PAGE,
  formatSize,
  type DesktopOs
} from '../downloads/latestRelease.js';
import { OsakaJadeLightPalette as L, OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { ProcessForgeEmblem, ThemeScope } from '@process-forge/canvas-ui';
import { LineDemo } from '../landing/LineDemo.js';

/**
 * The public landing page.
 *
 * Osaka Jade in two registers: the hero and footer are the studio's own dark
 * obsidian and jade, and the reading sections between are the light theme's
 * rice paper, ruled like a drawing sheet with jade zone numbers.
 *
 * The example in the hero is not a picture: it is a small paint line that
 * the real engine simulates in the visitor's browser (landing/demoLine.ts).
 */

export interface ProductLandingPageProps {
  onLaunchStudio: () => void;
}

interface PlatformInfo {
  name: string;
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  downloadUrl: string;
  fileLabel: string;
}

const RULE = `1px solid ${L.border.default}`;
const HAIRLINE = `1px solid ${L.border.subtle}`;
const GUTTER = 'clamp(16px, 4vw, 32px)';
const REPO = 'https://github.com/omeaga1/process-forge';

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };
const sans: React.CSSProperties = { fontFamily: fontFamily.sans };

/** A drawing zone: a numbered, ruled band down the sheet. */
function Zone({ n, title, note, children }: { n: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: RULE, display: 'flex', alignItems: 'stretch' }}>
      <div
        style={{
          ...mono,
          width: 'clamp(36px, 8vw, 64px)',
          flexShrink: 0,
          borderRight: RULE,
          padding: '24px 0 0',
          textAlign: 'center',
          fontSize: 12,
          fontWeight: 600,
          color: L.jade[500],
          letterSpacing: '0.1em'
        }}
      >
        {n}
      </div>
      <div style={{ flex: 1, padding: `24px ${GUTTER} 40px`, minWidth: 0 }}>
        <h2 style={{ ...sans, margin: 0, fontSize: '1.4rem', fontWeight: 650, letterSpacing: '-0.015em', color: L.text.primary }}>{title}</h2>
        {note && <p style={{ ...sans, margin: '8px 0 0', fontSize: '0.95rem', color: L.text.secondary, maxWidth: '64ch', lineHeight: 1.6 }}>{note}</p>}
        <div style={{ marginTop: 22 }}>{children}</div>
      </div>
    </section>
  );
}

/** A cell in a ruled grid of cards. */
function Cell({ kicker, title, children }: { kicker?: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '18px 20px', borderRight: HAIRLINE, borderBottom: HAIRLINE, background: L.background.surface }}>
      {kicker && <div style={{ ...mono, fontSize: 11, fontWeight: 600, color: L.jade[500], letterSpacing: '0.1em' }}>{kicker}</div>}
      <div style={{ ...sans, marginTop: kicker ? 6 : 0, fontSize: '1.02rem', fontWeight: 600, color: L.text.primary }}>{title}</div>
      <div style={{ ...sans, marginTop: 6, fontSize: '0.9rem', lineHeight: 1.6, color: L.text.secondary }}>{children}</div>
    </div>
  );
}

function Tool({ name }: { name: string }) {
  return (
    <code
      style={{
        ...mono,
        fontSize: '0.74rem',
        padding: '3px 8px',
        borderRadius: 4,
        background: L.jade.muted,
        color: L.jade[700],
        whiteSpace: 'nowrap'
      }}
    >
      {name}
    </code>
  );
}

export const ProductLandingPage: React.FC<ProductLandingPageProps> = ({ onLaunchStudio }) => {
  const [platform, setPlatform] = useState<PlatformInfo>({
    name: 'Windows',
    os: 'windows',
    downloadUrl: RELEASES_PAGE,
    fileLabel: 'Windows installer (.exe)'
  });

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const plat = window.navigator.platform?.toLowerCase() || '';
    // Phones report Linux (Android) or Mac (iOS); there is no phone build, so
    // point them at every desktop download rather than offer the wrong one.
    if (/android|iphone|ipad|ipod|mobile/.test(ua)) {
      setPlatform({ name: 'desktop', os: 'unknown', downloadUrl: RELEASES_PAGE, fileLabel: 'Windows, macOS and Linux' });
    } else if (plat.includes('mac') || ua.includes('mac os x')) {
      setPlatform({ name: 'macOS', os: 'macos', downloadUrl: RELEASES_PAGE, fileLabel: 'macOS disk image (.dmg)' });
    } else if (plat.includes('linux') || ua.includes('linux')) {
      setPlatform({ name: 'Linux', os: 'linux', downloadUrl: RELEASES_PAGE, fileLabel: 'Linux AppImage' });
    }
  }, []);

  useEffect(() => {
    if (platform.os === 'unknown') return;
    let cancelled = false;
    void fetchLatestInstaller(platform.os as DesktopOs).then((found) => {
      if (cancelled || !found) return;
      setPlatform((prev) => ({
        ...prev,
        downloadUrl: found.url,
        fileLabel: `${prev.fileLabel} · ${found.version} · ${formatSize(found.sizeBytes)}`
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [platform.os]);

  const darkLink: React.CSSProperties = { ...sans, fontSize: 13.5, color: D.text.secondary, textDecoration: 'none' };

  return (
    // flexShrink 0: the app's frame is a fixed-height flex column, and a
    // shrinking page painted its background only one screen deep.
    <div style={{ minHeight: '100vh', flexShrink: 0, background: L.background.base, color: L.text.primary, ...sans }}>
      <style>{`
        .pf-landing a:focus-visible, .pf-landing button:focus-visible { outline: 2px solid ${D.jade.glow}; outline-offset: 2px; }
        .pf-landing .pf-cta-primary:hover { filter: brightness(1.08); }
        .pf-landing .pf-cta-secondary:hover { background: ${D.background.surfaceHover}; }
        .pf-landing .pf-dark-link:hover { color: ${D.jade.glow}; }
      `}</style>
      <div className="pf-landing">
        {/* ── Hero: the studio's own dark Osaka Jade ─────────────────── */}
        <ThemeScope mode="dark">
          <header
            style={{
              background: D.background.base,
              backgroundImage: `radial-gradient(ellipse 70% 55% at 78% 0%, ${D.jade.glow}1f, transparent 70%), linear-gradient(${D.border.subtle} 1px, transparent 1px), linear-gradient(90deg, ${D.border.subtle} 1px, transparent 1px)`,
              backgroundSize: '100% 100%, 32px 32px, 32px 32px',
              color: D.text.primary,
              borderBottom: `1px solid ${D.border.strong}`
            }}
          >
            <div style={{ maxWidth: 1120, margin: '0 auto', padding: `0 ${GUTTER}` }}>
              {/* Nav */}
              <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 0', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ProcessForgeEmblem size={30} />
                  <span style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-0.01em' }}>
                    Process<span style={{ color: D.jade.glow }}>Forge</span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <a className="pf-dark-link" style={darkLink} href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a>
                  <a className="pf-dark-link" style={darkLink} href={RELEASES_PAGE} target="_blank" rel="noopener noreferrer">Releases</a>
                  <a className="pf-dark-link" style={darkLink} href={`${REPO}/tree/main/packages/mcp-server#readme`} target="_blank" rel="noopener noreferrer">MCP server</a>
                </div>
              </nav>

              {/* Pitch */}
              <div style={{ padding: 'clamp(28px, 6vw, 64px) 0 clamp(24px, 4vw, 40px)', maxWidth: 760 }}>
                <div style={{ ...mono, fontSize: 11.5, letterSpacing: '0.18em', color: D.jade.glow }}>OPEN-SOURCE PROCESS SIMULATION</div>
                <h1
                  style={{
                    margin: '14px 0 0',
                    fontSize: 'clamp(2.1rem, 5.4vw, 3.5rem)',
                    fontWeight: 680,
                    letterSpacing: '-0.035em',
                    lineHeight: 1.04,
                    color: D.text.primary
                  }}
                >
                  Find the bottleneck
                  <br />
                  <span style={{ color: D.jade[400] }}>before you build the line.</span>
                </h1>
                <p style={{ margin: '18px 0 0', fontSize: 'clamp(1rem, 2vw, 1.12rem)', lineHeight: 1.6, color: D.text.secondary, maxWidth: '60ch' }}>
                  Lay out reactors, tanks, pumps, fillers and conveyors, mark where material comes in and goes out, and simulate
                  the shift: every machine&apos;s busy, blocked and starved time, the throughput, and what holds it back. For
                  equipment nobody ships a model for, your AI designs one and the engine checks its physics first.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 26, flexWrap: 'wrap', alignItems: 'center' }}>
                  <a
                    className="pf-cta-primary"
                    href={platform.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      ...sans,
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '12px 22px',
                      borderRadius: 8,
                      background: D.jade.glow,
                      color: D.text.inverse,
                      fontWeight: 650,
                      fontSize: '0.95rem',
                      textDecoration: 'none',
                      boxShadow: `0 0 24px ${D.jade.glow}40`
                    }}
                  >
                    Download for {platform.name}
                  </a>
                  <button
                    className="pf-cta-secondary"
                    onClick={onLaunchStudio}
                    style={{
                      ...sans,
                      padding: '12px 22px',
                      borderRadius: 8,
                      background: 'transparent',
                      color: D.text.primary,
                      border: `1px solid ${D.border.strong}`,
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      cursor: 'pointer'
                    }}
                  >
                    Open in your browser
                  </button>
                </div>
                <div style={{ ...mono, fontSize: 11, color: D.text.muted, marginTop: 12 }}>{platform.fileLabel} · free, Apache-2.0</div>
              </div>

              {/* The live example */}
              <div style={{ paddingBottom: 'clamp(32px, 5vw, 56px)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: D.text.primary }}>
                    A paint line, simulated in this page
                    <span style={{ color: D.text.muted, fontWeight: 400 }}> · move a slider and the engine runs the shift again</span>
                  </div>
                  <div style={{ ...mono, fontSize: 10.5, letterSpacing: '0.1em', color: D.text.muted }}>SAME ENGINE AS THE APP</div>
                </div>
                <LineDemo />
              </div>
            </div>
          </header>
        </ThemeScope>

        {/* ── The sheet ─────────────────────────────────────────────────── */}
        <main style={{ maxWidth: 1120, margin: '0 auto', borderLeft: RULE, borderRight: RULE, background: L.background.base }}>
          <Zone
            n="01"
            title="How it works"
            note="Standard equipment comes with its model. Anything else, you describe, and it is checked before it can affect a result."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', border: RULE, borderRight: 'none', borderBottom: 'none' }}>
              <Cell kicker="STEP 1" title="Draw the line">
                Place pumps, tanks, reactors, heat exchangers, separators, fillers, conveyors, labelers and palletizers, and pipe
                them together. Feed, product, byproduct and waste arrows mark where material enters and leaves.
              </Cell>
              <Cell kicker="STEP 2" title="Design what is missing">
                Describe the unit in plain words: “a water-cooled steel belt that solidifies molten wax, 16 m by 1.2 m.” Your AI
                writes it as parameters, equations and limits. The engine evaluates every limit, and sends failures back with
                the reason until the design holds.
              </Cell>
              <Cell kicker="STEP 3" title="Simulate and fix the constraint">
                Run a shift. Liquid flows through tanks and pumps second by second; containers move as discrete events. See
                throughput, OEE and breakdowns per machine, and which unit to change first.
              </Cell>
            </div>
          </Zone>

          <Zone
            n="02"
            title="Bring your own AI"
            note="The engine does the physics; the AI only writes designs for it to check. Use whichever model you already pay for."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', border: RULE, borderRight: 'none', borderBottom: 'none' }}>
              <Cell title="In the app, with OpenRouter">
                Chat about your flowsheet and design unit operations without leaving ProcessForge. Sign in with OpenRouter once and
                use Claude, GPT, Gemini and others, paying as you go. Prefer your own provider key, or a free local model in
                Ollama? Those are under Other options.
              </Cell>
              <Cell title="From an MCP client, on your subscription">
                Claude Desktop, Cursor or any MCP client can build and run your line on the plan you already have: design units,
                place standard equipment, pull units from the community library, pipe them together and simulate. Add the server
                (Node.js 20 or later):
                <code
                  style={{
                    ...mono,
                    display: 'block',
                    marginTop: 10,
                    padding: '9px 12px',
                    fontSize: '0.82rem',
                    borderRadius: 6,
                    background: D.background.base,
                    color: D.jade.glow,
                    overflowX: 'auto',
                    whiteSpace: 'nowrap'
                  }}
                >
                  npx -y @process-forge/mcp-server
                </code>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {['design_unit_op', 'add_standard_unit_op', 'search_community_unit_ops', 'add_stream', 'simulate_process_line'].map((t) => (
                    <Tool key={t} name={t} />
                  ))}
                </span>
              </Cell>
            </div>
          </Zone>

          <Zone n="03" title="What it does not do yet">
            {[
              'Heat is not modelled in the line simulation: a heat exchanger passes flow up to its rated rate.',
              'A designed unit that runs continuously is checked at steady state, but does not limit the flow.',
              'Splits of whole items go evenly down each branch. Liquid splits only at a separator, by its vapor ratio.',
              'AI inside the app is billed per use, through OpenRouter or a provider key, or runs free in Ollama. Subscriptions such as Claude Pro or ChatGPT Plus cannot be used by other apps; they work through an MCP client instead.',
              'Results depend on the model. Smaller models write designs the engine rejects more often.'
            ].map((t) => (
              <div key={t} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: HAIRLINE, fontSize: '0.9rem', lineHeight: 1.55 }}>
                <span style={{ ...mono, color: L.jade[500] }}>—</span>
                <span style={{ color: L.text.secondary }}>{t}</span>
              </div>
            ))}
          </Zone>
        </main>

        {/* ── Footer: back to the dark ─────────────────────────────────── */}
        <footer style={{ background: D.background.base, borderTop: `1px solid ${D.border.strong}` }}>
          <div
            style={{
              maxWidth: 1120,
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              ...mono,
              fontSize: 11
            }}
          >
            {[
              ['REPOSITORY', 'github.com/omeaga1/process-forge', REPO],
              ['RELEASES', 'all platforms', RELEASES_PAGE],
              ['LICENCE', 'Apache-2.0', `${REPO}/blob/main/LICENSE`],
              ['PRIVACY', 'what goes where', '/privacy.html'],
              ['CODE SIGNING', 'policy', '/code-signing.html']
            ].map(([k, v, href]) => (
              <a
                key={k}
                className="pf-dark-link"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: `18px ${GUTTER}`, borderRight: `1px solid ${D.border.subtle}`, textDecoration: 'none', color: D.text.secondary }}
              >
                <div style={{ color: D.text.muted, letterSpacing: '0.1em', fontSize: 9.5 }}>{k}</div>
                <div style={{ marginTop: 4 }}>{v}</div>
              </a>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
};
