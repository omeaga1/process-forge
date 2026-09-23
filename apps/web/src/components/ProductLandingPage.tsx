import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchLatestInstaller,
  RELEASES_PAGE,
  formatSize,
  type DesktopOs
} from '../downloads/latestRelease.js';
import { OsakaJadeLightPalette as P, fontFamily } from '@process-forge/theme';
import { evaluateUnitOp, blockingViolations, WAX_COOLING_BELT_CONTRACT } from '@process-forge/protocol';

/**
 * The public landing page, as an engineering drawing.
 *
 * Laid out like a drafting sheet: ruled borders, a title block, zone numbers,
 * mono for figures and sans for prose, and colour only where it carries
 * meaning (green for a satisfied constraint, amber for a violated one).
 *
 * Every number in the worked example is computed at render by the engine's
 * evaluator (e.g. the duty is evaluateUnitOp(WAX_COOLING_BELT_CONTRACT)
 * .derived.totalDutyKw), so the page changes when the engine does.
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
          width: 'clamp(36px, 8vw, 64px)',
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
      <div style={{ flex: 1, padding: '20px clamp(16px, 4vw, 28px) 40px', minWidth: 0 }}>
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

export const ProductLandingPage: React.FC<ProductLandingPageProps> = ({ onLaunchStudio }) => {
  const [platform, setPlatform] = useState<PlatformInfo>({
    name: 'Windows',
    os: 'windows',
    downloadUrl: RELEASES_PAGE,
    fileLabel: 'Windows installer (.exe)'
  });
  const [beltSpeed, setBeltSpeed] = useState(6);

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
    void fetchLatestInstaller(platform.os as DesktopOs).then(
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
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 24,
            padding: '34px clamp(16px, 4vw, 28px) 20px'
          }}
        >
          <div>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '0.18em', color: P.text.muted }}>
              PROCESS SIMULATION
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
            <p style={{ margin: '14px 0 0', fontSize: '1.3rem', lineHeight: 1.35, color: P.text.primary, fontWeight: 600, maxWidth: '30ch' }}>
              Model the equipment no simulator ships.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: '1.02rem', lineHeight: 1.6, color: P.text.secondary, maxWidth: '58ch' }}>
              Describe a unit operation in plain words. Your AI model writes it, the engine checks
              the physics before it reaches your flowsheet, and then you simulate the whole line:
              throughput, bottlenecks, OEE.
            </p>
          </div>
          <table style={{ ...mono, fontSize: 10.5, borderCollapse: 'collapse', color: P.text.secondary }}>
            <tbody>
              {[
                ['SIMULATION', 'discrete-event'],
                ['RUNS', 'on your machine'],
                ['AI', 'any model · sign-in, key or MCP'],
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

        <div style={{ display: 'flex', gap: 10, padding: '0 clamp(16px, 4vw, 28px) 28px', flexWrap: 'wrap' }}>
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

        {/* ── 01 · How it works ────────────────────────────────────────── */}
        <Zone n="01" title="How it works">
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 0, border: RULE }}>
            {[
              [
                'Describe it',
                'Say what the equipment does, in your words: “a water-cooled steel belt that solidifies molten wax, 16 m by 1.2 m, fed at 0.55 kg/s.”'
              ],
              [
                'The AI designs it; the engine checks it',
                'Your AI model writes the unit as a model: its parameters, the equations that connect them, and the limits that must hold. The engine evaluates every limit, and anything that fails goes back to the model with the reason, until the design holds.'
              ],
              [
                'Run your line',
                'Connect it to pumps, tanks, fillers and conveyors, or to other units you designed, and simulate: busy, blocked and starved time for each machine, throughput, the bottleneck, and OEE.'
              ]
            ].map(([title, body], i) => (
              <li key={title} style={{ padding: '16px 18px', borderRight: HAIRLINE, borderBottom: HAIRLINE }}>
                <div style={{ ...mono, fontSize: 11, color: P.text.muted, letterSpacing: '0.1em' }}>STEP {i + 1}</div>
                <div style={{ ...sans, marginTop: 6, fontSize: '1rem', fontWeight: 600, color: P.text.primary }}>{title}</div>
                <p style={{ ...sans, margin: '6px 0 0', fontSize: '0.88rem', lineHeight: 1.6, color: P.text.secondary }}>{body}</p>
              </li>
            ))}
          </ol>
        </Zone>

        {/* ── 02 · The worked example ──────────────────────────────────── */}
        <Zone
          n="02"
          title="Try one: a unit nobody ships a model for"
          note="A water-cooled belt: molten wax is poured on, solidifies as it travels, and is scraped off at the far end. Every figure below is computed as you read it, by the same evaluator the engine runs. Move the belt speed and watch the verdict change."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
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

        {/* ── 03 · Claude ──────────────────────────────────────────────── */}
        <Zone n="03" title="Bring your own AI">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 0, border: RULE }}>
            <div style={{ padding: '16px 18px', borderRight: HAIRLINE, borderBottom: HAIRLINE }}>
              <div style={{ ...sans, fontSize: '1rem', fontWeight: 600 }}>In the app, with a sign-in, a key, or a local model</div>
              <p style={{ ...sans, margin: '6px 0 0', fontSize: '0.88rem', lineHeight: 1.6, color: P.text.secondary }}>
                Chat about your flowsheet and design unit operations without leaving ProcessForge. Sign in
                with OpenRouter to use Claude, GPT, Gemini and others on one account, paste a key from a
                provider, or run a model locally in Ollama. A key stays on your device and is sent only to
                its provider.
              </p>
            </div>
            <div style={{ padding: '16px 18px', borderRight: HAIRLINE, borderBottom: HAIRLINE }}>
              <div style={{ ...sans, fontSize: '1rem', fontWeight: 600 }}>From an MCP client, on your subscription</div>
              <p style={{ ...sans, margin: '6px 0 0', fontSize: '0.88rem', lineHeight: 1.6, color: P.text.secondary }}>
                Give an MCP client such as Claude Desktop or Cursor the ProcessForge tools, and it designs and simulates for you on the
                subscription you already pay for. Add this server to the client's MCP settings (Node.js 20 or
                later):
              </p>
              <code
                style={{
                  ...mono,
                  display: 'block',
                  marginTop: 10,
                  padding: '8px 10px',
                  fontSize: '0.8rem',
                  border: HAIRLINE,
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                  color: P.text.primary
                }}
              >
                npx -y @process-forge/mcp-server
              </code>
            </div>
          </div>
        </Zone>

        {/* ── 04 · Limits ──────────────────────────────────────────────── */}
        <Zone n="04" title="What it does not do yet">
          {[
            'No continuous dynamics: a unit operation is evaluated at steady state, and a line runs as discrete events.',
            'A split sends output evenly down each branch; there are no split ratios yet.',
            'AI inside the app is billed per use, through OpenRouter or a provider key, or runs free in Ollama. Subscriptions such as Claude Pro or ChatGPT Plus cannot be used by other apps; they work through an MCP client instead.',
            'Results depend on the model. Smaller models write designs the engine rejects more often.'
          ].map((t) => (
            <div key={t} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: HAIRLINE, fontSize: '0.88rem', lineHeight: 1.55 }}>
              <span style={{ ...mono, color: P.text.muted }}>·</span>
              <span style={{ color: P.text.secondary }}>{t}</span>
            </div>
          ))}
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
            ['LICENCE', 'Apache-2.0', 'https://github.com/omeaga1/process-forge/blob/main/LICENSE'],
            ['PRIVACY', 'what goes where', '/privacy.html'],
            ['CODE SIGNING', 'policy', '/code-signing.html']
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
