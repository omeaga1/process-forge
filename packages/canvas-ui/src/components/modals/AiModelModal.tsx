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
  Eye,
  EyeOff,
  Trash2,
  Key,
  ChevronDown,
  Lock
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import {
  getLlmCredentials,
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
import { setAssistantRoute, useAssistantRoute, ROUTE_LABELS } from '../../ai/assistantRoute.js';

export interface AiModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: (config: AiModelConfig) => void;
}

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

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    badge: 'Fast & Multimodal',
    icon: Sparkles,
    accentColor: '#2dd5b7',
    accentGlow: 'rgba(45, 213, 183, 0.25)',
    apiKeyField: 'geminiApiKey',
    keyPlaceholder: 'AIzaSy...',
    keyDocsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'Get Gemini API Key',
    description: 'Connect directly to Google AI Studio with high multimodal throughput and long context windows.'
  },
  {
    id: 'claude',
    label: 'Anthropic Claude',
    badge: 'Deep Reasoning',
    icon: Zap,
    accentColor: '#f59e0b',
    accentGlow: 'rgba(245, 158, 11, 0.25)',
    apiKeyField: 'claudeApiKey',
    keyPlaceholder: 'sk-ant-api...',
    keyDocsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'Get Anthropic API Key',
    description: 'Connect to Anthropic Console for complex P&ID synthesis and rigorous engineering reasoning.'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    badge: 'Industry Standard',
    icon: Globe,
    accentColor: '#10b981',
    accentGlow: 'rgba(16, 185, 129, 0.25)',
    apiKeyField: 'openaiApiKey',
    keyPlaceholder: 'sk-proj-...',
    keyDocsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'Get OpenAI API Key',
    description: 'Connect to OpenAI Platform with standard GPT-4o models and reliable tool execution.'
  },
  {
    id: 'ollama',
    label: 'Local Ollama',
    badge: 'Offline & Free',
    icon: Terminal,
    accentColor: '#38bdf8',
    accentGlow: 'rgba(56, 189, 248, 0.25)',
    apiKeyField: undefined,
    description: 'Run open-weight models directly on your GPU/workstation with 100% offline privacy.'
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
      'Chat in an MCP client (Claude Desktop, Cursor, or any client that supports MCP) on the subscription you already have, with the ProcessForge tools available to it. The app hands your flowsheet and design briefs over; the client does the thinking.'
  }
];

