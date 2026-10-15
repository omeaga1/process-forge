import React, { useEffect, useRef, useState } from 'react';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { useInView } from './useInView.js';

/** The pieces every page of the public site is made of. */

export const GUTTER = 'clamp(16px, 4vw, 32px)';
export const REPO = 'https://github.com/omeaga1/process-forge';
export const NPX = 'npx -y @process-forge/mcp-server';
export const MCPB = `${REPO}/releases/latest/download/process-forge.mcpb`;
export const MCP_CONFIG = `{
  "mcpServers": {
    "process-forge": {
      "command": "npx",
      "args": ["-y", "@process-forge/mcp-server"]
    }
  }
}`;

/** The MCP server's tools, as an engineer would group them (packages/tools registry, and the server's own). */
export const MCP_TOOLS: [string, string[]][] = [
  ['Read the line', ['get_open_flowsheet', 'list_flowsheets', 'open_flowsheet', 'simulate_process_line', 'diagnose_bottlenecks', 'compare_scenarios', 'sweep_line', 'solve_line_target']],
  ['Build it', ['new_flowsheet', 'plan_changes', 'apply_changes', 'list_standard_unit_ops', 'add_standard_unit_op', 'add_stream', 'route_stream', 'arrange_unit', 'update_unit', 'remove_unit', 'remove_stream', 'save_flowsheet']],
  ['Design units', ['design_unit_op', 'validate_unit_op', 'explore_unit_op', 'hold_unit_result', 'calculate_stream', 'lookup_component', 'forge_equipment_drawing', 'add_unit_op_to_flowsheet', 'query_unit_subagent']],
  ['The library', ['search_community_unit_ops', 'add_community_unit_op', 'package_unit_op', 'publish_unit_op', 'list_digital_twin_templates']]
];
export const MCP_TOOL_COUNT = MCP_TOOLS.reduce((n, [, t]) => n + t.length, 0);

export const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };
export const sans: React.CSSProperties = { fontFamily: fontFamily.sans };
export const card: React.CSSProperties = { border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.surface, padding: '20px 22px' };
export const textLink: React.CSSProperties = { color: D.jade.glow, textDecoration: 'underline', textDecorationColor: `${D.jade.glow}66`, textUnderlineOffset: 3 };
export const kicker: React.CSSProperties = { ...mono, fontSize: 12, letterSpacing: '0.16em', color: D.jade.glow };

/** A page's opening: its kicker, title and one line of what it is for. */
export function PageHeader({ kicker: k, title, children }: { kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(40px, 7vw, 72px) ${GUTTER} 0` }}>
      <div style={kicker}>{k}</div>
      <h1 style={{ ...sans, margin: '12px 0 0', fontSize: 'clamp(1.9rem, 4.6vw, 3rem)', fontWeight: 680, letterSpacing: '-0.035em', lineHeight: 1.06, maxWidth: '22ch', color: D.text.primary }}>{title}</h1>
      {children && <p style={{ ...sans, margin: '16px 0 0', fontSize: 'clamp(1rem, 2vw, 1.12rem)', lineHeight: 1.6, color: D.text.secondary, maxWidth: '62ch' }}>{children}</p>}
    </header>
  );
}

export function Section({ id, n, kicker: k, title, note, children }: { id: string; n?: string; kicker: string; title: string; note?: string; children: React.ReactNode }) {
  // Rises into place the first time it scrolls into view (and is simply there with reduced motion or no observer).
  const [ref, inView] = useInView<HTMLElement>(0.08);
  return (
    <section ref={ref} id={id} className="pf-reveal" {...(inView ? { 'data-in': '' } : {})} style={{ maxWidth: 1120, margin: '0 auto', padding: `clamp(48px, 8vw, 88px) ${GUTTER} 0` }}>
      <div style={kicker}>
        {n && (
          <>
            {n} <span style={{ color: D.text.muted }}>·</span>{' '}
          </>
        )}
        {k}
      </div>
      <h2 style={{ ...sans, margin: '10px 0 0', fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', fontWeight: 650, letterSpacing: '-0.025em', lineHeight: 1.12, color: D.text.primary, maxWidth: '28ch' }}>{title}</h2>
      {note && <p style={{ ...sans, margin: '12px 0 0', fontSize: 16, lineHeight: 1.6, color: D.text.secondary, maxWidth: '62ch' }}>{note}</p>}
      <div style={{ marginTop: 26 }}>{children}</div>
    </section>
  );
}

export function CopyCommand({ text, prompt = '$' }: { text: string; prompt?: string | null }) {
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

/** One numbered step of a guide. */
export function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
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

/** Clips of the studio, recorded from the current build by scripts/record-landing.mjs. */
export const CLIPS: { src: string; title: string; text: string }[] = [
  { src: '/landing/studio-run', title: 'Run the line', text: 'The desktop app opens the example, runs it at 5×, and shows every stream: flow, temperature and composition, as on a PFD.' },
  { src: '/landing/studio-unit', title: 'Open the unit', text: 'What comes in and goes out, then the panel its contract lays out. Cut the chiller to 80 kW and the engine fails that check, with the reason.' }
];

/** A recorded clip, framed like a desktop window. Plays muted and looped while on screen. */
export function Clip({ src, title, priority = false }: { src: string; title: string; priority?: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.25);
  const video = useRef<HTMLVideoElement>(null);
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
