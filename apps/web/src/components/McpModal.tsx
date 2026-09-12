import React, { useState } from 'react';
import { Copy, Check, X, Terminal, Cpu, ShieldCheck } from 'lucide-react';
import { OsakaJadePalette } from '@process-forge/theme';

interface McpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const McpModal: React.FC<McpModalProps> = ({ isOpen, onClose }) => {
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  if (!isOpen) return null;

  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        'process-forge': {
          command: 'node',
          args: ['C:/Personal Projects/process-forge/packages/mcp-server/dist/cli.js']
        }
      }
    },
    null,
    2
  );

  const geminiCmd =
    'gemini mcp add process-forge node "C:/Personal Projects/process-forge/packages/mcp-server/dist/cli.js"';

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(label);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 12, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <div
        style={{
          width: 760,
          maxWidth: '100%',
          backgroundColor: OsakaJadePalette.background.surface,
          border: `1px solid ${OsakaJadePalette.border.default}`,
          borderRadius: 12,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
            backgroundColor: OsakaJadePalette.background.canvas
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: OsakaJadePalette.jade[500]
              }}
            >
              <Cpu size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                Model Context Protocol (MCP) Server Setup
              </h3>
              <span style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
                Connect Claude Desktop, Gemini, Cursor, or ChatGPT directly to ProcessForge
              </span>
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

        {/* Content */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Trust Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 14,
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              border: `1px solid rgba(16, 185, 129, 0.25)`,
              borderRadius: 8
            }}
          >
            <ShieldCheck size={20} color={OsakaJadePalette.jade[500]} style={{ marginTop: 2 }} />
            <div style={{ fontSize: 13, lineHeight: 1.5, color: OsakaJadePalette.text.primary }}>
              <strong>Zero Raw API Keys & Full Local Privacy:</strong> ProcessForge runs its deterministic mathematical
              engine entirely on your machine. Your external Claude or Gemini subscription interacts with local tools via
              stdio without sending your proprietary manufacturing parameters to any cloud database.
            </div>
          </div>

          {/* Claude Desktop */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                Claude Desktop Configuration (<code>claude_desktop_config.json</code>)
              </span>
              <button
                onClick={() => handleCopy(claudeConfig, 'claude')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.jade[400],
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {copiedTab === 'claude' ? <Check size={14} /> : <Copy size={14} />}
                {copiedTab === 'claude' ? 'Copied!' : 'Copy Config'}
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                padding: 14,
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.subtle}`,
                borderRadius: 8,
                fontSize: 12,
                color: OsakaJadePalette.jade[300],
                overflowX: 'auto'
              }}
            >
              {claudeConfig}
            </pre>
          </div>

          {/* Gemini CLI */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                Google Gemini CLI Command
              </span>
              <button
                onClick={() => handleCopy(geminiCmd, 'gemini')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.jade[400],
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {copiedTab === 'gemini' ? <Check size={14} /> : <Copy size={14} />}
                {copiedTab === 'gemini' ? 'Copied!' : 'Copy Command'}
              </button>
            </div>
            <div
              style={{
                padding: 12,
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.subtle}`,
                borderRadius: 8,
                fontSize: 12,
                fontFamily: 'JetBrains Mono, monospace',
                color: OsakaJadePalette.text.primary,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Terminal size={14} color={OsakaJadePalette.jade[500]} />
              <span style={{ overflowX: 'auto' }}>{geminiCmd}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: OsakaJadePalette.background.canvas,
            borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
            display: 'flex',
            justifyContent: 'flex-end'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              backgroundColor: OsakaJadePalette.jade[500],
              border: 'none',
              borderRadius: 6,
              color: '#0c1214',
              fontWeight: 600,
              fontSize: 13,
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
