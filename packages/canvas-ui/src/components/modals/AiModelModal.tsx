import React, { useState, useEffect } from 'react';
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Zap,
  RefreshCw,
  X,
  Eye,
  EyeOff
} from 'lucide-react';
import { OsakaJadePalette } from '@process-forge/theme';
import {
  getAiConfig,
  saveAiConfig,
  resetToOfflineConfig,
  testProviderConnection,
  PROVIDER_METADATA,
  type AiModelConfig,
  type AiProvider
} from '../../ai/aiModelManager.js';

export interface AiModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: (config: AiModelConfig) => void;
}

export const AiModelModal: React.FC<AiModelModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged
}) => {
  const [config, setConfig] = useState<AiModelConfig>(getAiConfig());
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>(config.provider);
  const [apiKey, setApiKey] = useState<string>(config.apiKey || '');
  const [modelId, setModelId] = useState<string>(config.modelId || '');
  const [customEndpoint, setCustomEndpoint] = useState<string>(config.customEndpoint || '');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const active = getAiConfig();
      setConfig(active);
      setSelectedProvider(active.provider);
      setApiKey(active.apiKey || '');
      setModelId(active.modelId || PROVIDER_METADATA[active.provider].defaultModel);
      setCustomEndpoint(active.customEndpoint || '');
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentMeta = PROVIDER_METADATA[selectedProvider];

  const handleProviderChange = (provider: AiProvider) => {
    setSelectedProvider(provider);
    setModelId(PROVIDER_METADATA[provider].defaultModel);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const draftConfig: AiModelConfig = {
        provider: selectedProvider,
        apiKey: apiKey.trim(),
        modelId,
        customEndpoint: customEndpoint.trim()
      };
      const result = await testProviderConnection(draftConfig);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Connection test failed'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const updated: AiModelConfig = {
      provider: selectedProvider,
      apiKey: apiKey.trim(),
      modelId,
      customEndpoint: customEndpoint.trim()
    };
    saveAiConfig(updated);
    setConfig(updated);
    onConfigChanged?.(updated);
    onClose();
  };

  const handleResetToOffline = () => {
    const offline = resetToOfflineConfig();
    setConfig(offline);
    setSelectedProvider('offline');
    setApiKey('');
    setModelId(offline.modelId || 'deterministic-solver-v1');
    setTestResult({
      success: true,
      latencyMs: 1,
      message: 'Reverted to built-in Offline Deterministic Engine (Zero keys).'
    });
    onConfigChanged?.(offline);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 15, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          backgroundColor: OsakaJadePalette.background.surface,
          border: `1px solid ${OsakaJadePalette.border.default}`,
          borderRadius: 14,
          boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
            backgroundColor: OsakaJadePalette.background.surfaceElevated
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: `1px solid ${OsakaJadePalette.jade.glow}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: OsakaJadePalette.jade.glow
              }}
            >
              <Cpu size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                AI Model & Provider Configuration
              </h2>
              <p style={{ margin: 0, fontSize: 12, color: OsakaJadePalette.text.muted }}>
                Choose between built-in zero-key physics math or live frontier LLM reasoning.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: OsakaJadePalette.text.muted,
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Transparency Info Callout */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              border: `1px solid ${OsakaJadePalette.jade.glow}`,
              fontSize: 12,
              lineHeight: 1.5,
              color: OsakaJadePalette.text.secondary
            }}
          >
            <strong style={{ color: OsakaJadePalette.jade.glow }}>Transparent Architecture: </strong>
            ProcessForge includes a <strong>Built-in Offline Physics & CAD Solver</strong> that functions with zero API keys and zero internet access. To enable autonomous LLM reasoning, conversational CAD drafting, and unstructured inquiry, connect your own API key below.
          </div>

          {/* Provider Selection Tabs */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 8, display: 'block' }}>
              Active Intelligence Provider
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              {(Object.keys(PROVIDER_METADATA) as AiProvider[]).map((prov) => {
                const isSelected = selectedProvider === prov;
                const meta = PROVIDER_METADATA[prov];
                return (
                  <button
                    key={prov}
                    onClick={() => handleProviderChange(prov)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '12px 8px',
                      borderRadius: 8,
                      border: isSelected ? `2px solid ${OsakaJadePalette.jade.glow}` : `1px solid ${OsakaJadePalette.border.default}`,
                      backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.12)' : OsakaJadePalette.background.surfaceElevated,
                      color: isSelected ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.secondary,
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    {prov === 'offline' ? <Zap size={16} /> : <Cpu size={16} />}
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{meta.badgeName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Provider Details */}
          <div
            style={{
              padding: 16,
              borderRadius: 10,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                  {currentMeta.name}
                </span>
                {currentMeta.getKeyUrl && (
                  <a
                    href={currentMeta.getKeyUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      color: OsakaJadePalette.jade.glow,
                      textDecoration: 'none'
                    }}
                  >
                    Get API Key <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: OsakaJadePalette.text.muted, lineHeight: 1.4 }}>
                {currentMeta.description}
              </p>
            </div>

            {/* Model Selector */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 4, display: 'block' }}>
                Model Selection
              </label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  backgroundColor: OsakaJadePalette.background.base,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: 12,
                  outline: 'none'
                }}
              >
                {currentMeta.availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key Input (if required) */}
            {currentMeta.requiresApiKey && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 4, display: 'block' }}>
                  Provider API Key
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={currentMeta.keyPlaceholder}
                    style={{
                      width: '100%',
                      padding: '8px 36px 8px 12px',
                      borderRadius: 6,
                      backgroundColor: OsakaJadePalette.background.base,
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      color: OsakaJadePalette.text.primary,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      background: 'none',
                      border: 'none',
                      color: OsakaJadePalette.text.muted,
                      cursor: 'pointer',
                      padding: 4
                    }}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}

            {/* Custom Endpoint for Local MCP / Ollama */}
            {selectedProvider === 'mcp' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 4, display: 'block' }}>
                  Local Ollama / Server Endpoint
                </label>
                <input
                  type="text"
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                  placeholder="http://localhost:11434"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    backgroundColor: OsakaJadePalette.background.base,
                    border: `1px solid ${OsakaJadePalette.border.default}`,
                    color: OsakaJadePalette.text.primary,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    outline: 'none'
                  }}
                />
              </div>
            )}

            {/* Test Connection Button & Result */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 6,
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: 12,
                  cursor: isTesting ? 'wait' : 'pointer'
                }}
              >
                <RefreshCw size={13} className={isTesting ? 'animate-spin' : ''} />
                {isTesting ? 'Testing Connection...' : 'Test Connection'}
              </button>

              {testResult && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: testResult.success ? OsakaJadePalette.jade.glow : '#EF4444'
                  }}
                >
                  {testResult.success ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Privacy Guarantee Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 6,
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              fontSize: 11,
              color: OsakaJadePalette.text.muted
            }}
          >
            <ShieldCheck size={14} color={OsakaJadePalette.jade.glow} />
            <span>
              <strong>Zero-Key Vault:</strong> Keys are kept entirely within your browser or OS DPAPI vault. No telemetry or middleman servers.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderTop: `1px solid ${OsakaJadePalette.border.default}`,
            backgroundColor: OsakaJadePalette.background.surfaceElevated
          }}
        >
          <button
            type="button"
            onClick={handleResetToOffline}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              background: 'transparent',
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.secondary,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Switch to 100% Offline Mode
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                background: 'transparent',
                border: 'none',
                color: OsakaJadePalette.text.muted,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                padding: '8px 18px',
                borderRadius: 6,
                backgroundColor: OsakaJadePalette.jade.glow,
                border: 'none',
                color: OsakaJadePalette.background.base,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Save & Activate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
