import React, { useEffect, useState } from 'react';
import { User, ArrowRight, ExternalLink, Sun, Moon, Sliders, Cpu, Library } from 'lucide-react';
import {
  useTheme,
  getLlmCredentials,
  getAiConnection,
  isAgentChatUnlocked,
  useAssistantRoute,
  ProcessForgeLogo
} from '@process-forge/canvas-ui';
import type { SimulationProject } from '@process-forge/protocol';
import { draftingRadius } from '@process-forge/theme';
import { useAccount } from '../auth/useAccount.js';
import { hasCloudSession } from '../auth/accountManager.js';
import { ProjectBrowser } from './ProjectBrowser.js';

interface LandingPageHubProps {
  currentProject: SimulationProject;
  onNavigateLanding?: () => void;
  onNewProject: (templateKey: string) => void;
  onOpenProject: (project: SimulationProject) => void;
  onImportFile: (file: File) => void;
  onRenameCurrent: (name: string) => void;
  onOpenStudio: () => void;
  onOpenForgeHub?: () => void;
  onOpenAiModal: () => void;
  onOpenAccountModal: (tab?: 'email' | 'google') => void;
}

/**
 * The Studio Hub: every project (the same browser the studio opens with
 * Ctrl+O), plus account and AI model status. The desktop app opens here.
 */
export const LandingPageHub: React.FC<LandingPageHubProps> = ({
  currentProject,
  onNavigateLanding,
  onNewProject,
  onOpenProject,
  onImportFile,
  onRenameCurrent,
  onOpenStudio,
  onOpenForgeHub,
  onOpenAiModal,
  onOpenAccountModal
}) => {
  const { palette, theme, toggleTheme, font } = useTheme();
  const { user, isAuthenticated } = useAccount();
  const route = useAssistantRoute();
  const [creds, setCreds] = useState(() => getLlmCredentials());
  const [aiConn, setAiConn] = useState(() => getAiConnection());
  const inAppModel = isAgentChatUnlocked(aiConn, creds).unlocked;

  useEffect(() => {
    const onStorage = () => {
      setCreds(getLlmCredentials());
      setAiConn(getAiConnection());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // What the AI chip says: an MCP client is a working setup, not "no key".
  const ai =
    route === 'claude-desktop'
      ? { ok: true, label: 'AI: MCP client', detail: 'Your MCP client (Claude Desktop, Cursor, ...) reads the flowsheet and adds units to it.' }
      : inAppModel
        ? { ok: true, label: `AI: ${creds.provider}`, detail: `In-app AI through ${creds.provider}. Keys stay on this device and go only to their provider.` }
        : { ok: false, label: 'Choose an AI model', detail: 'Use a key, OpenRouter sign-in or a local Ollama model in the app, or an MCP client such as Claude Desktop.' };

  const chip: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    height: 32,
    padding: '0 12px',
    borderRadius: draftingRadius.soft,
    border: `1px solid ${palette.border.default}`,
    backgroundColor: palette.background.surface,
    color: palette.text.primary,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  };
  const card: React.CSSProperties = {
    backgroundColor: palette.background.surface,
    border: `1px solid ${palette.border.default}`,
    borderRadius: draftingRadius.soft,
    padding: 16
  };
  const cardTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: palette.text.primary };
  const cardButton: React.CSSProperties = {
    ...chip,
    width: '100%',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: palette.background.canvas
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        backgroundColor: palette.background.base,
        color: palette.text.primary,
        fontFamily: font.sans
      }}
    >
      <header
        style={{
          height: 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          backgroundColor: palette.background.surface,
          borderBottom: `1px solid ${palette.border.default}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            onClick={onNavigateLanding}
            style={{ display: 'flex', cursor: onNavigateLanding ? 'pointer' : 'default' }}
            title={onNavigateLanding ? 'Back to the ProcessForge home page' : undefined}
          >
            <ProcessForgeLogo size={30} wordmarkSize={16} />
          </div>
          <span style={{ fontSize: 13, color: palette.text.muted }}>Studio Hub</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={onOpenAiModal} title={ai.detail} style={chip}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: ai.ok ? palette.jade[500] : palette.status.blocked }} />
            {ai.label}
            <Sliders size={12} style={{ opacity: 0.6 }} />
          </button>
          <button
            type="button"
            onClick={() => onOpenAccountModal(isAuthenticated ? undefined : 'google')}
            title={isAuthenticated ? `Signed in as ${user?.name}` : 'Sign in'}
            style={chip}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" style={{ width: 16, height: 16, borderRadius: '50%' }} />
            ) : (
              <User size={13} color={palette.text.secondary} />
            )}
            {isAuthenticated ? user?.name?.split(' ')[0] || 'Account' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            style={{ ...chip, width: 32, padding: 0, justifyContent: 'center' }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1280, width: '100%', margin: '0 auto', padding: '28px 24px 40px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Your flowsheets</h1>
            <p style={{ fontSize: 14, color: palette.text.secondary, margin: '6px 0 0' }}>
              Open a project, or start one blank, from a template or from a file.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenStudio}
            style={{
              ...chip,
              height: 38,
              padding: '0 16px',
              fontSize: 13,
              border: 'none',
              backgroundColor: palette.jade[600],
              color: palette.text.inverse,
              maxWidth: 420
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Continue “{currentProject.name}”</span>
            <ArrowRight size={15} style={{ flexShrink: 0 }} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 20, alignItems: 'start' }} className="pf-hub-grid">
          <style>{`@media (max-width: 900px) { .pf-hub-grid { grid-template-columns: minmax(0, 1fr) !important; } }`}</style>
          <ProjectBrowser
            variant="page"
            currentProject={currentProject}
            onOpenProject={onOpenProject}
            onNewProject={onNewProject}
            onImportFile={onImportFile}
            onRenameCurrent={onRenameCurrent}
            onSignIn={() => onOpenAccountModal('google')}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={card}>
              <div style={cardTitle}>
                <User size={16} color={palette.jade[500]} /> Account
              </div>
              <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>
                {isAuthenticated ? user?.name : 'Not signed in'}
              </div>
              <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 3, lineHeight: 1.45 }}>
                {hasCloudSession(user)
                  ? 'Projects you save to the cloud open on any computer you sign in on.'
                  : 'Projects are kept on this computer. Sign in with Google to keep copies in ProcessForge Cloud.'}
              </div>
              <button type="button" onClick={() => onOpenAccountModal(isAuthenticated ? undefined : 'google')} style={cardButton}>
                {isAuthenticated ? 'Account' : 'Sign in with Google'} <ExternalLink size={12} />
              </button>
            </div>

            <div style={card}>
              <div style={cardTitle}>
                <Cpu size={16} color={palette.jade[500]} /> AI model
              </div>
              <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>{ai.label.replace(/^AI: /, '')}</div>
              <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 3, lineHeight: 1.45 }}>{ai.detail}</div>
              <button type="button" onClick={onOpenAiModal} style={cardButton}>
                <Sliders size={13} /> Change AI model
              </button>
            </div>

            {onOpenForgeHub && (
              <div style={card}>
                <div style={cardTitle}>
                  <Library size={16} color={palette.jade[500]} /> Community library
                </div>
                <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 6, lineHeight: 1.45 }}>
                  Unit ops other engineers have designed and published, ready to drop into a flowsheet.
                </div>
                <button type="button" onClick={onOpenForgeHub} style={cardButton}>
                  Browse the library
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
