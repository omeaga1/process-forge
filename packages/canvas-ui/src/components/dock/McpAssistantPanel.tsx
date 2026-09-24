import React, { useEffect, useState } from 'react';
import type { ProcessGraph } from '@process-forge/protocol';
import { CheckCircle2, AlertCircle, Copy, Check, ExternalLink, Sparkles } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import { claudeDesktopFlowsheetPrompt } from '../../ai/assistantRoute.js';

/** Fired by the desktop app's MCP bridge for each unit op an MCP client adds. */
const MCP_ACTIVITY_EVENT = 'pf-mcp-activity';
const EXTENSION_URL = 'https://github.com/omeaga1/process-forge/releases/latest/download/process-forge.mcpb';

const EXAMPLES = [
  'Read my ProcessForge flowsheet and tell me where the bottleneck is.',
  'Design a vibrating fluid-bed cooler for 5 kg/s of salt at 90 °C, cooled to 40 °C with ambient air, and add it to my flowsheet.',
  'Look at the unit I have open and check whether it holds at 20 % more throughput.'
];

type BridgeState = 'checking' | 'connected' | 'unavailable' | 'browser';

interface Activity {
  name: string;
  at: number;
}

/**
 * The assistant panel when an MCP client (Claude Desktop, Cursor, ...) is the
 * assistant. The conversation happens in the client, so there is no chat
 * here: this says whether the client can reach the app, shows what it has
 * done, and gives requests to try.
 */
export const McpAssistantPanel: React.FC<{ graph: ProcessGraph }> = ({ graph }) => {
  const { palette, font, radius: r } = useTheme();
  const [bridge, setBridge] = useState<BridgeState>('checking');
  const [activity, setActivity] = useState<Activity[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const invoke = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (c: string) => Promise<unknown> } }).__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') {
      setBridge('browser');
      return;
    }
    invoke('bridge_status')
      .then(() => setBridge('connected'))
      .catch(() => setBridge('unavailable'));
  }, []);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Activity>).detail;
      if (d?.name) setActivity((prev) => [{ name: d.name, at: d.at ?? Date.now() }, ...prev].slice(0, 6));
    };
    window.addEventListener(MCP_ACTIVITY_EVENT, on);
    return () => window.removeEventListener(MCP_ACTIVITY_EVENT, on);
  }, []);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      // Clipboard blocked: the text is on screen to select by hand.
    }
  };

  const section: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
  const heading: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: palette.text.muted
  };
  const status =
    bridge === 'connected'
      ? { ok: true, text: 'Your MCP client can read this flowsheet and add units to it.' }
      : bridge === 'unavailable'
        ? { ok: false, text: 'This desktop app is too old for the MCP link. Update it from the banner or the releases page.' }
        : bridge === 'browser'
          ? { ok: false, text: 'MCP clients cannot reach a browser tab. Use ProcessForge Desktop for the direct link, or copy the flowsheet into your client below.' }
          : { ok: true, text: 'Checking the link to your MCP client…' };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={section}>
        <div style={{ fontSize: 14, fontWeight: 700, color: palette.text.primary }}>Your MCP client is the assistant</div>
        <div style={{ fontSize: 13, color: palette.text.secondary, lineHeight: 1.5 }}>
          Chat in Claude Desktop, Cursor or another MCP client. It uses the ProcessForge tools to read this flowsheet, design
          unit ops that the engine checks, and add them here.
        </div>
        <div
          role="status"
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            padding: '9px 10px',
            borderRadius: r.md,
            fontSize: 13,
            lineHeight: 1.45,
            color: palette.text.primary,
            backgroundColor: status.ok ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.1)',
            border: `1px solid ${status.ok ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.4)'}`
          }}
        >
          {status.ok ? (
            <CheckCircle2 size={15} color={palette.jade[500]} style={{ flexShrink: 0, marginTop: 1 }} />
          ) : (
            <AlertCircle size={15} color={palette.status.blocked} style={{ flexShrink: 0, marginTop: 1 }} />
          )}
          <span>{status.text}</span>
        </div>
        {bridge === 'browser' && (
          <button
            type="button"
            onClick={() => copy('flowsheet', claudeDesktopFlowsheetPrompt(graph, ''))}
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              padding: '0 12px',
              borderRadius: r.md,
              border: `1px solid ${palette.border.strong}`,
              backgroundColor: palette.background.surface,
              color: palette.text.primary,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {copied === 'flowsheet' ? <Check size={14} /> : <Copy size={14} />}
            {copied === 'flowsheet' ? 'Copied' : 'Copy flowsheet for your client'}
          </button>
        )}
      </div>

      {activity.length > 0 && (
        <div style={section}>
          <div style={heading}>Added by your client</div>
          {activity.map((a) => (
            <div key={`${a.name}-${a.at}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: palette.text.primary }}>
              <Sparkles size={13} color={palette.jade[500]} />
              <span style={{ flex: 1 }}>{a.name}</span>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: palette.text.muted }}>
                {new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={section}>
        <div style={heading}>Try asking</div>
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex}
            type="button"
            onClick={() => copy(`ex${i}`, ex)}
            title="Copy"
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: r.md,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.background.surface,
              color: palette.text.primary,
              fontSize: 13,
              lineHeight: 1.45,
              cursor: 'pointer'
            }}
          >
            <span style={{ flex: 1 }}>“{ex}”</span>
            {copied === `ex${i}` ? <Check size={14} color={palette.jade[500]} /> : <Copy size={14} color={palette.text.muted} />}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: palette.text.muted, lineHeight: 1.5 }}>
        Not set up yet?{' '}
        <a href={EXTENSION_URL} target="_blank" rel="noreferrer" style={{ color: palette.jade[500], display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          Add ProcessForge to Claude Desktop <ExternalLink size={11} />
        </a>
        , or see AI model → MCP client for other clients.
      </div>
    </div>
  );
};
