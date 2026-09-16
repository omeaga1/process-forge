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
  ExternalLink,
  Bot,
  Copy,
  Check,
  X,
  Boxes,
  Cpu,
  ArrowRight,
  Factory,
  Package,
  Activity,
  CheckCircle2,
  HardDrive
} from 'lucide-react';

// ── Tutorial Step Animations CSS ──────────────────────────────────────────────
const TUTORIAL_CSS = `
  @keyframes pf-fade-up {
    from { opacity: 0; transform: translateY(20px); }
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
    title: '1. Place Equipment & Reactors',
    description: 'Add standard or custom unit operations — from jacketed CSTRs and surge vessels to 3D print farm queues and conveyors. The AI engine synthesizes vector CAD geometry and ASME nozzle schedules to specification.',
    equipment: ['reactor'],
    showStreams: 0
  },
  {
    step: 2,
    title: '2. Add Fluid & Material Transfer',
    description: 'Place transfer pumps or transport lines downstream. Ports, flanges, and connection endpoints snap together to define stream connectivity and mass balance boundaries.',
    equipment: ['reactor', 'pump'],
    showStreams: 1
  },
  {
    step: 3,
    title: '3. Run Dynamic Simulation & Solve Bottlenecks',
    description: 'Connect surge buffers and packaging stations. Run the deterministic hybrid simulation (continuous Runge-Kutta ODEs + discrete Poisson queuing) to expose bottlenecks in real time.',
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
  fileLabel: string;
}

export interface ProductLandingPageProps {
  onLaunchStudio: () => void;
  onOpenPortal: () => void;
  onSelectTemplate: (templateKey: string) => void;
}

export const ProductLandingPage: React.FC<ProductLandingPageProps> = ({
  onLaunchStudio,
  onOpenPortal: _onOpenPortal,
  onSelectTemplate: _onSelectTemplate
}) => {
  const [platform, setPlatform] = useState<PlatformInfo>({
    name: 'Windows',
    os: 'windows',
    extension: '.exe',
    downloadUrl: '/ProcessForge-Setup-x64.exe',
    fileLabel: 'Windows Installer (64-bit .exe)'
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
        downloadUrl: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.3/ProcessForge_0.1.3_aarch64.dmg',
        fileLabel: 'macOS Installer (.dmg)'
      });
    } else if (platformStr.includes('linux') || userAgent.includes('linux')) {
      setPlatform({
        name: 'Linux',
        os: 'linux',
        extension: '.AppImage',
        downloadUrl: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.3/ProcessForge_0.1.3_amd64.AppImage',
        fileLabel: 'Linux AppImage (.AppImage)'
      });
    }
  }, []);

  // Auto-advance tutorial steps
  useEffect(() => {
    const timer = setInterval(() => {
      setTutorialStep((prev) => (prev + 1) % TUTORIAL_STEPS.length);
    }, 4500);
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
      {/* ── Top Navigation Header ────────────────────────────────────────── */}
      <header
        style={{
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
          backgroundColor: `${OsakaJadePalette.background.surface}cc`,
          backdropFilter: 'blur(14px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '14px 32px',
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
            <span style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em', color: OsakaJadePalette.text.primary }}>
              PROCESS<span style={{ color: OsakaJadePalette.jade[400] }}>FORGE</span>
            </span>
            <span
              style={{
                marginLeft: '8px',
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: '4px',
                backgroundColor: `${OsakaJadePalette.jade.muted}`,
                color: OsakaJadePalette.jade[300],
                border: `1px solid ${OsakaJadePalette.jade[700]}`
              }}
            >
              v0.1.3
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <a
            href="#solutions"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.88rem', fontWeight: 500 }}
          >
            Solutions
          </a>
          <a
            href="#modeling"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.88rem', fontWeight: 500 }}
          >
            Physics Engine
          </a>
          <a
            href="#tutorial"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.88rem', fontWeight: 500 }}
          >
            How It Works
          </a>
          <a
            href="#automation"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.88rem', fontWeight: 500 }}
          >
            MCP Automation
          </a>
          <a
            href="https://github.com/omeaga1/process-forge"
            target="_blank"
            rel="noreferrer"
            style={{
              color: OsakaJadePalette.text.secondary,
              textDecoration: 'none',
              fontSize: '0.88rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            GitHub <ExternalLink size={13} />
          </a>

          {/* Web Studio Secondary Link */}
          <button
            onClick={onLaunchStudio}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '6px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.strong}`,
              color: OsakaJadePalette.text.primary,
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.12s ease'
            }}
            title="Launch Web Studio directly in browser"
          >
            <span>Launch Web Studio</span>
            <ArrowRight size={13} color={OsakaJadePalette.text.muted} />
          </button>

          {/* Primary Desktop App Download Button */}
          <a
            href={platform.downloadUrl}
            download={platform.os === 'windows' ? 'ProcessForge-Setup-x64.exe' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 16px',
              borderRadius: '6px',
              backgroundColor: OsakaJadePalette.jade[500],
              color: OsakaJadePalette.text.inverse,
              textDecoration: 'none',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: `0 0 12px ${OsakaJadePalette.jade.glow}44`,
              transition: 'all 0.12s ease'
            }}
          >
            <Download size={14} />
            <span>Download Desktop ({platform.extension})</span>
          </a>
        </nav>
      </header>

      {/* ── Hero Section ─────────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          padding: '80px 24px 70px',
          textAlign: 'center',
          maxWidth: '960px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        {/* Subtle Ambient Radial Glow */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '240px',
            background: `radial-gradient(ellipse at center, ${OsakaJadePalette.jade[500]}1a 0%, transparent 70%)`,
            pointerEvents: 'none',
            zIndex: 0
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Overline Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 14px',
              borderRadius: '20px',
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.border.strong}`,
              color: OsakaJadePalette.jade[300],
              fontSize: '0.78rem',
              fontWeight: 600,
              marginBottom: '22px'
            }}
          >
            <Boxes size={13} color={OsakaJadePalette.jade[400]} />
            <span>Native Desktop Process Engineering Studio &bull; Windows, macOS &amp; Linux</span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              marginBottom: '20px'
            }}
          >
            Model Any Process — From{' '}
            <span
              style={{
                background: `linear-gradient(135deg, ${OsakaJadePalette.jade[300]} 0%, ${OsakaJadePalette.jade[500]} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              Chemical Plants
            </span>{' '}
            to{' '}
            <span
              style={{
                background: `linear-gradient(135deg, ${OsakaJadePalette.jade[300]} 0%, ${OsakaJadePalette.jade[500]} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              3D Print Farms
            </span>
          </h1>

          <p
            style={{
              fontSize: '1.12rem',
              color: OsakaJadePalette.text.secondary,
              lineHeight: 1.6,
              maxWidth: '720px',
              margin: '0 auto 36px'
            }}
          >
            ProcessForge is an engineering desktop application for modeling, simulating, and optimizing complex operations.
            Combines continuous Runge-Kutta ODEs with discrete Poisson queuing, backed by an AI co-pilot for equipment and nozzle synthesis.
          </p>

          {/* Primary Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              marginBottom: '22px',
              flexWrap: 'wrap'
            }}
          >
            {/* Primary Action: Download Native Desktop App */}
            <a
              href={platform.downloadUrl}
              download={platform.os === 'windows' ? 'ProcessForge-Setup-x64.exe' : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '13px 26px',
                borderRadius: '8px',
                background: `linear-gradient(135deg, ${OsakaJadePalette.jade[500]}, ${OsakaJadePalette.jade[600]})`,
                color: OsakaJadePalette.text.inverse,
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.98rem',
                boxShadow: `0 4px 20px ${OsakaJadePalette.jade[500]}55`,
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
              title={`Download ProcessForge for ${platform.name}`}
            >
              <Download size={18} strokeWidth={2.4} />
              <span>Download for {platform.name} ({platform.extension})</span>
            </a>

            {/* Secondary Action: Launch Web Studio */}
            <button
              onClick={onLaunchStudio}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '13px 24px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.strong}`,
                color: OsakaJadePalette.text.primary,
                fontWeight: 600,
                fontSize: '0.98rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                transition: 'all 0.12s ease'
              }}
            >
              <span>Launch Web Studio (In-Browser)</span>
              <ArrowRight size={16} color={OsakaJadePalette.jade[400]} />
            </button>
          </div>

          {/* Platform Selector Link */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.82rem', color: OsakaJadePalette.text.secondary }}>
            <span>Available for Windows, macOS &amp; Linux.</span>
            <button
              onClick={() => setIsOtherModalOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: OsakaJadePalette.jade[400],
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline'
              }}
            >
              View all formats &amp; architectures (.msi, .dmg, .AppImage, portable .zip)
            </button>
          </div>

          {/* Key Engineering Assurances */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '24px',
              marginTop: '28px',
              flexWrap: 'wrap',
              fontSize: '0.78rem',
              color: OsakaJadePalette.text.muted
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={13} color={OsakaJadePalette.jade[400]} />
              100% Offline &amp; Local Execution
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={13} color={OsakaJadePalette.jade[400]} />
              Deterministic ODE + Discrete Physics
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={13} color={OsakaJadePalette.jade[400]} />
              Native Rust &amp; Tauri v2 Architecture
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={13} color={OsakaJadePalette.jade[400]} />
              Open Source (Apache-2.0)
            </span>
          </div>
        </div>
      </section>

      {/* ── Interactive Tutorial ─────────────────────────────────────────── */}
      <section
        id="tutorial"
        style={{
          padding: '60px 24px 80px',
          maxWidth: '1020px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '10px' }}>
            Build a Process Flowsheet in Minutes
          </h2>
          <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.98rem', maxWidth: '580px', margin: '0 auto' }}>
            The AI engine synthesizes unit operations and vector CAD dressing. You place equipment, connect streams, and simulate dynamics.
          </p>
        </div>

        {/* Step Indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '28px' }}>
          {TUTORIAL_STEPS.map((s, i) => (
            <button
              key={s.step}
              onClick={() => setTutorialStep(i)}
              style={{
                width: i === tutorialStep ? '32px' : '10px',
                height: '8px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: i === tutorialStep ? OsakaJadePalette.jade[400] : OsakaJadePalette.border.default,
                cursor: 'pointer',
                transition: 'all 0.25s ease'
              }}
              title={`Step ${s.step}`}
            />
          ))}
        </div>

        {/* Interactive CAD Canvas Preview Box */}
        <div
          style={{
            borderRadius: '12px',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            backgroundColor: OsakaJadePalette.background.canvas,
            overflow: 'hidden',
            boxShadow: `0 24px 48px rgba(0,0,0,0.45), 0 0 24px ${OsakaJadePalette.jade.glow}10`
          }}
        >
          {/* Header */}
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
                ProcessForge Industrial Flowsheet Viewport
              </span>
            </div>
            <span style={{ fontSize: '0.72rem', color: OsakaJadePalette.text.muted }}>
              Step {currentTutorial.step} of {TUTORIAL_STEPS.length}
            </span>
          </div>

          {/* Canvas Viewport */}
          <div
            style={{
              padding: '40px 24px',
              minHeight: '270px',
              position: 'relative'
            }}
          >
            {/* Grid Pattern */}
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

            {/* Equipment Sequence */}
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
                      animation: i === currentTutorial.equipment.length - 1 ? 'pf-fade-up 0.4s ease-out' : 'none',
                      boxShadow: i === currentTutorial.equipment.length - 1
                        ? `0 0 20px ${OsakaJadePalette.jade.glow}33`
                        : 'none'
                    }}
                  >
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: OsakaJadePalette.jade[400], marginBottom: '6px' }}>
                      {eq === 'reactor' ? 'CSTR-101' : eq === 'pump' ? 'P-101' : 'TK-102'}
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

                  {/* Stream Piping */}
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

          {/* Description Footer */}
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
              <div style={{ fontSize: '0.84rem', color: OsakaJadePalette.text.secondary, lineHeight: 1.5 }}>
                {currentTutorial.description}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Industry Solutions Section ───────────────────────────────────── */}
      <section
        id="solutions"
        style={{
          padding: '70px 24px',
          backgroundColor: OsakaJadePalette.background.surface,
          borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '10px' }}>
              Engineered for Diverse Process Domains
            </h2>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.98rem', maxWidth: '600px', margin: '0 auto' }}>
              Whether you are balancing fluid kinetics in a chemical plant or analyzing cycle times in a 3D printing farm, ProcessForge models your physics accurately.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '24px'
            }}
          >
            {/* Domain 1: Chemical & Process Plants */}
            <div
              style={{
                padding: '28px',
                borderRadius: '10px',
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: OsakaJadePalette.jade[400]
                }}
              >
                <Activity size={22} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Chemical &amp; Continuous Plants
              </h3>
              <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
                Model continuous and batch reactions, multi-stage distillation, fluid hydraulics, and heat exchange networks.
              </p>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: OsakaJadePalette.text.muted, lineHeight: 1.8 }}>
                <li>Runge-Kutta ODE solvers for continuous kinetics</li>
                <li>Pumping head curves, TDH &amp; viscosity penalties</li>
                <li>ASME B16.5 flange &amp; nozzle schedule verification</li>
              </ul>
            </div>

            {/* Domain 2: 3D Printing & Discrete Manufacturing */}
            <div
              style={{
                padding: '28px',
                borderRadius: '10px',
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: OsakaJadePalette.jade[400]
                }}
              >
                <Factory size={22} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Discrete Manufacturing &amp; 3D Print Farms
              </h3>
              <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
                Balance multi-machine 3D printer fleets, CNC machining cells, and automated robotic assembly lines.
              </p>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: OsakaJadePalette.text.muted, lineHeight: 1.8 }}>
                <li>Poisson discrete-event queue &amp; cycle time modeling</li>
                <li>Machine utilization &amp; post-processing buffer depths</li>
                <li>Starvation and line-blocking bottleneck identification</li>
              </ul>
            </div>

            {/* Domain 3: Warehousing & Logistics Operations */}
            <div
              style={{
                padding: '28px',
                borderRadius: '10px',
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: OsakaJadePalette.jade[400]
                }}
              >
                <Package size={22} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Warehousing &amp; Packaging Logistics
              </h3>
              <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
                Optimize container throughput, sortation lines, accumulation conveyors, and end-of-line palletizing cells.
              </p>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: OsakaJadePalette.text.muted, lineHeight: 1.8 }}>
                <li>Real-time pieces-per-minute (CPM) rate telemetry</li>
                <li>Accumulation conveyor buffering &amp; indexing</li>
                <li>Packaging line phase transitions (fluid $\rightarrow$ discrete containers)</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Physics Engine & Core Architecture ───────────────────────────── */}
      <section
        id="modeling"
        style={{
          padding: '70px 24px',
          maxWidth: '1100px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '10px' }}>
            Built on Rigorous Engineering Foundations
          </h2>
          <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.98rem', maxWidth: '580px', margin: '0 auto' }}>
            A unified simulation kernel with zero cloud latency and total intellectual property privacy.
          </p>
        </div>

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
              Continuous Runge-Kutta numerical integration for reaction kinetics and fluid rheology runs synchronized on the exact same master clock as discrete event queues and conveyor transfers.
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
              AI Equipment &amp; CAD Synthesis
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              Describe equipment geometry, process constraints, or nozzle ratings in plain language. The built-in AI co-pilot creates validated JSON node definitions, vector CAD drawings, and ASME nozzle schedules.
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
              <HardDrive size={22} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>
              100% Offline &amp; Data Privacy
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              The native desktop application runs completely self-contained. All simulation math, flowsheet topology, and proprietary facility data remain securely on your local workstation.
            </p>
          </div>
        </div>
      </section>

      {/* ── Extensibility & MCP Automation ───────────────────────────────── */}
      <section
        id="automation"
        style={{
          padding: '60px 24px',
          backgroundColor: OsakaJadePalette.background.surface,
          borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`
        }}
      >
        <div style={{ maxWidth: '740px', margin: '0 auto', textAlign: 'center' }}>
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
            <Terminal size={14} /> Model Context Protocol (MCP) Standard
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '12px' }}>
            Automate &amp; Script with External AI Assistants
          </h2>
          <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.94rem', marginBottom: '28px', maxWidth: '580px', margin: '0 auto 28px' }}>
            Connect Claude Desktop, Gemini CLI, or custom Python scripts via the MCP standard to programmatically synthesize unit operations, run sweeps, and analyze bottlenecks.
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

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer
        style={{
          marginTop: 'auto',
          borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
          padding: '36px 24px',
          backgroundColor: OsakaJadePalette.background.base,
          textAlign: 'center'
        }}
      >
        <div
          style={{
            maxWidth: '960px',
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
              Native desktop simulation studio for continuous and discrete industrial processes.
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
              href="https://github.com/omeaga1/process-forge/releases/tag/v0.1.3"
              target="_blank"
              rel="noreferrer"
              style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none' }}
            >
              Releases (v0.1.3)
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

      {/* ── All Platforms & Formats Modal ─────────────────────────────────── */}
      {isOtherModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
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
              maxWidth: '540px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: OsakaJadePalette.text.primary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Download size={18} color={OsakaJadePalette.jade[400]} /> ProcessForge Desktop Downloads
                </h3>
                <span style={{ fontSize: '0.78rem', color: OsakaJadePalette.text.muted }}>
                  Official Release v0.1.3 &bull; Native 64-bit binaries
                </span>
              </div>
              <button
                onClick={() => setIsOtherModalOpen(false)}
                style={{ background: 'none', border: 'none', color: OsakaJadePalette.text.muted, cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                {
                  label: 'Windows Setup Installer (.exe)',
                  url: '/ProcessForge-Setup-x64.exe',
                  download: 'ProcessForge-Setup-x64.exe',
                  tag: 'Recommended (Windows)',
                  sub: 'Native NSIS 64-bit installer with automatic updates'
                },
                {
                  label: 'Windows MSI Enterprise Package (.msi)',
                  url: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.3/ProcessForge_0.1.3_x64_en-US.msi',
                  download: 'ProcessForge_0.1.3_x64_en-US.msi',
                  tag: 'Enterprise MSI',
                  sub: 'Standard Windows Installer package for managed deployments'
                },
                {
                  label: 'Windows Portable Bundle (.zip)',
                  url: '/process-forge-windows-portable-x64.zip',
                  download: 'process-forge-windows-portable-x64.zip',
                  tag: 'Zero Install',
                  sub: 'Standalone executable archive — runs without administrative installation'
                },
                {
                  label: 'macOS Disk Image (.dmg)',
                  url: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.3/ProcessForge_0.1.3_aarch64.dmg',
                  download: 'ProcessForge_0.1.3_aarch64.dmg',
                  tag: 'macOS Apple Silicon',
                  sub: 'Apple Silicon (M1/M2/M3/M4) native universal app'
                },
                {
                  label: 'Linux AppImage (.AppImage)',
                  url: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.3/ProcessForge_0.1.3_amd64.AppImage',
                  download: 'ProcessForge_0.1.3_amd64.AppImage',
                  tag: 'Linux Standalone',
                  sub: 'Compatible with Ubuntu, Debian, Fedora, Arch Linux'
                },
                {
                  label: 'Linux Debian Package (.deb)',
                  url: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.3/ProcessForge_0.1.3_amd64.deb',
                  download: 'ProcessForge_0.1.3_amd64.deb',
                  tag: 'Ubuntu / Debian',
                  sub: 'Native Debian package with apt integration'
                }
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.url}
                  download={item.download}
                  target={item.url.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 14px',
                    borderRadius: '8px',
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    border: `1px solid ${OsakaJadePalette.border.subtle}`,
                    color: OsakaJadePalette.text.primary,
                    textDecoration: 'none',
                    transition: 'all 0.12s ease'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.label}</span>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: OsakaJadePalette.jade.muted,
                          color: OsakaJadePalette.jade[300]
                        }}
                      >
                        {item.tag}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: OsakaJadePalette.text.muted }}>{item.sub}</div>
                  </div>
                  <Download size={15} color={OsakaJadePalette.jade[400]} />
                </a>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button
                onClick={() => setIsOtherModalOpen(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
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

export default ProductLandingPage;
