import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Cloud,
  Cpu,
  User,
  ArrowRight,
  Upload,
  Trash2,
  ExternalLink,
  Send,
  Loader2,
  Sun,
  Moon,
  ChevronRight,
  Database,
  Workflow,
  Lock,
  KeyRound,
  Terminal,
  Sliders,
  Download,
  Check,
  Copy
} from 'lucide-react';
import {
  useTheme,
  getLlmCredentials,
  getAiConnection,
  isAgentChatUnlocked,
  dispatchMasterOrchestratorMessage,
  type ChatMessage,
  ProcessForgeLogo,
  ProcessForgeEmblem
} from '@process-forge/canvas-ui';
import type { SimulationProject } from '@process-forge/protocol';
import { useAccount } from '../auth/useAccount.js';
import {
  listUserCloudProjects,
  deleteProjectFromCloud,
  type CloudProjectRecord
} from '../storage/cloudStorageAdapter.js';

interface LandingPageHubProps {
  currentProject: SimulationProject;
  onNavigateLanding?: () => void;
  onCreateBlank: () => void;
  onSelectTemplate: (templateKey: string) => void;
  onOpenProject: (project: SimulationProject) => void;
  onImportFile: (file: File) => void;
  onOpenStudio: () => void;
  onOpenForgeHub?: () => void;
  onOpenAiModal: () => void;
  onOpenAccountModal: () => void;
  onOpenCloudProjectsModal: () => void;
}

