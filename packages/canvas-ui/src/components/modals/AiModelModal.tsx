import React, { useState, useEffect } from 'react';
import { Cpu, CheckCircle2, AlertCircle, X, Copy, Check, ExternalLink, Info, LogIn, LogOut, RotateCcw, Route, Server, Zap } from 'lucide-react';
import { Button, Modal } from '../../ui/index.js';
import { useTheme } from '../../hooks/useTheme.js';
import {
  getLlmCredentials,
  loadLlmCredentials,
  saveLlmCredentials,
  testLlmConnection,
  hasValidCredentials,
  migrateRemovedProviders,
  takeRemovedProviderNotice,
  resetToOfflineConfig,
  OPENROUTER_MODELS,
  type AiModelConfig,
  type LlmCredentials,
  type ConnectionTestResult
} from '../../ai/aiModelManager.js';
import { draftingRadius, tint } from '@process-forge/theme';
import { setAssistantRoute, useAssistantRoute, getAssistantRoute, ROUTE_LABELS } from '../../ai/assistantRoute.js';
import { signInWithOpenRouter } from '../../ai/openRouterAuth.js';
import { testJev } from '../../ai/agent/jevProvider.js';
import { MCP_CLIENTS, WINDOWS_NPX_NOTE } from '../../ai/mcpClientSetup.js';

export interface AiModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: (config: AiModelConfig) => void;
  /** Shown once, the first time the studio opens with no AI set up. */
  firstRun?: boolean;
}

type Choice = 'mcp' | 'openrouter';

/** The two ways ProcessForge uses AI. There are no others (ADR-0009). */
const CHOICES: { id: Choice; title: string; best: string; detail: string; icon: React.ElementType }[] = [
  {
    id: 'mcp',
    title: 'Your AI app (MCP)',
    best: 'Best if you already pay for Claude, Gemini or ChatGPT',
    detail: 'Chat in Claude, Antigravity, Codex or Cursor on your subscription, at no extra cost. It reads this flowsheet and adds the units it designs.',
    icon: Server
  },
  {
    id: 'openrouter',
    title: 'OpenRouter',
    best: 'Best for AI inside ProcessForge',
    detail: 'Sign in once, pay as you go, and use Claude, GPT, Gemini and others right here in the app.',
    icon: Route
  }
];

/** The Claude Desktop extension attached to every release (see mcp-server/scripts/pack-mcpb.mjs). */
const CLAUDE_EXTENSION_URL = 'https://github.com/omeaga1/process-forge/releases/latest/download/process-forge.mcpb';

const isListedModel = (id: string | undefined) => OPENROUTER_MODELS.models.some((m) => m.id === id);

