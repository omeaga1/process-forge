import React, { useState, useEffect } from 'react';
import {
  fetchLatestRelease,
  selectAsset,
  RELEASES_PAGE,
  formatSize,
  type DesktopOs,
  type ResolvedInstaller
} from '../downloads/latestRelease.js';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { ProcessForgeEmblem, ThemeScope } from '@process-forge/canvas-ui';
import { LineDemo } from '../landing/LineDemo.js';
import { EquipmentExplorer } from '../landing/EquipmentExplorer.js';
import { DesignLoop } from '../landing/DesignLoop.js';
import { McpDemo } from '../landing/McpDemo.js';

/**
 * The public landing page, in the studio's own Osaka Jade: obsidian
 * surfaces, jade for what matters, amber only for what limits the line.
 *
 * Every section is something to use rather than read: the hero plays back a
 * shift the real engine simulates in the page (landing/demoLine.ts), the
 * equipment is the studio's catalog with its drawings, and the design loop
 * shows the engine's own verdicts.
 */

export interface ProductLandingPageProps {
  /**
   * Opens the studio in this page. Only in development: ProcessForge is a
   * desktop app, and the public site is the place to download it.
   */
  onLaunchStudio?: () => void;
}

interface PlatformInfo {
  name: string;
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  downloadUrl: string;
  fileLabel: string;
}

const GUTTER = 'clamp(16px, 4vw, 32px)';
const REPO = 'https://github.com/omeaga1/process-forge';
const NPX = 'npx -y @process-forge/mcp-server';
const MCPB = `${REPO}/releases/latest/download/process-forge.mcpb`;
const MCP_CONFIG = `{
  "mcpServers": {
    "process-forge": {
      "command": "npx",
      "args": ["-y", "@process-forge/mcp-server"]
    }
  }
}`;
const FIRST_PROMPT = 'Build a paint line: batch reactor, tank, filler and labeler at 30 cans/min, then find the bottleneck.';

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };
const sans: React.CSSProperties = { fontFamily: fontFamily.sans };

