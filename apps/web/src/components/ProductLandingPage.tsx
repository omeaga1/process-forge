import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchLatestInstaller,
  RELEASES_PAGE,
  formatSize,
  type DesktopOs
} from '../downloads/latestRelease.js';
import { OsakaJadeLightPalette as P, fontFamily } from '@process-forge/theme';
import {
  evaluateUnitOp,
  blockingViolations,
  synthesizeEquipmentDrawing,
  WAX_COOLING_BELT_CONTRACT
} from '@process-forge/protocol';

/**
 * The public landing page, as an engineering drawing.
 *
 * DESIGN NOTE
 *
 * The previous page argued. Gradient headline, three-card feature grid,
 * checkmark pill row, "Engineered for Diverse Process Domains" -- the shape of
 * a generic SaaS page, which is a poor fit for an audience that reads P&IDs
 * fluently and distrusts a sales tone. It also asserted capabilities that did
 * not exist, which is the same failure this project has been auditing out of
 * the codebase all along.
 *
 * This page demonstrates instead, in an idiom its reader already knows: a
 * drafting sheet. Ruled borders, a title block, zone numbers, mono for every
 * figure and sans for prose, and colour used only where it carries meaning --
 * green for a satisfied constraint, amber for a violated one. No gradients, no
 * decorative motion.
 *
 * THE IMPORTANT PART
 *
 * Every number in the worked example is COMPUTED, at render, by the same
 * evaluator the engine uses. The 172.095 kW duty is not typed into copy; it is
 * `evaluateUnitOp(WAX_COOLING_BELT_CONTRACT).derived.totalDutyKw`. The
 * equipment drawings come from the real ISA-5.1 template library. If the engine
 * changes, this page changes with it, and it cannot drift into claiming
 * something the software no longer does.
 */

export interface ProductLandingPageProps {
  onLaunchStudio: () => void;
  onOpenPortal: () => void;
  onSelectTemplate: (templateKey: string) => void;
}

interface PlatformInfo {
  name: string;
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  downloadUrl: string;
  fileLabel: string;
}

const RULE = `1px solid ${P.border.default}`;
const HAIRLINE = `1px solid ${P.border.subtle}`;

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };
const sans: React.CSSProperties = { fontFamily: fontFamily.sans };

/** A drawing zone: a numbered, ruled band down the sheet. */
function Zone({
  n,
  title,
  note,
  children
}: {
  n: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ borderTop: RULE, display: 'flex', alignItems: 'stretch' }}>
      <div
        style={{
          ...mono,
          width: 64,
          flexShrink: 0,
          borderRight: RULE,
          padding: '20px 0 0',
          textAlign: 'center',
          fontSize: 12,
          color: P.text.muted,
          letterSpacing: '0.1em'
        }}
      >
        {n}
      </div>
      <div style={{ flex: 1, padding: '20px 28px 40px', minWidth: 0 }}>
        <h2
          style={{
            ...sans,
            margin: 0,
            fontSize: '1.35rem',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: P.text.primary
          }}
        >
          {title}
        </h2>
        {note && (
          <p style={{ ...sans, margin: '6px 0 0', fontSize: '0.9rem', color: P.text.secondary, maxWidth: '62ch', lineHeight: 1.6 }}>
            {note}
          </p>
        )}
        <div style={{ marginTop: 22 }}>{children}</div>
      </div>
    </section>
  );
}

/** An equipment symbol drawn from the real ISA-5.1 template library. */
function Symbol({ prompt, caption }: { prompt: string; caption: string }) {
  const drawing = useMemo(() => {
    try {
      return synthesizeEquipmentDrawing(prompt);
    } catch {
      return null;
    }
  }, [prompt]);
  if (!drawing) return null;
  return (
    <figure style={{ margin: 0, textAlign: 'center', minWidth: 96 }}>
      <svg
        viewBox={drawing.viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 92 }}
        aria-label={drawing.label}
      >
        <g
          fill="none"
          stroke={P.text.primary}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: drawing.svgShell }}
        />
        {drawing.svgDetails && (
          <g
            fill="none"
            stroke={P.text.muted}
            strokeWidth={1}
            dangerouslySetInnerHTML={{ __html: drawing.svgDetails }}
          />
        )}
      </svg>
      <figcaption style={{ ...mono, fontSize: 10, color: P.text.muted, letterSpacing: '0.06em', marginTop: 4 }}>
        {caption}
      </figcaption>
    </figure>
  );
}

