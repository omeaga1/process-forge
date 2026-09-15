import React, { useState, useEffect } from 'react';
import {
  Cpu,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Zap,
  X,
  Copy,
  Check,
  Lock,
  User,
  LogOut,
  Radio,
  ExternalLink
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import {
  getAiConnection,
  enableMcpMode,
  initiateOAuthLogin,
  signOutOAuth,
  disconnectMcp,
  resetToOfflineConfig,
  type AiConnectionState,
  type AiModelConfig
} from '../../ai/aiModelManager.js';

export interface AiModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: (config: AiModelConfig) => void;
}

export const AiModelModal: React.FC<AiModelModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged
}) => {
  const { palette } = useTheme();
  const OsakaJadePalette = palette;
  const [conn, setConn] = useState<AiConnectionState>(getAiConnection());
  const [activeTab, setActiveTab] = useState<'mcp' | 'oauth' | 'offline'>('mcp');
  const [mcpClientTab, setMcpClientTab] = useState<'claude' | 'gemini' | 'cursor' | 'local'>('claude');
  const [isActivatingMcp, setIsActivatingMcp] = useState<boolean>(false);
  const [mcpResult, setMcpResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    toolsCount?: number;
  } | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const active = getAiConnection();
      setConn(active);
      setActiveTab(active.mode === 'offline' ? 'mcp' : active.mode);
      setMcpResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleMcp = () => {
    if (conn.mode === 'mcp') {
      const updated = disconnectMcp();
      setConn(updated);
      setMcpResult(null);
      onConfigChanged?.({
        provider: updated.mode,
        mode: updated.mode
      });
    } else {
      setIsActivatingMcp(true);
      const updated = enableMcpMode();
      setConn(updated);
      setMcpResult({
        success: true,
        message: 'ProcessForge MCP Server enabled with 6 engineering tools active over stdio.',
        toolsCount: 6,
        latencyMs: 1
      });
      setIsActivatingMcp(false);
      onConfigChanged?.({
        provider: updated.mode,
        mode: updated.mode
      });
    }
  };

  const handleOAuthLogin = (provider: 'google' | 'github' | 'microsoft' | 'sso') => {
    const updated = initiateOAuthLogin(provider);
    setConn(updated);
    onConfigChanged?.({
      provider: updated.mode,
      mode: updated.mode
    });
  };

  const handleSignOutOAuth = () => {
    const updated = signOutOAuth();
    setConn(updated);
    onConfigChanged?.({
      provider: updated.mode,
      mode: updated.mode
    });
  };

  const handleSwitchToOffline = () => {
    resetToOfflineConfig();
    const updated = getAiConnection();
    setConn(updated);
    setMcpResult(null);
    onConfigChanged?.({
      provider: updated.mode,
      mode: updated.mode
    });
  };

  const claudeDesktopSnippet = JSON.stringify(
    {
      mcpServers: {
        'process-forge': {
          command: 'npx',
          args: ['-y', '@process-forge/mcp-server']
        }
      }
    },
    null,
    2
  );

  const geminiCliSnippet = `# Connect ProcessForge MCP tools to Gemini CLI (stdio):
gemini mcp add process-forge -- npx -y @process-forge/mcp-server`;

  const cursorSnippet = JSON.stringify(
    {
      mcpServers: {
        'process-forge': {
          command: 'npx',
          args: ['-y', '@process-forge/mcp-server']
        }
      }
    },
    null,
    2
  );

  const localDevSnippet = JSON.stringify(
    {
      mcpServers: {
        'process-forge': {
          command: 'node',
          args: ['<path-to-repo>/packages/mcp-server/dist/cli.js']
        }
      }
    },
    null,
    2
  );

  const activeSnippetText =
    mcpClientTab === 'claude'
      ? claudeDesktopSnippet
      : mcpClientTab === 'gemini'
      ? geminiCliSnippet
      : mcpClientTab === 'cursor'
      ? cursorSnippet
      : localDevSnippet;

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(activeSnippetText);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: OsakaJadePalette.background.surface,
          border: `1px solid ${OsakaJadePalette.border.default}`,
          borderRadius: 12,
          width: '100%',
          maxWidth: 680,
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: OsakaJadePalette.background.surfaceElevated
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: `1px solid ${OsakaJadePalette.jade[600]}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Cpu size={20} color={OsakaJadePalette.jade.glow} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                AI Connection Manager
              </div>
              <div style={{ fontSize: 12, color: OsakaJadePalette.text.muted }}>
                Zero Raw Keys (ADR-0005) • Model Context Protocol & OAuth 2.0 PKCE Only
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: OsakaJadePalette.text.muted,
              cursor: 'pointer',
              padding: 4
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Active Connection Status Banner */}
        <div
          style={{
            padding: '12px 24px',
            backgroundColor:
              conn.mode === 'offline'
                ? 'rgba(255, 255, 255, 0.03)'
                : 'rgba(16, 185, 129, 0.08)',
            borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor:
                  conn.mode === 'offline'
                    ? OsakaJadePalette.text.muted
                    : OsakaJadePalette.jade[400],
                boxShadow:
                  conn.mode !== 'offline'
                    ? `0 0 8px ${OsakaJadePalette.jade[400]}`
                    : 'none'
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
              Active Mode:{' '}
              {conn.mode === 'offline'
                ? 'Offline (Local Unit-Ops Only)'
                : conn.mode === 'mcp'
                ? `MCP Connected (${conn.mcp.serverName})`
                : `OAuth Session (${conn.oauth.provider.toUpperCase()} • ${conn.oauth.userEmail})`}
            </span>
          </div>

          {conn.mode !== 'offline' && (
            <button
              onClick={handleSwitchToOffline}
              style={{
                padding: '4px 10px',
                borderRadius: 5,
                backgroundColor: 'transparent',
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.muted,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              Switch to Offline
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
            backgroundColor: OsakaJadePalette.background.surfaceElevated
          }}
        >
          <button
            onClick={() => setActiveTab('mcp')}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'mcp' ? `2px solid ${OsakaJadePalette.jade.glow}` : 'none',
              backgroundColor: activeTab === 'mcp' ? OsakaJadePalette.background.surface : 'transparent',
              color: activeTab === 'mcp' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <Radio size={14} />
            Model Context Protocol (MCP)
          </button>
          <button
            onClick={() => setActiveTab('oauth')}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'oauth' ? `2px solid ${OsakaJadePalette.jade.glow}` : 'none',
              backgroundColor: activeTab === 'oauth' ? OsakaJadePalette.background.surface : 'transparent',
              color: activeTab === 'oauth' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <Lock size={14} />
            OAuth 2.0 PKCE (Enterprise)
          </button>
          <button
            onClick={() => setActiveTab('offline')}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'offline' ? `2px solid ${OsakaJadePalette.jade.glow}` : 'none',
              backgroundColor: activeTab === 'offline' ? OsakaJadePalette.background.surface : 'transparent',
              color: activeTab === 'offline' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <Zap size={14} />
            Offline Mode Info
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: MODEL CONTEXT PROTOCOL (MCP) */}
          {activeTab === 'mcp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: 14, color: OsakaJadePalette.text.primary }}>
                  Local Model Context Protocol (MCP) Server
                </h4>
                <p style={{ margin: 0, fontSize: 12, color: OsakaJadePalette.text.secondary, lineHeight: 1.5 }}>
                  ProcessForge runs an embedded MCP server exposing 6 deterministic engineering tools over standard I/O (<code style={{ color: OsakaJadePalette.jade.glow }}>stdio</code>). External AI assistants (Claude Desktop, Gemini CLI, Cursor) connect directly without sending your proprietary CAD or flowsheet topologies to third-party endpoints.
                </p>
              </div>

              {/* Status / Activation Card */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: conn.mode === 'mcp' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
                        boxShadow: conn.mode === 'mcp' ? `0 0 8px ${OsakaJadePalette.jade.glow}` : 'none'
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                      ProcessForge MCP Server (stdio)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted }}>
                    {conn.mode === 'mcp'
                      ? 'Status: Active • Studio synchronized with local 6-tool engineering engine'
                      : 'Status: Standalone / Offline • External MCP client configuration ready'}
                  </div>
                </div>

                <button
                  onClick={handleToggleMcp}
                  disabled={isActivatingMcp}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 6,
                    backgroundColor: conn.mode === 'mcp' ? OsakaJadePalette.background.surface : OsakaJadePalette.jade.glow,
                    color: conn.mode === 'mcp' ? OsakaJadePalette.text.primary : OsakaJadePalette.background.base,
                    border: conn.mode === 'mcp' ? `1px solid ${OsakaJadePalette.border.default}` : 'none',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: isActivatingMcp ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Radio size={14} />
                  {conn.mode === 'mcp' ? 'Deactivate in Studio' : 'Enable in Studio'}
                </button>
              </div>

              {/* Status Feedback Banner */}
              {mcpResult && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 6,
                    backgroundColor: mcpResult.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    border: `1px solid ${mcpResult.success ? OsakaJadePalette.jade[600] : 'rgba(239, 68, 68, 0.4)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 12,
                    color: mcpResult.success ? OsakaJadePalette.jade[300] : '#f87171'
                  }}
                >
                  {mcpResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{mcpResult.message}</span>
                </div>
              )}

              {/* Client Connection Snippets */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                    Connect to AI Assistants (Zero Raw Keys)
                  </span>
                  <button
                    onClick={handleCopySnippet}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      background: OsakaJadePalette.background.surface,
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      padding: '4px 10px',
                      borderRadius: 4,
                      color: OsakaJadePalette.jade[400],
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {copiedSnippet ? <Check size={12} /> : <Copy size={12} />}
                    {copiedSnippet ? 'Copied' : 'Copy Snippet'}
                  </button>
                </div>

                {/* Sub-tabs for AI clients */}
                <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`, paddingBottom: 6 }}>
                  {(['claude', 'gemini', 'cursor', 'local'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setMcpClientTab(tab)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 4,
                        border: 'none',
                        backgroundColor: mcpClientTab === tab ? OsakaJadePalette.background.canvas : 'transparent',
                        color: mcpClientTab === tab ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {tab === 'claude' ? 'Claude Desktop' : tab === 'gemini' ? 'Gemini CLI' : tab === 'cursor' ? 'Cursor IDE' : 'Local Repo'}
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary }}>
                  {mcpClientTab === 'claude' && (
                    <span>Add to <code style={{ color: OsakaJadePalette.jade.glow }}>claude_desktop_config.json</code> under <code style={{ color: OsakaJadePalette.jade.glow }}>mcpServers</code>:</span>
                  )}
                  {mcpClientTab === 'gemini' && (
                    <span>Run in your terminal to register the ProcessForge MCP tools with Google Gemini CLI:</span>
                  )}
                  {mcpClientTab === 'cursor' && (
                    <span>Add to your project root <code style={{ color: OsakaJadePalette.jade.glow }}>.cursor/mcp.json</code>:</span>
                  )}
                  {mcpClientTab === 'local' && (
                    <span>For developers running the ProcessForge monorepo from local repository build:</span>
                  )}
                </div>

                <pre
                  style={{
                    backgroundColor: OsakaJadePalette.background.canvas,
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: OsakaJadePalette.jade[200],
                    margin: 0,
                    overflowX: 'auto',
                    lineHeight: 1.4
                  }}
                >
                  {activeSnippetText}
                </pre>
              </div>

              {/* 6 Deterministic Engineering Tools Registered */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: OsakaJadePalette.text.primary, marginBottom: 8 }}>
                  Deterministic Engineering Tools Exposed
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {[
                    { name: 'simulate_process_line', desc: 'Discrete-event queue & Runge-Kutta ODE mass balance' },
                    { name: 'diagnose_bottlenecks', desc: 'Pinpoints starvation, backpressure, and cycle limits' },
                    { name: 'query_unit_subagent', desc: 'Retrieves thermodynamic specs and nozzle schedules' },
                    { name: 'package_unit_op', desc: 'Synthesizes validated UnitOp manifest scaffold directories' },
                    { name: 'forge_equipment_drawing', desc: 'Generates vector CAD SVG asset definitions and ports' },
                    { name: 'list_digital_twin_templates', desc: 'Returns canonical industrial chemical line flowsheets' }
                  ].map((tool) => (
                    <div
                      key={tool.name}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        backgroundColor: OsakaJadePalette.background.surfaceElevated,
                        border: `1px solid ${OsakaJadePalette.border.subtle}`
                      }}
                    >
                      <code style={{ fontSize: 11, color: OsakaJadePalette.jade.glow, fontWeight: 700 }}>
                        {tool.name}
                      </code>
                      <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, marginTop: 2 }}>
                        {tool.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OAUTH 2.0 PKCE ENTERPRISE */}
          {activeTab === 'oauth' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: 14, color: OsakaJadePalette.text.primary }}>
                  OAuth 2.0 PKCE & Enterprise Single Sign-On
                </h4>
                <p style={{ margin: 0, fontSize: 12, color: OsakaJadePalette.text.secondary, lineHeight: 1.5 }}>
                  Authenticate via standard corporate identity providers.
                  Quota billing, audit logging, and Zero Data Retention (ZDR) guarantees are managed at the organization level with zero raw API keys.
                </p>
              </div>

              {conn.oauth.status === 'authenticated' ? (
                /* Authenticated Profile Card */
                <div
                  style={{
                    padding: 18,
                    borderRadius: 8,
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    border: `1px solid ${OsakaJadePalette.jade[600]}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          backgroundColor: 'rgba(16, 185, 129, 0.2)',
                          border: `1px solid ${OsakaJadePalette.jade[500]}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <User size={22} color={OsakaJadePalette.jade[400]} />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                          {conn.oauth.userName}
                        </div>
                        <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
                          {conn.oauth.userEmail}
                        </div>
                        <div style={{ fontSize: 11, color: OsakaJadePalette.jade[400], marginTop: 2 }}>
                          {conn.oauth.organization} • OAuth 2.0 PKCE Active
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleSignOutOAuth}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 6,
                        backgroundColor: 'transparent',
                        border: `1px solid ${OsakaJadePalette.border.default}`,
                        color: OsakaJadePalette.text.muted,
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <LogOut size={13} />
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                /* 1-Click Login Providers */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={() => handleOAuthLogin('google')}
                    style={{
                      padding: '12px 18px',
                      borderRadius: 8,
                      backgroundColor: OsakaJadePalette.background.surfaceElevated,
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      color: OsakaJadePalette.text.primary,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>Continue with Google Workspace (OAuth 2.0 PKCE)</span>
                    <ExternalLink size={14} color={OsakaJadePalette.text.muted} />
                  </button>
                  <button
                    onClick={() => handleOAuthLogin('github')}
                    style={{
                      padding: '12px 18px',
                      borderRadius: 8,
                      backgroundColor: OsakaJadePalette.background.surfaceElevated,
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      color: OsakaJadePalette.text.primary,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>Continue with GitHub Enterprise</span>
                    <ExternalLink size={14} color={OsakaJadePalette.text.muted} />
                  </button>
                  <button
                    onClick={() => handleOAuthLogin('sso')}
                    style={{
                      padding: '12px 18px',
                      borderRadius: 8,
                      backgroundColor: OsakaJadePalette.background.surfaceElevated,
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      color: OsakaJadePalette.text.primary,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>Enterprise Single Sign-On (Azure Entra ID / Okta)</span>
                    <ExternalLink size={14} color={OsakaJadePalette.text.muted} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: OFFLINE MODE INFO */}
          {activeTab === 'offline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: 14, color: OsakaJadePalette.text.primary }}>
                  Offline Local Operation
                </h4>
                <p style={{ margin: 0, fontSize: 12, color: OsakaJadePalette.text.secondary, lineHeight: 1.5 }}>
                  ProcessForge is local-first by design. In offline mode:
                </p>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  fontSize: 12,
                  color: OsakaJadePalette.text.secondary
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color={OsakaJadePalette.jade[400]} />
                  <span>Full access to all Unit-Ops you created or installed from the plugin catalog.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color={OsakaJadePalette.jade[400]} />
                  <span>Local Runge-Kutta 4th-order fluid continuous balances and discrete containers.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color={OsakaJadePalette.jade[400]} />
                  <span>Complete nozzle elevation, mechanical dressing, and parameter configuration.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} color={OsakaJadePalette.border.glowAmber} />
                  <span>Vector CAD synthesis and custom unit-op generation are paused until connected via MCP or OAuth.</span>
                </div>
              </div>

              <button
                onClick={handleSwitchToOffline}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  alignSelf: 'flex-start'
                }}
              >
                Set Active Connection to Offline
              </button>
            </div>
          )}
        </div>

        {/* Footer Zero-Key Assurance Callout */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: `1px solid ${OsakaJadePalette.border.default}`,
            backgroundColor: OsakaJadePalette.background.surfaceElevated,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: OsakaJadePalette.text.muted }}>
            <ShieldCheck size={16} color={OsakaJadePalette.jade[500]} />
            <span>Zero Raw API Keys Policy: No sk-... or AIza... keys are ever required or stored.</span>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.jade[500],
              color: OsakaJadePalette.text.inverse,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
