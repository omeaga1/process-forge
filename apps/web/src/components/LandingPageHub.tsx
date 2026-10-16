import React, { useEffect, useState } from 'react';
import { User, ArrowRight, Sun, Moon, Library } from 'lucide-react';
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
import { useAccount } from '../auth/useAccount.js';
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
          height: 60,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          backgroundColor: palette.background.base,
          borderBottom: `1px solid ${palette.border.subtle}`
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
          {onOpenForgeHub && (
            <Tooltip content="Unit ops other engineers have designed and published" side="bottom">
              <Button variant="ghost" onClick={onOpenForgeHub} icon={<Library size={14} />}>
                Library
              </Button>
            </Tooltip>
          )}
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

      <div style={{ maxWidth: 1040, width: '100%', margin: '0 auto', padding: '56px 28px 64px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 44 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.025em', margin: 0 }}>Your flowsheets</h1>
            <p style={{ fontSize: 15, color: palette.text.secondary, margin: '10px 0 0', lineHeight: 1.5 }}>
              Pick up where you left off, or start from a blank canvas, a template or a file.
            </p>
          </div>
          <Button variant="primary" size="lg" onClick={onOpenStudio} style={{ maxWidth: 420 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Continue “{currentProject.name}”</span>
            <ArrowRight size={15} style={{ flexShrink: 0 }} />
          </Button>
        </div>

        <ProjectBrowser
          variant="page"
          currentProject={currentProject}
          onOpenProject={onOpenProject}
          onNewProject={onNewProject}
          onImportFile={onImportFile}
          onRenameCurrent={onRenameCurrent}
          onSignIn={() => onOpenAccountModal('google')}
        />
      </div>
    </div>
  );
};