export const AiModelModal: React.FC<AiModelModalProps> = ({ isOpen, onClose, onConfigChanged, firstRun = false }) => {
  const { palette, font } = useTheme();
  const route = useAssistantRoute();

  const [choice, setChoice] = useState<Choice>('mcp');
  const [creds, setCreds] = useState<LlmCredentials>(() => getLlmCredentials());
  const [notice, setNotice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [jevResult, setJevResult] = useState<{ busy: boolean; ok?: boolean; text?: string }>({ busy: false });
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [mcpClientId, setMcpClientId] = useState('claude-desktop');
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [orSignIn, setOrSignIn] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [showPasteKey, setShowPasteKey] = useState(false);
  const [pastedKey, setPastedKey] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    // Settings from a provider that has been removed are cleared here (and at
    // startup); the notice about it is shown once.
    void migrateRemovedProviders();
    const removed = takeRemovedProviderNotice();
    const loaded = getLlmCredentials();
    setNotice(removed);
    setCreds(loaded);
    // Open on what is in use. With nothing set up, the MCP choice (no extra
    // cost for subscribers), unless the notice points at OpenRouter.
    setChoice(getAssistantRoute() === 'claude-desktop' ? 'mcp' : hasValidCredentials(loaded) || removed ? 'openrouter' : 'mcp');
    setShowPasteKey(false);
    setPastedKey('');
    setTestResult(null);
    setJevResult({ busy: false });
    setSaveFeedback(false);
  }, [isOpen]);


  if (!isOpen) return null;

  const signedIn = hasValidCredentials(creds);
  const mcpClient = MCP_CLIENTS.find((c) => c.id === mcpClientId) ?? MCP_CLIENTS[0]!;

  const flashSaved = () => {
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2200);
  };

  /** OAuth PKCE: OpenRouter issues a key for this app; it is saved like a pasted one. */
  const handleSignIn = async () => {
    setOrSignIn({ busy: true });
    setTestResult(null);
    try {
      const key = await signInWithOpenRouter();
      const modelId = creds.modelId || OPENROUTER_MODELS.defaultModel;
      const updated = saveLlmCredentials({ modelId, openrouterApiKey: key });
      setCreds(updated);
      setAssistantRoute('api-key');
      setOrSignIn({ busy: false });
      setNotice(null);
      flashSaved();
      onConfigChanged?.({ provider: 'openrouter', mode: 'openrouter', modelId });
      if (firstRun) onClose();
    } catch (err: any) {
      setOrSignIn({ busy: false, error: err?.message || String(err) });
    }
  };

  /** Forgets the key here (and in the OS keychain). Revoking it is done at openrouter.ai. */
  const handleSignOut = () => {
    const updated = saveLlmCredentials({ openrouterApiKey: '' });
    setCreds(updated);
    resetToOfflineConfig();
    if (route === 'api-key') setAssistantRoute('none');
    setTestResult(null);
    setJevResult({ busy: false });
    onConfigChanged?.({ provider: 'offline', mode: 'offline', modelId: 'offline' });
  };

  /** Saves the model choice, and a pasted key if there is one. */
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = saveLlmCredentials({ modelId: creds.modelId, ...(pastedKey ? { openrouterApiKey: pastedKey } : {}) });
    setCreds(updated);
    setPastedKey('');
    if (hasValidCredentials(updated)) {
      setAssistantRoute('api-key');
      setNotice(null);
      onConfigChanged?.({ provider: 'openrouter', mode: 'openrouter', modelId: updated.modelId });
    }
    flashSaved();
  };

  // On desktop a saved key is in the OS keychain, not in `creds`: load it only
  // for the call. A pasted key, not yet saved, wins over the saved one.
  const keyForCall = async () => pastedKey || (await loadLlmCredentials()).openrouterApiKey;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const key = await keyForCall();
    setTestResult(await testLlmConnection({ ...creds, ...(key ? { openrouterApiKey: key } : {}) }));
    setIsTesting(false);
  };

  const handleTestJev = async () => {
    setJevResult({ busy: true });
    setJevResult({ busy: false, ...(await testJev(await keyForCall())) });
  };

  // The theme's own tokens, so the dialog matches the rest of the studio in both themes.
  const accent = palette.jade[500];
  const cardBg = palette.background.surface;
  const inputBg = palette.background.base;
  const borderColor = palette.border.default;
  const textColor = palette.text.primary;
  const textMuted = palette.text.secondary;
  const textDim = palette.text.muted;

  const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: textColor, marginBottom: 6 };
  const input: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: inputBg,
    border: `1px solid ${borderColor}`,
    borderRadius: draftingRadius.soft,
    outline: 'none',
    padding: '9px 12px',
    color: textColor,
    fontSize: 12
  };
  const secondaryButton: React.CSSProperties = {
    padding: '9px 14px',
    borderRadius: draftingRadius.soft,
    backgroundColor: palette.background.surface,
    border: `1px solid ${borderColor}`,
    color: textColor,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7
  };
  const smallText: React.CSSProperties = { margin: 0, fontSize: 11, color: textMuted, lineHeight: 1.5 };
  const linkButton: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: accent, fontSize: 11, fontWeight: 600, cursor: 'pointer' };

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      width={680}
      flush
      icon={
        <div style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: tint(accent, 0.15), color: accent }}>
          <Cpu size={17} />
        </div>
      }
      title={firstRun ? 'How do you want to use AI?' : 'AI model'}
      description={
        <>
          {firstRun ? 'Pick one now or later. The engine checks every design either way.' : 'An MCP client such as Claude Desktop, or OpenRouter in the app.'}{' '}
          <span aria-live="polite" style={{ color: textMuted }}>Now: {ROUTE_LABELS[route]}.</span>
        </>
      }
      footer={
        <>
          <span style={{ fontSize: 12, color: textDim, marginRight: 'auto' }}>
            In use:{' '}
            <strong style={{ color: textColor }}>{route === 'claude-desktop' ? 'MCP client' : route === 'api-key' ? 'OpenRouter' : 'nothing yet'}</strong>
          </span>
          <Button onClick={onClose}>{firstRun ? 'Decide later' : 'Done'}</Button>
        </>
      }
    >
      <div>
        {/* The two choices */}
        <div style={{ padding: '14px 24px', background: palette.background.base }}>
          <div role="tablist" aria-label="How to use AI" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {CHOICES.map((c) => {
              const Icon = c.icon;
              const selected = choice === c.id;
              const inUse = c.id === 'mcp' ? route === 'claude-desktop' : route === 'api-key' && signedIn;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setChoice(c.id);
                    setTestResult(null);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: '12px 14px',
                    textAlign: 'left',
                    borderRadius: draftingRadius.soft,
                    border: `1.5px solid ${selected ? accent : borderColor}`,
                    backgroundColor: selected ? tint(accent, 0.1) : cardBg,
                    boxShadow: selected ? `0 0 0 3px ${tint(accent, 0.2)}` : 'none',
                    color: textColor,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={16} color={selected ? accent : textMuted} />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{c.title}</span>
                    {inUse && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: 999,
                          color: palette.jade[500],
                          backgroundColor: tint(palette.jade[500], 0.14)
                        }}
                      >
                        In use
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>{c.best}</span>
                  <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.45 }}>{c.detail}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
          {notice && (
            <div
              role="status"
              style={{
                padding: '10px 14px',
                borderRadius: draftingRadius.soft,
                backgroundColor: tint(palette.status.blocked, 0.08),
                border: `1px solid ${tint(palette.status.blocked, 0.35)}`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontSize: 12,
                lineHeight: 1.5,
                color: textColor
              }}
            >
              <Info size={15} color={palette.status.blocked} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ flex: 1 }}>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" style={{ ...linkButton, color: textMuted }}>
                <X size={14} />
              </button>
            </div>
          )}

          {choice === 'openrouter' && (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ ...smallText, fontSize: 12 }}>
                Sign in once and use Claude, GPT, Gemini, DeepSeek, Llama and more, billed to your OpenRouter account.
                Sign-in issues a key for this app only. It stays on this device (the OS keychain in the desktop app,
                local storage in a browser) and is sent only to OpenRouter, which forwards each request to the
                model&apos;s own provider under OpenRouter&apos;s terms.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleSignIn}
                    disabled={orSignIn.busy}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      borderRadius: draftingRadius.soft,
                      border: 'none',
                      background: accent,
                      color: palette.text.inverse,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: orSignIn.busy ? 'progress' : 'pointer',
                      opacity: orSignIn.busy ? 0.7 : 1
                    }}
                  >
                    <LogIn size={14} />
                    {orSignIn.busy ? 'Waiting for OpenRouter in your browser...' : signedIn ? 'Signed in. Sign in again' : 'Sign in with OpenRouter'}
                  </button>
                  {signedIn && (
                    <button type="button" onClick={handleSignOut} style={secondaryButton} title="Forget the key on this device">
                      <LogOut size={13} /> Sign out
                    </button>
                  )}
                </div>
                {orSignIn.error && (
                  <div role="alert" style={{ fontSize: 12, color: palette.status.failed, lineHeight: 1.45 }}>
                    {orSignIn.error}
                  </div>
                )}
                <p style={smallText}>
                  Opens OpenRouter in your browser; approve there and you are set. Give the key a spending limit in{' '}
                  <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" style={{ color: accent }}>
                    your OpenRouter settings
                  </a>
                  , where you can also revoke it. Signing out here only forgets it on this device.{' '}
                  {!showPasteKey && (
                    <button type="button" onClick={() => setShowPasteKey(true)} style={linkButton}>
                      Paste a key instead
                    </button>
                  )}
                </p>
                {showPasteKey && (
                  <input
                    type="password"
                    aria-label="OpenRouter API key"
                    placeholder={creds.vaulted?.includes('openrouterApiKey') ? 'Saved in your OS keychain. Paste to replace it.' : 'sk-or-v1-...'}
                    value={pastedKey}
                    onChange={(e) => setPastedKey(e.target.value.trim())}
                    style={{ ...input, fontFamily: font.mono, letterSpacing: '0.04em' }}
                  />
                )}
              </div>

              <div>
                <label style={label} htmlFor="pf-openrouter-model">
                  Model
                </label>
                <select
                  id="pf-openrouter-model"
                  value={creds.modelId || OPENROUTER_MODELS.defaultModel}
                  onChange={(e) => setCreds({ ...creds, modelId: e.target.value })}
                  style={{ ...input, fontWeight: 600, cursor: 'pointer' }}
                >
                  {creds.modelId && !isListedModel(creds.modelId) && <option value={creds.modelId}>{creds.modelId}</option>}
                  {OPENROUTER_MODELS.models.map((m) => (
                    <option key={m.id} value={m.id} style={{ backgroundColor: palette.background.surface, color: palette.text.primary }}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  aria-label="OpenRouter model ID"
                  placeholder="Or any model ID, e.g. qwen/qwen3.8-27b:free"
                  value={isListedModel(creds.modelId) ? '' : creds.modelId || ''}
                  onChange={(e) => setCreds({ ...creds, modelId: e.target.value.trim() || OPENROUTER_MODELS.defaultModel })}
                  style={{ ...input, marginTop: 8, fontFamily: font.mono }}
                />
                <p style={{ ...smallText, marginTop: 6 }}>
                  Browse every model and its price at{' '}
                  <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" style={{ color: accent }}>
                    openrouter.ai/models
                  </a>
                  . The free models need no credit but are rate-limited.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={handleTestConnection} disabled={isTesting || (!signedIn && !pastedKey)} style={{ ...secondaryButton, opacity: signedIn || pastedKey ? 1 : 0.5 }}>
                  {isTesting ? <RotateCcw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={13} color={accent} />}
                  {isTesting ? 'Testing...' : 'Test connection'}
                </button>
                <button
                  type="button"
                  onClick={handleTestJev}
                  disabled={jevResult.busy || (!signedIn && !pastedKey)}
                  title="Jev, a decision model on your OpenRouter account, decides what a complete design of each unit needs. This asks it about a sample unit."
                  style={{ ...secondaryButton, opacity: signedIn || pastedKey ? 1 : 0.5 }}
                >
                  {jevResult.busy ? 'Testing Jev...' : 'Test Jev'}
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '9px 18px',
                    borderRadius: draftingRadius.soft,
                    background: saveFeedback ? palette.jade[500] : accent,
                    border: 'none',
                    color: palette.text.inverse,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7
                  }}
                >
                  {saveFeedback && <Check size={14} />}
                  {saveFeedback ? 'Saved' : 'Save'}
                </button>
              </div>

              {testResult && (
                <div
                  role="status"
                  style={{
                    padding: '10px 14px',
                    borderRadius: draftingRadius.soft,
                    border: `1px solid ${testResult.ok ? palette.jade[500] : palette.status.failed}40`,
                    backgroundColor: testResult.ok ? tint(palette.jade[500], 0.08) : tint(palette.status.failed, 0.08),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: textColor
                  }}
                >
                  {testResult.ok ? <CheckCircle2 size={16} color={palette.jade[500]} /> : <AlertCircle size={16} color={palette.status.failed} />}
                  <span style={{ flex: 1 }}>
                    {testResult.ok ? `${testResult.modelName} answered in ${testResult.latencyMs} ms.` : testResult.error}
                  </span>
                </div>
              )}
              {jevResult.text && (
                <p role="status" style={{ ...smallText, color: jevResult.ok ? palette.jade[500] : textMuted }}>
                  {jevResult.text}
                </p>
              )}
            </form>
          )}

          {choice === 'mcp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ ...smallText, fontSize: 12 }}>
                Chat in an MCP client (Claude Desktop, Cursor, or any client that supports MCP) on the subscription you
                already have, with the ProcessForge tools available to it. While ProcessForge Desktop is open, the client
                can read the open flowsheet and add the unit ops it designs straight onto it, drawn and ready to pipe.
              </p>

              <button
                type="button"
                onClick={() => {
                  setAssistantRoute(route === 'claude-desktop' ? 'none' : 'claude-desktop');
                  if (firstRun && route !== 'claude-desktop') onClose();
                }}
                aria-pressed={route === 'claude-desktop'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: draftingRadius.soft,
                  border: route === 'claude-desktop' ? `1px solid ${borderColor}` : 'none',
                  background: route === 'claude-desktop' ? 'transparent' : accent,
                  color: route === 'claude-desktop' ? textColor : palette.text.inverse,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {route === 'claude-desktop' ? (
                  <>
                    <Check size={14} /> Using your MCP client. Stop using it
                  </>
                ) : (
                  'Use my MCP client as the assistant'
                )}
              </button>

              {/* One-click install for Claude Desktop (a .mcpb extension). */}
              <div
                style={{
                  padding: 14,
                  borderRadius: draftingRadius.soft,
                  backgroundColor: cardBg,
                  border: `1px solid ${accent}55`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>Set up Claude Desktop (once)</div>
                <a
                  href={CLAUDE_EXTENSION_URL}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '9px 14px',
                    borderRadius: draftingRadius.soft,
                    border: `1px solid ${accent}`,
                    color: accent,
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: 'none'
                  }}
                >
                  <ExternalLink size={14} /> Add to Claude Desktop
                </a>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: textMuted, lineHeight: 1.6 }}>
                  <li>
                    This downloads <code style={{ fontFamily: font.mono }}>process-forge.mcpb</code>.
                  </li>
                  <li>Open the file. Claude Desktop shows ProcessForge and its tools; click Install.</li>
                  <li>Keep this app open, then ask Claude to design a unit and add it to your flowsheet.</li>
                </ol>
              </div>

              <div style={{ fontSize: 12, color: textMuted }}>Or add it to another MCP client:</div>
              <div role="tablist" aria-label="MCP client" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {MCP_CLIENTS.map((c) => {
                  const active = c.id === mcpClient.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setMcpClientId(c.id);
                        setCopiedSnippet(false);
                      }}
                      style={{
                        padding: '5px 10px',
                        borderRadius: draftingRadius.soft,
                        border: `1px solid ${active ? accent : borderColor}`,
                        background: active ? tint(palette.jade[500], 0.12) : 'transparent',
                        color: active ? textColor : textMuted,
                        fontSize: 12,
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer'
                      }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ padding: 14, borderRadius: draftingRadius.soft, backgroundColor: cardBg, border: `1px solid ${borderColor}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: textColor }}>{mcpClient.kind === 'command' ? 'Terminal' : mcpClient.file}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(mcpClient.snippet).catch(() => {
                        // Clipboard blocked: the text is on screen to select.
                      });
                      setCopiedSnippet(true);
                      setTimeout(() => setCopiedSnippet(false), 2000);
                    }}
                    style={{ ...linkButton, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {copiedSnippet ? <Check size={12} /> : <Copy size={12} />}
                    {copiedSnippet ? 'Copied' : mcpClient.kind === 'command' ? 'Copy command' : 'Copy config'}
                  </button>
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontFamily: font.mono,
                    color: textMuted,
                    backgroundColor: palette.background.base,
                    padding: 12,
                    borderRadius: draftingRadius.soft,
                    overflowX: 'auto',
                    whiteSpace: mcpClient.kind === 'command' ? 'pre-wrap' : 'pre',
                    wordBreak: mcpClient.kind === 'command' ? 'break-all' : 'normal',
                    border: `1px solid ${borderColor}`
                  }}
                >
                  {mcpClient.snippet}
                </pre>
              </div>

              <p style={{ ...smallText, color: textDim }}>
                {mcpClient.where}
                {mcpClient.note ? ` ${mcpClient.note}` : ''}
              </p>
              <p style={{ ...smallText, color: textDim }}>{WINDOWS_NPX_NOTE}</p>
              <p style={{ ...smallText, color: textDim }}>
                Most clients also list ProcessForge&apos;s prompts as slash commands: debottleneck-line, design-unit-op and build-line.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
      </div>
    </Modal>
  );
};
