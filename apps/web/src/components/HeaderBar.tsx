import React, { useRef } from 'react';
import {
  Layers,
  Cpu,
  Zap,
  ShoppingBag,
  ShieldCheck,
  ChevronDown,
  Save,
  FolderOpen,
  AlertCircle
} from 'lucide-react';
import { OsakaJadePalette } from '@process-forge/theme';
import { useMobileViewport } from '@process-forge/canvas-ui';

interface HeaderBarProps {
  currentTemplate: string;
  isGuestMode: boolean;
  activeAiProvider?: string;
  onSelectTemplate: (templateKey: string) => void;
  onOpenMcpModal: () => void;
  onOpenAiModal?: () => void;
  onOpenForgeHub: () => void;
  onOpenSaveModal: () => void;
  onOpenGuestModal: () => void;
  onImportFile: (file: File) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentTemplate,
  isGuestMode,
  activeAiProvider = 'offline',
  onSelectTemplate,
  onOpenMcpModal,
  onOpenAiModal,
  onOpenForgeHub,
  onOpenSaveModal,
  onOpenGuestModal,
  onImportFile
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isMobile } = useMobileViewport();

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
            title={`AI Provider: ${activeAiProvider.toUpperCase()}`}
          >
            <Cpu size={15} />
          </button>

          <button
            onClick={onOpenMcpModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 6,
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.primary,
              cursor: 'pointer'
            }}
            title="MCP Server Configuration"
          >
            <Zap size={15} color={OsakaJadePalette.jade[500]} />
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
        padding: '0 20px',
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

      {/* Left: Brand & Status Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
              boxShadow: `0 0 12px ${OsakaJadePalette.jade.glow}`
            }}
          >
            <Layers size={18} strokeWidth={2.5} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: OsakaJadePalette.text.primary }}>
              ProcessForge
            </span>
          </div>
        </div>

        {/* Guest Mode Indicator */}
        {isGuestMode && (
          <button
            onClick={onOpenGuestModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 8px',
              borderRadius: 12,
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              fontSize: 11,
              color: OsakaJadePalette.border.glowAmber,
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Click to view Guest Mode preservation options"
          >
            <AlertCircle size={12} />
            GUEST MODE • LOCAL ONLY
          </button>
        )}

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
            fontWeight: 500
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: OsakaJadePalette.jade[500],
              boxShadow: `0 0 6px ${OsakaJadePalette.jade[500]}`
            }}
          />
          WASM CORE ACTIVE
        </div>
      </div>

      {/* Center: Template Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: OsakaJadePalette.text.muted }}>Digital Twin:</span>
        <div style={{ position: 'relative' }}>
          <select
            value={currentTemplate}
            onChange={(e) => onSelectTemplate(e.target.value)}
            style={{
              appearance: 'none',
              backgroundColor: OsakaJadePalette.background.canvas,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 6,
              padding: '6px 28px 6px 12px',
              color: OsakaJadePalette.text.primary,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="sherwin-williams-paint-line">
              Sherwin-Williams Architectural Paint Canning Line
            </option>
            <option value="beverage-bottling-line">
              High-Speed Beverage Bottling & Carbonation Line
            </option>
            <option value="blank">Blank Infinite Canvas</option>
          </select>
          <ChevronDown
            size={14}
            color={OsakaJadePalette.text.secondary}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Open Project File */}
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'transparent',
            border: `1px solid ${OsakaJadePalette.border.subtle}`,
            borderRadius: 6,
            padding: '6px 10px',
            color: OsakaJadePalette.text.secondary,
            fontSize: 12,
            cursor: 'pointer'
          }}
          title="Open a saved .pfg.json project file from disk"
        >
          <FolderOpen size={14} />
          Open .pfg
        </button>

        {/* Save Project Modal Trigger */}
        <button
          onClick={onOpenSaveModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: `1px solid ${OsakaJadePalette.jade[600]}`,
            borderRadius: 6,
            padding: '6px 12px',
            color: OsakaJadePalette.text.accent,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }}
          title="Save or Download whole simulation state"
        >
          <Save size={14} />
          Save Simulation
        </button>

        {/* AI Connection Button (Zero-Key MCP & OAuth) */}
        <button
          onClick={onOpenAiModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: activeAiProvider === 'offline' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(16, 185, 129, 0.15)',
            border: `1px solid ${activeAiProvider === 'offline' ? OsakaJadePalette.border.default : OsakaJadePalette.jade.glow}`,
            borderRadius: 6,
            padding: '6px 12px',
            color: activeAiProvider === 'offline' ? OsakaJadePalette.text.secondary : OsakaJadePalette.jade.glow,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }}
          title="Manage AI Connection (MCP or OAuth 2.0 PKCE - Zero Raw Keys)"
        >
          {activeAiProvider === 'offline' ? <Zap size={14} /> : <Cpu size={14} color={OsakaJadePalette.jade.glow} />}
          <span>
            AI Connection:{' '}
            {activeAiProvider === 'offline'
              ? 'OFFLINE (LOCAL)'
              : activeAiProvider === 'mcp'
              ? 'MCP CONNECTED'
              : 'OAUTH SIGNED IN'}
          </span>
        </button>

        {/* MCP Server Setup */}
        <button
          onClick={onOpenMcpModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            borderRadius: 6,
            padding: '6px 12px',
            color: OsakaJadePalette.text.primary,
            fontSize: 12,
            cursor: 'pointer'
          }}
          title="Connect Claude Desktop / Gemini CLI via MCP"
        >
          <Cpu size={14} color={OsakaJadePalette.jade[500]} />
          MCP Server
        </button>

        {/* ForgeHub Marketplace */}
        <button
          onClick={onOpenForgeHub}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            borderRadius: 6,
            padding: '6px 12px',
            color: OsakaJadePalette.text.secondary,
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          <ShoppingBag size={14} />
          ForgeHub
        </button>

        {/* Zero Raw Keys Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 6,
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${OsakaJadePalette.border.subtle}`,
            fontSize: 11,
            color: OsakaJadePalette.text.secondary
          }}
          title="Zero Raw Keys: 100% Local Math & DPAPI Vault"
        >
          <ShieldCheck size={14} color={OsakaJadePalette.jade[500]} />
          Zero Raw Keys
        </div>
      </div>
    </header>
  );
};
