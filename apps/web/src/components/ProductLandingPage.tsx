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
import { EquipmentExplorer } from '../landing/EquipmentExplorer.js';
import { WorkedExample } from '../landing/WorkedExample.js';
import { ExampleGallery } from '../landing/ExampleGallery.js';
import { McpDemo } from '../landing/McpDemo.js';
import { ControlDemo } from '../landing/ControlDemo.js';
import { useInView } from '../landing/useInView.js';
import { COLD_BREW_PROMPT } from '../landing/coldBrew.js';
import { STANDARD_EQUIPMENT_CATALOG } from '@process-forge/protocol';

/**
 * The public landing page, in the studio's own Osaka Jade, built around one
 * worked example taken end to end: a cold-brew freeze concentrator Claude
 * designed through the MCP server (landing/coldBrew.ts).
 *
 * Nothing on it is a mock-up. The walkthrough, the panel and the gallery are
 * worked out by the real engine in the page, and the clips are recordings of
 * the current studio running the same example (scripts/record-landing.mjs).
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
/** The MCP server's tools, as an engineer would group them (packages/tools registry, and the server's own). */
const MCP_TOOLS: [string, string[]][] = [
  ['Read the line', ['get_open_flowsheet', 'list_flowsheets', 'open_flowsheet', 'simulate_process_line', 'diagnose_bottlenecks', 'compare_scenarios']],
  ['Build it', ['new_flowsheet', 'list_standard_unit_ops', 'add_standard_unit_op', 'add_stream', 'route_stream', 'arrange_unit', 'update_unit', 'remove_unit', 'remove_stream', 'save_flowsheet']],
  ['Design units', ['design_unit_op', 'validate_unit_op', 'explore_unit_op', 'hold_unit_result', 'calculate_stream', 'forge_equipment_drawing', 'add_unit_op_to_flowsheet', 'query_unit_subagent']],
  ['Share them', ['search_community_unit_ops', 'add_community_unit_op', 'package_unit_op', 'publish_unit_op', 'list_digital_twin_templates']]
];
const MCP_TOOL_COUNT = MCP_TOOLS.reduce((n, [, t]) => n + t.length, 0);

const FIRST_PROMPT = COLD_BREW_PROMPT;

/** Clips of the studio, recorded from the current build by scripts/record-landing.mjs. */
const CLIPS: { src: string; title: string; text: string }[] = [
  { src: '/landing/studio-run', title: 'Run the line', text: 'The desktop app opens the example, runs it at 5×, and shows every stream: flow, temperature and composition, as on a PFD.' },
  { src: '/landing/studio-unit', title: 'Open the unit', text: 'What comes in and goes out, then the panel its contract lays out. Cut the chiller to 80 kW and the engine fails that check, with the reason.' }
];

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };
const sans: React.CSSProperties = { fontFamily: fontFamily.sans };

