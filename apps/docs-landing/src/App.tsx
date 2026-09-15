import React, { useState, useEffect } from 'react';
import { OsakaJadePalette } from '@process-forge/theme';
import {
  ReactorAnim,
  TankAnim,
  PumpAnim,
  injectEquipmentCSS
} from '@process-forge/canvas-ui';
import {
  Download,
  Terminal,
  ShieldCheck,
  Play,
  ExternalLink,
  Bot,
  Copy,
  Check,
  X,
  Boxes,
  Cpu,
  ChevronRight,
  ArrowRight
} from 'lucide-react';

// ── Tutorial Step Animations CSS ──────────────────────────────────────────────
const TUTORIAL_CSS = `
  @keyframes pf-fade-up {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pf-stream-flow {
    0% { stroke-dashoffset: 36; }
    100% { stroke-dashoffset: 0; }
  }
`;

function injectTutorialCSS(): void {
  if (typeof document === 'undefined') return;
  injectEquipmentCSS();
  if (!document.getElementById('pf-tutorial-css')) {
    const s = document.createElement('style');
    s.id = 'pf-tutorial-css';
    s.textContent = TUTORIAL_CSS;
    document.head.appendChild(s);
  }
}

// ── Tutorial Steps ────────────────────────────────────────────────────────────
interface TutorialStep {
  step: number;
  title: string;
  description: string;
  equipment: ('reactor' | 'pump' | 'tank')[];
  showStreams: number;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    step: 1,
    title: 'Place a Reactor',
    description: 'Ask the AI software engine to synthesize a jacketed CSTR with Rushton turbine. It generates the unit-op definition, vector CAD geometry, and ASME nozzle schedule.',
    equipment: ['reactor'],
    showStreams: 0
  },
  {
    step: 2,
    title: 'Add a Transfer Pump',
    description: 'Place a centrifugal pump downstream. The software engine synthesizes suction and discharge ports with ASME 150# flanges, ready for stream connection.',
    equipment: ['reactor', 'pump'],
    showStreams: 1
  },
  {
    step: 3,
    title: 'Connect to a Surge Tank',
    description: 'Complete the circuit with a buffer vessel. Connect the piping streams, set your parameters, and run the deterministic ODE + discrete-event simulation.',
    equipment: ['reactor', 'pump', 'tank'],
    showStreams: 2
  }
];

// ── Platform Detection ────────────────────────────────────────────────────────
interface PlatformInfo {
  name: string;
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  extension: string;
  downloadUrl: string;
}

