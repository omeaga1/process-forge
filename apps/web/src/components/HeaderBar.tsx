import React, { useRef, useState, useEffect } from 'react';
import { Layers, Cpu, ChevronDown, FolderOpen, AlertCircle, Sun, Moon, RotateCw, Sparkles, User, LayoutDashboard, CloudOff, CloudUpload, Check, Loader2 } from 'lucide-react';
import { Button, Tooltip, useMobileViewport, useTheme, ProcessForgeLogo } from '@process-forge/canvas-ui';
import { useAccount } from '../auth/useAccount.js';
import { hasCloudSession } from '../auth/accountManager.js';
import { isTauriEnvironment } from './UpdateNotificationBanner.js';
import { tint } from '@process-forge/theme';

/** Where the open project stands against its cloud copy. */
export type CloudSaveStatus =
  | { kind: 'signed-out' }
  | { kind: 'unsaved' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

interface HeaderBarProps {
  cloudSaveStatus?: CloudSaveStatus;
  onQuickCloudSave?: () => void;
  /** The open project's name, shown as the way into the project browser. */
  projectName: string;
  onOpenProjects: () => void;
  /** Double-click the project name to rename it. */
  onRenameProject?: (name: string) => void;
  isGuestMode: boolean;
  activeAiProvider?: string;
  onNavigateHome?: () => void;
  onOpenAiModal?: () => void;
  onOpenForgeHub: () => void;
  onOpenSaveModal: () => void;
  onOpenGuestModal: () => void;
  onImportFile: (file: File) => void;
  onOpenAccountModal?: () => void;
  onCheckForUpdates?: () => void;
  isCheckingUpdates?: boolean;
  hasUpdateAvailable?: boolean;
}

const Divider: React.FC = () => <div aria-hidden style={{ width: 1, height: 18, backgroundColor: 'var(--pf-border-subtle)', margin: '0 4px', flexShrink: 0 }} />;

export const HeaderBar: React.FC<HeaderBarProps> = ({
  projectName,
  onOpenProjects,
  onRenameProject,
  isGuestMode,
  onNavigateHome,
  onOpenAiModal,
  onOpenForgeHub,
  onOpenSaveModal,
  cloudSaveStatus = { kind: 'signed-out' },
  onQuickCloudSave,
  onOpenGuestModal,
  onImportFile,
  onOpenAccountModal,
  onCheckForUpdates,
  isCheckingUpdates = false,
  hasUpdateAvailable = false
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const clickTimer = useRef<number | null>(null);

  // Below this width the buttons keep their icons and tooltips but drop
  // their text labels, so the header fits the desktop window's 1024 px minimum.
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1280);
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 1280);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const { isMobile } = useMobileViewport();
  const { theme, toggleTheme, palette } = useTheme();
  const { user, isAuthenticated, openAccountModal } = useAccount();
  const openAccount = () => (onOpenAccountModal ?? openAccountModal)();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
      e.target.value = ''; // so the same file can be opened again
    }
  };

  const header: React.CSSProperties = {
    height: isMobile ? 48 : 50,
    backgroundColor: palette.background.surface,
    borderBottom: `1px solid ${palette.border.default}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: isMobile ? '0 10px' : '0 12px 0 10px',
    zIndex: 100,
    position: 'relative',
    minWidth: 0
  };

  const fileInput = <input ref={fileInputRef} type="file" accept=".json,.pfg,.pfg.json" style={{ display: 'none' }} onChange={handleFileChange} />;

  const brand = onNavigateHome ? (
    <Tooltip content="Studio Hub: your projects and templates" side="bottom">
      <button type="button" className="pf-focus" onClick={onNavigateHome} aria-label="ProcessForge home" style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: '4px 6px', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}>
        <ProcessForgeLogo size={isMobile ? 24 : 26} wordmarkSize={14} />
      </button>
    </Tooltip>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 6px', flexShrink: 0 }}>
      <ProcessForgeLogo size={isMobile ? 24 : 26} wordmarkSize={14} />
    </div>
  );

  const themeButton = (
    <Button variant="ghost" iconOnly icon={theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={toggleTheme} />
  );

  const accountLabel =
    isAuthenticated && user ? `${user.name} (${user.email})${hasCloudSession(user) ? ' · saves to ProcessForge Cloud' : ' · this device only'}` : 'Sign in';

  if (isMobile) {
    return (
      <header style={header}>
        {fileInput}
        {brand}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Button variant="ghost" iconOnly icon={<User size={15} />} label={accountLabel} onClick={openAccount} />
          <Button variant="ghost" iconOnly icon={<CloudUpload size={15} />} label="Save" onClick={onOpenSaveModal} />
          <Button variant="ghost" iconOnly icon={<Cpu size={15} />} label="AI model" onClick={onOpenAiModal} />
          {onCheckForUpdates && (
            <Button
              variant="ghost"
              iconOnly
              icon={<RotateCw size={14} className={isCheckingUpdates ? 'animate-spin' : ''} />}
              label={hasUpdateAvailable ? 'Install the update' : 'Check for updates'}
              onClick={onCheckForUpdates}
              disabled={isCheckingUpdates}
            />
          )}
          {themeButton}
        </div>
      </header>
    );
  }

  // Save to cloud in one click, and the full save options beside it.
  const st = cloudSaveStatus;
  const time = st.kind === 'saved' ? new Date(st.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const save =
    st.kind === 'signed-out'
      ? { icon: <CloudOff size={14} />, label: 'Save to cloud', hint: 'Sign in with Google to save this project to ProcessForge Cloud. It is already saved on this device.' }
      : st.kind === 'saving'
        ? { icon: <Loader2 size={14} className="animate-spin" />, label: 'Saving…', hint: 'Saving to ProcessForge Cloud' }
        : st.kind === 'saved'
          ? { icon: <Check size={14} color={palette.jade[400]} />, label: 'Saved', hint: `Saved to ProcessForge Cloud at ${time}. No changes since.` }
          : st.kind === 'error'
            ? { icon: <CloudOff size={14} color={palette.status.blocked} />, label: 'Retry save', hint: st.message }
            : { icon: <CloudUpload size={14} color={palette.jade[400]} />, label: 'Save to cloud', hint: 'Save this project to ProcessForge Cloud · Ctrl+S' };

  return (
    <header style={header}>
      {fileInput}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0, overflow: 'hidden' }}>
        {brand}
        {onNavigateHome && (
          <Button variant="ghost" icon={<LayoutDashboard size={14} />} onClick={onNavigateHome}>
            Studio Hub
          </Button>
        )}
        <Divider />

        {/* The open project: click for every project, templates and files (Ctrl+O); double-click to rename. */}
        {renaming !== null && onRenameProject ? (
          <input
            autoFocus
            className="pf-input"
            value={renaming}
            aria-label="Project name"
            onChange={(e) => setRenaming(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setRenaming(null);
            }}
            onBlur={() => {
              const name = renaming.trim();
              if (name && name !== projectName) onRenameProject(name);
              setRenaming(null);
            }}
            style={{ width: 260, height: 32, fontWeight: 600 }}
          />
        ) : (
          <Tooltip content={`Projects: open another, start one, or open a file · Ctrl+O${onRenameProject ? '. Double-click to rename.' : ''}`} side="bottom">
            <button
              type="button"
              className="pf-btn"
              data-variant="default"
              data-size="md"
              onDoubleClick={(e) => {
                if (!onRenameProject) return;
                e.preventDefault();
                if (clickTimer.current) window.clearTimeout(clickTimer.current);
                setRenaming(projectName);
              }}
              onClick={() => {
                // The first click of a double-click (rename) must not open the browser.
                if (clickTimer.current) window.clearTimeout(clickTimer.current);
                clickTimer.current = window.setTimeout(onOpenProjects, onRenameProject ? 220 : 0);
              }}
              style={{ maxWidth: 300, minWidth: 120, flexShrink: 1, justifyContent: 'flex-start' }}
            >
              <FolderOpen size={14} color={palette.jade[400]} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1, textAlign: 'left' }}>{projectName}</span>
              <ChevronDown size={13} color={palette.text.muted} style={{ flexShrink: 0 }} />
            </button>
          </Tooltip>
        )}

        {isGuestMode && (
          <Tooltip content="Projects are kept in this browser only. Click for ways to keep a copy." side="bottom">
            <button
              type="button"
              className="pf-chip"
              onClick={onOpenGuestModal}
              style={{ color: palette.status.blocked, borderColor: tint(palette.status.blocked, 0.4), backgroundColor: tint(palette.status.blocked, 0.08), flexShrink: 0 }}
            >
              <AlertCircle size={12} />
              Guest
            </button>
          </Tooltip>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <div className="pf-split">
          <Tooltip content={save.hint} side="bottom">
            <Button icon={save.icon} onClick={onQuickCloudSave ?? onOpenSaveModal} disabled={st.kind === 'saving'} aria-label={save.label}>
              {!compact && save.label}
            </Button>
          </Tooltip>
          <Button iconOnly icon={<ChevronDown size={13} />} label="More save options: rename, save on this device, download a file" onClick={onOpenSaveModal} />
        </div>

        <Divider />

        <Tooltip content="AI model: an MCP client such as Claude Desktop, or OpenRouter in the app" side="bottom">
          <Button variant="ghost" icon={<Cpu size={14} color={palette.jade[400]} />} onClick={onOpenAiModal} aria-label="AI model">
            {!compact && 'AI model'}
          </Button>
        </Tooltip>
        <Tooltip content="Unit ops other engineers have published, and worked examples" side="bottom">
          <Button variant="ghost" icon={<Layers size={14} />} onClick={onOpenForgeHub} aria-label="Community library">
            {!compact && 'Community library'}
          </Button>
        </Tooltip>

        <Divider />

        <Tooltip content={accountLabel} side="bottom">
          <Button
            variant={isAuthenticated ? 'default' : 'ghost'}
            onClick={openAccount}
            icon={
              user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <User size={14} color={isAuthenticated ? palette.jade[400] : undefined} />
              )
            }
          >
            {isAuthenticated && user ? user.name.split(' ')[0] : 'Sign in'}
            {hasCloudSession(user) && <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: palette.jade[400] }} />}
          </Button>
        </Tooltip>

        {isTauriEnvironment() && onCheckForUpdates &&
          (hasUpdateAvailable ? (
            <Button variant="primary" icon={<Sparkles size={14} />} onClick={onCheckForUpdates}>
              Update ready
            </Button>
          ) : (
            <Button
              variant="ghost"
              iconOnly
              icon={<RotateCw size={14} className={isCheckingUpdates ? 'animate-spin' : ''} />}
              label="Check for updates"
              onClick={onCheckForUpdates}
              disabled={isCheckingUpdates}
            />
          ))}

        {themeButton}
      </div>
    </header>
  );
};
