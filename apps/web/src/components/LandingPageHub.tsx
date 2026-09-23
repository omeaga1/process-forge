import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  Cloud,
  Cpu,
  User,
  ArrowRight,
  Upload,
  Trash2,
  ExternalLink,
  Loader2,
  Sun,
  Moon,
  ChevronRight,
  Database,
  Workflow,
  Terminal,
  Sliders
} from 'lucide-react';
import {
  useTheme,
  getLlmCredentials,
  getAiConnection,
  isAgentChatUnlocked,
  ProcessForgeLogo,
  ProcessForgeEmblem
} from '@process-forge/canvas-ui';
import type { SimulationProject } from '@process-forge/protocol';
import { SHERWIN_WILLIAMS_PAINT_LINE } from '@process-forge/canvas-ui';
import { simulateProcess } from '@process-forge/simulation-core';
import { draftingRadius } from '@process-forge/theme';
import { useAccount } from '../auth/useAccount.js';
import { hasCloudSession } from '../auth/accountManager.js';
import {
  listUserCloudProjects,
  deleteProjectFromCloud,
  resolveProjectBundle,
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

  /**
   * The template card's figures, computed from the template itself.
   *
   * It previously read "6 Machines • 120 CPM". The machine count was right; the
   * rate was not -- the engine gives roughly a third of that for this line. A
   * number typed into a card is a number that will be wrong, so this one is
   * derived: the node count from the graph, the throughput from an actual run.
   */
  const paintLineSummary = useMemo(() => {
    const machines = SHERWIN_WILLIAMS_PAINT_LINE.nodes.length;
    try {
      const result = simulateProcess(SHERWIN_WILLIAMS_PAINT_LINE, 30);
      return `${machines} machines • ${Math.round(result.averageLineThroughputUnitsPerMin)} CPM`;
    } catch {
      return `${machines} machines`;
    }
  }, []);
  const OsakaJadePalette = palette;
  const { user, isAuthenticated } = useAccount();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cloudProjects, setCloudProjects] = useState<CloudProjectRecord[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true);
  const [creds, setCreds] = useState(() => getLlmCredentials());
  const [aiConn, setAiConn] = useState(() => getAiConnection());
  const lockStatus = isAgentChatUnlocked(aiConn, creds);
  const hasKey = lockStatus.unlocked;


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
            linear-gradient(rgba(113, 206, 173, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(113, 206, 173, 0.05) 1px, transparent 1px)
          `
          : `
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
              borderRadius: draftingRadius.soft,
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
                borderRadius: draftingRadius.soft,
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
          {/* AI Model Status */}
          <button
            onClick={onOpenAiModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 12px',
              borderRadius: draftingRadius.soft,
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
              borderRadius: draftingRadius.soft,
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
              borderRadius: draftingRadius.soft,
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
              borderRadius: draftingRadius.soft,
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
              }}
            />
            PROJECTS
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
          Your flowsheets
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
          Open a project, start from a template, or design a unit operation of your own. Every result on the canvas comes from the simulation engine.
        </p>

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
          {/* Primary Action: Open Studio */}
          <button
            onClick={onOpenStudio}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 20px',
              borderRadius: draftingRadius.soft,
              backgroundColor: OsakaJadePalette.jade[600],
              border: `1px solid ${OsakaJadePalette.jade[400]}`,
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: '"JetBrains Mono", monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              transition: 'all 0.12s ease'
            }}
            title="Launch Interactive Canvas Studio"
          >
            <Terminal size={16} strokeWidth={2.5} />
            {/* Resumes the project in progress; it never starts a new one. */}
            <span>
              {currentProject.graph.nodes.length > 0
                ? `Resume ${currentProject.name}`
                : 'Open the studio'}
            </span>
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
              borderRadius: draftingRadius.soft,
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

          {onOpenForgeHub && (
            <button
              onClick={onOpenForgeHub}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 16px',
                borderRadius: draftingRadius.soft,
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
              <span>Community library</span>
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 14px',
              borderRadius: draftingRadius.soft,
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
              borderRadius: draftingRadius.soft,
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
              borderRadius: draftingRadius.soft,
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
                  borderRadius: draftingRadius.soft,
                  border: `1px dashed ${OsakaJadePalette.border.default}`
                }}
              >
                <Database size={24} color={OsakaJadePalette.text.muted} style={{ margin: '0 auto 8px auto' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                  No Cloud Projects Yet
                </div>
                <div style={{ fontSize: 12, color: OsakaJadePalette.text.muted, marginTop: 4 }}>
                  Projects you save to ProcessForge Cloud appear here, on any device you sign in on.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cloudProjects.slice(0, 3).map((cp) => (
                  <div
                    key={cp.id}
                    onClick={() => void resolveProjectBundle(cp, user).then((b) => b && onOpenProject(b))}
                    style={{
                      padding: '12px 14px',
                      backgroundColor: OsakaJadePalette.background.canvas,
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      borderRadius: draftingRadius.soft,
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
                          borderRadius: draftingRadius.soft,
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          border: `1px solid rgba(16, 185, 129, 0.25)`,
                          color: OsakaJadePalette.text.accent,
                          fontWeight: 600
                        }}
                      >
                        {cp.syncStatus === 'synced' ? 'In the cloud' : cp.syncStatus === 'failed' ? 'Cloud save failed' : 'This device'}
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
              borderRadius: draftingRadius.soft,
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
              {/* Template 1: architectural paint line */}
              <div
                onClick={() => onSelectTemplate('sherwin-williams-paint-line')}
                style={{
                  padding: 14,
                  backgroundColor: OsakaJadePalette.background.canvas,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: draftingRadius.soft,
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
                    Architectural Paint Canning Line
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: draftingRadius.soft,
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      color: OsakaJadePalette.text.accent
                    }}
                  >
                    {paintLineSummary}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: OsakaJadePalette.text.muted }}>
                  </span>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: draftingRadius.soft,
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
                  borderRadius: draftingRadius.soft,
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
                      borderRadius: draftingRadius.soft,
                      backgroundColor: 'rgba(14, 165, 233, 0.15)',
                      color: '#38bdf8'
                    }}
                  >
                    5 machines
                  </span>
                </div>
                <p style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, margin: '6px 0 10px 0', lineHeight: 1.4 }}>
                  Continuous carbonation vessel, high-speed rotary rinser/filler, crown capper, accumulation conveyor, and case tray shrink-packager.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: OsakaJadePalette.text.muted }}>
                  </span>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: draftingRadius.soft,
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
                  borderRadius: draftingRadius.soft,
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
                    Blank flowsheet
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: draftingRadius.soft,
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: OsakaJadePalette.text.muted
                    }}
                  >
                    Empty Canvas
                  </span>
                </div>
                <p style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, margin: '6px 0 10px 0', lineHeight: 1.4 }}>
                  An empty flowsheet. Add standard equipment, or design your own unit operation.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: OsakaJadePalette.text.muted }}>
                  </span>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: draftingRadius.soft,
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
          {/* Account & Cloud Sync Hub Card */}
          <div
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: draftingRadius.soft,
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
                  borderRadius: draftingRadius.soft,
                  backgroundColor: isAuthenticated ? `${OsakaJadePalette.jade.glow}26` : `${OsakaJadePalette.status.blocked}26`,
                  color: isAuthenticated ? OsakaJadePalette.text.accent : OsakaJadePalette.status.blocked
                }}
              >
                {isAuthenticated ? (hasCloudSession(user) ? 'Google account' : 'Profile on this device') : 'Not signed in'}
              </span>
            </div>

            <div style={{ fontSize: 13, color: OsakaJadePalette.text.primary, fontWeight: 600 }}>
              {isAuthenticated ? user?.name : 'Local Guest Engineer'}
            </div>
            <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted, marginTop: 2 }}>
              {isAuthenticated ? `${user?.email} • ${user?.organization || 'Process Engineering'}` : 'Sign in with Google to keep a copy of your projects in ProcessForge Cloud.'}
            </div>

            <button
              onClick={onOpenAccountModal}
              style={{
                width: '100%',
                marginTop: 14,
                padding: '9px 12px',
                borderRadius: draftingRadius.soft,
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
              <span>{isAuthenticated ? 'Account' : 'Sign in with Google'}</span>
              <ExternalLink size={12} />
            </button>
          </div>

          {/* Model Providers Subscription Card */}
          <div
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: draftingRadius.soft,
              padding: 20
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={18} color={OsakaJadePalette.jade[400]} />
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: OsakaJadePalette.text.primary }}>
                  AI model
                </h2>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: draftingRadius.soft,
                  backgroundColor: hasKey ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                  color: hasKey ? OsakaJadePalette.text.accent : OsakaJadePalette.text.muted
                }}
              >
                {hasKey ? 'Active Key' : 'No Key Linked'}
              </span>
            </div>

            <p style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, margin: '0 0 14px 0', lineHeight: 1.4 }}>
              Use Claude in the app with your own API key (or Gemini, OpenAI, or a local Ollama model), or from Claude Desktop on your Claude subscription. Keys are stored only on this device — in the OS keychain in the desktop app, in local storage in a browser — and sent only to the provider they belong to.
            </p>

            <button
              onClick={onOpenAiModal}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: draftingRadius.soft,
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
              <span>Choose how to use Claude</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
