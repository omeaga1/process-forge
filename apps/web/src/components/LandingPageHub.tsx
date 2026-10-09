import React, { useEffect, useState } from 'react';
import { User, ArrowRight, Sun, Moon, Sliders, Cpu, Library } from 'lucide-react';
import {
  useTheme,
  getLlmCredentials,
  getAiConnection,
  isAgentChatUnlocked,
  useAssistantRoute,
  ProcessForgeLogo,
  Button,
  Tooltip
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
        ? { ok: true, label: 'AI: OpenRouter', detail: 'In-app AI through OpenRouter. The key stays on this device and goes only to OpenRouter.' }
        : { ok: false, label: 'Choose an AI model', detail: 'Sign in with OpenRouter in the app, or use an MCP client such as Claude Desktop.' };

  const card: React.CSSProperties = {
    backgroundColor: palette.background.surface,
    border: `1px solid ${palette.border.default}`,
    borderRadius: draftingRadius.soft,
    padding: 16
  };
  const cardTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: palette.text.primary };

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
          {onNavigateLanding ? (
            <Tooltip content="The ProcessForge home page" side="bottom">
              <button type="button" className="pf-focus" onClick={onNavigateLanding} aria-label="ProcessForge home page" style={{ display: 'flex', background: 'none', border: 'none', padding: 4, borderRadius: 6, cursor: 'pointer' }}>
                <ProcessForgeLogo size={30} wordmarkSize={16} />
              </button>
            </Tooltip>
          ) : (
            <ProcessForgeLogo size={30} wordmarkSize={16} />
          )}
          <span style={{ fontSize: 13, color: palette.text.muted }}>Studio Hub</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tooltip content={ai.detail} side="bottom">
            <Button variant="ghost" onClick={onOpenAiModal} icon={<span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: ai.ok ? palette.jade[500] : palette.status.blocked }} />}>
              {ai.label}
            </Button>
          </Tooltip>
          <Tooltip content={isAuthenticated ? `Signed in as ${user?.name}` : 'Sign in with Google'} side="bottom">
            <Button
              variant="ghost"
              onClick={() => onOpenAccountModal(isAuthenticated ? undefined : 'google')}
              icon={user?.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} /> : <User size={14} />}
            >
              {isAuthenticated ? user?.name?.split(' ')[0] || 'Account' : 'Sign in'}
            </Button>
          </Tooltip>
          <Button variant="ghost" iconOnly icon={theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={toggleTheme} />
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
          <Button variant="primary" size="lg" onClick={onOpenStudio} style={{ maxWidth: 420 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Continue “{currentProject.name}”</span>
            <ArrowRight size={15} style={{ flexShrink: 0 }} />
          </Button>
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
              <Button onClick={() => onOpenAccountModal(isAuthenticated ? undefined : 'google')} style={{ width: '100%', marginTop: 12 }}>
                {isAuthenticated ? 'Account' : 'Sign in with Google'}
              </Button>
            </div>

            <div style={card}>
              <div style={cardTitle}>
                <Cpu size={16} color={palette.jade[500]} /> AI model
              </div>
              <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>{ai.label.replace(/^AI: /, '')}</div>
              <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 3, lineHeight: 1.45 }}>{ai.detail}</div>
              <Button onClick={onOpenAiModal} icon={<Sliders size={13} />} style={{ width: '100%', marginTop: 12 }}>
                Change AI model
              </Button>
            </div>

            {onOpenForgeHub && (
              <div style={card}>
                <div style={cardTitle}>
                  <Library size={16} color={palette.jade[500]} /> Community library
                </div>
                <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 6, lineHeight: 1.45 }}>
                  Unit ops other engineers have designed and published, ready to drop into a flowsheet.
                </div>
                <Button onClick={onOpenForgeHub} style={{ width: '100%', marginTop: 12 }}>
                  Browse the library
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
