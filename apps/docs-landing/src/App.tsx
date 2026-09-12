import React, { useState, useEffect } from 'react';
import { OsakaJadePalette } from '@process-forge/theme';
import {
  Download,
  Terminal,
  ShieldCheck,
  Share2,
  Sparkles,
  Play,
  ExternalLink,
  Bot,
  HardDrive,
  Copy,
  Check,
  X,
  Boxes,
  Zap
} from 'lucide-react';

interface PlatformInfo {
  name: string;
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  extension: string;
  filename: string;
  downloadUrl: string;
  instruction: string;
}

export const App: React.FC = () => {
  const [platform, setPlatform] = useState<PlatformInfo>({
    name: 'Windows',
    os: 'windows',
    extension: '.msi',
    filename: 'ProcessForge_0.1.0_x64_en-US.msi',
    downloadUrl: 'https://github.com/omeaga1/process-forge/releases/latest',
    instruction: 'Windows 10 / 11 (64-bit MSI Installer)'
  });

  const [isOtherModalOpen, setIsOtherModalOpen] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'claude' | 'gemini'>('claude');

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const platformStr = window.navigator.platform?.toLowerCase() || '';

    if (platformStr.includes('mac') || userAgent.includes('macintosh') || userAgent.includes('mac os x')) {
      setPlatform({
        name: 'macOS',
        os: 'macos',
        extension: '.dmg',
        filename: 'ProcessForge_0.1.0_universal.dmg',
        downloadUrl: 'https://github.com/omeaga1/process-forge/releases/latest',
        instruction: 'macOS 12+ (Apple Silicon & Intel DMG)'
      });
    } else if (platformStr.includes('linux') || userAgent.includes('linux')) {
      setPlatform({
        name: 'Linux',
        os: 'linux',
        extension: '.AppImage',
        filename: 'ProcessForge_0.1.0_amd64.AppImage',
        downloadUrl: 'https://github.com/omeaga1/process-forge/releases/latest',
        instruction: 'Linux x86_64 AppImage (Ubuntu / Debian / Fedora / Arch)'
      });
    } else {
      // Default to Windows
      setPlatform({
        name: 'Windows',
        os: 'windows',
        extension: '.msi',
        filename: 'ProcessForge_0.1.0_x64_en-US.msi',
        downloadUrl: 'https://github.com/omeaga1/process-forge/releases/latest',
        instruction: 'Windows 10 / 11 (64-bit MSI & EXE)'
      });
    }
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
      {/* Top Header Navigation */}
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
              v0.1.0-alpha
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <a
            href="#features"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}
          >
            Features
          </a>
          <a
            href="#mcp"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}
          >
            MCP Protocol
          </a>
          <a
            href="#architecture"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}
          >
            Architecture
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
            href="./studio/"
            onClick={(e) => {
              // Graceful fallback for local development or subpath hosting
              if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                e.preventDefault();
                window.location.href = 'http://localhost:3000';
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '6px',
              backgroundColor: OsakaJadePalette.background.surfaceHover,
              color: OsakaJadePalette.jade[300],
              border: `1px solid ${OsakaJadePalette.jade[700]}`,
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Play size={14} />
            Web Studio (Guest)
          </a>
        </nav>
      </header>

      {/* Hero Showcase Section */}
      <section
        style={{
          position: 'relative',
          padding: '80px 24px 60px',
          textAlign: 'center',
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        {/* Glow ambient circle */}
        <div
          style={{
            position: 'absolute',
            top: '40px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '240px',
            background: `radial-gradient(ellipse at center, ${OsakaJadePalette.jade[500]}22 0%, transparent 70%)`,
            pointerEvents: 'none',
            zIndex: 0
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '20px',
              backgroundColor: `${OsakaJadePalette.background.surfaceElevated}`,
              border: `1px solid ${OsakaJadePalette.border.glow}55`,
              color: OsakaJadePalette.jade[300],
              fontSize: '0.8rem',
              fontWeight: 600,
              marginBottom: '24px'
            }}
          >
            <Sparkles size={14} color={OsakaJadePalette.jade[400]} />
            The AI Software Engineer for Physical Process Simulation
          </div>

          <h1
            style={{
              fontSize: 'clamp(2.5rem, 5vw, 4.2rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              marginBottom: '24px',
              maxWidth: '960px',
              margin: '0 auto 24px'
            }}
          >
            Design, Simulate, and Optimize{' '}
            <span
              style={{
                background: `linear-gradient(135deg, ${OsakaJadePalette.jade[300]} 0%, ${OsakaJadePalette.jade[500]} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              Industrial Twins
            </span>{' '}
            with Autonomous Agents
          </h1>

          <p
            style={{
              fontSize: '1.15rem',
              color: OsakaJadePalette.text.secondary,
              lineHeight: 1.6,
              maxWidth: '780px',
              margin: '0 auto 40px',
              fontWeight: 400
            }}
          >
            Process engineers shouldn't have to write Python glue code or struggle with brittle legacy software.
            ProcessForge combines continuous and discrete-event simulation with an AI agent in every machine,
            backed by local Model Context Protocol (MCP) orchestration.
          </p>

          {/* Download & Launch Call to Actions */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              marginBottom: '16px'
            }}
          >
            {/* Primary OS Detected Download Button */}
            <a
              href={platform.downloadUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 28px',
                borderRadius: '8px',
                background: `linear-gradient(135deg, ${OsakaJadePalette.jade[500]}, ${OsakaJadePalette.jade[600]})`,
                color: OsakaJadePalette.text.inverse,
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '1rem',
                boxShadow: `0 4px 20px ${OsakaJadePalette.jade[500]}44`,
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                cursor: 'pointer'
              }}
            >
              <Download size={20} color={OsakaJadePalette.text.inverse} />
              <div style={{ textAlign: 'left' }}>
                <div>Download for {platform.name} ({platform.extension})</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 500 }}>{platform.instruction}</div>
              </div>
            </a>

            {/* Direct Web Studio Guest Launcher */}
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
                fontSize: '0.98rem',
                cursor: 'pointer'
              }}
            >
              <Play size={18} color={OsakaJadePalette.jade[400]} />
              Launch Web Studio (Guest Mode)
            </a>
          </div>

          {/* Platform Switcher & Version Meta */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              fontSize: '0.82rem',
              color: OsakaJadePalette.text.muted
            }}
          >
            <span>v0.1.0 • Free & Open Source (Apache 2.0)</span>
            <span>•</span>
            <button
              onClick={() => setIsOtherModalOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: OsakaJadePalette.jade[400],
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                font: 'inherit',
                fontSize: '0.82rem'
              }}
            >
              Other platforms (.exe, .dmg, .AppImage)
            </button>
            <span>•</span>
            <span>Zero login required to test</span>
          </div>
        </div>

        {/* Live Simulation Preview Graphic */}
        <div
          style={{
            marginTop: '50px',
            borderRadius: '12px',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            backgroundColor: OsakaJadePalette.background.canvas,
            overflow: 'hidden',
            boxShadow: `0 24px 48px rgba(0,0,0,0.5), 0 0 20px ${OsakaJadePalette.jade.glow}15`,
            position: 'relative'
          }}
        >
          {/* Mock Window Top Bar */}
          <div
            style={{
              padding: '12px 18px',
              backgroundColor: OsakaJadePalette.background.surface,
              borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f43f5e' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981' }} />
              <span style={{ marginLeft: '12px', fontSize: '0.8rem', color: OsakaJadePalette.text.secondary, fontWeight: 600 }}>
                Sherwin-Williams Paint Canning Line — ProcessForge Twin Studio
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.75rem' }}>
              <span style={{ color: OsakaJadePalette.jade[400], display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: OsakaJadePalette.jade[400] }} />
                DES Clock: 00:04:12.400
              </span>
              <span style={{ color: OsakaJadePalette.text.muted }}>Rate: 180 cans/min</span>
            </div>
          </div>

          {/* Interactive Flow Diagram Representation */}
          <div style={{ padding: '36px 24px', position: 'relative' }}>
            {/* Grid Pattern */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `radial-gradient(${OsakaJadePalette.border.default} 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
                opacity: 0.5,
                pointerEvents: 'none'
              }}
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '16px',
                position: 'relative',
                zIndex: 1
              }}
            >
              {/* Unit Op 1 */}
              <div
                style={{
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.jade[500]}`,
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'left',
                  boxShadow: `0 0 12px ${OsakaJadePalette.jade.glow}22`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: OsakaJadePalette.jade[400], fontWeight: 700 }}>CONTINUOUS</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: OsakaJadePalette.status.busy }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>Mixer Tank 01</div>
                <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.secondary }}>Viscosity: 1200 cP</div>
                <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.secondary }}>Temp: 24.5 °C</div>
                <div style={{ marginTop: '8px', fontSize: '0.7rem', color: OsakaJadePalette.jade[300], display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Bot size={12} /> Agent: Rheology tuning
                </div>
              </div>

              {/* Unit Op 2 */}
              <div
                style={{
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700 }}>BUFFER TANK</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: OsakaJadePalette.status.busy }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>Surge Tank 01</div>
                <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.secondary }}>Capacity: 2,500 L</div>
                <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.secondary }}>Level: 74% (Healthy)</div>
                <div style={{ marginTop: '8px', fontSize: '0.7rem', color: OsakaJadePalette.text.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Bot size={12} /> Agent: Buffer head calc
                </div>
              </div>

              {/* Unit Op 3 */}
              <div
                style={{
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.status.blocked}`,
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'left',
                  boxShadow: `0 0 12px ${OsakaJadePalette.status.blocked}33`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: OsakaJadePalette.status.blocked, fontWeight: 700 }}>DISCRETE BOTTLENECK</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: OsakaJadePalette.status.blocked }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>Rotary Filler 01</div>
                <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.secondary }}>Rate: 180 cans/min</div>
                <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.status.blocked }}>Backpressure: 91%</div>
                <div style={{ marginTop: '8px', fontSize: '0.7rem', color: OsakaJadePalette.status.blocked, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Bot size={12} /> Agent: Infeed throttling
                </div>
              </div>

              {/* Unit Op 4 */}
              <div
                style={{
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: OsakaJadePalette.jade[400], fontWeight: 700 }}>DISCRETE DES</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: OsakaJadePalette.status.busy }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>Vacuum Capper</div>
                <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.secondary }}>Torque: 3.2 N·m</div>
                <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.secondary }}>Seal Integrity: 99.8%</div>
                <div style={{ marginTop: '8px', fontSize: '0.7rem', color: OsakaJadePalette.text.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Bot size={12} /> Agent: Torque verifier
                </div>
              </div>

              {/* Unit Op 5 */}
              <div
                style={{
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: OsakaJadePalette.jade[400], fontWeight: 700 }}>END-OF-LINE</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: OsakaJadePalette.status.busy }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>Robot Palletizer</div>
                <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.secondary }}>Pattern: 5-Tier Interlock</div>
                <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.secondary }}>Pallets: 14 completed</div>
                <div style={{ marginTop: '8px', fontSize: '0.7rem', color: OsakaJadePalette.text.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Bot size={12} /> Agent: Stacking planner
                </div>
              </div>
            </div>

            {/* Master Orchestrator Live Banner */}
            <div
              style={{
                marginTop: '20px',
                padding: '12px 18px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.jade[700]}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={16} color={OsakaJadePalette.jade[400]} />
                <span style={{ fontSize: '0.85rem', color: OsakaJadePalette.text.primary, fontWeight: 600 }}>
                  Master Orchestrator:
                </span>
                <span style={{ fontSize: '0.85rem', color: OsakaJadePalette.text.secondary }}>
                  Identified upstream accumulation risk at Rotary Filler. Recommended increasing conveyor speed by 8% or staggering batch feed.
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: OsakaJadePalette.jade[300],
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: OsakaJadePalette.jade.muted
                }}
              >
                Autotuned via MCP
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section
        id="features"
        style={{
          padding: '80px 24px',
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '12px' }}>
            Built for Engineers. Supercharged by AI.
          </h2>
          <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '1.05rem', maxWidth: '650px', margin: '0 auto' }}>
            Not an LLM chatbot wrapper. ProcessForge is a high-performance industrial simulation engine where agents act as software and process engineers.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '24px'
          }}
        >
          {/* Card 1 */}
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
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <Bot size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              Hierarchical Multi-Agent Architecture
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              A high-level Master Orchestrator oversees the entire plant flowsheet, detecting bottlenecks and material imbalances.
              Every unit operation has an embedded sub-agent pop-out screen with its own chat interface to assist engineers in building and calibrating that specific machine.
            </p>
          </div>

          {/* Card 2 */}
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
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <Terminal size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              Native Model Context Protocol (MCP)
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              Full stdio MCP server support. Connect your existing Claude Desktop, Gemini CLI, Cursor, or local LLMs to run simulations, evaluate unit operations, and autogenerate industrial flowsheets without vendor lock-in.
            </p>
          </div>

          {/* Card 3 */}
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
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <ShieldCheck size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              Zero Raw Keys & 100% Local Privacy
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              All simulation math runs locally in Rust and WebAssembly. API keys are stored in the OS credential vault (Windows DPAPI, macOS Keychain) and never sent to cloud servers or stored in plaintext.
            </p>
          </div>

          {/* Card 4 */}
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
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <Share2 size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              ForgeHub Plugin Marketplace
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              Free, community-driven unit operations repository. Engineers can publish custom distillation columns, rotary packers, or chemical reactors, and other users can insert them directly into their flowsheets in one click.
            </p>
          </div>

          {/* Card 5 */}
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
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <HardDrive size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              Zero-Friction Guest Mode & Portable Twins
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              No forced sign-ups or paywalls. Jump right into the web studio as a guest, build complete digital twin models, and export portable <code style={{ color: OsakaJadePalette.jade[300] }}>.processforge</code> project files anytime.
            </p>
          </div>

          {/* Card 6 */}
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
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <Zap size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              Native Desktop with Auto-Updates
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              Lightweight Tauri v2 shell for Windows, macOS, and Linux. Built-in automatic update detection notifies you whenever a new release is published with seamless one-click in-app updating.
            </p>
          </div>
        </div>
      </section>

      {/* MCP Quick Start Section */}
      <section
        id="mcp"
        style={{
          padding: '60px 24px',
          backgroundColor: OsakaJadePalette.background.surface,
          borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`
        }}
      >
        <div style={{ maxWidth: '960px', margin: '0 auto', textAlign: 'center' }}>
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
            <Terminal size={14} /> Model Context Protocol (MCP) Integration
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '14px' }}>
            Plug ProcessForge into Claude Desktop & Gemini CLI
          </h2>
          <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.98rem', marginBottom: '32px', maxWidth: '640px', margin: '0 auto 32px' }}>
            Give your favorite AI coding assistant direct, programmatic control over process simulations, unit operation parameters, and digital twin exports.
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
                  Claude Desktop Config
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
                  Gemini CLI Command
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

      {/* Footer */}
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
            maxWidth: '1200px',
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
              Next-generation hybrid process simulation with hierarchical agent orchestration.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '0.85rem' }}>
            <a
              href="https://github.com/omeaga1/process-forge"
              target="_blank"
              rel="noreferrer"
              style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none' }}
            >
              GitHub Repository
            </a>
            <a
              href="https://github.com/omeaga1/process-forge/releases"
              target="_blank"
              rel="noreferrer"
              style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none' }}
            >
              Release Downloads
            </a>
            <a
              href="https://github.com/omeaga1/process-forge/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
              style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none' }}
            >
              Apache-2.0 License
            </a>
          </div>
        </div>
        <div style={{ marginTop: '24px', fontSize: '0.75rem', color: OsakaJadePalette.text.muted }}>
          Hosted on GitHub Pages with $0 cloud footprint. No telemetry tracking or personal data collection.
        </div>
      </footer>

      {/* Other Platforms Modal */}
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
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Download size={20} color={OsakaJadePalette.jade[400]} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>All Platform Installers</h3>
              </div>
              <button
                onClick={() => setIsOtherModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: OsakaJadePalette.text.muted,
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: OsakaJadePalette.text.secondary, marginBottom: '20px' }}>
              All binaries are signed and built automatically from open-source GitHub Actions CI. Select your target architecture:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {/* Windows MSI */}
              <a
                href="https://github.com/omeaga1/process-forge/releases/latest"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  textDecoration: 'none'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Windows (64-bit MSI)</div>
                  <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.muted }}>ProcessForge_x64_en-US.msi</div>
                </div>
                <Download size={16} color={OsakaJadePalette.jade[400]} />
              </a>

              {/* Windows Standalone EXE */}
              <a
                href="https://github.com/omeaga1/process-forge/releases/latest"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  textDecoration: 'none'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Windows Standalone Executable</div>
                  <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.muted }}>ProcessForge_x64.exe</div>
                </div>
                <Download size={16} color={OsakaJadePalette.jade[400]} />
              </a>

              {/* macOS DMG */}
              <a
                href="https://github.com/omeaga1/process-forge/releases/latest"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  textDecoration: 'none'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>macOS Universal DMG</div>
                  <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.muted }}>Apple Silicon (M1/M2/M3/M4) & Intel x86_64</div>
                </div>
                <Download size={16} color={OsakaJadePalette.jade[400]} />
              </a>

              {/* Linux AppImage */}
              <a
                href="https://github.com/omeaga1/process-forge/releases/latest"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  textDecoration: 'none'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Linux AppImage (x86_64)</div>
                  <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.muted }}>Ubuntu, Debian, Fedora, Arch</div>
                </div>
                <Download size={16} color={OsakaJadePalette.jade[400]} />
              </a>

              {/* Linux DEB */}
              <a
                href="https://github.com/omeaga1/process-forge/releases/latest"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  textDecoration: 'none'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Debian / Ubuntu (.deb)</div>
                  <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.muted }}>Native dpkg installer</div>
                </div>
                <Download size={16} color={OsakaJadePalette.jade[400]} />
              </a>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
