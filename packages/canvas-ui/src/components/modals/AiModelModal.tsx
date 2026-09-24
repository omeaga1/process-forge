import React, { useState, useEffect } from 'react';
import {
  Cpu,
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Zap,
  Globe,
  Terminal,
  RotateCcw,
  Server,
  ShieldCheck,
  ChevronRight,
  Eye,
  EyeOff,
  Trash2,
  Key,
  ChevronDown,
  Lock,
  Route,
  LogIn
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import {
  getLlmCredentials,
  loadLlmCredentials,
  saveLlmCredentials,
  testLlmConnection,
  purgeAllCredentials,
  DEFAULT_PROVIDER_MODELS,
  hasValidCredentials,
  type AiModelConfig,
  type LlmProvider,
  type LlmCredentials,
  type ConnectionTestResult
} from '../../ai/aiModelManager.js';
import { draftingRadius } from '@process-forge/theme';
import { setAssistantRoute, useAssistantRoute, getAssistantRoute, ROUTE_LABELS } from '../../ai/assistantRoute.js';
import { signInWithOpenRouter } from '../../ai/openRouterAuth.js';

export interface AiModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: (config: AiModelConfig) => void;
  /** Shown once, the first time the studio opens with no AI set up. */
  firstRun?: boolean;
}

/** The two ways ProcessForge is built to use AI; everything else is under "Other options". */
const MAIN_CHOICES: { id: 'mcp' | 'openrouter'; title: string; best: string; detail: string }[] = [
  {
    id: 'mcp',
    title: 'Claude Desktop (MCP)',
    best: 'Best if you already pay for Claude',
    detail: 'Chat in Claude Desktop or Cursor on your subscription, at no extra cost. It reads this flowsheet and adds the units it designs.'
  },
  {
    id: 'openrouter',
    title: 'OpenRouter',
    best: 'Best for AI inside ProcessForge',
    detail: 'Sign in once, pay as you go, and use Claude, GPT, Gemini and others right here in the app.'
  }
];

interface ProviderMeta {
  id: LlmProvider | 'mcp';
  label: string;
  badge: string;
  icon: React.ElementType;
  accentColor: string;
  accentGlow: string;
  apiKeyField?: keyof LlmCredentials;
  keyPlaceholder?: string;
  keyDocsUrl?: string;
  docsLabel?: string;
  description: string;
}

type SecretKeyField = NonNullable<LlmCredentials['vaulted']>[number];

/** The Claude Desktop extension attached to every release (see mcp-server/scripts/pack-mcpb.mjs). */
const CLAUDE_EXTENSION_URL = 'https://github.com/omeaga1/process-forge/releases/latest/download/process-forge.mcpb';

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    badge: 'Your Google key',
    icon: Sparkles,
    accentColor: '#2dd5b7',
    accentGlow: 'rgba(45, 213, 183, 0.25)',
    apiKeyField: 'geminiApiKey',
    keyPlaceholder: 'AIzaSy...',
    keyDocsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'Get Gemini API Key',
    description: 'Connect to Google AI Studio with your own key, billed to your Google account (AI Studio has a free tier).'
  },
  {
    id: 'claude',
    label: 'Anthropic Claude',
    badge: 'Your Anthropic key',
    icon: Zap,
    accentColor: '#f59e0b',
    accentGlow: 'rgba(245, 158, 11, 0.25)',
    apiKeyField: 'claudeApiKey',
    keyPlaceholder: 'sk-ant-api...',
    keyDocsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'Get Anthropic API Key',
    description: 'Connect to the Anthropic Console with your own key, billed to your Anthropic account.'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    badge: 'Your OpenAI key',
    icon: Globe,
    accentColor: '#10b981',
    accentGlow: 'rgba(16, 185, 129, 0.25)',
    apiKeyField: 'openaiApiKey',
    keyPlaceholder: 'sk-proj-...',
    keyDocsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'Get OpenAI API Key',
    description: 'Connect to the OpenAI Platform with your own key, billed to your OpenAI account.'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    badge: 'Any model, one sign-in',
    icon: Route,
    accentColor: '#6366f1',
    accentGlow: 'rgba(99, 102, 241, 0.25)',
    apiKeyField: 'openrouterApiKey',
    keyPlaceholder: 'sk-or-v1-...',
    keyDocsUrl: 'https://openrouter.ai/settings/keys',
    docsLabel: 'Manage OpenRouter keys',
    description:
      'Sign in once and use Claude, GPT, Gemini, DeepSeek, Llama and more, billed to your OpenRouter account. Sign-in issues a key for this app only; you can set a spending limit on it or revoke it in your OpenRouter settings.'
  },
  {
    id: 'ollama',
    label: 'Local Ollama',
    badge: 'On this computer',
    icon: Terminal,
    accentColor: '#38bdf8',
    accentGlow: 'rgba(56, 189, 248, 0.25)',
    apiKeyField: undefined,
    description: 'Run an open-weight model in Ollama on this computer. Nothing is sent anywhere.'
  },
  {
    id: 'mcp',
    label: 'MCP client',
    badge: 'Your subscription',
    icon: Server,
    accentColor: '#a855f7',
    accentGlow: 'rgba(168, 85, 247, 0.25)',
    apiKeyField: undefined,
    description:
      'Chat in an MCP client (Claude Desktop, Cursor, or any client that supports MCP) on the subscription you already have, with the ProcessForge tools available to it. While ProcessForge Desktop is open, the client can read the open flowsheet and add the unit ops it designs straight onto it, drawn and ready to pipe.'
  }
];

