import React, { useEffect, useMemo, useState } from 'react';
import { validateProcessGraph, type ProcessGraph } from '@process-forge/protocol';
import { AlertTriangle, XCircle, Copy, Check, ExternalLink, Sparkles, ChevronRight } from 'lucide-react';
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
  nodeId?: string;
  at: number;
}

interface McpAssistantPanelProps {
  graph: ProcessGraph;
  bottleneckNodeId?: string | null;
  onOpenUnit?: (nodeId: string) => void;
}

/**
 * The assistant panel when an MCP client (Claude Desktop, Cursor, ...) is the
 * assistant. The conversation happens in the client, so the panel is about
 * the flowsheet the client is working on: the link, the units and what is
 * wrong with them, and what the client has added. Setup help folds away once
 * there is something on the canvas.
 */
export const McpAssistantPanel: React.FC<McpAssistantPanelProps> = ({ graph, bottleneckNodeId, onOpenUnit }) => {
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
      if (d?.name) setActivity((prev) => [{ name: d.name, nodeId: d.nodeId, at: d.at ?? Date.now() }, ...prev].slice(0, 6));
    };
    window.addEventListener(MCP_ACTIVITY_EVENT, on);
    return () => window.removeEventListener(MCP_ACTIVITY_EVENT, on);
  }, []);

  const issues = useMemo(() => {
    try {
      return validateProcessGraph(graph).diagnostics.filter((d) => d.severity !== 'INFO').slice(0, 6);
    } catch {
      return [];
    }
  }, [graph]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      // Clipboard blocked: the text is on screen to select by hand.
    }
  };

  const empty = graph.nodes.length === 0;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const heading: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: palette.text.muted,
    margin: '0 0 6px'
  };
  const listButton: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    minHeight: 32,
    padding: '5px 8px',
    border: 'none',
    borderRadius: r.md,
    background: 'transparent',
    color: palette.text.primary,
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer'
  };

  const status =
    bridge === 'connected'
      ? { ok: true, text: 'Linked to your MCP client', hint: 'Your MCP client can read this flowsheet and add units to it.' }
      : bridge === 'unavailable'
        ? { ok: false, text: 'Update the app for the MCP link', hint: 'This desktop app is too old for the MCP link.' }
        : bridge === 'browser'
          ? { ok: false, text: 'MCP clients cannot reach a browser tab', hint: 'Use ProcessForge Desktop for the direct link, or copy the flowsheet into your client.' }
          : { ok: true, text: 'Checking the MCP link…', hint: '' };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* The link, in one line. */}
      <div>
        <div
          role="status"
          title={status.hint}
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: palette.text.primary }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              backgroundColor: status.ok ? palette.jade[500] : palette.status.blocked
            }}
          />
          {status.text}
        </div>
        <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 4, lineHeight: 1.45 }}>
          {bridge === 'browser' ? status.hint : 'You chat in Claude Desktop, Cursor or another MCP client; changes it makes show up here.'}
        </div>
        {bridge === 'browser' && (
          <button
            type="button"
            onClick={() => copy('flowsheet', claudeDesktopFlowsheetPrompt(graph, ''))}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 30,
              marginTop: 8,
              padding: '0 10px',
              borderRadius: r.md,
              border: `1px solid ${palette.border.strong}`,
              backgroundColor: palette.background.surface,
              color: palette.text.primary,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {copied === 'flowsheet' ? <Check size={13} /> : <Copy size={13} />}
            {copied === 'flowsheet' ? 'Copied' : 'Copy flowsheet for your client'}
          </button>
        )}
      </div>

      {/* The flowsheet the client is working on. */}
      <div>
        <div style={heading}>On the canvas{empty ? '' : ` · ${graph.nodes.length}`}</div>
        {empty ? (
          <div style={{ fontSize: 13, color: palette.text.secondary, lineHeight: 1.5 }}>
            Nothing yet. Ask your client to design a unit, or use Add equipment.
          </div>
        ) : (
          graph.nodes.map((n) => {
            const isBottleneck = n.id === bottleneckNodeId;
            const connections = graph.edges.filter((e) => e.sourceNodeId === n.id || e.targetNodeId === n.id).length;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onOpenUnit?.(n.id)}
                className="pf-dock-row"
                title={`Open ${n.name} in the unit studio`}
                style={listButton}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {n.name}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: palette.text.muted }}>
                    {n.kind.replace(/_/g, ' ').toLowerCase()} · {connections} stream{connections === 1 ? '' : 's'}
                  </span>
                </span>
                {isBottleneck && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 999,
                      color: palette.status.blocked,
                      backgroundColor: 'rgba(245, 158, 11, 0.12)'
                    }}
                  >
                    bottleneck
                  </span>
                )}
                <ChevronRight size={14} color={palette.text.muted} />
              </button>
            );
          })
        )}
      </div>

      {issues.length > 0 && (
        <div>
          <div style={heading}>Needs attention · {issues.length}</div>
          {issues.map((d, i) => {
            const target = d.nodeId && byId.get(d.nodeId);
            const Icon = d.severity === 'ERROR' ? XCircle : AlertTriangle;
            return (
              <button
                key={`${d.code}-${i}`}
                type="button"
                disabled={!target}
                onClick={() => target && onOpenUnit?.(target.id)}
                className="pf-dock-row"
                style={{ ...listButton, alignItems: 'flex-start', cursor: target ? 'pointer' : 'default' }}
              >
                <Icon
                  size={14}
                  color={d.severity === 'ERROR' ? '#ef4444' : palette.status.blocked}
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <span style={{ fontSize: 12, lineHeight: 1.45, color: palette.text.secondary }}>{d.message}</span>
              </button>
            );
          })}
        </div>
      )}

      {activity.length > 0 && (
        <div>
          <div style={heading}>Added by your client</div>
          {activity.map((a) => (
            <button
              key={`${a.name}-${a.at}`}
              type="button"
              onClick={() => a.nodeId && onOpenUnit?.(a.nodeId)}
              className="pf-dock-row"
              style={listButton}
            >
              <Sparkles size={13} color={palette.jade[500]} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: palette.text.muted }}>
                {new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Help, folded: a click away, not a wall of examples. */}
      <details style={{ marginTop: 'auto' }}>
        <summary style={{ ...heading, cursor: 'pointer', margin: 0, listStyle: 'revert' }}>Try asking your client</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
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
                padding: '7px 9px',
                borderRadius: r.md,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.background.surface,
                color: palette.text.primary,
                fontSize: 12,
                lineHeight: 1.45,
                cursor: 'pointer'
              }}
            >
              <span style={{ flex: 1 }}>“{ex}”</span>
              {copied === `ex${i}` ? <Check size={13} color={palette.jade[500]} /> : <Copy size={13} color={palette.text.muted} />}
            </button>
          ))}
          <div style={{ fontSize: 12, color: palette.text.muted, lineHeight: 1.5 }}>
            Not set up?{' '}
            <a href={EXTENSION_URL} target="_blank" rel="noreferrer" style={{ color: palette.jade[500], display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              Add ProcessForge to Claude Desktop <ExternalLink size={11} />
            </a>
            , or see AI model → MCP client for other clients.
          </div>
        </div>
      </details>

      <style>{`.pf-dock-row:hover:not(:disabled) { background-color: ${palette.background.canvas} !important; }`}</style>
    </div>
  );
};