export const LandingPageHub: React.FC<LandingPageHubProps> = ({
  currentProject,
  onNavigateLanding,
  onCreateBlank,
  onSelectTemplate,
  onOpenProject,
  onImportFile,
  onOpenStudio,
  onOpenForgeHub,
  onOpenAiModal,
  onOpenAccountModal,
  onOpenCloudProjectsModal
}) => {
  const { palette, theme, toggleTheme } = useTheme();
  const OsakaJadePalette = palette;
  const { user, isAuthenticated } = useAccount();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cloudProjects, setCloudProjects] = useState<CloudProjectRecord[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true);
  const [creds, setCreds] = useState(() => getLlmCredentials());
  const [aiConn, setAiConn] = useState(() => getAiConnection());
  const lockStatus = isAgentChatUnlocked(aiConn, creds);
  const hasKey = lockStatus.unlocked;

  // Agent Chat State on Landing Page
  const [agentInput, setAgentInput] = useState<string>('');
  const [isAgentThinking, setIsAgentThinking] = useState<boolean>(false);
  const [agentConversation, setAgentConversation] = useState<ChatMessage[]>([]);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  // Fetch Cloud Projects
  useEffect(() => {
    setIsLoadingProjects(true);
    listUserCloudProjects(user)
      .then((items) => {
        setCloudProjects(items);
        setIsLoadingProjects(false);
      })
      .catch(() => setIsLoadingProjects(false));
  }, [user]);

  // Sync credentials and connection on storage updates
  useEffect(() => {
    const handleStorage = () => {
      const newCreds = getLlmCredentials();
      const newConn = getAiConnection();
      setCreds(newCreds);
      setAiConn(newConn);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
      e.target.value = '';
    }
  };

  const handleAgentSend = async (promptToSend?: string) => {
    if (!lockStatus.unlocked) {
      onOpenAiModal();
      return;
    }
    const text = promptToSend || agentInput;
    if (!text.trim() || isAgentThinking) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      senderTitle: user?.name || 'Process Engineer',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setAgentConversation((prev) => [...prev, userMsg]);
    if (!promptToSend) setAgentInput('');
    setIsAgentThinking(true);

    try {
      const res = await dispatchMasterOrchestratorMessage(text, {
        graphName: currentProject.graph.name,
        nodeCount: currentProject.graph.nodes.length,
        totalPackaged: 0,
        averageRatePerMin: 0
      });

      const agentMsg: ChatMessage = {
        id: `orch-${Date.now()}`,
        sender: 'master_orchestrator',
        senderTitle: 'Plant Orchestrator',
        text: res.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelBadge: res.senderBadge
      };

      setAgentConversation((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      setAgentConversation((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'master_orchestrator',
          senderTitle: 'Error',
          text: `[Error]: ${err.message || 'Failed to call model provider'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsAgentThinking(false);
    }
  };

  const handleDeleteCloudProject = async (e: React.MouseEvent, recordId: string) => {
    e.stopPropagation();
    if (!user) return;
    if (window.confirm('Delete this project from your cloud storage?')) {
      await deleteProjectFromCloud(recordId, user);
      setCloudProjects((prev) => prev.filter((p) => p.id !== recordId));
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        backgroundColor: OsakaJadePalette.background.base,
        backgroundImage: theme === 'dark'
          ? `
            radial-gradient(ellipse at 50% 0%, rgba(45, 213, 183, 0.12) 0%, transparent 60%),
            radial-gradient(circle at 10% 40%, rgba(84, 158, 106, 0.08) 0%, transparent 40%),
            linear-gradient(rgba(113, 206, 173, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(113, 206, 173, 0.05) 1px, transparent 1px),
            repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.2) 3px, transparent 4px)
          `
          : `
            radial-gradient(ellipse at 50% 0%, rgba(35, 148, 104, 0.08) 0%, transparent 60%),
            linear-gradient(rgba(35, 148, 104, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(35, 148, 104, 0.06) 1px, transparent 1px)
          `,
        backgroundSize: theme === 'dark'
          ? '100% 100%, 100% 100%, 32px 32px, 32px 32px, 100% 4px'
          : '100% 100%, 28px 28px, 28px 28px',
        color: OsakaJadePalette.text.primary,
        fontFamily: 'Inter, system-ui, sans-serif'
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.pfg,.pfg.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Top Navigation Bar */}
      <header
        style={{
          height: 56,
          backgroundColor: OsakaJadePalette.background.surface,
          borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          flexShrink: 0
        }}
      >
        {/* Brand & Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            onClick={onNavigateLanding}
            style={{ display: 'flex', alignItems: 'center', cursor: onNavigateLanding ? 'pointer' : 'default' }}
            title={onNavigateLanding ? 'Return to Product Showcase & Landing Page' : undefined}
          >
            <ProcessForgeLogo size={32} wordmarkSize={17} />
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: 'rgba(45, 213, 183, 0.12)',
              border: `1px solid ${OsakaJadePalette.border.strong}`,
              color: OsakaJadePalette.jade[400],
              fontFamily: '"JetBrains Mono", monospace'
            }}
          >
            PROJECT PORTAL
          </span>
          {onNavigateLanding && (
            <button
              onClick={onNavigateLanding}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 4,
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.secondary,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: '"JetBrains Mono", monospace',
                cursor: 'pointer'
              }}
              title="Return to Product Showcase Landing Page"
            >
              <span>← SHOWCASE</span>
            </button>
          )}
        </div>

        {/* Right Nav Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Download Windows Desktop App (.exe) */}
          <a
            href="/ProcessForge-Setup-x64.exe"
            download="ProcessForge-Setup-x64.exe"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 4,
              backgroundColor: OsakaJadePalette.jade[600],
              border: `1px solid ${OsakaJadePalette.jade[400]}`,
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: '"JetBrains Mono", monospace',
              textDecoration: 'none',
              cursor: 'pointer',
              boxShadow: `0 0 10px ${OsakaJadePalette.jade.glow}44`,
              transition: 'all 0.12s ease'
            }}
            title="Download ProcessForge for Windows (Native .exe Setup)"
          >
            <Download size={13} strokeWidth={2.5} />
            <span>DOWNLOAD (.EXE)</span>
          </a>

          {/* AI Model Status */}
          <button
            onClick={onOpenAiModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 12px',
              borderRadius: 4,
              backgroundColor: hasKey
                ? (theme === 'dark' ? 'rgba(45, 213, 183, 0.08)' : 'rgba(35, 148, 104, 0.08)')
                : (theme === 'dark' ? 'rgba(255, 83, 69, 0.08)' : 'rgba(220, 38, 38, 0.08)'),
              border: `1px solid ${hasKey ? OsakaJadePalette.border.strong : OsakaJadePalette.status.failed}66`,
              color: hasKey ? OsakaJadePalette.text.primary : OsakaJadePalette.status.failed,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: '"JetBrains Mono", monospace',
              cursor: 'pointer',
              transition: 'all 0.12s ease'
            }}
            title="Configure AI Model Providers (Claude, Gemini, OpenAI, Ollama)"
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: hasKey ? OsakaJadePalette.jade.glow : OsakaJadePalette.status.failed,
                boxShadow: hasKey ? `0 0 6px ${OsakaJadePalette.jade.glow}` : undefined
              }}
            />
            <span>{hasKey ? `AI: ${creds.provider.toUpperCase()}` : 'LINK AI MODEL'}</span>
            <Sliders size={12} style={{ opacity: 0.7, marginLeft: 2 }} />
          </button>

          {/* Account Button */}
          <button
            onClick={onOpenAccountModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 4,
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.primary,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: '"JetBrains Mono", monospace',
              cursor: 'pointer',
              transition: 'all 0.12s ease'
            }}
            title={isAuthenticated ? `Signed in as ${user?.name}` : 'Sign In / Account'}
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="Avatar"
                style={{ width: 16, height: 16, borderRadius: '50%' }}
              />
            ) : (
              <User size={13} color={OsakaJadePalette.text.secondary} />
            )}
            <span>{isAuthenticated ? (user?.name?.split(' ')[0]?.toUpperCase() || 'ACCOUNT') : 'SIGN IN'}</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            style={{
              width: 32,
              height: 32,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.secondary,
              cursor: 'pointer',
              transition: 'all 0.12s ease'
            }}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      {/* Hero Header Section */}
      <section
        style={{
          padding: '40px 32px 32px 32px',
          maxWidth: 1280,
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 16,
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: `1px solid ${OsakaJadePalette.jade[600]}`,
              color: OsakaJadePalette.text.accent,
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: OsakaJadePalette.jade[500],
                boxShadow: `0 0 8px ${OsakaJadePalette.jade.glow}`
              }}
            />
            CONTINUOUS & DISCRETE PROCESS SIMULATION
          </span>
        </div>

        <h1
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: 0,
            lineHeight: 1.2,
            color: OsakaJadePalette.text.primary
          }}
        >
          Design, Simulate & Orchestrate Industrial Plants
        </h1>

        <p
          style={{
            fontSize: 15,
            lineHeight: 1.5,
            color: OsakaJadePalette.text.secondary,
            maxWidth: 720,
            margin: 0
          }}
        >
          Continuous fluid mechanics, discrete line flow contracts, automated ASME equipment solvers, and real-time process optimization.
        </p>

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
          {/* Primary Action: Download for Windows .exe */}
          <a
            href="/ProcessForge-Setup-x64.exe"
            download="ProcessForge-Setup-x64.exe"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 22px',
              borderRadius: 4,
              backgroundColor: OsakaJadePalette.jade[600],
              border: `1px solid ${OsakaJadePalette.jade[400]}`,
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: theme === 'dark'
                ? `inset 0 1px 0 rgba(255,255,255,0.25), 0 3px 16px ${OsakaJadePalette.jade.glow}55`
                : '0 2px 6px rgba(0,0,0,0.15)',
              fontFamily: '"JetBrains Mono", monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              textDecoration: 'none',
              transition: 'all 0.12s ease'
            }}
            title="Download ProcessForge Windows Setup (.exe Installer)"
          >
            <Download size={16} strokeWidth={2.5} />
            <span>Download Installer (.exe)</span>
          </a>

          {/* Primary Action: Open Studio */}
          <button
            onClick={onOpenStudio}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 20px',
              borderRadius: 4,
              backgroundColor: OsakaJadePalette.jade[600],
              border: `1px solid ${OsakaJadePalette.jade[400]}`,
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: theme === 'dark'
                ? `inset 0 1px 0 rgba(255,255,255,0.25), 0 3px 12px ${OsakaJadePalette.jade.glow}44`
                : '0 2px 4px rgba(0,0,0,0.1)',
              fontFamily: '"JetBrains Mono", monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              transition: 'all 0.12s ease'
            }}
            title="Launch Interactive Canvas Studio"
          >
            <Terminal size={16} strokeWidth={2.5} />
            <span>Open Studio</span>
            <ArrowRight size={14} />
          </button>

          {/* Secondary Action: Blank Canvas */}
          <button
            onClick={onCreateBlank}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 16px',
              borderRadius: 4,
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.strong}`,
              color: OsakaJadePalette.text.primary,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '0.02em',
              transition: 'all 0.12s ease'
            }}
            title="Create clean slate industrial flowsheet"
          >
            <Plus size={15} strokeWidth={2.5} color={OsakaJadePalette.jade.glow} />
            <span>Blank Canvas</span>
          </button>

          {/* Secondary Action: Load Paint Canning Line */}
          <button
            onClick={() => onSelectTemplate('sherwin-williams-paint-line')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 16px',
              borderRadius: 4,
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.strong}`,
              color: OsakaJadePalette.text.primary,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '0.02em',
              transition: 'all 0.12s ease'
            }}
            title="Load reference 6-machine industrial packaging line"
          >
            <Workflow size={15} color={OsakaJadePalette.jade.glow} />
            <span>Paint Canning Line</span>
          </button>

          {onOpenForgeHub && (
            <button
              onClick={onOpenForgeHub}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 16px',
                borderRadius: 4,
                backgroundColor: theme === 'dark' ? 'rgba(45, 213, 183, 0.08)' : 'rgba(35, 148, 104, 0.08)',
                border: `1px solid ${OsakaJadePalette.border.glow}`,
                color: OsakaJadePalette.text.accent,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: '"JetBrains Mono", monospace',
                letterSpacing: '0.02em',
                transition: 'all 0.12s ease'
              }}
            >
              <ProcessForgeEmblem size={15} glow={false} />
              <span>ProcessForge Hub</span>
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 14px',
              borderRadius: 4,
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.secondary,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '0.02em',
              transition: 'all 0.12s ease'
            }}
          >
            <Upload size={14} />
            <span>Import .pfg</span>
          </button>

          <button
            onClick={onOpenCloudProjectsModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 14px',
              borderRadius: 4,
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.secondary,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '0.02em',
              transition: 'all 0.12s ease'
            }}
          >
            <Cloud size={14} />
            <span>Cloud Projects ({cloudProjects.length})</span>
          </button>
        </div>

        {/* Quick Install Bar & PowerShell One-Liner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 4,
            paddingTop: 14,
            borderTop: `1px solid ${OsakaJadePalette.border.subtle}`
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontFamily: 'monospace'
            }}
          >
            <Terminal size={14} color={OsakaJadePalette.jade[400]} />
            <span style={{ color: OsakaJadePalette.text.secondary }}>
              irm https://process-forge.pages.dev/install.ps1 | iex
            </span>
            <button
              onClick={() => copyToClipboard('irm https://process-forge.pages.dev/install.ps1 | iex')}
              title="Copy PowerShell 1-Click Install Command"
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

          <a
            href="/install.cmd"
            download="install.cmd"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.secondary,
              fontSize: '0.78rem',
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: '"JetBrains Mono", monospace'
            }}
            title="Download 1-Click Install Script (.cmd)"
          >
            <Download size={12} />
            <span>1-Click Script (.cmd)</span>
          </a>

          <a
            href="https://github.com/omeaga1/process-forge/releases/tag/v0.1.1"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.muted,
              fontSize: '0.78rem',
              textDecoration: 'none'
            }}
          >
            <span>All Releases (.exe, macOS, Linux)</span>
            <ExternalLink size={12} />
          </a>

          <span style={{ fontSize: '0.72rem', color: OsakaJadePalette.text.muted }}>
            1-Click automated setup &bull; Antivirus-safe &bull; Offline native desktop support &bull; Zero login required
          </span>
        </div>
      </section>

      {/* Main Grid: Projects & Templates (Left) + Overarching Agent & Subscriptions (Right) */}
      <main
        style={{
          maxWidth: 1280,
          width: '100%',
          margin: '0 auto',
          padding: '0 32px 48px 32px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 24
        }}
      >
        {/* Left Column: Cloud Storage Flowsheets & Examples */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Cloud Storage Section */}
          <div
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 12,
              padding: 20
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cloud size={18} color={OsakaJadePalette.jade[400]} />
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: OsakaJadePalette.text.primary }}>
                  Cloud Storage Projects
                </h2>
              </div>
              <button
                onClick={onOpenCloudProjectsModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: OsakaJadePalette.text.accent,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <span>View All ({cloudProjects.length})</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {isLoadingProjects ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: OsakaJadePalette.text.muted, fontSize: 13 }}>
                <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                <span>Loading your cloud flowsheets...</span>
              </div>
            ) : cloudProjects.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  backgroundColor: OsakaJadePalette.background.canvas,
                  borderRadius: 8,
                  border: `1px dashed ${OsakaJadePalette.border.default}`
                }}
              >
                <Database size={24} color={OsakaJadePalette.text.muted} style={{ margin: '0 auto 8px auto' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                  No Cloud Projects Yet
                </div>
                <div style={{ fontSize: 12, color: OsakaJadePalette.text.muted, marginTop: 4 }}>
                  Create a new process forge and save it to the cloud to access it from any browser.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cloudProjects.slice(0, 3).map((cp) => (
                  <div
                    key={cp.id}
                    onClick={() => onOpenProject(cp.bundle)}
                    style={{
                      padding: '12px 14px',
                      backgroundColor: OsakaJadePalette.background.canvas,
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = OsakaJadePalette.jade[600];
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = OsakaJadePalette.border.default;
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cp.name}
                      </div>
                      <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted, marginTop: 2 }}>
                        {cp.nodeCount} Unit-Ops • {cp.streamCount} Streams • {new Date(cp.updatedAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4,
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          border: `1px solid rgba(16, 185, 129, 0.25)`,
                          color: OsakaJadePalette.text.accent,
                          fontWeight: 600
                        }}
                      >
                        Cloud Synced
                      </span>
                      <button
                        onClick={(e) => handleDeleteCloudProject(e, cp.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: OsakaJadePalette.text.muted,
                          cursor: 'pointer',
                          padding: 4
                        }}
                        title="Delete project"
                      >
                        <Trash2 size={13} />
                      </button>
                      <span style={{ color: OsakaJadePalette.jade.glow }}>
                        <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Industrial Flowsheet Templates & Examples */}
          <div
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 12,
              padding: 20
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Workflow size={18} color={OsakaJadePalette.jade[400]} />
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: OsakaJadePalette.text.primary }}>
                Industrial Templates & Line Examples
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Template 1: Sherwin-Williams */}
              <div
                onClick={() => onSelectTemplate('sherwin-williams-paint-line')}
                style={{
                  padding: 14,
                  backgroundColor: OsakaJadePalette.background.canvas,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = OsakaJadePalette.jade[600];
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = OsakaJadePalette.border.default;
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                    Sherwin-Williams Architectural Paint Canning Line
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      color: OsakaJadePalette.text.accent
                    }}
                  >
                    6 Machines • 120 CPM
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: OsakaJadePalette.text.muted }}>
                    SYS // LINE-CAN-01
                  </span>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 3,
                      backgroundColor: theme === 'dark' ? 'rgba(45, 213, 183, 0.08)' : 'rgba(35, 148, 104, 0.08)',
                      border: `1px solid ${OsakaJadePalette.border.strong}`,
                      fontSize: 11,
                      fontFamily: '"JetBrains Mono", monospace',
                      color: OsakaJadePalette.text.accent,
                      fontWeight: 600,
                      letterSpacing: '0.02em'
                    }}
                  >
                    <span>LAUNCH STUDIO</span>
                    <ArrowRight size={12} />
                  </div>
                </div>
              </div>

              {/* Template 2: Beverage Bottling */}
              <div
                onClick={() => onSelectTemplate('beverage-bottling-line')}
                style={{
                  padding: 14,
                  backgroundColor: OsakaJadePalette.background.canvas,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = OsakaJadePalette.jade[600];
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = OsakaJadePalette.border.default;
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                    High-Speed Beverage Bottling & Packaging Line
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      backgroundColor: 'rgba(14, 165, 233, 0.15)',
                      color: '#38bdf8'
                    }}
                  >
                    5 Machines • 300 BPM
                  </span>
                </div>
                <p style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, margin: '6px 0 10px 0', lineHeight: 1.4 }}>
                  Continuous carbonation vessel, high-speed rotary rinser/filler, crown capper, accumulation conveyor, and case tray shrink-packager.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: OsakaJadePalette.text.muted }}>
                    SYS // LINE-BOT-02
                  </span>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 3,
                      backgroundColor: theme === 'dark' ? 'rgba(14, 165, 233, 0.08)' : 'rgba(2, 132, 199, 0.08)',
                      border: `1px solid rgba(56, 189, 248, 0.3)`,
                      fontSize: 11,
                      fontFamily: '"JetBrains Mono", monospace',
                      color: '#38bdf8',
                      fontWeight: 600,
                      letterSpacing: '0.02em'
                    }}
                  >
                    <span>LAUNCH STUDIO</span>
                    <ArrowRight size={12} />
                  </div>
                </div>
              </div>

              {/* Template 3: Blank Canvas */}
              <div
                onClick={onCreateBlank}
                style={{
                  padding: 14,
                  backgroundColor: OsakaJadePalette.background.canvas,
                  border: `1px dashed ${OsakaJadePalette.border.default}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = OsakaJadePalette.jade[600];
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = OsakaJadePalette.border.default;
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                    Custom Blank Process Forge
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: OsakaJadePalette.text.muted
                    }}
                  >
                    Empty Canvas
                  </span>
                </div>
                <p style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, margin: '6px 0 10px 0', lineHeight: 1.4 }}>
                  A clean grid ready for your custom process equipment, ASME nozzles, instrument loops, and unit-op CAD configurations.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: OsakaJadePalette.text.muted }}>
                    SYS // SCRATCH-CANVAS
                  </span>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 3,
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      fontSize: 11,
                      fontFamily: '"JetBrains Mono", monospace',
                      color: OsakaJadePalette.text.primary,
                      fontWeight: 600,
                      letterSpacing: '0.02em'
                    }}
                  >
                    <span>INITIALIZE BLANK</span>
                    <Plus size={12} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Overarching Agent Command Center, Account & Subscriptions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Overarching Agent Command Center */}
          <div
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.glow}`,
              borderRadius: 12,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: `${OsakaJadePalette.jade[500]}1a`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${OsakaJadePalette.jade[500]}44`
                  }}
                >
                  <ProcessForgeEmblem size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: OsakaJadePalette.text.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Plant Orchestrator</span>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: hasKey ? OsakaJadePalette.jade[500] : OsakaJadePalette.status.failed,
                        boxShadow: hasKey ? `0 0 6px ${OsakaJadePalette.jade.glow}` : undefined
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, fontFamily: '"JetBrains Mono", monospace' }}>
                    Plant Orchestrator • {hasKey ? creds.provider.toUpperCase() : 'Locked (Add API Key)'}
                  </div>
                </div>
              </div>

              <button
                onClick={onOpenAiModal}
                style={{
                  background: 'none',
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: 4,
                  padding: '4px 8px',
                  color: OsakaJadePalette.text.secondary,
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Cpu size={12} />
                <span>Config</span>
              </button>
            </div>

            {/* Agent Conversation Box or Security Lockout Gate */}
            {!lockStatus.unlocked ? (
              <div
                style={{
                  backgroundColor: OsakaJadePalette.background.canvas,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: 8,
                  padding: '24px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: 12,
                  marginBottom: 10
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: OsakaJadePalette.status.failed
                  }}
                >
                  <Lock size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary, marginBottom: 4 }}>
                    Plant Orchestrator Locked
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary, maxWidth: 320, lineHeight: 1.5 }}>
                    For your security and privacy, agent orchestration is locked until credentials (API key or active local MCP connection) are detected.
                  </div>
                </div>
                <button
                  onClick={onOpenAiModal}
                  style={{
                    marginTop: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: OsakaJadePalette.jade[500],
                    color: OsakaJadePalette.text.inverse,
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: `0 0 12px ${OsakaJadePalette.jade.glow}`,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <KeyRound size={13} />
                  <span>Unlock Agent / Add Credentials</span>
                </button>
              </div>
            ) : (
              <>
                {/* Agent Conversation Box */}
                <div
                  style={{
                    height: 220,
                    overflowY: 'auto',
                    backgroundColor: OsakaJadePalette.background.canvas,
                    border: `1px solid ${OsakaJadePalette.border.default}`,
                    borderRadius: 8,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    marginBottom: 10
                  }}
                >
                  {agentConversation.map((m) => {
                    const isUser = m.sender === 'user';
                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: isUser ? 'flex-end' : 'flex-start',
                          maxWidth: '88%',
                          backgroundColor: isUser
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${isUser ? OsakaJadePalette.jade[600] : OsakaJadePalette.border.default}`,
                          borderRadius: 8,
                          padding: '8px 10px',
                          fontSize: 12,
                          color: OsakaJadePalette.text.primary,
                          lineHeight: 1.45
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: isUser ? OsakaJadePalette.text.accent : OsakaJadePalette.text.secondary,
                            marginBottom: 3,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <span>{m.senderTitle}</span>
                          {m.modelBadge && (
                            <span
                              style={{
                                fontSize: 9,
                                backgroundColor: 'rgba(255,255,255,0.06)',
                                padding: '1px 4px',
                                borderRadius: 3,
                                color: OsakaJadePalette.text.muted
                              }}
                            >
                              {m.modelBadge}
                            </span>
                          )}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                      </div>
                    );
                  })}
                  {isAgentThinking && (
                    <div
                      style={{
                        alignSelf: 'flex-start',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        color: OsakaJadePalette.text.muted
                      }}
                    >
                      <Loader2 size={14} className="animate-spin" color={OsakaJadePalette.jade.glow} />
                      <span>Orchestrator reasoning...</span>
                    </div>
                  )}
                </div>

                {/* Quick Prompts */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {[
                    'Audit line bottleneck',
                    'Design 120 cpm canning line',
                    'ASME B16.5 nozzle sizing'
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAgentSend(p)}
                      disabled={isAgentThinking}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        border: `1px solid ${OsakaJadePalette.border.default}`,
                        borderRadius: 4,
                        padding: '3px 8px',
                        color: OsakaJadePalette.text.secondary,
                        fontSize: 10,
                        cursor: 'pointer'
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* Prompt Input */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={agentInput}
                    onChange={(e) => setAgentInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAgentSend();
                    }}
                    placeholder="Query plant solver or specify equipment parameters..."
                    style={{
                      flex: 1,
                      backgroundColor: OsakaJadePalette.background.canvas,
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      borderRadius: 6,
                      padding: '8px 10px',
                      fontSize: 12,
                      color: OsakaJadePalette.text.primary,
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => handleAgentSend()}
                    disabled={!agentInput.trim() || isAgentThinking}
                    style={{
                      backgroundColor: agentInput.trim() && !isAgentThinking ? OsakaJadePalette.jade[600] : 'rgba(255,255,255,0.05)',
                      border: 'none',
                      borderRadius: 6,
                      padding: '0 12px',
                      color: '#fff',
                      cursor: agentInput.trim() && !isAgentThinking ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Send size={14} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Account & Cloud Sync Hub Card */}
          <div
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 12,
              padding: 20
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={18} color={OsakaJadePalette.jade[400]} />
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: OsakaJadePalette.text.primary }}>
                  Engineering Account & Sync
                </h2>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  backgroundColor: isAuthenticated ? `${OsakaJadePalette.jade.glow}26` : `${OsakaJadePalette.status.blocked}26`,
                  color: isAuthenticated ? OsakaJadePalette.text.accent : OsakaJadePalette.status.blocked
                }}
              >
                {isAuthenticated ? `${user?.plan || 'Professional'} Plan` : 'Guest Mode'}
              </span>
            </div>

            <div style={{ fontSize: 13, color: OsakaJadePalette.text.primary, fontWeight: 600 }}>
              {isAuthenticated ? user?.name : 'Local Guest Engineer'}
            </div>
            <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted, marginTop: 2 }}>
              {isAuthenticated ? `${user?.email} • ${user?.organization || 'Process Engineering'}` : 'Sign in with Google to sync cloud projects and unlock higher quotas.'}
            </div>

            {/* Quota Bar */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: OsakaJadePalette.text.secondary, marginBottom: 4 }}>
                <span>Cloud Simulation Quota</span>
                <span>{cloudProjects.length} / {user?.cloudStorageQuota?.maxProjects || 25} Projects</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, ((cloudProjects.length) / (user?.cloudStorageQuota?.maxProjects || 25)) * 100)}%`,
                    height: '100%',
                    backgroundColor: OsakaJadePalette.jade[500],
                    borderRadius: 3
                  }}
                />
              </div>
            </div>

            <button
              onClick={onOpenAccountModal}
              style={{
                width: '100%',
                marginTop: 14,
                padding: '9px 12px',
                borderRadius: 4,
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.primary,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: '"JetBrains Mono", monospace',
                letterSpacing: '0.02em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.12s ease'
              }}
            >
              <span>{isAuthenticated ? 'MANAGE ACCOUNT & QUOTAS' : 'SIGN IN WITH GOOGLE'}</span>
              <ExternalLink size={12} />
            </button>
          </div>

          {/* Model Providers Subscription Card */}
          <div
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 12,
              padding: 20
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={18} color={OsakaJadePalette.jade[400]} />
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: OsakaJadePalette.text.primary }}>
                  Model Providers & Subscriptions
                </h2>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  backgroundColor: hasKey ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                  color: hasKey ? OsakaJadePalette.text.accent : OsakaJadePalette.text.muted
                }}
              >
                {hasKey ? 'Active Key' : 'No Key Linked'}
              </span>
            </div>

            <p style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, margin: '0 0 14px 0', lineHeight: 1.4 }}>
              Bring your existing subscription from <strong>Anthropic Claude</strong>, <strong>Google Gemini</strong>, <strong>OpenAI</strong>, or run locally on <strong>Ollama</strong>. Keys are stored strictly on your local browser.
            </p>

            <button
              onClick={onOpenAiModal}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 4,
                backgroundColor: theme === 'dark' ? 'rgba(45, 213, 183, 0.1)' : 'rgba(35, 148, 104, 0.1)',
                border: `1px solid ${OsakaJadePalette.border.glow}`,
                color: OsakaJadePalette.text.accent,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: '"JetBrains Mono", monospace',
                letterSpacing: '0.02em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.12s ease'
              }}
            >
              <Sliders size={13} />
              <span>CONFIGURE AI SUBSCRIPTIONS</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
