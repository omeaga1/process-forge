import React from 'react';
import {
  Layers,
  Cpu,
  Download,
  ShoppingBag,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import { OsakaJadePalette } from '@process-forge/theme';

interface HeaderBarProps {
  currentTemplate: string;
  onSelectTemplate: (templateKey: string) => void;
  onOpenMcpModal: () => void;
  onOpenForgeHub: () => void;
  onExportGraph: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentTemplate,
  onSelectTemplate,
  onOpenMcpModal,
  onOpenForgeHub,
  onExportGraph
}) => {
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
      {/* Left: Brand & Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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

      {/* Right: Actions & Trust Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

        <button
          onClick={onOpenForgeHub}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 6,
            padding: '6px 12px',
            color: OsakaJadePalette.text.accent,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <ShoppingBag size={14} />
          ForgeHub
        </button>

        <button
          onClick={onExportGraph}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'transparent',
            border: `1px solid ${OsakaJadePalette.border.subtle}`,
            borderRadius: 6,
            padding: '6px 12px',
            color: OsakaJadePalette.text.secondary,
            fontSize: 12,
            cursor: 'pointer'
          }}
          title="Export JSON Digital Twin"
        >
          <Download size={14} />
          Export
        </button>

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