function Section({ id, n, kicker, title, note, children }: {
  id: string; n: string; kicker: string; title: string; note?: string; children: React.ReactNode;
}) {
  // Rises into place the first time it scrolls into view (and is simply there with reduced motion or no observer).
  const [ref, inView] = useInView<HTMLElement>(0.08);
  return (
    <section ref={ref} id={id} className="pf-reveal" {...(inView ? { 'data-in': '' } : {})} style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(56px, 9vw, 104px) ${GUTTER} 0` }}>
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

/** A recorded clip, framed like a desktop window. Plays muted and looped while on screen. */
function Clip({ src, title, priority = false }: { src: string; title: string; priority?: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.25);
  const video = React.useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (inView && !reduced) void v.play().catch(() => undefined);
    else v.pause();
  }, [inView]);
  return (
    <div ref={ref} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${D.border.strong}`, background: D.background.base, boxShadow: `0 24px 60px -24px #000c, 0 0 0 1px ${D.jade.glow}10` }}>
      <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${D.border.default}`, background: D.background.surface }}>
        {[D.status.failed, D.status.blocked, D.jade[500]].map((c) => (
          <span key={c} style={{ width: 9, height: 9, borderRadius: 5, background: `${c}aa` }} />
        ))}
        <span style={{ ...mono, fontSize: 11, color: D.text.muted, marginLeft: 8 }}>ProcessForge · {title}</span>
      </div>
      <video
        ref={video}
        muted
        loop
        playsInline
        controls
        preload={priority ? 'auto' : 'metadata'}
        poster={`${src}.jpg`}
        aria-label={`Recording of the ProcessForge desktop app: ${title}`}
        style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '16 / 10', background: D.background.canvas }}
      >
        <source src={`${src}.webm`} type="video/webm" />
      </video>
    </div>
  );
}

function CopyCommand({ text, prompt = '$' }: { text: string; prompt?: string | null }) {
  const [copied, setCopied] = useState(false);
  const multiline = text.includes('\n');
  return (
    <div style={{ display: 'flex', alignItems: multiline ? 'flex-start' : 'stretch', border: `1px solid ${D.border.strong}`, borderRadius: 8, overflow: 'hidden', background: D.background.base }}>
      <code tabIndex={0} aria-label={multiline ? 'Configuration' : 'Command'} style={{ ...mono, flex: 1, minWidth: 0, padding: '10px 12px', fontSize: 13, color: D.jade.glow, overflowX: 'auto', whiteSpace: multiline ? 'pre' : 'nowrap' }}>
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
  const [releaseTag, setReleaseTag] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchLatestRelease().then((release) => {
      if (cancelled || !release) return;
      setReleaseTag(release.tag_name);
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
  const textLink: React.CSSProperties = { color: D.jade.glow, textDecoration: 'underline', textDecorationColor: `${D.jade.glow}66`, textUnderlineOffset: 3 };

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
        @keyframes pf-glow-pulse { 0%, 100% { box-shadow: 0 0 0 0 ${D.jade.glow}55; } 50% { box-shadow: 0 0 0 5px ${D.jade.glow}00; } }
        .pf-landing .pf-dot { width: 7px; height: 7px; border-radius: 4px; background: ${D.jade.glow}; animation: pf-glow-pulse 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .pf-landing * { animation: none !important; transition: none !important; } .pf-landing .pf-reveal, .pf-landing .pf-type { opacity: 1; transform: none; } }
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
                ['Worked example', '#example'],
                ['In the app', '#app'],
                ['Examples', '#examples'],
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
          <a
            className="pf-pill"
            href={RELEASES_PAGE}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 10px', borderRadius: 999, border: `1px solid ${D.border.strong}`, background: `${D.background.surface}cc`, color: D.text.secondary, fontSize: 13, textDecoration: 'none', marginBottom: 22, maxWidth: '100%', flexWrap: 'wrap' }}
          >
            <span className="pf-dot" aria-hidden />
            <span style={{ color: D.text.primary, fontWeight: 600 }}>{releaseTag ? `${releaseTag} is out` : 'Latest release'}</span>
            <span>Unit panels inside Claude, and operating conditions it asks you for</span>
            <span aria-hidden style={{ color: D.jade.glow }}>→</span>
          </a>
          <div style={{ ...mono, fontSize: 12, letterSpacing: '0.18em', color: D.jade.glow }}>OPEN-SOURCE PROCESS SIMULATION</div>
          <h1 style={{ margin: '14px 0 0', fontSize: 'clamp(2.2rem, 5.6vw, 3.8rem)', fontWeight: 680, letterSpacing: '-0.04em', lineHeight: 1.02, maxWidth: '20ch' }}>
            Describe the equipment. <span style={{ color: D.jade[400] }}>The engine checks the physics.</span>
          </h1>
          <p style={{ margin: '20px 0 0', fontSize: 'clamp(1rem, 2vw, 1.14rem)', lineHeight: 1.6, color: D.text.secondary, maxWidth: '60ch' }}>
            Ask Claude for a unit no simulator ships, from a freeze concentrator to a pastillation belt. It asks for your operating conditions,
            writes the unit as parameters, equations and limits, and ProcessForge checks every one before it goes on your flowsheet. Then
            simulate the line, set every unit from a spec sheet, and see which check runs closest to its limit.
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
            <Clip src={CLIPS[0]!.src} title="Cold-brew freeze concentration" priority />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 13, color: D.text.muted }}>
              <span>The desktop app running the worked example below: a unit Claude designed, simulated on the canvas.</span>
              <span style={{ ...mono, fontSize: 11, letterSpacing: '0.1em' }}>RECORDED FROM THE CURRENT BUILD</span>
            </div>
          </div>

          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1, margin: 'clamp(28px, 5vw, 44px) 0 0', border: `1px solid ${D.border.subtle}`, borderRadius: 12, overflow: 'hidden', background: D.border.subtle }}>
            {[
              ['0', 'numbers guessed: the engine computes every one'],
              [String(MCP_TOOL_COUNT), 'MCP tools for Claude and other clients'],
              [String(STANDARD_EQUIPMENT_CATALOG.length), 'standard units, each with its model'],
              ['Apache-2.0', 'free and open source, app and server']
            ].map(([k, v]) => (
              <div key={v} style={{ background: D.background.base, padding: '16px 18px' }}>
                <dt style={{ ...mono, fontSize: 22, fontWeight: 600, color: D.text.primary }}>{k}</dt>
                <dd style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.45, color: D.text.secondary }}>{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <Section
          id="example"
          n="01"
          kicker="WORKED EXAMPLE"
          title="Cold brew, freeze-concentrated: from one sentence to a simulated line."
          note="No simulator ships a model of this unit. Here is the whole loop as it ran, with every list, verdict and number worked out by the engine in this page."
        >
          <WorkedExample />
        </Section>

        <Section
          id="control"
          n="02"
          kicker="YOUR NUMBERS"
          title="Then set the conditions yourself."
          note="Operating conditions are inputs, not guesses. Change one and the engine re-checks the design and runs an hour of the line again. Try 6 gal/min of feed."
        >
          <ControlDemo />
        </Section>

        <Section id="app" n="03" kicker="IN THE APP" title="The same example, in the desktop app." note="Recorded from the current build, working the line above.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 20 }}>
            {CLIPS.map((c) => (
              <figure key={c.src} style={{ margin: 0 }}>
                <Clip src={c.src} title={c.title} />
                <figcaption style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 650 }}>{c.title}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: D.text.secondary, marginTop: 4 }}>{c.text}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section
          id="examples"
          n="04"
          kicker="MORE WORKED EXAMPLES"
          title="Every kind of unit the contracts can express."
          note="These ship with the engine, and AI clients pattern-match against them when they design: phase changes, separations, reactions, batches, items. Pick one and the engine validates it here."
        >
          <ExampleGallery />
        </Section>

        <Section
          id="equipment"
          n="05"
          kicker="STANDARD EQUIPMENT"
          title="And a standard library, each unit with its model."
          note="Pumps, tanks, exchangers, reactors, columns, dryers and packaging, ready to drop on the canvas and pipe to what your AI designs. Point at one to see how the engine models it."
        >
          <EquipmentExplorer />
        </Section>

        <Section
          id="ai"
          n="06"
          kicker="CLAUDE & MCP"
          title="Run your line from Claude."
          note="The ProcessForge MCP server gives Claude, Cursor or any MCP client the studio's tools: design units nobody ships, place and pipe them, simulate the line and compare scenarios. In clients with MCP Apps, a unit's panel opens in the chat, with its operating conditions as inputs. The engine does the physics; the AI drives."
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
          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ fontSize: 16, fontWeight: 650 }}>{MCP_TOOL_COUNT} tools, one engine</div>
              <div style={{ fontSize: 13, color: D.text.muted }}>Every number a tool returns is computed, never estimated by the model.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, marginTop: 14 }}>
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
          </div>
        </Section>

        <Section
          id="install"
          n="07"
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
                      Keep the desktop app open and Claude puts the unit on your canvas, where you can run it.
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

        <Section id="limits" n="08" kicker="HONESTLY" title="What it does not do yet.">
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
            Simulate the unit nobody sells a model of.
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
