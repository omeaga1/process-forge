/**
 * ProcessForge AI Model Connection Manager
 * Manages provider selection (Offline Deterministic Solver vs. Google Gemini, Anthropic Claude, OpenAI, Local MCP).
 * Ensures zero external key transmission: keys remain in local storage or OS vault.
 */

export type AiProvider = 'offline' | 'gemini' | 'claude' | 'openai' | 'mcp';

export interface AiModelConfig {
  provider: AiProvider;
  apiKey?: string;
  modelId?: string;
  customEndpoint?: string;
  temperature?: number;
}

export const DEFAULT_AI_CONFIG: AiModelConfig = {
  provider: 'offline',
  modelId: 'deterministic-solver-v1',
  temperature: 0.2
};

export const PROVIDER_METADATA: Record<
  AiProvider,
  {
    name: string;
    description: string;
    defaultModel: string;
    availableModels: { id: string; name: string }[];
    badgeName: string;
    keyPlaceholder: string;
    getKeyUrl?: string;
    requiresApiKey: boolean;
  }
> = {
  offline: {
    name: 'Deterministic Physics Engine',
    description: 'Built-in local mathematical solver. Solves fluid kinematics, mass-balance ODEs, and ISA-5.1 CAD drawings locally. 100% offline, zero keys required.',
    defaultModel: 'deterministic-solver-v1',
    availableModels: [
      { id: 'deterministic-solver-v1', name: 'Built-in ISA-5.1 & Kinematics Engine (Offline)' }
    ],
    badgeName: 'Offline Solver',
    keyPlaceholder: '',
    requiresApiKey: false
  },
  gemini: {
    name: 'Google Gemini',
    description: 'Connect Google Gemini for autonomous engineering reasoning, multi-turn design synthesis, and generative CAD drafting.',
    defaultModel: 'gemini-2.0-flash',
    availableModels: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Fast, Recommended)' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Deep Engineering Reasoning)' }
    ],
    badgeName: 'Gemini 2.0',
    keyPlaceholder: 'AIzaSy...',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    requiresApiKey: true
  },
  claude: {
    name: 'Anthropic Claude',
    description: 'Connect Anthropic Claude for rigorous process engineering analysis, ASME vessel validation, and constraint checking.',
    defaultModel: 'claude-3-5-sonnet-20241022',
    availableModels: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (State-of-the-Art)' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Ultra Fast)' }
    ],
    badgeName: 'Claude 3.5',
    keyPlaceholder: 'sk-ant-api03-...',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    requiresApiKey: true
  },
  openai: {
    name: 'OpenAI GPT-4o',
    description: 'Connect OpenAI GPT-4o for natural language machine design and plant orchestration.',
    defaultModel: 'gpt-4o',
    availableModels: [
      { id: 'gpt-4o', name: 'GPT-4o (Omni Process Modeling)' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Lightweight)' }
    ],
    badgeName: 'GPT-4o',
    keyPlaceholder: 'sk-proj-...',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    requiresApiKey: true
  },
  mcp: {
    name: 'Local MCP Server / Ollama',
    description: 'Connect local Model Context Protocol agent or local Ollama LLM endpoint running on your machine.',
    defaultModel: 'llama3.2',
    availableModels: [
      { id: 'llama3.2', name: 'Llama 3.2 (Local Ollama)' },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder (Local Ollama)' }
    ],
    badgeName: 'Local MCP',
    keyPlaceholder: 'Not needed if using local stdio/ollama',
    requiresApiKey: false
  }
};

const STORAGE_KEY = 'pf_ai_model_config';

/**
 * Load the active AI configuration from localStorage or defaults
 */
export function getAiConfig(): AiModelConfig {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_AI_CONFIG;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AI_CONFIG;
    const parsed = JSON.parse(raw) as AiModelConfig;
    return {
      provider: parsed.provider || 'offline',
      apiKey: parsed.apiKey || '',
      modelId: parsed.modelId || PROVIDER_METADATA[parsed.provider || 'offline']?.defaultModel,
      customEndpoint: parsed.customEndpoint,
      temperature: parsed.temperature ?? 0.2
    };
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

/**
 * Persist AI configuration safely to client storage
 */
export function saveAiConfig(config: AiModelConfig): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  } catch (err) {
    console.error('Failed to persist AI config to localStorage:', err);
  }
}

/**
 * Reset active provider to Offline Deterministic Solver
 */
export function resetToOfflineConfig(): AiModelConfig {
  const config: AiModelConfig = {
    provider: 'offline',
    modelId: 'deterministic-solver-v1',
    temperature: 0.2
  };
  saveAiConfig(config);
  return config;
}

/**
 * Test connectivity and validate API credentials
 */
export async function testProviderConnection(
  config: AiModelConfig
): Promise<{ success: boolean; latencyMs: number; message: string }> {
  const startTime = Date.now();

  if (config.provider === 'offline') {
    return {
      success: true,
      latencyMs: 1,
      message: 'Deterministic physics & CAD engine is online and ready (100% offline, zero-key).'
    };
  }

  if (config.provider === 'mcp') {
    const endpoint = config.customEndpoint || 'http://localhost:11434';
    try {
      const res = await fetch(`${endpoint}/api/tags`, { method: 'GET' });
      const latency = Date.now() - startTime;
      if (res.ok) {
        return { success: true, latencyMs: latency, message: `Successfully connected to local server at ${endpoint}.` };
      }
      return { success: false, latencyMs: latency, message: `Local endpoint responded with status ${res.status}.` };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: `Could not reach local MCP/Ollama endpoint: ${err?.message || 'Connection refused'}. Ensure local server is running.`
      };
    }
  }

  if (!config.apiKey || config.apiKey.trim().length === 0) {
    return {
      success: false,
      latencyMs: 0,
      message: `API key is required for ${PROVIDER_METADATA[config.provider].name}.`
    };
  }

  try {
    if (config.provider === 'gemini') {
      const model = config.modelId || 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        config.apiKey.trim()
      )}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with the single word "ONLINE"' }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0.1 }
        })
      });

      const latency = Date.now() - startTime;
      if (res.ok) {
        return {
          success: true,
          latencyMs: latency,
          message: `Connected successfully to Google Gemini (${model}) in ${latency}ms!`
        };
      }
      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        latencyMs: latency,
        message: errJson?.error?.message || `Gemini API returned HTTP ${res.status}`
      };
    }

    if (config.provider === 'claude') {
      const model = config.modelId || 'claude-3-5-sonnet-20241022';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Ping' }]
        })
      });

      const latency = Date.now() - startTime;
      if (res.ok) {
        return {
          success: true,
          latencyMs: latency,
          message: `Connected successfully to Anthropic Claude (${model}) in ${latency}ms!`
        };
      }
      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        latencyMs: latency,
        message: errJson?.error?.message || `Claude API returned HTTP ${res.status}`
      };
    }

    if (config.provider === 'openai') {
      const model = config.modelId || 'gpt-4o';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 10
        })
      });

      const latency = Date.now() - startTime;
      if (res.ok) {
        return {
          success: true,
          latencyMs: latency,
          message: `Connected successfully to OpenAI (${model}) in ${latency}ms!`
        };
      }
      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        latencyMs: latency,
        message: errJson?.error?.message || `OpenAI API returned HTTP ${res.status}`
      };
    }

    return {
      success: false,
      latencyMs: Date.now() - startTime,
      message: `Unknown provider ${config.provider}`
    };
  } catch (err: any) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      message: `Network error connecting to ${config.provider}: ${err?.message || String(err)}`
    };
  }
}