function Section({ id, n, kicker, title, note, children }: {
  id: string; n: string; kicker: string; title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(56px, 9vw, 104px) ${GUTTER} 0` }}>
      <div style={{ ...mono, fontSize: 12, letterSpacing: '0.16em', color: D.jade.glow }}>
        {n} <span style={{ color: D.text.muted }}>·</span> {kicker}
      </div>
      <h2 style={{ ...sans, margin: '10px 0 0', fontSize: 'clamp(1.6rem, 3.4vw, 2.2rem)', fontWeight: 650, letterSpacing: '-0.025em', lineHeight: 1.12, color: D.text.primary, maxWidth: '26ch' }}>
        {title}
      </h2>
      {note && <p style={{ ...sans, margin: '12px 0 0', fontSize: 16, lineHeight: 1.6, color: D.text.secondary, maxWidth: '62ch' }}>{note}</p>}
      <div style={{ marginTop: 28 }}>{children}</div>
    </section>
  );
}

function CopyCommand({ text, prompt = '$' }: { text: string; prompt?: string | null }) {
  const [copied, setCopied] = useState(false);
  const multiline = text.includes('\n');
  return (
    <div style={{ display: 'flex', alignItems: multiline ? 'flex-start' : 'stretch', border: `1px solid ${D.border.strong}`, borderRadius: 8, overflow: 'hidden', background: D.background.base }}>
      <code style={{ ...mono, flex: 1, minWidth: 0, padding: '10px 12px', fontSize: 13, color: D.jade.glow, overflowX: 'auto', whiteSpace: multiline ? 'pre' : 'nowrap' }}>
        {prompt && <span style={{ color: D.text.muted }}>{prompt} </span>}
        {text}
      </code>
      <button
        type="button"
        className="pf-copy"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          });
        }}
        style={{ ...sans, fontSize: 12, fontWeight: 600, padding: multiline ? '10px 14px' : '0 14px', alignSelf: 'stretch', border: 'none', borderLeft: `1px solid ${D.border.strong}`, background: D.background.surfaceElevated, color: copied ? D.jade.glow : D.text.primary, cursor: 'pointer' }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** One numbered step of the install guide. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, alignItems: 'start' }}>
      <span style={{ ...mono, width: 24, height: 24, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: D.jade.glow, border: `1px solid ${D.jade.glow}66` }}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: D.text.primary, lineHeight: '24px' }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: D.text.secondary, marginTop: 2 }}>{children}</div>
      </div>
    </li>
  );
}

/** A platform's warning on first launch, and the way past it. */
function FirstRunNote({ os, children }: { os: string; children: React.ReactNode }) {
  return (
    <div style={{ borderLeft: `2px solid ${D.border.glowAmber}`, padding: '2px 0 2px 12px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: D.text.primary }}>{os}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: D.text.secondary, marginTop: 2 }}>{children}</div>
    </div>
  );
}

const OS_LABELS: Record<DesktopOs, { name: string; file: string }> = {
  windows: { name: 'Windows', file: '.exe installer' },
  macos: { name: 'macOS', file: '.dmg, Apple silicon' },
  linux: { name: 'Linux', file: '.AppImage' }
};

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

  // One request to GitHub serves the hero's button and every link in the
  // install guide.
  const [installers, setInstallers] = useState<Partial<Record<DesktopOs, ResolvedInstaller>>>({});
  useEffect(() => {
    let cancelled = false;
    void fetchLatestRelease().then((release) => {
      if (cancelled || !release) return;
      const found: Partial<Record<DesktopOs, ResolvedInstaller>> = {};
      for (const os of Object.keys(OS_LABELS) as DesktopOs[]) {
        const hit = selectAsset(release, os);
        if (hit) found[os] = hit;
      }
      setInstallers(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const detected = platform.os === 'unknown' ? undefined : installers[platform.os];
  const downloadUrl = detected?.url ?? platform.downloadUrl;
  const fileLabel = detected ? `${platform.fileLabel} · ${detected.version} · ${formatSize(detected.sizeBytes)}` : platform.fileLabel;

  const navLink: React.CSSProperties = { ...sans, fontSize: 14, color: D.text.secondary, textDecoration: 'none' };
  const card: React.CSSProperties = { border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.surface, padding: '20px 22px' };

  const primary = (
    <a
      className="pf-cta-primary"
      href={downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...sans, display: 'inline-flex', alignItems: 'center', padding: '12px 22px', borderRadius: 9, background: D.jade.glow, color: D.text.inverse, fontWeight: 650, fontSize: 16, textDecoration: 'none', boxShadow: `0 0 28px ${D.jade.glow}45` }}
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
  const textLink: React.CSSProperties = { color: D.jade.glow, textDecoration: 'none' };

  return (
    // flexShrink 0: the app's frame is a fixed-height flex column, and a
    // shrinking page painted its background only one screen deep.
    <div
      className="pf-landing"
      style={{
        minHeight: '100vh',
        flexShrink: 0,
        background: D.background.base,
        backgroundImage: `radial-gradient(ellipse 60% 40% at 80% 0%, ${D.jade.glow}1c, transparent 70%), radial-gradient(ellipse 50% 30% at 0% 55%, ${D.jade[500]}14, transparent 70%)`,
        backgroundRepeat: 'no-repeat',
        color: D.text.primary,
        ...sans
      }}
    >
      <style>{`
        .pf-landing a:focus-visible, .pf-landing button:focus-visible, .pf-landing input:focus-visible { outline: 2px solid ${D.jade.glow}; outline-offset: 2px; }
        .pf-landing .pf-cta-primary { transition: transform .15s ease, filter .15s ease; }
        .pf-landing .pf-cta-primary:hover { filter: brightness(1.08); transform: translateY(-1px); }
        .pf-landing .pf-cta-secondary:hover, .pf-landing .pf-copy:hover { background: ${D.background.surfaceHover} !important; }
        .pf-landing .pf-nav-link:hover { color: ${D.jade.glow} !important; }
        .pf-landing .pf-chip:hover { border-color: ${D.jade[400]} !important; color: ${D.text.primary} !important; }
        .pf-landing .pf-ghost-btn:not(:disabled):hover { border-color: ${D.jade.glow} !important; color: ${D.jade.glow} !important; }
        @keyframes pf-pop-in { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }
        .pf-landing .pf-pop { animation: pf-pop-in .25s ease; }
        @media (max-width: 560px) { .pf-landing .pf-explorer-detail { grid-template-columns: 1fr !important; } }
        @media (prefers-reduced-motion: reduce) { .pf-landing * { animation: none !important; transition: none !important; } }
      `}</style>
      <ThemeScope mode="dark">
        {/* Nav: stays in reach while the page scrolls. */}
        <nav
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: `${D.background.base}cc`,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderBottom: `1px solid ${D.border.subtle}`
          }}
        >
          <div style={{ maxWidth: 1120, margin: '0 auto', padding: `12px ${GUTTER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: D.text.primary }}>
              <ProcessForgeEmblem size={28} />
              <span style={{ fontSize: 16, fontWeight: 650, letterSpacing: '-0.01em' }}>
                Process<span style={{ color: D.jade.glow }}>Forge</span>
              </span>
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              {[
                ['Equipment', '#equipment'],
                ['Design', '#design'],
                ['Claude & MCP', '#ai'],
                ['Install', '#install'],
                ['GitHub', REPO]
              ].map(([label, href]) => (
                <a
                  key={label}
                  className="pf-nav-link"
                  style={navLink}
                  href={href}
                  {...(href!.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </nav>

        {/* Hero, with the line running under it. */}
        <header id="top" style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(40px, 7vw, 80px) ${GUTTER} 0` }}>
          <div style={{ ...mono, fontSize: 12, letterSpacing: '0.18em', color: D.jade.glow }}>OPEN-SOURCE PROCESS SIMULATION</div>
          <h1 style={{ margin: '14px 0 0', fontSize: 'clamp(2.2rem, 5.6vw, 3.8rem)', fontWeight: 680, letterSpacing: '-0.04em', lineHeight: 1.02, maxWidth: '21ch' }}>
            Find the bottleneck <span style={{ color: D.jade[400] }}>before you build the line.</span>
          </h1>
          <p style={{ margin: '20px 0 0', fontSize: 'clamp(1rem, 2vw, 1.14rem)', lineHeight: 1.6, color: D.text.secondary, maxWidth: '58ch' }}>
            Lay out reactors, tanks, fillers and conveyors, and simulate the shift: when each machine runs, waits or backs up,
            and which one holds the line back. For equipment nobody ships a model for, your AI designs one, and the engine checks
            its physics first.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            {primary}
            {secondary}
            {devStudio}
          </div>
          <div style={{ ...mono, fontSize: 11, color: D.text.muted, marginTop: 12 }}>
            {fileLabel} · free and open source ·{' '}
            <a href="#install" className="pf-nav-link" style={{ color: D.text.secondary, textDecoration: 'none' }}>
              other platforms and install steps
            </a>
          </div>

          <div style={{ marginTop: 'clamp(36px, 6vw, 56px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: D.text.secondary }}>
                <span style={{ color: D.text.primary, fontWeight: 600 }}>Try it:</span> a paint line, simulated in this page. Move a slider
                and the shift runs again.
              </div>
              <div style={{ ...mono, fontSize: 11, letterSpacing: '0.1em', color: D.text.muted }}>THE APP’S OWN ENGINE</div>
            </div>
            <LineDemo />
          </div>
        </header>

        <Section
          id="equipment"
          n="01"
          kicker="EQUIPMENT"
          title="Standard units come with their model."
          note="Drop them on the canvas, pipe them together, and they behave the way the equipment does. Point at one to see how."
        >
          <EquipmentExplorer />
        </Section>

        <Section
          id="design"
          n="02"
          kicker="DESIGN"
          title="For equipment nobody ships, describe it."
          note="Your AI writes the unit as parameters, equations and limits. The engine evaluates every limit, and a design that breaks one goes back with the reason, until it holds."
        >
          <DesignLoop />
        </Section>

        <Section
          id="ai"
          n="03"
          kicker="CLAUDE & MCP"
          title="Run your line from Claude."
          note="The ProcessForge MCP server gives Claude, Cursor or any MCP client the studio's tools: build a flowsheet, place and pipe equipment, design units nobody ships, simulate the shift, find the bottleneck and compare scenarios. The engine does the physics; the AI drives."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={card}>
                <div style={{ fontSize: 16, fontWeight: 650 }}>From Claude Desktop, Cursor, or any MCP client</div>
                <p style={{ margin: '8px 0 14px', fontSize: 14, lineHeight: 1.6, color: D.text.secondary }}>
                  On your existing subscription. The client designs units, places standard equipment, pulls units from the community
                  library, pipes them together and simulates. With the desktop app open, it works on the flowsheet on your canvas.
                </p>
                <a
                  href="https://github.com/omeaga1/process-forge/releases/latest/download/process-forge.mcpb"
                  className="pf-btn"
                  data-variant="primary"
                  data-size="md"
                  style={{ textDecoration: 'none' }}
                >
                  Add to Claude Desktop
                </a>
                <p style={{ margin: '8px 0 14px', fontSize: 13, lineHeight: 1.55, color: D.text.muted }}>
                  One click to install, and it keeps itself up to date. For Cursor and other clients, add the server (Node.js 20 or later):
                </p>
                <CopyCommand text={NPX} />
                <p style={{ margin: '10px 0 0', fontSize: 13, color: D.text.muted }}>
                  Step by step: <a href="#install" style={textLink}>install guide</a> ·{' '}
                  <a href={`${REPO}/tree/main/packages/mcp-server#readme`} target="_blank" rel="noopener noreferrer" style={textLink}>every tool</a>
                </p>
              </div>
              <div style={card}>
                <div style={{ fontSize: 16, fontWeight: 650 }}>In the app, with OpenRouter</div>
                <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: D.text.secondary }}>
                  Sign in once and chat with Claude, GPT, Gemini and others, paying as you go, with a spending limit you set at
                  OpenRouter.
                </p>
              </div>
            </div>
            <McpDemo />
          </div>
        </Section>

        <Section
          id="install"
          n="04"
          kicker="INSTALL"
          title="Up and running in a few minutes."
          note="Install the desktop app to build and simulate lines. Add the MCP server to drive it from Claude. Both are free, and both update themselves."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
            <div style={card}>
              <div style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>DESKTOP APP</div>
              <div style={{ fontSize: 16, fontWeight: 650, marginTop: 6 }}>Windows, macOS and Linux</div>
              <ol style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 14 }}>
                <Step n={1} title="Download the installer">
                  <span style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                    {(Object.keys(OS_LABELS) as DesktopOs[]).map((os) => {
                      const hit = installers[os];
                      return (
                        <a
                          key={os}
                          className="pf-cta-secondary"
                          href={hit?.url ?? RELEASES_PAGE}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${D.border.strong}`, color: D.text.primary, textDecoration: 'none', fontSize: 13 }}
                        >
                          <span style={{ fontWeight: 600 }}>{OS_LABELS[os].name}</span>
                          <span style={{ ...mono, fontSize: 11, color: D.text.muted }}>
                            {OS_LABELS[os].file}
                            {hit ? ` · ${hit.version} · ${formatSize(hit.sizeBytes)}` : ''}
                          </span>
                        </a>
                      );
                    })}
                  </span>
                  <span style={{ display: 'block', marginTop: 6 }}>
                    Every file, including the .msi, .deb and Intel Mac builds, is on the{' '}
                    <a href={RELEASES_PAGE} target="_blank" rel="noopener noreferrer" style={textLink}>latest release</a>.
                  </span>
                </Step>
                <Step n={2} title="Run it, and get past the first-run warning">
                  The installers are not code-signed yet, so your system asks once before it opens them.
                  <span style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                    <FirstRunNote os="Windows">
                      SmartScreen shows “Windows protected your PC”. Click <b>More info</b>, then <b>Run anyway</b>. The installer
                      sets up for your user only and needs no admin rights.{' '}
                      <a href="/code-signing.html" target="_blank" rel="noopener noreferrer" style={textLink}>Our code signing policy</a>
                    </FirstRunNote>
                    <FirstRunNote os="macOS">
                      Open the .dmg and drag ProcessForge to Applications. If macOS says it cannot check the app, open{' '}
                      <b>System Settings → Privacy &amp; Security</b> and click <b>Open Anyway</b>.
                    </FirstRunNote>
                    <FirstRunNote os="Linux">
                      Make the AppImage executable (<code style={mono}>chmod +x ProcessForge_*.AppImage</code>) and run it, or install
                      the .deb.
                    </FirstRunNote>
                  </span>
                </Step>
                <Step n={3} title="Updates arrive on their own">
                  The app checks for a new release each time it starts.
                </Step>
              </ol>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={card}>
                <div style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>MCP · CLAUDE DESKTOP</div>
                <div style={{ fontSize: 16, fontWeight: 650, marginTop: 6 }}>One-click extension</div>
                <ol style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 14 }}>
                  <Step n={1} title="Download the extension">
                    <a href={MCPB} style={textLink}>process-forge.mcpb</a>, from the latest release.
                  </Step>
                  <Step n={2} title="Open it">
                    Double-click the file, or drag it onto Claude Desktop, and click <b>Install</b>. Nothing else to set up:
                    Claude Desktop runs it on its built-in Node.js, and it keeps itself up to date.
                  </Step>
                  <Step n={3} title="Ask Claude">
                    Start a new chat and try:
                    <span style={{ display: 'block', marginTop: 8 }}>
                      <CopyCommand text={FIRST_PROMPT} prompt={null} />
                    </span>
                    <span style={{ display: 'block', marginTop: 8 }}>
                      Keep the desktop app open and Claude builds the line on your canvas, where you can watch it run.
                    </span>
                  </Step>
                </ol>
              </div>
              <div style={card}>
                <div style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>MCP · CURSOR AND OTHER CLIENTS</div>
                <div style={{ fontSize: 16, fontWeight: 650, marginTop: 6 }}>Add the server to your config</div>
                <p style={{ margin: '8px 0 12px', fontSize: 13, lineHeight: 1.6, color: D.text.secondary }}>
                  Needs Node.js 20 or later. Add this to your client’s MCP configuration (for Cursor, <code style={mono}>.cursor/mcp.json</code>)
                  and restart it:
                </p>
                <CopyCommand text={MCP_CONFIG} prompt={null} />
                <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: D.text.muted }}>
                  The package is <a href="https://www.npmjs.com/package/@process-forge/mcp-server" target="_blank" rel="noopener noreferrer" style={textLink}>@process-forge/mcp-server</a> on npm.
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section id="limits" n="05" kicker="HONESTLY" title="What it does not do yet.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {[
              ['Pressure', 'No pressure network is solved: flow is limited by each unit\'s rated capacity, not worked out from pressure drops and pump curves.'],
              ['Properties', 'Water and steam use IAPWS-IF97 and gases the ideal-gas law; other liquids, and mixtures, use the density and heat capacity you give them, mixed by mass. There is no full property package.'],
              ['Items', 'Whole items split evenly down each branch.'],
              ['Subscriptions', 'Claude Pro or ChatGPT Plus cannot be used inside other apps; they work through an MCP client. In-app AI is billed per use.'],
              ['The model matters', 'Smaller models write designs the engine rejects more often.']
            ].map(([k, t]) => (
              <div key={k} style={{ border: `1px solid ${D.border.subtle}`, borderRadius: 10, padding: '12px 14px', background: `${D.background.surface}99` }}>
                <div style={{ fontSize: 13, fontWeight: 650, color: D.text.primary }}>{k}</div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: D.text.secondary, marginTop: 4 }}>{t}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Close: the call to action once more, then the links. */}
        <section style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(64px, 10vw, 112px) ${GUTTER} clamp(48px, 7vw, 72px)`, textAlign: 'center' }}>
          <ProcessForgeEmblem size={44} />
          <h2 style={{ margin: '16px auto 0', fontSize: 'clamp(1.6rem, 3.4vw, 2.2rem)', fontWeight: 650, letterSpacing: '-0.025em', maxWidth: '22ch' }}>
            Simulate your line before you pour the concrete.
          </h2>
          <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            {primary}
            {secondary}
          </div>
        </section>

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
