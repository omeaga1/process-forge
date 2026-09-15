import React, { useRef } from 'react';
import {
  Layers,
  Cpu,
  Zap,
  ShieldCheck,
  ChevronDown,
  Save,
  FolderOpen,
  AlertCircle,
  PanelRightClose,
  PanelRightOpen,
  Sun,
  Moon,
  RotateCw,
  Sparkles
} from 'lucide-react';
import { useMobileViewport, useTheme } from '@process-forge/canvas-ui';

interface HeaderBarProps {
  currentTemplate: string;
  isGuestMode: boolean;
  activeAiProvider?: string;
  onSelectTemplate: (templateKey: string) => void;
  onOpenAiModal?: () => void;
  onOpenForgeHub: () => void;
  onOpenSaveModal: () => void;
  onOpenGuestModal: () => void;
  onImportFile: (file: File) => void;
  isDockCollapsed?: boolean;
  onToggleDockCollapse?: () => void;
  onCheckForUpdates?: () => void;
  isCheckingUpdates?: boolean;
  hasUpdateAvailable?: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentTemplate,
  isGuestMode,
  activeAiProvider = 'offline',
  onSelectTemplate,
  onOpenAiModal,
  onOpenForgeHub,
  onOpenSaveModal,
  onOpenGuestModal,
  onImportFile,
  isDockCollapsed = false,
  onToggleDockCollapse,
  onCheckForUpdates,
  isCheckingUpdates = false,
  hasUpdateAvailable = false
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isMobile, isTablet, isCompact } = useMobileViewport();
  const { theme, toggleTheme, palette } = useTheme();
  const OsakaJadePalette = palette;


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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.jade[500],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: OsakaJadePalette.background.base,
              boxShadow: `0 0 8px ${OsakaJadePalette.jade.glow}`
            }}
          >
            <Layers size={16} strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: OsakaJadePalette.text.primary }}>
            ProcessForge
          </span>
        </div>

        {/* Mobile Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isGuestMode && (
            <button
              onClick={onOpenGuestModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 6px',
                borderRadius: 8,
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                fontSize: 10,
                color: OsakaJadePalette.border.glowAmber,
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="Guest Mode Active"
            >
              <AlertCircle size={12} />
              GUEST
            </button>
          )}

          <button
            onClick={onOpenSaveModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 6,
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${OsakaJadePalette.jade[600]}`,
              color: OsakaJadePalette.text.accent,
              cursor: 'pointer'
            }}
            title="Save Project (.pfg)"
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
              borderRadius: 6,
              backgroundColor: activeAiProvider === 'offline' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${activeAiProvider === 'offline' ? OsakaJadePalette.border.default : OsakaJadePalette.jade.glow}`,
              color: activeAiProvider === 'offline' ? OsakaJadePalette.text.secondary : OsakaJadePalette.jade.glow,
              cursor: 'pointer'
            }}
            title={`AI & MCP Engine: ${activeAiProvider.toUpperCase()}`}
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
                borderRadius: 6,
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
              borderRadius: 6,
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
        height: 54,
        backgroundColor: OsakaJadePalette.background.surface,
        borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 100,
        position: 'relative',
        overflow: 'hidden',
        flexWrap: 'nowrap',
        minWidth: 0,
        gap: 10
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.pfg,.pfg.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Left: Brand & Status Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.jade[500],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: OsakaJadePalette.background.base,
              boxShadow: `0 0 12px ${OsakaJadePalette.jade.glow}`,
              flexShrink: 0
            }}
          >
            <Layers size={18} strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: OsakaJadePalette.text.primary, whiteSpace: 'nowrap' }}>
            ProcessForge
          </span>
        </div>

        {/* Guest Mode Indicator */}
        {isGuestMode && (
          <button
            onClick={onOpenGuestModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 12,
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              fontSize: 10,
              color: OsakaJadePalette.border.glowAmber,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
            title="Guest Mode: Storage is local to this browser session. Click to view backup options."
          >
            <AlertCircle size={12} />
            <span>{isCompact ? 'GUEST' : 'GUEST MODE'}</span>
          </button>
        )}

        {/* Simulation Core Active Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 8px',
            borderRadius: 12,
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            fontSize: 11,
            color: OsakaJadePalette.text.accent,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
          title="Deterministic Simulation Core Active"
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: OsakaJadePalette.jade[500],
              boxShadow: `0 0 6px ${OsakaJadePalette.jade[500]}`,
              flexShrink: 0
            }}
          />
          {!isCompact && <span>SIMULATION CORE ACTIVE</span>}
        </div>
      </div>

      {/* Center: Template Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 1, maxWidth: 360 }}>
        {!isTablet && (
          <span style={{ fontSize: 12, color: OsakaJadePalette.text.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>
            Twin:
          </span>
        )}
        <div style={{ position: 'relative', minWidth: 0, width: '100%' }}>
          <select
            value={currentTemplate}
            onChange={(e) => onSelectTemplate(e.target.value)}
            style={{
              appearance: 'none',
              width: '100%',
              maxWidth: '100%',
              backgroundColor: OsakaJadePalette.background.canvas,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 6,
              padding: '6px 26px 6px 10px',
              color: OsakaJadePalette.text.primary,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap'
            }}
            title="Switch Digital Twin Process Template"
          >
            <option value="sherwin-williams-paint-line">
              Sherwin-Williams Paint Canning Line
            </option>
            <option value="beverage-bottling-line">
              High-Speed Beverage Bottling Line
            </option>
            <option value="blank">Blank Infinite Canvas</option>
          </select>
          <ChevronDown
            size={13}
            color={OsakaJadePalette.text.secondary}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Open Project File */}
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            backgroundColor: 'transparent',
            border: `1px solid ${OsakaJadePalette.border.subtle}`,
            borderRadius: 6,
            padding: isTablet ? '6px 8px' : '6px 10px',
            color: OsakaJadePalette.text.secondary,
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
          title="Open a saved .pfg.json project file from disk"
        >
          <FolderOpen size={14} />
          {!isTablet && <span>Open .pfg</span>}
        </button>

        {/* Save Project Modal Trigger */}
        <button
          onClick={onOpenSaveModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: `1px solid ${OsakaJadePalette.jade[600]}`,
            borderRadius: 6,
            padding: isTablet ? '6px 8px' : '6px 12px',
            color: OsakaJadePalette.text.accent,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
          title="Save or Download whole simulation state (.pfg)"
        >
          <Save size={14} />
          {!isTablet && <span>{isCompact ? 'Save' : 'Save Simulation'}</span>}
        </button>

        {/* AI & MCP Connection Button */}
        <button
          onClick={onOpenAiModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            backgroundColor: activeAiProvider === 'offline' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(16, 185, 129, 0.15)',
            border: `1px solid ${activeAiProvider === 'offline' ? OsakaJadePalette.border.default : OsakaJadePalette.jade.glow}`,
            borderRadius: 6,
            padding: isTablet ? '6px 8px' : '6px 10px',
            color: activeAiProvider === 'offline' ? OsakaJadePalette.text.secondary : OsakaJadePalette.jade.glow,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
          title={`AI & MCP Engine: ${activeAiProvider.toUpperCase()} (Click to configure zero raw keys)`}
        >
          {activeAiProvider === 'offline' ? <Zap size={14} /> : <Cpu size={14} color={OsakaJadePalette.jade.glow} />}
          {!isTablet && (
            <span>
              {isCompact
                ? `AI: ${activeAiProvider === 'offline' ? 'LOCAL' : 'ACTIVE'}`
                : `AI & MCP: ${activeAiProvider === 'offline' ? 'OFFLINE' : 'ACTIVE'}`}
            </span>
          )}
        </button>

        {/* Community UnitOp Library */}
        <button
          onClick={onOpenForgeHub}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            borderRadius: 6,
            padding: isTablet ? '6px 8px' : '6px 10px',
            color: OsakaJadePalette.text.secondary,
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
          title="Community UnitOp Library — Browse & publish unit-op plugins"
        >
          <Layers size={14} />
          {!isTablet && <span>Community UnitOps</span>}
        </button>

        {/* Zero Raw Keys Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: isCompact ? '6px 7px' : '4px 8px',
            borderRadius: 6,
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${OsakaJadePalette.border.subtle}`,
            fontSize: 11,
            color: OsakaJadePalette.text.secondary,
            whiteSpace: 'nowrap'
          }}
          title="Zero Raw Keys: 100% Local Math & DPAPI Vault"
        >
          <ShieldCheck size={14} color={OsakaJadePalette.jade[500]} />
          {!isCompact && <span>Zero Raw Keys</span>}
        </div>

        {/* Check for Updates Action */}
        {onCheckForUpdates && (
          <button
            onClick={onCheckForUpdates}
            disabled={isCheckingUpdates}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              backgroundColor: hasUpdateAvailable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${hasUpdateAvailable ? OsakaJadePalette.jade.glow : OsakaJadePalette.border.default}`,
              borderRadius: 6,
              padding: isTablet ? '6px 8px' : '6px 10px',
              color: hasUpdateAvailable ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.secondary,
              fontSize: 12,
              fontWeight: hasUpdateAvailable ? 600 : 500,
              cursor: isCheckingUpdates ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: hasUpdateAvailable ? `0 0 10px ${OsakaJadePalette.jade.glow}33` : 'none'
            }}
            title="Check for application updates & new releases"
          >
            {hasUpdateAvailable ? (
              <Sparkles size={14} color={OsakaJadePalette.jade.glow} />
            ) : (
              <RotateCw size={14} className={isCheckingUpdates ? 'animate-spin' : ''} />
            )}
            {!isTablet && (
              <span>
                {isCheckingUpdates
                  ? 'Checking...'
                  : hasUpdateAvailable
                  ? 'Update Ready'
                  : 'Check Updates'}
              </span>
            )}
          </button>
        )}

        {/* Theme Toggle Button (Osaka Jade Dark / Bamboo Ivory Light) */}
        <button
          onClick={toggleTheme}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            borderRadius: 6,
            color: theme === 'dark' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.accent,
            cursor: 'pointer',
            marginLeft: 2
          }}
          title={theme === 'dark' ? 'Switch to Light Theme (Bamboo Ivory)' : 'Switch to Dark Theme (Osaka Jade)'}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Dock Collapse Toggle Button */}
        {onToggleDockCollapse && (
          <button
            onClick={onToggleDockCollapse}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              backgroundColor: isDockCollapsed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${isDockCollapsed ? OsakaJadePalette.jade[600] : OsakaJadePalette.border.default}`,
              borderRadius: 6,
              color: isDockCollapsed ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.secondary,
              cursor: 'pointer',
              marginLeft: 2
            }}
            title={isDockCollapsed ? 'Open Software Engineer Dock (Alt+D)' : 'Collapse Software Engineer Dock (Alt+D)'}
          >
            {isDockCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
          </button>
        )}
      </div>
    </header>
  );
};
