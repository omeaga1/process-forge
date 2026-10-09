import React, { useEffect, useRef, useState } from 'react';
import { Check, CircleSlash, Eye, Loader2, PencilLine, Square, X, ArrowUp, Hand, ShieldCheck, Workflow } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import { Button, Tooltip } from '../../ui/index.js';
import { loadLlmCredentials } from '../../ai/aiModelManager.js';
import { runAgent, type AgentMessage, type ApprovalRequest } from '../../ai/agent/agentLoop.js';
import type { AgentHost } from '../../ai/agent/agentTools.js';
import { JevOpenRouterProvider, isJevEnabled, offlineDecider, setJevEnabled, testJev } from '../../ai/agent/jevProvider.js';

/**
 * The in-app assistant: chat with a model on OpenRouter that works on
 * the open flowsheet with ProcessForge's tools. What it reads, simulates and
 * checks runs straight away and is listed as it happens; every change to the
 * flowsheet is shown as a card and waits for Approve.
 */

type Line =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; summary: string; access: 'read' | 'write'; status: 'running' | 'done' | 'failed' | 'declined'; detail?: string; decidedBy?: string }
  | { kind: 'error'; id: string; text: string };

const EXAMPLES = [
  'Where is the bottleneck, and what would fix it?',
  'Add a heater before the reactor to bring the feed to 70 °C.',
  'Design a spray dryer for milk concentrate and put it after the evaporator.'
];

export interface AgentChatProps {
  host: AgentHost;
  modelLabel: string;
}