/** Label / value / unit, ruled like a schedule row. */
function Row({
  label,
  value,
  unit,
  emphasis
}: {
  label: string;
  value: string;
  unit?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 72px',
        gap: 12,
        padding: '6px 0',
        borderBottom: HAIRLINE,
        fontSize: emphasis ? '0.92rem' : '0.84rem'
      }}
    >
      <span style={{ ...sans, color: emphasis ? P.text.primary : P.text.secondary, fontWeight: emphasis ? 600 : 400 }}>
        {label}
      </span>
      <span style={{ ...mono, color: P.text.primary, fontWeight: emphasis ? 700 : 500 }}>{value}</span>
      <span style={{ ...mono, color: P.text.muted, fontSize: '0.78rem' }}>{unit ?? ''}</span>
    </div>
  );
}

export const ProductLandingPage: React.FC<ProductLandingPageProps> = ({
  onLaunchStudio,
  onOpenPortal: _onOpenPortal,
  onSelectTemplate: _onSelectTemplate
}) => {
  const [platform, setPlatform] = useState<PlatformInfo>({
    name: 'Windows',
    os: 'windows',
    downloadUrl: RELEASES_PAGE,
    fileLabel: 'Windows installer (.exe)'
  });
  const [copied, setCopied] = useState(false);
  const [beltSpeed, setBeltSpeed] = useState(6);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const plat = window.navigator.platform?.toLowerCase() || '';
    if (plat.includes('mac') || ua.includes('mac os x')) {
      setPlatform({ name: 'macOS', os: 'macos', downloadUrl: RELEASES_PAGE, fileLabel: 'macOS disk image (.dmg)' });
    } else if (plat.includes('linux') || ua.includes('linux')) {
      setPlatform({ name: 'Linux', os: 'linux', downloadUrl: RELEASES_PAGE, fileLabel: 'Linux AppImage' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchLatestInstaller(platform.os === 'unknown' ? 'windows' : (platform.os as DesktopOs)).then(
      (found) => {
        if (cancelled || !found) return;
        setPlatform((prev) => ({
          ...prev,
          downloadUrl: found.url,
          fileLabel: `${prev.fileLabel} · ${found.version} · ${formatSize(found.sizeBytes)}`
        }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [platform.os]);

  // The worked example, evaluated live by the engine's own evaluator.
  const evaluation = useMemo(
    () => evaluateUnitOp(WAX_COOLING_BELT_CONTRACT, { parameterOverrides: { beltSpeedMPerMin: beltSpeed } }),
    [beltSpeed]
  );
  const blocking = blockingViolations(evaluation);
  const valid = blocking.length === 0;
  const d = evaluation.derived;
  const fx = (v: number | undefined, dp = 2) => (v === undefined ? '—' : v.toFixed(dp));

  const mcpSnippet = `{
  "mcpServers": {
    "process-forge": {
      "command": "npx",
      "args": ["-y", "@process-forge/mcp-server"]
    }
  }
}`;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: P.background.base,
        color: P.text.primary,
        ...sans
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          background: P.background.surface,
          borderLeft: RULE,
          borderRight: RULE,
          minHeight: '100vh'
        }}
      >
        {/* ── Title block ─────────────────────────────────────────────── */}
        <header
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'end',
            gap: 24,
            padding: '34px 28px 20px'
          }}
        >
          <div>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '0.18em', color: P.text.muted }}>
              PROCESS SIMULATION · DESKTOP
            </div>
            <h1
              style={{
                margin: '10px 0 0',
                fontSize: 'clamp(2rem, 5vw, 3.1rem)',
                fontWeight: 650,
                letterSpacing: '-0.03em',
                lineHeight: 1.04
              }}
            >
              ProcessForge
            </h1>
            <p style={{ margin: '14px 0 0', fontSize: '1.02rem', lineHeight: 1.6, color: P.text.secondary, maxWidth: '54ch' }}>
              Describe a unit operation that has no model. A sub-agent writes it as a declarative
              contract; the engine evaluates the physics and refuses designs that cannot hold.
            </p>
          </div>
          <table style={{ ...mono, fontSize: 10.5, borderCollapse: 'collapse', color: P.text.secondary }}>
            <tbody>
              {[
                ['SOLVER', 'discrete-event'],
                ['EXECUTION', 'local / offline'],
                ['INTERFACE', 'MCP · stdio'],
                ['LICENCE', 'Apache-2.0']
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ border: HAIRLINE, padding: '4px 10px', color: P.text.muted, letterSpacing: '0.08em' }}>{k}</td>
                  <td style={{ border: HAIRLINE, padding: '4px 10px', color: P.text.primary }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </header>

        <div style={{ display: 'flex', gap: 10, padding: '0 28px 28px', flexWrap: 'wrap' }}>
          <a
            href={platform.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...sans,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 20px',
              background: P.text.primary,
              color: P.background.surface,
              border: `1px solid ${P.text.primary}`,
              fontWeight: 600,
              fontSize: '0.92rem',
              textDecoration: 'none'
            }}
          >
            Download for {platform.name}
          </a>
          <button
            onClick={onLaunchStudio}
            style={{
              ...sans,
              padding: '11px 20px',
              background: 'transparent',
              color: P.text.primary,
              border: RULE,
              fontWeight: 600,
              fontSize: '0.92rem',
              cursor: 'pointer'
            }}
          >
            Open the studio in this browser
          </button>
          <span style={{ ...mono, fontSize: 10.5, color: P.text.muted, alignSelf: 'center' }}>
            {platform.fileLabel}
          </span>
        </div>

        {/* ── 01 · The worked example ──────────────────────────────────── */}
        <Zone
          n="01"
          title="A unit operation nobody shipped a model for"
          note="A water-cooled belt: molten wax is poured on, solidifies as it travels, and is scraped off at the far end. No simulator ships this. Every figure below is computed as you read it, by the same evaluator the engine runs — move the belt speed and watch the verdict change."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 28 }}>
            <div>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', color: P.text.muted, marginBottom: 8 }}>
                INPUT
              </div>
              <Row label="Wax feed rate" value="0.55" unit="kg/s" />
              <Row label="Inlet temperature" value="95" unit="°C" />
              <Row label="Congealing point" value="58" unit="°C" />
              <Row label="Discharge temperature" value="40" unit="°C" />
              <Row label="Heat of fusion" value="190" unit="kJ/kg" />
              <Row label="Belt" value="16 × 1.2" unit="m" />

              <label style={{ display: 'block', marginTop: 20 }}>
                <span style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', color: P.text.muted }}>
                  BELT SPEED — {beltSpeed.toFixed(1)} m/min
                </span>
                <input
                  type="range"
                  min={1}
                  max={40}
                  step={0.5}
                  value={beltSpeed}
                  onChange={(e) => setBeltSpeed(Number(e.target.value))}
                  style={{ width: '100%', marginTop: 8, accentColor: P.text.accent }}
                />
              </label>
            </div>

            <div>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', color: P.text.muted, marginBottom: 8 }}>
                COMPUTED BY THE ENGINE
              </div>
              <Row label="Sensible, liquid" value={fx(d.sensibleLiquidKw, 2)} unit="kW" />
              <Row label="Latent, solidification" value={fx(d.latentKw, 2)} unit="kW" />
              <Row label="Sensible, solid" value={fx(d.sensibleSolidKw, 2)} unit="kW" />
              <Row label="Total cooling duty" value={fx(d.totalDutyKw, 3)} unit="kW" emphasis />
              <Row label="Residence time" value={fx(d.residenceTimeS, 1)} unit="s" />
              <Row label="Deposited layer" value={fx(d.waxLayerThicknessMm, 2)} unit="mm" />
              <Row label="Conduction time" value={fx(d.conductionTimeS, 1)} unit="s" />

              <div
                style={{
                  marginTop: 18,
                  border: `1px solid ${valid ? P.text.accent : P.border.glowAmber}`,
                  padding: '12px 14px'
                }}
              >
                <div
                  style={{
                    ...mono,
                    fontSize: 11,
                    letterSpacing: '0.1em',
                    color: valid ? P.text.accent : P.border.glowAmber,
                    fontWeight: 700
                  }}
                >
                  {valid ? 'PHYSICALLY VALID' : 'REJECTED'}
                </div>
                <p style={{ ...sans, margin: '6px 0 0', fontSize: '0.84rem', lineHeight: 1.55, color: P.text.secondary }}>
                  {valid
                    ? 'Every constraint the contract declares holds at this operating point.'
                    : blocking[0]?.message}
                </p>
                {!valid && blocking[0]?.hint && (
                  <p style={{ ...mono, margin: '8px 0 0', fontSize: '0.76rem', color: P.text.muted }}>
                    → {blocking[0].hint}
                  </p>
                )}
              </div>

              <p style={{ ...sans, margin: '14px 0 0', fontSize: '0.82rem', lineHeight: 1.6, color: P.text.muted }}>
                Slowing the belt lays a thicker layer, and conduction time grows as the square of
                thickness while residence time grows only linearly. Below about 4 m/min the wax
                cannot conduct its heat out however cold the belt is — a failure the duty
                calculation alone never sees.
              </p>
            </div>
          </div>
        </Zone>

        {/* ── 02 · Equipment library ───────────────────────────────────── */}
        <Zone
          n="02"
          title="ISA-5.1 symbols, drawn from the template library"
          note="Equipment is drawn from a fixed template library matched by keyword, with a few parameters interpolated from the description. These are rendered live by the same function the studio calls."
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
              gap: 18,
              borderTop: HAIRLINE,
              borderBottom: HAIRLINE,
              padding: '18px 0'
            }}
          >
            <Symbol prompt="distillation column with sieve trays" caption="COLUMN" />
            <Symbol prompt="jacketed CSTR with Rushton turbine" caption="REACTOR" />
            <Symbol prompt="shell and tube heat exchanger" caption="EXCHANGER" />
            <Symbol prompt="centrifugal pump" caption="PUMP" />
            <Symbol prompt="cyclone separator" caption="CYCLONE" />
            <Symbol prompt="spherical LPG pressure storage" caption="SPHERE" />
            <Symbol prompt="horizontal bullet tank on saddles" caption="DRUM" />
          </div>
        </Zone>

        {/* ── 03 · Scope, stated honestly ──────────────────────────────── */}
        <Zone
          n="03"
          title="What it does, and what it does not"
          note="Stated plainly, because the alternative is discovering it after you have modelled your line."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 28 }}>
            <div>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', color: P.text.accent, marginBottom: 10 }}>
                BUILT
              </div>
              {[
                'Discrete-event simulation with per-machine busy, blocked, starved and down time',
                'OEE from accumulated state-time, not from a nameplate figure',
                'Reproducible runs — the same graph and seed produce the same numbers',
                'Custom unit operations, with constraints the engine evaluates before it will run them',
                'Six MCP tools over stdio, driven by your own AI subscription',
                'Runs on your machine; a flowsheet leaves it only when you sign in with Google and choose Save to Cloud'
              ].map((t) => (
                <div key={t} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: HAIRLINE, fontSize: '0.86rem', lineHeight: 1.5 }}>
                  <span style={{ ...mono, color: P.text.accent }}>✓</span>
                  <span style={{ color: P.text.secondary }}>{t}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', color: P.text.muted, marginBottom: 10 }}>
                NOT YET
              </div>
              {[
                'No continuous ODE integration — unit-op contracts evaluate steady-state relations',
                'A split output is dealt round-robin; there are no routing rules or split ratios yet',
                'The simulation engine is TypeScript; the Rust is the desktop shell',
                'In-app authoring uses your own API key; a Claude subscription works through MCP, from Claude Desktop'
              ].map((t) => (
                <div key={t} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: HAIRLINE, fontSize: '0.86rem', lineHeight: 1.5 }}>
                  <span style={{ ...mono, color: P.text.muted }}>·</span>
                  <span style={{ color: P.text.muted }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </Zone>

        {/* ── 04 · MCP ─────────────────────────────────────────────────── */}
        <Zone
          n="04"
          title="Drive it from the assistant you already pay for"
          note="ProcessForge exposes its tools over MCP. Your client is the model — there is no second subscription and no key to hand over."
        >
          <div style={{ border: RULE, background: P.background.base }}>
            <div
              style={{
                ...mono,
                fontSize: 10,
                letterSpacing: '0.1em',
                color: P.text.muted,
                padding: '8px 14px',
                borderBottom: HAIRLINE,
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <span>claude_desktop_config.json</span>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(mcpSnippet);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
                style={{ ...mono, background: 'none', border: 'none', color: P.text.accent, cursor: 'pointer', fontSize: 10, letterSpacing: '0.1em' }}
              >
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <pre style={{ ...mono, margin: 0, padding: '14px', fontSize: '0.8rem', lineHeight: 1.6, color: P.text.primary, overflowX: 'auto' }}>
              {mcpSnippet}
            </pre>
          </div>
        </Zone>

        {/* ── Footer title block ───────────────────────────────────────── */}
        <footer
          style={{
            borderTop: RULE,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            ...mono,
            fontSize: 10.5
          }}
        >
          {[
            ['REPOSITORY', 'github.com/omeaga1/process-forge', 'https://github.com/omeaga1/process-forge'],
            ['RELEASES', 'all platforms', RELEASES_PAGE],
            ['LICENCE', 'Apache-2.0', 'https://github.com/omeaga1/process-forge/blob/main/LICENSE']
          ].map(([k, v, href]) => (
            <a
              key={k}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '16px 20px', borderRight: HAIRLINE, textDecoration: 'none', color: P.text.secondary }}
            >
              <div style={{ color: P.text.muted, letterSpacing: '0.1em', fontSize: 9.5 }}>{k}</div>
              <div style={{ marginTop: 4, color: P.text.primary }}>{v}</div>
            </a>
          ))}
        </footer>
      </div>
    </div>
  );
};