export const AiModelModal: React.FC<AiModelModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged
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

  useEffect(() => {
    if (isOpen) {
      const loaded = getLlmCredentials();
      setCreds(loaded);
      // Open on the provider in use; with no key saved yet, on Claude.
      setActiveProvider(hasValidCredentials(loaded) ? loaded.provider : 'claude');
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

  const handleProviderSelect = (provider: LlmProvider | 'mcp') => {
    setActiveProvider(provider);
    setTestResult(null);
    setShowApiKey(false);
    // Selecting a tab shows that provider's settings; only Save changes what
    // the app uses. It used to switch the active provider on click, keeping
    // the previous provider's model id (a Claude model under Gemini).
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
      const result = await testLlmConnection({
        ...creds,
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
    switch (providerId) {
      case 'gemini':
        return Boolean(creds.geminiApiKey?.trim());
      case 'claude':
        return Boolean(creds.claudeApiKey?.trim());
      case 'openai':
        return Boolean(creds.openaiApiKey?.trim());
      case 'ollama':
        return Boolean(creds.ollamaEndpoint?.trim());
      case 'mcp':
        return false;
      default:
        return false;
    }
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
                  AI model
                </h2>
                <span style={{ fontSize: 11, color: textMuted }} aria-live="polite">
                  Now: {ROUTE_LABELS[route]}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '2px 7px',
                    borderRadius: draftingRadius.sharp,
                    backgroundColor: `${currentProviderMeta.accentColor}20`,
                    color: currentProviderMeta.accentColor,
                    border: `1px solid ${currentProviderMeta.accentColor}40`
                  }}
                >
                  {currentProviderMeta.badge}
                </span>
              </div>
              <p
                style={{
                  margin: '3px 0 0',
                  fontSize: 12,
                  color: textMuted
                }}
              >
                Configure direct browser inference keys, local models, and MCP tool servers
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

        {/* Provider Segmented Bar */}
        <div
          style={{
            padding: '12px 24px 0 24px',
            background: isDark ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.02)'
          }}
        >
          <div
            role="tablist"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 4,
              padding: 4,
              borderRadius: draftingRadius.soft,
              backgroundColor: cardBg,
              border: `1px solid ${borderColor}`
            }}
          >
            {PROVIDERS.map((tab) => {
              const isSelected = activeProvider === tab.id;
              const isActiveEngine = creds.provider === tab.id;
              const hasKey = hasConfiguredKey(tab.id);
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => handleProviderSelect(tab.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 4px',
                    borderRadius: draftingRadius.soft,
                    border: isSelected
                      ? `1px solid ${tab.accentColor}50`
                      : '1px solid transparent',
                    backgroundColor: isSelected
                      ? isDark
                        ? 'rgba(255, 255, 255, 0.07)'
                        : '#ffffff'
                      : 'transparent',
                    color: isSelected ? textColor : textMuted,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)';
                      e.currentTarget.style.color = textColor;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = textMuted;
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon
                      size={14}
                      color={isSelected ? tab.accentColor : textMuted}
                    />
                    <span style={{ fontSize: 11, fontWeight: isSelected ? 700 : 500 }}>
                      {tab.label.replace('Google ', '').replace('Anthropic ', '').replace('Local ', '')}
                    </span>
                    {/* Status dot */}
                    {isActiveEngine && (
                      <span
                        title="Active Engine"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          backgroundColor: '#10b981',
                        }}
                      />
                    )}
                    {!isActiveEngine && hasKey && (
                      <span
                        title="Configured"
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          backgroundColor: textDim
                        }}
                      />
                    )}
                  </div>
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
          {/* Security Assurance Banner */}
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
              <span style={{ fontWeight: 600, color: textColor }}>Direct TLS Architecture:</span>{' '}
              Your key stays on this device (the OS keychain in the desktop app, local storage in a browser) and is sent only to this provider.
              No proxy or intermediary telemetry servers.
            </div>
          </div>

          {/* Form for API-key-based providers (Gemini, Claude, OpenAI) */}
          {activeProvider !== 'ollama' && activeProvider !== 'mcp' && (
            <form onSubmit={handleSaveCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Provider Info text */}
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                {currentProviderMeta.description}
              </div>

              {/* API Key Input Field */}
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
                    placeholder={currentProviderMeta.keyPlaceholder}
                    value={
                      activeProvider === 'gemini'
                        ? creds.geminiApiKey || ''
                        : activeProvider === 'claude'
                          ? creds.claudeApiKey || ''
                          : creds.openaiApiKey || ''
                    }
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      if (activeProvider === 'gemini') {
                        setCreds({ ...creds, geminiApiKey: val });
                      } else if (activeProvider === 'claude') {
                        setCreds({ ...creds, claudeApiKey: val });
                      } else if (activeProvider === 'openai') {
                        setCreds({ ...creds, openaiApiKey: val });
                      }
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
                  Model Architecture
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
              </div>

              {/* Action Buttons Row */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={
                    isTesting ||
                    (activeProvider === 'gemini' && !creds.geminiApiKey) ||
                    (activeProvider === 'claude' && !creds.claudeApiKey) ||
                    (activeProvider === 'openai' && !creds.openaiApiKey)
                  }
                  style={{
                    padding: '9px 16px',
                    borderRadius: draftingRadius.soft,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                    border: `1px solid ${borderColor}`,
                    color: textColor,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor:
                      isTesting ||
                      (activeProvider === 'gemini' && !creds.geminiApiKey) ||
                      (activeProvider === 'claude' && !creds.claudeApiKey) ||
                      (activeProvider === 'openai' && !creds.openaiApiKey)
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      (activeProvider === 'gemini' && !creds.geminiApiKey) ||
                      (activeProvider === 'claude' && !creds.claudeApiKey) ||
                      (activeProvider === 'openai' && !creds.openaiApiKey)
                        ? 0.5
                        : 1,
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
                Add this to your MCP client's configuration (for Claude Desktop, claude_desktop_config.json)
                and restart it. The app cannot detect that connection -- it lives inside the client -- so
                choose this route below once it is set up.
              </p>
              <button
                type="button"
                onClick={() => setAssistantRoute(route === 'claude-desktop' ? 'none' : 'claude-desktop')}
                aria-pressed={route === 'claude-desktop'}
                style={{
                  padding: '9px 14px',
                  borderRadius: draftingRadius.soft,
                  border: `1px solid ${borderColor}`,
                  backgroundColor: route === 'claude-desktop' ? 'rgba(168, 85, 247, 0.18)' : 'transparent',
                  color: textColor,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  alignSelf: 'flex-start'
                }}
              >
                {route === 'claude-desktop' ? 'Using an MCP client — stop' : 'Use an MCP client as my assistant'}
              </button>
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
            <span>{purgeFeedback ? 'All Keys Cleared!' : 'Purge All Keys'}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: textDim }}>
              Active Engine:{' '}
              <strong style={{ color: textColor }}>
                {PROVIDERS.find((p) => p.id === creds.provider)?.label || 'Offline'}
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
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