export const AgentChat: React.FC<AgentChatProps> = ({ host, modelLabel }) => {
  const { palette, font } = useTheme();
  const [focused, setFocused] = useState(false);
  const graph = host.getGraph();
  const sheet = { name: graph.name, units: graph.nodes.filter((n) => n.kind !== 'TERMINAL').length };
  const chip = (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 22,
    padding: '0 7px',
    borderRadius: 2,
    border: `1px solid ${palette.border.default}`,
    background: 'transparent',
    color,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap'
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<(ApprovalRequest & { resolve: (ok: boolean) => void }) | null>(null);
  const [jevOn, setJevOn] = useState(isJevEnabled);
  const [jevTest, setJevTest] = useState<{ busy: boolean; text?: string; ok?: boolean }>({ busy: false });

  // Asks Jev about a sample unit on the engineer's OpenRouter sign-in, and says what came back.
  const runJevTest = async () => {
    setJevTest({ busy: true });
    const creds = await loadLlmCredentials();
    setJevTest({ busy: false, ...(await testJev(creds.openrouterApiKey)) });
  };
  const jev = useRef<JevOpenRouterProvider | null>(null);
  const history = useRef<AgentMessage[]>([]);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines, pending]);

  const add = (line: Line) => setLines((prev) => [...prev, line]);
  const upsertTool = (line: Extract<Line, { kind: 'tool' }>) =>
    setLines((prev) => (prev.some((l) => l.id === line.id) ? prev.map((l) => (l.id === line.id ? line : l)) : [...prev, line]));

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setInput('');
    add({ kind: 'user', id: `u-${Date.now()}`, text });
    history.current.push({ role: 'user', content: text });
    setBusy(true);
    abort.current = new AbortController();
    try {
      const creds = await loadLlmCredentials();
      // Design checks: Jev on the engineer's OpenRouter account when it is on; offline otherwise.
      const key = creds.provider === 'openrouter' ? creds.openrouterApiKey?.trim() : undefined;
      if (jevOn && key && !jev.current) jev.current = new JevOpenRouterProvider(key);
      const decider = jevOn && key && jev.current ? jev.current : offlineDecider(key ? 'Jev is turned off' : 'Jev needs OpenRouter');
      const answer = await runAgent({
        creds,
        decider,
        history: history.current,
        host,
        signal: abort.current.signal,
        onEvent: (e) => {
          if (e.type === 'text') add({ kind: 'assistant', id: `a-${Date.now()}-${Math.random()}`, text: e.text });
          else upsertTool({ kind: 'tool', id: e.id, summary: e.summary, access: e.access, status: e.status, ...(e.detail ? { detail: e.detail } : {}), ...(e.decidedBy ? { decidedBy: e.decidedBy } : {}) });
        },
        approve: (req) => new Promise<boolean>((resolve) => setPending({ ...req, resolve }))
      });
      if (answer) add({ kind: 'assistant', id: `a-${Date.now()}`, text: answer });
    } catch (e) {
      const stopped = e instanceof DOMException && e.name === 'AbortError';
      add({ kind: 'error', id: `e-${Date.now()}`, text: stopped ? 'Stopped.' : e instanceof Error ? e.message : String(e) });
      // A turn that did not finish leaves tool calls without results; start the model afresh from the messages.
      history.current = history.current.filter((m) => m.role === 'user' || (m.role === 'assistant' && !('tool_calls' in m && m.tool_calls)));
    } finally {
      setBusy(false);
      setPending(null);
      abort.current = null;
    }
  };

  const decide = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const stop = () => {
    pending?.resolve(false);
    setPending(null);
    abort.current?.abort();
  };

  const bubble = (mine: boolean): React.CSSProperties => ({
    alignSelf: mine ? 'flex-end' : 'flex-start',
    maxWidth: '92%',
    padding: '8px 10px',
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    background: mine ? `${palette.jade[500]}22` : palette.background.surfaceElevated,
    border: `1px solid ${mine ? palette.jade[600] : palette.border.default}`,
    color: palette.text.primary
  });

  return (
    <>
      <div ref={scroller} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lines.length === 0 && (
          <div style={{ fontSize: 12, color: palette.text.secondary, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 700, color: palette.text.primary, marginBottom: 4 }}>Assistant · {modelLabel}</div>
            It works on this flowsheet with ProcessForge&apos;s tools. Reading, simulating, what-ifs and design checks run straight away; every change to
            the flowsheet waits for you to approve it.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => send(ex)}
                  style={{ textAlign: 'left', fontSize: 12, padding: '5px 8px', borderRadius: 6, background: palette.background.surface, border: `1px solid ${palette.border.default}`, color: palette.jade.glow, cursor: 'pointer' }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {lines.map((l) => {
          if (l.kind === 'user') return <div key={l.id} style={bubble(true)}>{l.text}</div>;
          if (l.kind === 'assistant') return <div key={l.id} style={bubble(false)}>{l.text}</div>;
          if (l.kind === 'error')
            return (
              <div key={l.id} role="alert" style={{ ...bubble(false), borderColor: palette.status.blocked, color: palette.text.primary }}>
                {l.text}
              </div>
            );
          const Icon = l.status === 'running' ? Loader2 : l.status === 'declined' ? CircleSlash : l.status === 'failed' ? X : l.access === 'write' ? PencilLine : Eye;
          const color = l.status === 'failed' || l.status === 'declined' ? palette.text.muted : l.access === 'write' ? palette.jade.glow : palette.text.secondary;
          return (
            <div key={l.id} title={l.detail} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color, paddingLeft: 2 }}>
              <Icon size={12} className={l.status === 'running' ? 'animate-spin' : undefined} style={{ flexShrink: 0 }} />
              <span style={{ textDecoration: l.status === 'declined' ? 'line-through' : 'none' }}>{l.summary}</span>
              {l.status === 'declined' && <span>(declined)</span>}
              {l.decidedBy && <span style={{ color: palette.text.muted }}>· design checks by {l.decidedBy}</span>}
            </div>
          );
        })}

        {pending && (
          <div role="dialog" aria-label="Approve a change" style={{ padding: 10, borderRadius: 8, border: `1px solid ${palette.jade[500]}`, background: palette.background.surface, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: palette.jade[400] }}>Change to the flowsheet</div>
            <div style={{ fontSize: 13, color: palette.text.primary, lineHeight: 1.45 }}>{pending.summary}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="primary" size="sm" autoFocus icon={<Check size={13} />} onClick={() => decide(true)}>
                Approve
              </Button>
              <Button size="sm" onClick={() => decide(false)}>
                Decline
              </Button>
            </div>
          </div>
        )}

        {busy && !pending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: palette.text.muted }}>
            <Loader2 size={12} className="animate-spin" /> Working…
          </div>
        )}
      </div>

      {/* The composer: what you ask, and how the assistant will act on it. */}
      <div style={{ padding: 10, borderTop: `1px solid ${palette.border.default}`, background: palette.background.base }}>
        <div
          style={{
            border: `1px solid ${focused ? palette.jade[500] : palette.border.strong}`,
            borderRadius: 2,
            background: palette.background.surfaceElevated,
            boxShadow: focused ? `0 0 0 3px ${palette.jade[500]}22` : 'none',
            transition: 'border-color 120ms, box-shadow 120ms'
          }}
        >
          <textarea
            value={input}
            rows={2}
            aria-label="Message the assistant"
            placeholder="Ask about this flowsheet, or what to build…"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', resize: 'none', background: 'transparent', border: 'none', padding: '9px 10px 4px', color: palette.text.primary, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 6px 8px' }}>
            <Tooltip content="Reading, simulating, what-ifs and design checks run straight away; every change to the flowsheet waits for your approval.">
              <span tabIndex={0} className="pf-focus" style={chip(palette.text.secondary)}>
                <Hand size={11} /> Asks before changes
              </span>
            </Tooltip>
            <button
              type="button"
              aria-pressed={jevOn}
              onClick={() => {
                setJevOn(!jevOn);
                setJevEnabled(!jevOn);
              }}
              title="Jev, a decision model on your OpenRouter account, decides what a complete design of each unit needs (energy balance, outlets, components) and checks designs for what is missing. About $0.0004 a check. Off: the same checks with offline keyword rules, less accurate."
              style={{ ...chip(jevOn ? palette.jade.glow : palette.text.muted), cursor: 'pointer', borderColor: jevOn ? `${palette.jade[500]}88` : palette.border.default, background: jevOn ? `${palette.jade[500]}1a` : 'transparent' }}
            >
              <ShieldCheck size={11} /> Jev checks {jevOn ? 'on' : 'off'}
            </button>
            <span title={`Model: ${modelLabel}`} style={{ marginLeft: 'auto', fontFamily: font.mono, fontSize: 10, color: palette.text.muted, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {modelLabel}
            </span>
            {busy ? (
              <Button size="sm" iconOnly icon={<Square size={11} />} label="Stop" onClick={stop} />
            ) : (
              <Button variant="primary" size="sm" iconOnly icon={<ArrowUp size={14} />} label="Send · Enter" onClick={() => send(input)} disabled={!input.trim()} />
            )}
          </div>
        </div>
        {/* What it works on, under the composer like an attachment tray. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 2px 0', fontSize: 11, color: palette.text.muted }}>
          <Workflow size={11} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Works on <span style={{ color: palette.text.secondary }}>{sheet.name}</span> · {sheet.units} {sheet.units === 1 ? 'unit' : 'units'} · ProcessForge tools
          </span>
          <button
            type="button"
            onClick={() => void runJevTest()}
            disabled={jevTest.busy}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, color: palette.jade.glow, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
          >
            {jevTest.busy ? 'Testing Jev…' : 'Test Jev'}
          </button>
        </div>
        {jevTest.text && (
          <div role="status" style={{ padding: '4px 2px 0', fontSize: 11, lineHeight: 1.45, color: jevTest.ok ? palette.jade.glow : palette.text.secondary }}>
            {jevTest.text}
          </div>
        )}
      </div>
    </>
  );
};