export const AiModelModal: React.FC<AiModelModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged,
  firstRun = false
}) => {
  const { theme, palette, font } = useTheme();
  const route = useAssistantRoute();
  const isDark = theme !== 'light';

  const [activeProvider, setActiveProvider] = useState<LlmProvider | 'mcp'>('gemini');
  const [creds, setCreds] = useState<LlmCredentials>(() => getLlmCredentials());
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [purgeFeedback, setPurgeFeedback] = useState<boolean>(false);
  const [inputFocused, setInputFocused] = useState<boolean>(false);
  const [orSignIn, setOrSignIn] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [showOther, setShowOther] = useState<boolean>(false);
  const [showPasteKey, setShowPasteKey] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const loaded = getLlmCredentials();
      setCreds(loaded);
      // Open on what is in use: the MCP client, a saved provider, or with
      // nothing set up, the MCP choice (no extra cost for Claude subscribers).
      const start: LlmProvider | 'mcp' =
        getAssistantRoute() === 'claude-desktop' ? 'mcp' : hasValidCredentials(loaded) ? loaded.provider : 'mcp';
      setActiveProvider(start);
      setShowOther(start !== 'mcp' && start !== 'openrouter');
      setShowPasteKey(false);
      setTestResult(null);
      setSaveFeedback(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentProviderMeta: ProviderMeta = PROVIDERS.find((p) => p.id === activeProvider) ?? (PROVIDERS[0] as ProviderMeta);
  const keyField = currentProviderMeta.apiKeyField as SecretKeyField | undefined;
  // On desktop a saved key is not in `creds` (it is in the keychain); `vaulted`
  // records that it exists.
  const keyIsVaulted = Boolean(keyField && creds.vaulted?.includes(keyField) && !creds[keyField]);
  const hasKeyForTest = !keyField || Boolean(creds[keyField]) || keyIsVaulted;

  const handleProviderSelect = (provider: LlmProvider | 'mcp') => {
    setActiveProvider(provider);
    setTestResult(null);
    setShowApiKey(false);
    // Selecting a tab shows that provider's settings; only Save changes what
    // the app uses, and the model id always belongs to the selected provider.
    if (provider !== 'mcp') {
      const models = DEFAULT_PROVIDER_MODELS[provider];
      const keepModel = models.models.some((m) => m.id === creds.modelId);
      setCreds({ ...creds, provider, modelId: keepModel ? creds.modelId : models.defaultModel });
    }
  };

  const handleTestConnection = async () => {
    if (activeProvider === 'mcp') return;
    setIsTesting(true);
    setTestResult(null);
    try {
      // On desktop a saved key is in the OS keychain, not in `creds`: load it
      // only for the call. A key typed into the field wins over the saved one.
      const stored = await loadLlmCredentials();
      const typed = Object.fromEntries(Object.entries(creds).filter(([, v]) => v !== '' && v !== undefined));
      const result = await testLlmConnection({
        ...stored,
        ...typed,
        provider: activeProvider
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeProvider !== 'mcp') {
      const updated = saveLlmCredentials({
        ...creds,
        provider: activeProvider
      });
      setCreds(updated);
      setAssistantRoute('api-key');
      setSaveFeedback(true);
      setTimeout(() => setSaveFeedback(false), 2200);
      onConfigChanged?.({
        provider: activeProvider as any,
        mode: activeProvider as any,
        modelId: updated.modelId
      });
    }
  };

  /** OAuth PKCE: OpenRouter issues a key for this app; it is saved like a pasted one. */
  const handleOpenRouterSignIn = async () => {
    setOrSignIn({ busy: true });
    setTestResult(null);
    try {
      const key = await signInWithOpenRouter();
      const models = DEFAULT_PROVIDER_MODELS.openrouter;
      const modelId = models.models.some((m) => m.id === creds.modelId) ? creds.modelId : models.defaultModel;
      const updated = saveLlmCredentials({ ...creds, provider: 'openrouter', modelId, openrouterApiKey: key });
      setCreds(updated);
      setAssistantRoute('api-key');
      setOrSignIn({ busy: false });
      setSaveFeedback(true);
      setTimeout(() => setSaveFeedback(false), 2200);
      onConfigChanged?.({ provider: 'openrouter' as any, mode: 'openrouter' as any, modelId });
      if (firstRun) onClose();
    } catch (err: any) {
      setOrSignIn({ busy: false, error: err?.message || String(err) });
    }
  };

  const handlePurgeCredentials = async () => {
    if (
      typeof window !== 'undefined' &&
      window.confirm('Permanently purge all API keys and saved credentials from this device?')
    ) {
      await purgeAllCredentials();
      const reset = getLlmCredentials();
      setCreds(reset);
      setTestResult(null);
      setPurgeFeedback(true);
      setTimeout(() => setPurgeFeedback(false), 2500);
      onConfigChanged?.({
        provider: 'offline' as any,
        mode: 'offline' as any,
        modelId: 'offline'
      });
    }
  };

  const claudeDesktopSnippet = JSON.stringify(
    {
      mcpServers: {
        'process-forge': {
          command: 'npx',
          args: ['-y', '@process-forge/mcp-server']
        }
      }
    },
    null,
    2
  );

  const hasConfiguredKey = (providerId: LlmProvider | 'mcp'): boolean => {
    if (providerId === 'ollama') return Boolean(creds.ollamaEndpoint?.trim());
    const field = PROVIDERS.find((p) => p.id === providerId)?.apiKeyField as SecretKeyField | undefined;
    if (!field) return false;
    // A desktop key is in the keychain, recorded in `vaulted`, not in creds.
    return Boolean((creds[field] as string | undefined)?.trim()) || Boolean(creds.vaulted?.includes(field));
  };

  // Color tokens
  const modalBg = isDark
    ? 'linear-gradient(180deg, #14211c 0%, #0d1714 100%)'
    : 'linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%)';
  const cardBg = isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.03)';
  const inputBg = isDark ? 'rgba(0, 0, 0, 0.35)' : '#ffffff';
  const borderColor = isDark ? 'rgba(113, 206, 173, 0.18)' : 'rgba(0, 0, 0, 0.1)';
  const borderFocus = currentProviderMeta.accentColor;
  const textColor = palette.text.primary;
  const textMuted = isDark ? '#8ca395' : '#64748b';
  const textDim = isDark ? '#597063' : '#94a3b8';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 5, 0.78)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 680,
          maxWidth: '100%',
          maxHeight: '92vh',
          background: modalBg,
          border: `1px solid ${borderColor}`,
          borderRadius: draftingRadius.sharp,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'pfModalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: `1px solid ${borderColor}`,
            background: isDark ? 'rgba(255, 255, 255, 0.015)' : 'transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: draftingRadius.soft,
                background: `linear-gradient(135deg, ${currentProviderMeta.accentGlow}, rgba(255, 255, 255, 0.02))`,
                border: `1px solid ${currentProviderMeta.accentColor}40`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: currentProviderMeta.accentColor,
              }}
            >
              <Cpu size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: textColor,
                    letterSpacing: '-0.01em'
                  }}
                >
                  {firstRun ? 'How do you want to use AI?' : 'AI model'}
                </h2>
                <span style={{ fontSize: 11, color: textMuted }} aria-live="polite">
                  Now: {ROUTE_LABELS[route]}
                </span>
              </div>
              <p
                style={{
                  margin: '3px 0 0',
                  fontSize: 12,
                  color: textMuted
                }}
              >
                {firstRun
                  ? 'Pick one now or later. The engine checks every design either way.'
                  : 'Claude Desktop over MCP, or OpenRouter in the app. Other options below.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: draftingRadius.soft,
              background: 'transparent',
              border: 'none',
              color: textMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
              e.currentTarget.style.color = textColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = textMuted;
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* The two main choices, then the rest under "Other options". */}
        <div
          style={{
            padding: '14px 24px 0 24px',
            background: isDark ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.02)'
          }}
        >
          <div role="tablist" aria-label="How to use AI" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {MAIN_CHOICES.map((c) => {
              const meta = PROVIDERS.find((p) => p.id === c.id)!;
              const Icon = meta.icon;
              const selected = activeProvider === c.id;
              const inUse = c.id === 'mcp' ? route === 'claude-desktop' : route === 'api-key' && creds.provider === 'openrouter';
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => handleProviderSelect(c.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: '12px 14px',
                    textAlign: 'left',
                    borderRadius: draftingRadius.soft,
                    border: `1.5px solid ${selected ? meta.accentColor : borderColor}`,
                    backgroundColor: selected ? (isDark ? 'rgba(255, 255, 255, 0.06)' : '#ffffff') : cardBg,
                    boxShadow: selected ? `0 0 0 3px ${meta.accentGlow}` : 'none',
                    color: textColor,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={16} color={meta.accentColor} />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{c.title}</span>
                    {inUse && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: 999,
                          color: '#10b981',
                          backgroundColor: 'rgba(16, 185, 129, 0.14)'
                        }}
                      >
                        In use
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: meta.accentColor }}>{c.best}</span>
                  <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.45 }}>{c.detail}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '10px 0 12px' }}>
            <button
              type="button"
              onClick={() => setShowOther((v) => !v)}
              aria-expanded={showOther}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'none',
                border: 'none',
                padding: '4px 0',
                color: textMuted,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <ChevronRight size={13} style={{ transform: showOther ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} />
              Other options
            </button>
            {showOther &&
              PROVIDERS.filter((p) => p.id !== 'mcp' && p.id !== 'openrouter').map((p) => {
                const selected = activeProvider === p.id;
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => handleProviderSelect(p.id)}
                    title={p.description}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      height: 28,
                      padding: '0 10px',
                      borderRadius: 999,
                      border: `1px solid ${selected ? p.accentColor : borderColor}`,
                      backgroundColor: selected ? (isDark ? 'rgba(255, 255, 255, 0.07)' : '#ffffff') : 'transparent',
                      color: selected ? textColor : textMuted,
                      fontSize: 12,
                      fontWeight: selected ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    <Icon size={12} color={selected ? p.accentColor : textMuted} />
                    {p.id === 'ollama' ? 'Local Ollama (free, offline)' : `${p.label.replace('Google ', '').replace('Anthropic ', '')} key`}
                    {hasConfiguredKey(p.id) && (
                      <span title="Set up" style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#10b981' }} />
                    )}
                  </button>
                );
              })}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div
          style={{
            padding: 24,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            flex: 1
          }}
        >
          {/* Where the key goes: only for providers that take one. */}
          {keyField && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: draftingRadius.soft,
              backgroundColor: isDark ? 'rgba(45, 213, 183, 0.05)' : 'rgba(16, 185, 129, 0.05)',
              border: isDark ? '1px solid rgba(45, 213, 183, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: draftingRadius.soft,
                backgroundColor: isDark ? 'rgba(45, 213, 183, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: currentProviderMeta.accentColor,
                flexShrink: 0
              }}
            >
              <ShieldCheck size={16} />
            </div>
            <div style={{ flex: 1, fontSize: 11, lineHeight: 1.45, color: textMuted }}>
              <span style={{ fontWeight: 600, color: textColor }}>Where your key goes:</span>{' '}
              it stays on this device (the OS keychain in the desktop app, local storage in a browser) and is sent only to{' '}
              {activeProvider === 'openrouter'
                ? "OpenRouter, which forwards each request to the model's own provider under OpenRouter's terms."
                : 'this provider. No ProcessForge server is in between.'}
            </div>
          </div>
          )}

          {/* Form for API-key-based providers (Gemini, Claude, OpenAI) */}
          {activeProvider !== 'ollama' && activeProvider !== 'mcp' && (
            <form onSubmit={handleSaveCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Provider Info text */}
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                {currentProviderMeta.description}
              </div>

              {activeProvider === 'openrouter' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleOpenRouterSignIn}
                    disabled={orSignIn.busy}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      borderRadius: draftingRadius.soft,
                      border: 'none',
                      background: currentProviderMeta.accentColor,
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: orSignIn.busy ? 'progress' : 'pointer',
                      opacity: orSignIn.busy ? 0.7 : 1
                    }}
                  >
                    <LogIn size={14} />
                    {orSignIn.busy
                      ? 'Waiting for OpenRouter in your browser...'
                      : creds.openrouterApiKey || creds.vaulted?.includes('openrouterApiKey')
                        ? 'Signed in. Sign in again'
                        : 'Sign in with OpenRouter'}
                  </button>
                  {orSignIn.error && (
                    <div role="alert" style={{ fontSize: 12, color: '#ef4444', lineHeight: 1.45 }}>
                      {orSignIn.error}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.45 }}>
                    Opens OpenRouter in your browser; approve there and you are set. Give the key a spending limit in
                    your OpenRouter settings.{' '}
                    {!showPasteKey && (
                      <button
                        type="button"
                        onClick={() => setShowPasteKey(true)}
                        style={{ background: 'none', border: 'none', padding: 0, color: currentProviderMeta.accentColor, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Paste a key instead
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* API Key Input Field */}
              {(activeProvider !== 'openrouter' || showPasteKey) && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6
                  }}
                >
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: textColor
                    }}
                  >
                    {currentProviderMeta.label} API Key
                  </label>
                  {currentProviderMeta.keyDocsUrl && (
                    <a
                      href={currentProviderMeta.keyDocsUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: currentProviderMeta.accentColor,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        textDecoration: 'none',
                        transition: 'opacity 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                    >
                      <span>{currentProviderMeta.docsLabel}</span>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>

                <div
                  style={{
                    position: 'relative',
                    borderRadius: draftingRadius.soft,
                    border: `1px solid ${inputFocused ? borderFocus : borderColor}`,
                    boxShadow: inputFocused ? `0 0 0 3px ${currentProviderMeta.accentGlow}` : 'none',
                    transition: 'all 0.15s ease',
                    backgroundColor: inputBg
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: textDim,
                      display: 'flex',
                      alignItems: 'center',
                      pointerEvents: 'none'
                    }}
                  >
                    <Key size={14} />
                  </div>

                  <input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder={
                      keyIsVaulted
                        ? 'Saved in your OS keychain. Type to replace it.'
                        : currentProviderMeta.keyPlaceholder
                    }
                    value={
                      currentProviderMeta.apiKeyField
                        ? String(creds[currentProviderMeta.apiKeyField] ?? '')
                        : ''
                    }
                    onChange={(e) => {
                      const field = currentProviderMeta.apiKeyField;
                      if (field) setCreds({ ...creds, [field]: e.target.value.trim() });
                    }}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: '10px 40px 10px 36px',
                      color: textColor,
                      fontSize: 12,
                      fontFamily: font.mono,
                      letterSpacing: '0.04em'
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: textMuted,
                      cursor: 'pointer',
                      padding: 6,
                      borderRadius: draftingRadius.soft,
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.15s ease'
                    }}
                    title={showApiKey ? 'Hide Secret Key' : 'Reveal Secret Key'}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = textColor;
                      e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = textMuted;
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              )}

              {/* Model Selection Dropdown */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: textColor,
                    marginBottom: 6
                  }}
                >
                  Model
                </label>

                <div
                  style={{
                    position: 'relative',
                    borderRadius: draftingRadius.soft,
                    border: `1px solid ${borderColor}`,
                    backgroundColor: inputBg,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: currentProviderMeta.accentColor,
                      display: 'flex',
                      alignItems: 'center',
                      pointerEvents: 'none'
                    }}
                  >
                    <Sparkles size={14} />
                  </div>

                  <select
                    value={
                      creds.modelId ||
                      DEFAULT_PROVIDER_MODELS[activeProvider as LlmProvider].defaultModel
                    }
                    onChange={(e) => setCreds({ ...creds, modelId: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: '10px 36px 10px 36px',
                      color: textColor,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      appearance: 'none',
                      WebkitAppearance: 'none'
                    }}
                  >
                    {activeProvider === 'openrouter' &&
                      creds.modelId &&
                      !DEFAULT_PROVIDER_MODELS.openrouter.models.some((m) => m.id === creds.modelId) && (
                        <option value={creds.modelId}>{creds.modelId}</option>
                      )}
                    {DEFAULT_PROVIDER_MODELS[activeProvider as LlmProvider].models.map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        style={{
                          backgroundColor: isDark ? '#14211c' : '#ffffff',
                          color: isDark ? '#f6f5dd' : '#1e2922',
                          padding: 8
                        }}
                      >
                        {m.name}
                      </option>
                    ))}
                  </select>

                  <div
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: textMuted,
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <ChevronDown size={14} />
                  </div>
                </div>
                {activeProvider === 'openrouter' && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      aria-label="OpenRouter model ID"
                      placeholder="Or any model ID, e.g. qwen/qwen3.8-27b:free"
                      value={DEFAULT_PROVIDER_MODELS.openrouter.models.some((m) => m.id === creds.modelId) ? '' : creds.modelId || ''}
                      onChange={(e) =>
                        setCreds({ ...creds, modelId: e.target.value.trim() || DEFAULT_PROVIDER_MODELS.openrouter.defaultModel })
                      }
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        backgroundColor: inputBg,
                        border: `1px solid ${borderColor}`,
                        borderRadius: draftingRadius.soft,
                        outline: 'none',
                        padding: '8px 12px',
                        color: textColor,
                        fontSize: 12,
                        fontFamily: font.mono
                      }}
                    />
                    <div style={{ marginTop: 6, fontSize: 11, color: textMuted, lineHeight: 1.45 }}>
                      Browse every model and its price at{' '}
                      <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" style={{ color: currentProviderMeta.accentColor }}>
                        openrouter.ai/models
                      </a>
                      . "Free models" needs no credit but is rate-limited.
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons Row */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || !hasKeyForTest}
                  style={{
                    padding: '9px 16px',
                    borderRadius: draftingRadius.soft,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                    border: `1px solid ${borderColor}`,
                    color: textColor,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: isTesting || !hasKeyForTest ? 'not-allowed' : 'pointer',
                    opacity: hasKeyForTest ? 1 : 0.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isTesting) {
                      e.currentTarget.style.backgroundColor = isDark
                        ? 'rgba(255, 255, 255, 0.09)'
                        : 'rgba(0, 0, 0, 0.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isDark
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(0, 0, 0, 0.04)';
                  }}
                >
                  {isTesting ? (
                    <RotateCcw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Zap size={13} color={currentProviderMeta.accentColor} />
                  )}
                  <span>{isTesting ? 'Pinging Provider...' : 'Test Connection'}</span>
                </button>

                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '9px 18px',
                    borderRadius: draftingRadius.soft,
                    background: saveFeedback
                      ? '#10b981'
                      : `linear-gradient(135deg, ${currentProviderMeta.accentColor} 0%, #10b981 100%)`,
                    border: 'none',
                    color: '#081410',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {saveFeedback ? <Check size={14} /> : <Lock size={13} />}
                  <span>{saveFeedback ? 'Credentials Saved & Active!' : 'Save Credentials'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Form for Local Ollama */}
          {activeProvider === 'ollama' && (
            <form onSubmit={handleSaveCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                {currentProviderMeta.description}
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: textColor,
                    marginBottom: 6
                  }}
                >
                  Ollama Service Endpoint
                </label>
                <div
                  style={{
                    borderRadius: draftingRadius.soft,
                    border: `1px solid ${borderColor}`,
                    backgroundColor: inputBg
                  }}
                >
                  <input
                    type="text"
                    placeholder="http://localhost:11434"
                    value={creds.ollamaEndpoint || 'http://localhost:11434'}
                    onChange={(e) => setCreds({ ...creds, ollamaEndpoint: e.target.value.trim() })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: '10px 14px',
                      color: textColor,
                      fontSize: 12,
                      fontFamily: font.mono
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: textColor,
                    marginBottom: 6
                  }}
                >
                  Local Model Tag
                </label>
                <div
                  style={{
                    borderRadius: draftingRadius.soft,
                    border: `1px solid ${borderColor}`,
                    backgroundColor: inputBg
                  }}
                >
                  <input
                    type="text"
                    placeholder="llama3:latest, deepseek-r1:latest, mistral:latest"
                    value={creds.modelId || 'llama3:latest'}
                    onChange={(e) => setCreds({ ...creds, modelId: e.target.value.trim() })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: '10px 14px',
                      color: textColor,
                      fontSize: 12
                    }}
                  />
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                  {['llama3:latest', 'deepseek-r1:latest', 'mistral:latest'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setCreds({ ...creds, modelId: tag })}
                      style={{
                        padding: '2px 8px',
                        borderRadius: draftingRadius.soft,
                        border: `1px solid ${borderColor}`,
                        backgroundColor: cardBg,
                        color: textMuted,
                        fontSize: 10,
                        cursor: 'pointer'
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ollama Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  style={{
                    padding: '9px 16px',
                    borderRadius: draftingRadius.soft,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                    border: `1px solid ${borderColor}`,
                    color: textColor,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7
                  }}
                >
                  {isTesting ? (
                    <RotateCcw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Zap size={13} color="#38bdf8" />
                  )}
                  <span>{isTesting ? 'Connecting to daemon...' : 'Ping Ollama'}</span>
                </button>

                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '9px 18px',
                    borderRadius: draftingRadius.soft,
                    background: saveFeedback
                      ? '#10b981'
                      : 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                    border: 'none',
                    color: '#081410',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7
                  }}
                >
                  {saveFeedback ? <Check size={14} /> : <Lock size={13} />}
                  <span>{saveFeedback ? 'Config Saved & Active!' : 'Save Ollama Config'}</span>
                </button>
              </div>
            </form>
          )}

          {/* MCP Bridge View */}
          {activeProvider === 'mcp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                {currentProviderMeta.description}
              </div>

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
                  background: route === 'claude-desktop' ? 'transparent' : currentProviderMeta.accentColor,
                  color: route === 'claude-desktop' ? textColor : '#ffffff',
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
                  border: `1px solid ${currentProviderMeta.accentColor}55`,
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
                    background: 'transparent',
                    border: `1px solid ${currentProviderMeta.accentColor}`,
                    color: currentProviderMeta.accentColor,
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: 'none'
                  }}
                >
                  <ExternalLink size={14} /> Add to Claude Desktop
                </a>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: textMuted, lineHeight: 1.6 }}>
                  <li>This downloads <code style={{ fontFamily: font.mono }}>process-forge.mcpb</code>.</li>
                  <li>Open the file. Claude Desktop shows ProcessForge and its tools; click Install.</li>
                  <li>Keep this app open, then ask Claude to design a unit and add it to your flowsheet.</li>
                </ol>
              </div>

              <div style={{ fontSize: 12, color: textMuted }}>Other MCP clients (Cursor and others), or manual setup:</div>

              <div
                style={{
                  padding: 14,
                  borderRadius: draftingRadius.soft,
                  backgroundColor: cardBg,
                  border: `1px solid ${borderColor}`
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: textColor }}>
                      claude_desktop_config.json
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        padding: '1px 6px',
                        borderRadius: draftingRadius.soft,
                        backgroundColor: 'rgba(168, 85, 247, 0.15)',
                        color: '#c084fc',
                        fontWeight: 700
                      }}
                    >
                      MCP Stdio
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(claudeDesktopSnippet);
                      setCopiedSnippet(true);
                      setTimeout(() => setCopiedSnippet(false), 2000);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: currentProviderMeta.accentColor,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    {copiedSnippet ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedSnippet ? 'Copied' : 'Copy Config'}</span>
                  </button>
                </div>

                <pre
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontFamily: font.mono,
                    color: textMuted,
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.05)',
                    padding: 12,
                    borderRadius: draftingRadius.soft,
                    overflowX: 'auto',
                    border: `1px solid ${borderColor}`
                  }}
                >
                  {claudeDesktopSnippet}
                </pre>
              </div>

              <p style={{ margin: 0, fontSize: 11, color: textDim, lineHeight: 1.4 }}>
                Add this to the client's MCP configuration (in Claude Desktop: Settings, Developer, Edit
                Config) and restart it.
              </p>
            </div>
          )}

          {/* Test Connection Feedback Banner */}
          {testResult && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: draftingRadius.soft,
                backgroundColor: testResult.ok
                  ? isDark
                    ? 'rgba(16, 185, 129, 0.1)'
                    : 'rgba(16, 185, 129, 0.08)'
                  : isDark
                    ? 'rgba(239, 68, 68, 0.1)'
                    : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${testResult.ok ? '#10b981' : '#ef4444'}40`,
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: draftingRadius.soft,
                  backgroundColor: testResult.ok ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: testResult.ok ? '#10b981' : '#ef4444',
                  flexShrink: 0
                }}
              >
                {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              </div>

              <div style={{ flex: 1, fontSize: 12, lineHeight: 1.4 }}>
                {testResult.ok ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: textColor }}>
                      <strong>Connection Verified:</strong> {testResult.modelName} responded successfully.
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: draftingRadius.soft,
                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                        color: '#10b981',
                        fontFamily: font.mono
                      }}
                    >
                      {testResult.latencyMs} ms
                    </span>
                  </div>
                ) : (
                  <span style={{ color: isDark ? '#fca5a5' : '#dc2626' }}>
                    <strong>Verification Failed:</strong> {testResult.error}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.02)',
            borderTop: `1px solid ${borderColor}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          {firstRun ? <span /> : (
          <button
            type="button"
            onClick={handlePurgeCredentials}
            style={{
              padding: '6px 12px',
              borderRadius: draftingRadius.soft,
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
              color: isDark ? '#f87171' : '#dc2626',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease'
            }}
            title="Permanently remove all keys and stored credentials from this device"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.18)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)';
            }}
          >
            <Trash2 size={12} />
            <span>{purgeFeedback ? 'All keys removed' : 'Remove all keys'}</span>
          </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: textDim }}>
              In use:{' '}
              <strong style={{ color: textColor }}>
                {route === 'claude-desktop'
                  ? 'MCP client'
                  : route === 'api-key'
                    ? PROVIDERS.find((p) => p.id === creds.provider)?.label ?? 'AI in the app'
                    : 'nothing yet'}
              </strong>
            </span>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 16px',
                borderRadius: draftingRadius.soft,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                color: textColor,
                border: `1px solid ${borderColor}`,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
              }}
            >
              {firstRun ? 'Decide later' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