export const App: React.FC = () => {
  const [platform, setPlatform] = useState<PlatformInfo>({
    name: 'Windows',
    os: 'windows',
    extension: '.exe (Installer)',
    downloadUrl: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.1/ProcessForge_0.1.1_x64-setup.exe'
  });

  const [isOtherModalOpen, setIsOtherModalOpen] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'claude' | 'gemini'>('claude');
  const [tutorialStep, setTutorialStep] = useState<number>(0);

  useEffect(() => {
    injectTutorialCSS();

    const userAgent = window.navigator.userAgent.toLowerCase();
    const platformStr = window.navigator.platform?.toLowerCase() || '';

    if (platformStr.includes('mac') || userAgent.includes('macintosh') || userAgent.includes('mac os x')) {
      setPlatform({
        name: 'macOS',
        os: 'macos',
        extension: '.dmg',
        downloadUrl: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.1/ProcessForge_0.1.1_aarch64.dmg'
      });
    } else if (platformStr.includes('linux') || userAgent.includes('linux')) {
      setPlatform({
        name: 'Linux',
        os: 'linux',
        extension: '.AppImage',
        downloadUrl: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.1/ProcessForge_0.1.1_amd64.AppImage'
      });
    }
  }, []);

  // Auto-advance tutorial steps
  useEffect(() => {
    const timer = setInterval(() => {
      setTutorialStep((prev) => (prev + 1) % TUTORIAL_STEPS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const claudeConfigSnippet = `{
  "mcpServers": {
    "process-forge": {
      "command": "npx",
      "args": ["-y", "@process-forge/mcp-server"]
    }
  }
}`;

  const geminiConfigSnippet = `# Add ProcessForge to Gemini CLI or local agent stdio:
gemini mcp add process-forge -- npx -y @process-forge/mcp-server`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const currentTutorial = TUTORIAL_STEPS[tutorialStep]!;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: OsakaJadePalette.background.base,
        color: OsakaJadePalette.text.primary,
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        style={{
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
          backgroundColor: `${OsakaJadePalette.background.surface}cc`,
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: `linear-gradient(135deg, ${OsakaJadePalette.jade[400]}, ${OsakaJadePalette.jade[600]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 16px ${OsakaJadePalette.jade.glow}44`
            }}
          >
            <Boxes size={18} color="#0c1214" />
          </div>
          <div>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: OsakaJadePalette.text.primary }}>
              PROCESS<span style={{ color: OsakaJadePalette.jade[400] }}>FORGE</span>
            </span>
            <span
              style={{
                marginLeft: '8px',
                fontSize: '0.68rem',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: `${OsakaJadePalette.jade.muted}`,
                color: OsakaJadePalette.jade[300],
                border: `1px solid ${OsakaJadePalette.jade[700]}`
              }}
            >
              v0.1.1
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <a
            href="#tutorial"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}
          >
            Tutorial
          </a>
          <a
            href="#mcp"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}
          >
            MCP Protocol
          </a>
          <a
            href="https://github.com/omeaga1/process-forge"
            target="_blank"
            rel="noreferrer"
            style={{
              color: OsakaJadePalette.text.secondary,
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            GitHub <ExternalLink size={13} />
          </a>

          <a
            href={platform.downloadUrl}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '6px',
              backgroundColor: OsakaJadePalette.jade[500],
              color: OsakaJadePalette.text.inverse,
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: `0 0 12px ${OsakaJadePalette.jade.glow}44`
            }}
          >
            <Download size={14} />
            Download ({platform.extension})
          </a>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          padding: '100px 24px 80px',
          textAlign: 'center',
          maxWidth: '900px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: 'absolute',
            top: '40px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '500px',
            height: '200px',
            background: `radial-gradient(ellipse at center, ${OsakaJadePalette.jade[500]}22 0%, transparent 70%)`,
            pointerEvents: 'none',
            zIndex: 0
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1
            style={{
              fontSize: 'clamp(2.5rem, 5vw, 4rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              marginBottom: '24px'
            }}
          >
            Design, Simulate, and Refine{' '}
            <span
              style={{
                background: `linear-gradient(135deg, ${OsakaJadePalette.jade[300]} 0%, ${OsakaJadePalette.jade[500]} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              Industrial Flowsheets
            </span>
          </h1>

          <p
            style={{
              fontSize: '1.15rem',
              color: OsakaJadePalette.text.secondary,
              lineHeight: 1.6,
              maxWidth: '640px',
              margin: '0 auto 40px'
            }}
          >
            AI synthesizes unit operations, CAD equipment, and nozzle schedules.
            You place, connect, and simulate on the flowsheet canvas.
          </p>

          {/* Two CTAs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              marginBottom: '32px'
            }}
          >
            <a
              href="#tutorial"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 28px',
                borderRadius: '8px',
                background: `linear-gradient(135deg, ${OsakaJadePalette.jade[500]}, ${OsakaJadePalette.jade[600]})`,
                color: OsakaJadePalette.text.inverse,
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '1rem',
                boxShadow: `0 4px 20px ${OsakaJadePalette.jade[500]}55`,
                cursor: 'pointer'
              }}
            >
              <Play size={18} />
              See How It Works
            </a>

            <a
              href="./studio/"
              onClick={(e) => {
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                  e.preventDefault();
                  window.location.href = 'http://localhost:3000';
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 24px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.primary,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer'
              }}
            >
              Launch Web Studio
              <ArrowRight size={16} color={OsakaJadePalette.jade[400]} />
            </a>
          </div>

          {/* Quick Install PowerShell One-Liner */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: '6px',
              padding: '6px 14px',
              marginBottom: '20px',
              fontSize: '0.8rem',
              fontFamily: 'monospace'
            }}
          >
            <Terminal size={14} color={OsakaJadePalette.jade[400]} />
            <span style={{ color: OsakaJadePalette.text.secondary }}>
              irm https://omeaga1.github.io/process-forge/install.ps1 | iex
            </span>
            <button
              onClick={() => copyToClipboard('irm https://omeaga1.github.io/process-forge/install.ps1 | iex')}
              title="Copy PowerShell install command"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: OsakaJadePalette.jade[400],
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
                marginLeft: '4px'
              }}
            >
              {copiedSnippet ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          {/* Download Chips */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              marginBottom: '12px'
            }}
          >
            <a
              href="https://github.com/omeaga1/process-forge/releases/download/v0.1.1/ProcessForge_0.1.1_x64-setup.exe"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '6px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.secondary,
                fontSize: '0.78rem',
                fontWeight: 500,
                textDecoration: 'none'
              }}
            >
              <Download size={12} /> Windows Installer
            </a>
            <a
              href="https://github.com/omeaga1/process-forge/releases/download/v0.1.1/process-forge-windows-portable-x64.zip"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '6px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.secondary,
                fontSize: '0.78rem',
                fontWeight: 500,
                textDecoration: 'none'
              }}
            >
              <Download size={12} /> Portable .zip
            </a>
            <button
              onClick={() => setIsOtherModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '6px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.jade[400],
                fontSize: '0.78rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <Download size={12} /> macOS / Linux
            </button>
          </div>

          <div style={{ fontSize: '0.78rem', color: OsakaJadePalette.text.muted }}>
            Free &amp; open source (Apache 2.0) · Zero login required
          </div>
        </div>
      </section>

      {/* ── Animated Tutorial ──────────────────────────────────────────────── */}
      <section
        id="tutorial"
        style={{
          padding: '60px 24px 80px',
          maxWidth: '1000px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '12px' }}>
            Build a Flowsheet in 3 Steps
          </h2>
          <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '1rem', maxWidth: '540px', margin: '0 auto' }}>
            The AI software engine creates equipment. You place it, connect streams, and run the simulation.
          </p>
        </div>

        {/* Step Indicator Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
          {TUTORIAL_STEPS.map((s, i) => (
            <button
              key={s.step}
              onClick={() => setTutorialStep(i)}
              style={{
                width: i === tutorialStep ? '32px' : '10px',
                height: '10px',
                borderRadius: '5px',
                border: 'none',
                backgroundColor: i === tutorialStep ? OsakaJadePalette.jade[400] : OsakaJadePalette.border.default,
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            />
          ))}
        </div>

        {/* Tutorial Canvas */}
        <div
          style={{
            borderRadius: '12px',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            backgroundColor: OsakaJadePalette.background.canvas,
            overflow: 'hidden',
            boxShadow: `0 24px 48px rgba(0,0,0,0.4), 0 0 24px ${OsakaJadePalette.jade.glow}12`
          }}
        >
          {/* Canvas Top Bar */}
          <div
            style={{
              padding: '10px 20px',
              backgroundColor: OsakaJadePalette.background.surface,
              borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f43f5e' }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981' }} />
              </div>
              <span style={{ fontSize: '0.82rem', color: OsakaJadePalette.text.primary, fontWeight: 700 }}>
                ProcessForge Canvas
              </span>
            </div>
            <span style={{ fontSize: '0.72rem', color: OsakaJadePalette.text.muted }}>
              Step {currentTutorial.step} of {TUTORIAL_STEPS.length}
            </span>
          </div>

          {/* Canvas Body */}
          <div
            style={{
              padding: '40px 24px',
              minHeight: '280px',
              position: 'relative'
            }}
          >
            {/* Grid Dots */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `radial-gradient(${OsakaJadePalette.border.default} 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
                opacity: 0.35,
                pointerEvents: 'none'
              }}
            />

            {/* Equipment Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                position: 'relative',
                zIndex: 1,
                overflowX: 'auto',
                maxWidth: '100%',
                paddingBottom: '8px'
              }}
            >
              {currentTutorial.equipment.map((eq, i) => (
                <React.Fragment key={eq}>
                  <div
                    style={{
                      width: '160px',
                      backgroundColor: OsakaJadePalette.background.surface,
                      border: i === currentTutorial.equipment.length - 1
                        ? `2px solid ${OsakaJadePalette.jade[400]}`
                        : `1px solid ${OsakaJadePalette.border.default}`,
                      borderRadius: '10px',
                      padding: '14px',
                      textAlign: 'center',
                      animation: i === currentTutorial.equipment.length - 1 ? 'pf-fade-up 0.5s ease-out' : 'none',
                      boxShadow: i === currentTutorial.equipment.length - 1
                        ? `0 0 20px ${OsakaJadePalette.jade.glow}33`
                        : 'none'
                    }}
                  >
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: OsakaJadePalette.jade[400], marginBottom: '6px' }}>
                      {eq === 'reactor' ? 'RX-101' : eq === 'pump' ? 'P-101' : 'TK-102'}
                    </div>
                    <div style={{ height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {eq === 'reactor' && <ReactorAnim isRunning={true} hasJacket={true} agitatorType="rushton" />}
                      {eq === 'pump' && <PumpAnim isRunning={true} />}
                      {eq === 'tank' && <TankAnim isRunning={true} levelPercent={74} />}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', marginTop: '6px' }}>
                      {eq === 'reactor' ? 'CSTR Reactor' : eq === 'pump' ? 'Transfer Pump' : 'Surge Tank'}
                    </div>
                  </div>

                  {/* Stream Connector */}
                  {i < currentTutorial.equipment.length - 1 && i < currentTutorial.showStreams && (
                    <div style={{ width: '48px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <svg width="48" height="24" viewBox="0 0 48 24">
                        <line
                          x1="0"
                          y1="12"
                          x2="40"
                          y2="12"
                          stroke={OsakaJadePalette.jade[400]}
                          strokeWidth="2"
                          strokeDasharray="6 3"
                          style={{ animation: 'pf-stream-flow 1.5s linear infinite' }}
                        />
                        <polygon
                          points="40,8 48,12 40,16"
                          fill={OsakaJadePalette.jade[400]}
                        />
                      </svg>
                      <span style={{ fontSize: '0.6rem', color: OsakaJadePalette.text.muted, marginTop: '2px' }}>Stream</span>
                    </div>
                  )}

                  {i < currentTutorial.equipment.length - 1 && i >= currentTutorial.showStreams && (
                    <div style={{ width: '48px', flexShrink: 0 }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Step Description Bar */}
          <div
            style={{
              padding: '16px 24px',
              backgroundColor: OsakaJadePalette.background.surface,
              borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.jade.muted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: OsakaJadePalette.jade[300],
                fontWeight: 800,
                fontSize: '0.9rem',
                flexShrink: 0
              }}
            >
              {currentTutorial.step}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px' }}>
                {currentTutorial.title}
              </div>
              <div style={{ fontSize: '0.82rem', color: OsakaJadePalette.text.secondary, lineHeight: 1.5 }}>
                {currentTutorial.description}
              </div>
            </div>
          </div>
        </div>

        {/* "Try it yourself" link */}
        <div style={{ textAlign: 'center', marginTop: '28px' }}>
          <a
            href="./studio/"
            onClick={(e) => {
              if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                e.preventDefault();
                window.location.href = 'http://localhost:3000';
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '8px',
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.jade[700]}`,
              color: OsakaJadePalette.jade[300],
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.9rem'
            }}
          >
            Try it yourself in Web Studio <ChevronRight size={16} />
          </a>
        </div>
      </section>

      {/* ── Three Value Props ──────────────────────────────────────────────── */}
      <section
        style={{
          padding: '60px 24px',
          maxWidth: '1100px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px'
          }}
        >
          <div
            style={{
              padding: '28px',
              borderRadius: '10px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <Cpu size={22} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>
              Dual Continuous &amp; Discrete Solver
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              Runge-Kutta ODEs for chemical kinetics and fluid rheology run on the exact same timeline as Poisson discrete-event simulation for conveyor queues and robotic packaging.
            </p>
          </div>

          <div
            style={{
              padding: '28px',
              borderRadius: '10px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <Bot size={22} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>
              AI-Generated Equipment
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              Need a custom reactor, column, or filler? The AI software engine synthesizes complete unit-op definitions, vector CAD drawings, and ASME nozzle schedules for you to place and connect.
            </p>
          </div>

          <div
            style={{
              padding: '28px',
              borderRadius: '10px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>
              Zero Lock-In, Full Privacy
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              Open-source (Apache 2.0). MCP protocol for any LLM. OAuth PKCE with no plaintext secrets. All simulation physics run locally. No telemetry, no cloud dependency.
            </p>
          </div>
        </div>
      </section>

      {/* ── MCP Quick Start ────────────────────────────────────────────────── */}
      <section
        id="mcp"
        style={{
          padding: '60px 24px',
          backgroundColor: OsakaJadePalette.background.surface,
          borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`
        }}
      >
        <div style={{ maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '16px',
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              color: OsakaJadePalette.jade[400],
              fontSize: '0.78rem',
              fontWeight: 600,
              marginBottom: '16px'
            }}
          >
            <Terminal size={14} /> Model Context Protocol
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '12px' }}>
            Connect Claude Desktop or Gemini CLI
          </h2>
          <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.95rem', marginBottom: '28px', maxWidth: '560px', margin: '0 auto 28px' }}>
            Give your AI assistant direct access to synthesize unit operations and scaffold flowsheet environments.
          </p>

          <div
            style={{
              borderRadius: '8px',
              backgroundColor: OsakaJadePalette.background.canvas,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              overflow: 'hidden',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveTab('claude')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: activeTab === 'claude' ? OsakaJadePalette.background.surfaceHover : 'transparent',
                    color: activeTab === 'claude' ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Claude Desktop
                </button>
                <button
                  onClick={() => setActiveTab('gemini')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: activeTab === 'gemini' ? OsakaJadePalette.background.surfaceHover : 'transparent',
                    color: activeTab === 'gemini' ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Gemini CLI
                </button>
              </div>
              <button
                onClick={() => copyToClipboard(activeTab === 'claude' ? claudeConfigSnippet : geminiConfigSnippet)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.secondary,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                {copiedSnippet ? <Check size={13} color={OsakaJadePalette.jade[400]} /> : <Copy size={13} />}
                {copiedSnippet ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <pre
              style={{
                margin: 0,
                padding: '18px',
                fontSize: '0.85rem',
                color: OsakaJadePalette.jade[300],
                overflowX: 'auto',
                lineHeight: 1.5
              }}
            >
              <code>{activeTab === 'claude' ? claudeConfigSnippet : geminiConfigSnippet}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer
        style={{
          marginTop: 'auto',
          borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
          padding: '40px 24px',
          backgroundColor: OsakaJadePalette.background.base,
          textAlign: 'center'
        }}
      >
        <div
          style={{
            maxWidth: '900px',
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px'
          }}
        >
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: OsakaJadePalette.text.primary, marginBottom: '4px' }}>
              PROCESS<span style={{ color: OsakaJadePalette.jade[400] }}>FORGE</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: OsakaJadePalette.text.muted }}>
              The software forge for custom unit operations and industrial flowsheets.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '0.85rem' }}>
            <a
              href="https://github.com/omeaga1/process-forge"
              target="_blank"
              rel="noreferrer"
              style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none' }}
            >
              GitHub
            </a>
            <a
              href="https://github.com/omeaga1/process-forge/releases"
              target="_blank"
              rel="noreferrer"
              style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none' }}
            >
              Releases
            </a>
            <a
              href="https://github.com/omeaga1/process-forge/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
              style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none' }}
            >
              Apache-2.0
            </a>
          </div>
        </div>
      </footer>

      {/* ── All Platforms Modal ─────────────────────────────────────────────── */}
      {isOtherModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px'
          }}
          onClick={() => setIsOtherModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={18} color={OsakaJadePalette.jade[400]} /> All Platforms
              </h3>
              <button
                onClick={() => setIsOtherModalOpen(false)}
                style={{ background: 'none', border: 'none', color: OsakaJadePalette.text.muted, cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Windows Installer (.exe)', url: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.1/ProcessForge_0.1.1_x64-setup.exe', sub: 'Recommended — Signed & verified one-click installer' },
                { label: 'Windows Portable (.zip)', url: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.1/process-forge-windows-portable-x64.zip', sub: 'No installation needed — extract and run' },
                { label: 'macOS Universal (.dmg)', url: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.1/ProcessForge_0.1.1_aarch64.dmg', sub: 'Apple Silicon & Intel — notarized' },
                { label: 'Linux (.AppImage / .deb)', url: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.1/ProcessForge_0.1.1_amd64.AppImage', sub: 'Ubuntu, Debian, Fedora, Arch' }
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '6px',
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    border: `1px solid ${OsakaJadePalette.border.subtle}`,
                    color: OsakaJadePalette.text.primary,
                    textDecoration: 'none'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.label}</div>
                    <div style={{ fontSize: '0.72rem', color: OsakaJadePalette.text.muted }}>{item.sub}</div>
                  </div>
                  <Download size={14} color={OsakaJadePalette.jade[400]} />
                </a>
              ))}
            </div>

            <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.jade[400], marginTop: '14px', lineHeight: 1.4, padding: '8px 10px', borderRadius: '6px', backgroundColor: OsakaJadePalette.jade.muted, border: `1px solid ${OsakaJadePalette.jade[700]}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} /> All installers are code-signed and verified. No SmartScreen warnings.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                onClick={() => setIsOtherModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
