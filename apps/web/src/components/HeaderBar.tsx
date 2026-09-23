import React, { useRef, useState, useEffect } from 'react';
import {
  Layers,
  Cpu,
  ChevronDown,
  Save,
  FolderOpen,
  AlertCircle,
  Sun,
  Moon,
  RotateCw,
  Sparkles,
  User,
  LayoutDashboard
} from 'lucide-react';
import { useMobileViewport, useTheme, ProcessForgeLogo } from '@process-forge/canvas-ui';
import { useAccount } from '../auth/useAccount.js';
import { hasCloudSession } from '../auth/accountManager.js';
import { isTauriEnvironment } from './UpdateNotificationBanner.js';
import { draftingRadius } from '@process-forge/theme';

interface HeaderBarProps {
  currentTemplate: string;
  isGuestMode: boolean;
  activeAiProvider?: string;
  onNavigateHome?: () => void;
  onSelectTemplate: (templateKey: string) => void;
  onOpenAiModal?: () => void;
  onOpenForgeHub: () => void;
  onOpenUnitOpCreator?: () => void;
  onOpenSaveModal: () => void;
  onOpenGuestModal: () => void;
  onImportFile: (file: File) => void;
  onOpenAccountModal?: () => void;
  onOpenCloudProjects?: () => void;
  onCheckForUpdates?: () => void;
  isCheckingUpdates?: boolean;
  hasUpdateAvailable?: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentTemplate,
  isGuestMode,
  activeAiProvider: _activeAiProvider = 'mcp',
  onNavigateHome,
  onSelectTemplate,
  onOpenAiModal,
  onOpenForgeHub,
  onOpenUnitOpCreator,
  onOpenSaveModal,
  onOpenGuestModal,
  onImportFile,
  onOpenAccountModal,
  onOpenCloudProjects,
  onCheckForUpdates,
  isCheckingUpdates = false,
  hasUpdateAvailable = false
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const OsakaJadePalette = palette;
  const { user, isAuthenticated, openAccountModal } = useAccount();


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
      e.target.value = ''; // reset so same file can be reopened
    }
  };

  if (isMobile) {
    return (
      <header
        style={{
          height: 48,
          backgroundColor: OsakaJadePalette.background.surface,
          borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          zIndex: 100,
          position: 'relative'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.pfg,.pfg.json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Brand */}
        <div
          onClick={onNavigateHome}
          style={{ display: 'flex', alignItems: 'center', cursor: onNavigateHome ? 'pointer' : 'default' }}
          title={onNavigateHome ? 'Return to Studio Dashboard & Projects Hub' : undefined}
        >
          <ProcessForgeLogo size={24} wordmarkSize={14} />
        </div>

        {/* Mobile Right Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={onOpenAccountModal || openAccountModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: draftingRadius.soft,
              backgroundColor: isAuthenticated ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${isAuthenticated ? OsakaJadePalette.jade[600] : OsakaJadePalette.border.default}`,
              color: isAuthenticated ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.secondary,
              cursor: 'pointer'
            }}
            title={isAuthenticated ? `Account: ${user?.name}` : 'Sign In'}
          >
            <User size={15} />
          </button>

          <button
            onClick={onOpenSaveModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: draftingRadius.soft,
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${OsakaJadePalette.jade[600]}`,
              color: OsakaJadePalette.text.accent,
              cursor: 'pointer'
            }}
            title="Save Simulation to Cloud"
          >
            <Save size={15} />
          </button>

          <button
            onClick={onOpenAiModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: draftingRadius.soft,
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${OsakaJadePalette.jade.glow}`,
              color: OsakaJadePalette.jade.glow,
              cursor: 'pointer'
            }}
            title="AI & MCP Engineering Tools"
          >
            <Cpu size={15} />
          </button>

          {onCheckForUpdates && (
            <button
              onClick={onCheckForUpdates}
              disabled={isCheckingUpdates}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: draftingRadius.soft,
                backgroundColor: hasUpdateAvailable ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${hasUpdateAvailable ? OsakaJadePalette.jade.glow : OsakaJadePalette.border.default}`,
                color: hasUpdateAvailable ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.primary,
                cursor: 'pointer'
              }}
              title={hasUpdateAvailable ? 'Update Available — Click to Apply' : 'Check for Updates'}
            >
              <RotateCw size={14} className={isCheckingUpdates ? 'animate-spin' : ''} />
            </button>
          )}

          <button
            onClick={toggleTheme}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: draftingRadius.soft,
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: theme === 'dark' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.primary,
              cursor: 'pointer'
            }}
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>
    );
  }

  return (
    <header
      style={{
        height: 50,
        backgroundColor: OsakaJadePalette.background.surface,
        borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 100,
        position: 'relative',
        flexWrap: 'nowrap',
        minWidth: 0,
        gap: 12
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.pfg,.pfg.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Left: Brand, Navigation, Flowsheet Selector, and Core Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0, overflow: 'hidden' }}>
        <div
          onClick={onNavigateHome}
          style={{ display: 'flex', alignItems: 'center', cursor: onNavigateHome ? 'pointer' : 'default', flexShrink: 0 }}
          title={onNavigateHome ? 'Return to Studio Dashboard & Projects Hub' : undefined}
        >
          <ProcessForgeLogo size={26} wordmarkSize={14} />
        </div>

        {onNavigateHome && (
          <button
            onClick={onNavigateHome}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 32,
              padding: '0 9px',
              borderRadius: draftingRadius.soft,
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.secondary,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxSizing: 'border-box',
              flexShrink: 0
            }}
            title="Studio Hub, Cloud Projects & Templates"
          >
            <LayoutDashboard size={13} color={OsakaJadePalette.jade[400]} />
            <span>Studio Hub</span>
          </button>
        )}

        {/* Subtle separator */}
        <div style={{ width: 1, height: 16, backgroundColor: OsakaJadePalette.border.subtle, margin: '0 2px', flexShrink: 0 }} />

        {/* Digital Twin Flowsheet Selector */}
        <div style={{ position: 'relative', width: 220, minWidth: 120, flexShrink: 1 }}>
          <select
            value={currentTemplate}
            onChange={(e) => onSelectTemplate(e.target.value)}
            style={{
              appearance: 'none',
              width: '100%',
              height: 32,
              boxSizing: 'border-box',
              backgroundColor: OsakaJadePalette.background.canvas,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: draftingRadius.soft,
              padding: '0 26px 0 10px',
              color: OsakaJadePalette.text.primary,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap'
            }}
            title="Switch Process Flowsheet Template"
          >
            <option value="blank">Custom Blank Canvas</option>
            <option value="sherwin-williams-paint-line">
              Architectural Paint Canning Line
            </option>
            <option value="beverage-bottling-line">
              High-Speed Beverage Bottling Line
            </option>
          </select>
          <ChevronDown
            size={13}
            color={OsakaJadePalette.text.secondary}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
        </div>

        {/* Subtle separator */}
        <div style={{ width: 1, height: 16, backgroundColor: OsakaJadePalette.border.subtle, margin: '0 2px', flexShrink: 0 }} />

        {/* Guest Mode Indicator */}
        {isGuestMode && (
          <button
            onClick={onOpenGuestModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 32,
              padding: '0 8px',
              borderRadius: draftingRadius.soft,
              backgroundColor: 'rgba(245, 158, 11, 0.10)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              fontSize: 11,
              color: OsakaJadePalette.border.glowAmber,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxSizing: 'border-box',
              flexShrink: 0
            }}
            title="Guest Mode: Storage is local to this browser session. Click to view backup options."
          >
            <AlertCircle size={12} />
            <span>Guest</span>
          </button>
        )}
      </div>

      {/* Right: Actions, User Account, Tools */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Cloud Projects Browser */}
        <button
          onClick={onOpenCloudProjects || (() => fileInputRef.current?.click())}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 32,
            backgroundColor: 'transparent',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            borderRadius: draftingRadius.soft,
            padding: '0 10px',
            color: OsakaJadePalette.text.secondary,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxSizing: 'border-box'
          }}
          title="Open or browse Cloud Simulation Projects"
        >
          <FolderOpen size={14} />
          {!compact && <span>Projects</span>}
        </button>

        {/* Save Simulation Action */}
        <button
          onClick={onOpenSaveModal}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 32,
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: `1px solid ${OsakaJadePalette.jade[600]}`,
            borderRadius: draftingRadius.soft,
            padding: '0 12px',
            color: OsakaJadePalette.text.accent,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxSizing: 'border-box'
          }}
          title="Save simulation to Cloud Storage"
        >
          <Save size={14} />
          {!compact && <span>Save</span>}
        </button>

        {/* Subtle separator */}
        <div style={{ width: 1, height: 16, backgroundColor: OsakaJadePalette.border.subtle, margin: '0 2px' }} />

        {/* AI & MCP Connection Button */}
        <button
          onClick={onOpenAiModal}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 32,
            backgroundColor: 'rgba(16, 185, 129, 0.10)',
            border: `1px solid ${OsakaJadePalette.jade[600]}`,
            borderRadius: draftingRadius.soft,
            padding: '0 10px',
            color: OsakaJadePalette.text.accent,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxSizing: 'border-box'
          }}
          title="AI model: an API key (Claude, GPT, Gemini), a local Ollama model, or an MCP client"
        >
          <Cpu size={14} color={OsakaJadePalette.jade.glow} />
          {!compact && <span>AI Tools</span>}
        </button>

        {/* Create a unit operation that does not exist yet */}
        {onOpenUnitOpCreator && (
          <button
            onClick={onOpenUnitOpCreator}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 32,
              backgroundColor: 'rgba(113, 206, 173, 0.12)',
              border: `1px solid ${OsakaJadePalette.jade[600]}`,
              borderRadius: draftingRadius.soft,
              padding: '0 10px',
              color: OsakaJadePalette.text.accent,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxSizing: 'border-box'
            }}
            title="New Unit Op — describe equipment that has no model yet; the engine checks it against your physics before it reaches the canvas"
          >
            <Sparkles size={14} />
            {!compact && <span>New Unit Op</span>}
          </button>
        )}

        {/* Community UnitOp Library */}
        <button
          onClick={onOpenForgeHub}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 32,
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            borderRadius: draftingRadius.soft,
            padding: '0 10px',
            color: OsakaJadePalette.text.secondary,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxSizing: 'border-box'
          }}
          title="Community UnitOp Library — Browse & publish unit-op plugins"
        >
          <Layers size={14} />
          {!compact && <span>Community library</span>}
        </button>

        {/* Subtle separator */}
        <div style={{ width: 1, height: 16, backgroundColor: OsakaJadePalette.border.subtle, margin: '0 2px' }} />

        {/* User Account & Cloud Sync Button */}
        <button
          onClick={onOpenAccountModal || openAccountModal}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 32,
            backgroundColor: isAuthenticated ? 'rgba(16, 185, 129, 0.10)' : 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${isAuthenticated ? OsakaJadePalette.jade[600] : OsakaJadePalette.border.default}`,
            borderRadius: draftingRadius.soft,
            padding: '0 10px',
            color: isAuthenticated ? OsakaJadePalette.text.primary : OsakaJadePalette.text.secondary,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxSizing: 'border-box'
          }}
          title={
            isAuthenticated && user
              ? `Account: ${user.name} (${user.email})${hasCloudSession(user) ? ' · can save to ProcessForge Cloud' : ' · this device only'}`
              : 'Sign in'
          }
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <User size={13} color={isAuthenticated ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted} />
          )}
          <span>{isAuthenticated && user ? user.name.split(' ')[0] : 'Sign In'}</span>
          {hasCloudSession(user) && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 0,
                backgroundColor: OsakaJadePalette.jade[400]
              }}
              title="Signed in to ProcessForge Cloud"
            />
          )}
        </button>

        {/* Check for Updates Action (Desktop Tauri only) */}
        {isTauriEnvironment() && onCheckForUpdates && (
          <button
            onClick={onCheckForUpdates}
            disabled={isCheckingUpdates}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              height: 32,
              padding: hasUpdateAvailable ? '0 10px' : '0',
              width: hasUpdateAvailable ? 'auto' : 32,
              backgroundColor: hasUpdateAvailable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${hasUpdateAvailable ? OsakaJadePalette.jade.glow : OsakaJadePalette.border.default}`,
              borderRadius: draftingRadius.soft,
              color: hasUpdateAvailable ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.secondary,
              fontSize: 12,
              fontWeight: hasUpdateAvailable ? 600 : 500,
              cursor: isCheckingUpdates ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
              boxSizing: 'border-box',
              borderColor: hasUpdateAvailable
                ? OsakaJadePalette.jade[400]
                : OsakaJadePalette.border.default
            }}
            title={hasUpdateAvailable ? 'Update Available — Click to Apply' : 'Check for Updates'}
          >
            {hasUpdateAvailable ? (
              <Sparkles size={14} color={OsakaJadePalette.jade.glow} />
            ) : (
              <RotateCw size={14} className={isCheckingUpdates ? 'animate-spin' : ''} />
            )}
            {hasUpdateAvailable && <span>Update Ready</span>}
          </button>
        )}

        {/* Theme Toggle Button (Osaka Jade Dark / Bamboo Ivory Light) */}
        <button
          onClick={toggleTheme}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            borderRadius: draftingRadius.soft,
            color: theme === 'dark' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.accent,
            cursor: 'pointer',
            boxSizing: 'border-box'
          }}
          title={theme === 'dark' ? 'Switch to Light Theme (Bamboo Ivory)' : 'Switch to Dark Theme (Osaka Jade)'}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
};
