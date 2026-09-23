/**
 * ProcessForge Multi-Provider LLM Client (Bring-Your-Own-Subscription)
 * Connects directly to Google Gemini, Anthropic Claude, OpenAI, or Local Ollama.
 * Zero middleman servers: your API keys and prompts stay 100% in your browser.
 */

export type LlmProvider = 'gemini' | 'claude' | 'openai' | 'ollama' | 'openrouter';

export interface LlmCredentials {
  provider: LlmProvider;
  modelId: string;
  geminiApiKey?: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
  /** Issued by "Sign in with OpenRouter" (OAuth PKCE), or pasted. */
  openrouterApiKey?: string;
  ollamaEndpoint?: string;
  /**
   * Desktop only: which key fields are held in the OS keychain. Lets
   * synchronous code know a key EXISTS without the key itself being in
   * localStorage. The value is loaded with loadLlmCredentials().
   */
  vaulted?: ('geminiApiKey' | 'claudeApiKey' | 'openaiApiKey' | 'openrouterApiKey')[];
}

export interface LlmChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmCallResult {
  text: string;
  model: string;
  latencyMs: number;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs?: number;
  modelName?: string;
  error?: string;
}

export const DEFAULT_PROVIDER_MODELS: Record<LlmProvider, { defaultModel: string; models: { id: string; name: string }[] }> = {
  // Model lists checked against OpenRouter's live catalogue (2026-09-23).
  gemini: {
    defaultModel: 'gemini-3.8-flash',
    models: [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
      { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
    ]
  },
  claude: {
    defaultModel: 'claude-opus-5-5',
    models: [
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
      { id: 'claude-opus-5', name: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' }
    ]
  },
  openai: {
    defaultModel: 'gpt-6-sol',
    models: [
      { id: 'gpt-6-sol', name: 'GPT-6 Sol' },
      { id: 'gpt-6-luna', name: 'GPT-6 Luna' },
      { id: 'gpt-4o', name: 'GPT-4o' }
    ]
  },
  openrouter: {
    defaultModel: 'anthropic/claude-opus-5.5',
    models: [
      { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5' },
      { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'openai/gpt-6-sol', name: 'GPT-6 Sol' },
      { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
      { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
      { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick' },
      { id: 'openrouter/auto', name: 'Auto (OpenRouter picks)' }
    ]
  },
  ollama: {
    defaultModel: 'llama3:latest',
    models: [
      { id: 'llama3:latest', name: 'Llama 3 (8B / 70B Local)' },
      { id: 'deepseek-r1:latest', name: 'DeepSeek R1 (Local Reasoning)' },
      { id: 'mistral:latest', name: 'Mistral 7B Local' }
    ]
  }
};

/**
 * OpenRouter: one account, many models (Claude, GPT, Gemini, open-weight).
 * OpenAI-compatible API. The two headers identify the app on OpenRouter's side
 * and are optional.
 */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
function openRouterHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key.trim()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://process-forge.pages.dev',
    'X-Title': 'ProcessForge'
  };
}

/**
 * Utility to mask an API key for safe display in the UI without exposing secrets.
 * Prevents shoulder-surfing and accidental screen share exposure.
 */
export function maskApiKey(key?: string | null): string {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Test connectivity and latency with the chosen provider
 */
export async function testLlmConnection(creds: LlmCredentials): Promise<ConnectionTestResult> {
  const start = performance.now();
  try {
    switch (creds.provider) {
      case 'gemini': {
        if (!creds.geminiApiKey?.trim()) {
          return { ok: false, error: 'Google Gemini API key is missing' };
        }
        const rawModel = creds.modelId || 'gemini-2.5-flash';
        const model = rawModel === 'gemini-2.0-flash' || rawModel === 'gemini-1.5-flash' || rawModel === 'gemini-1.5-pro'
          ? 'gemini-2.5-flash'
          : rawModel;
        // Direct Client-to-Google TLS: Header-based authentication prevents key exposure in proxy/access logs
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': creds.geminiApiKey.trim()
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Respond with exactly: OK' }] }]
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${res.status}: ${res.statusText}`);
        }
        const latencyMs = Math.round(performance.now() - start);
        return { ok: true, latencyMs, modelName: model };
      }

      case 'claude': {
        if (!creds.claudeApiKey?.trim()) {
          return { ok: false, error: 'Anthropic Claude API key is missing' };
        }
        const model = creds.modelId || 'claude-haiku-4-5-20251001';
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': creds.claudeApiKey.trim(),
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'dangerously-allow-browser': 'true',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Respond with exactly: OK' }]
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${res.status}: ${res.statusText}`);
        }
        const latencyMs = Math.round(performance.now() - start);
        return { ok: true, latencyMs, modelName: model };
      }

      case 'openai': {
        if (!creds.openaiApiKey?.trim()) {
          return { ok: false, error: 'OpenAI API key is missing' };
        }
        const model = creds.modelId || 'gpt-4o-mini';
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.openaiApiKey.trim()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Respond with exactly: OK' }]
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${res.status}: ${res.statusText}`);
        }
        const latencyMs = Math.round(performance.now() - start);
        return { ok: true, latencyMs, modelName: model };
      }

      case 'openrouter': {
        if (!creds.openrouterApiKey?.trim()) {
          return { ok: false, error: 'OpenRouter is not connected' };
        }
        const model = creds.modelId || 'anthropic/claude-opus-5.5';
        const res = await fetch(OPENROUTER_CHAT_URL, {
          method: 'POST',
          headers: openRouterHeaders(creds.openrouterApiKey),
          body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: 'user', content: 'Respond with exactly: OK' }] })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${res.status}: ${res.statusText}`);
        }
        return { ok: true, latencyMs: Math.round(performance.now() - start), modelName: model };
      }

      case 'ollama': {
        const endpoint = creds.ollamaEndpoint?.trim() || 'http://localhost:11434';
        const model = creds.modelId || 'llama3:latest';
        const res = await fetch(`${endpoint}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Respond with exactly: OK' }]
          })
        });
        if (!res.ok) {
          throw new Error(`Ollama returned status ${res.status}. Is Ollama running on ${endpoint}?`);
        }
        const latencyMs = Math.round(performance.now() - start);
        return { ok: true, latencyMs, modelName: model };
      }
    }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Connection test failed' };
  }
}

/**
 * Execute an LLM query across any configured provider
 */
export async function callLlmModel(
  creds: LlmCredentials,
  messages: LlmChatMessage[],
  systemPrompt: string,
  /** A full unit-op contract does not fit in the 2,048 tokens a chat reply gets. */
  options: { maxTokens?: number } = {}
): Promise<LlmCallResult> {
  const start = performance.now();
  switch (creds.provider) {
    case 'gemini': {
      if (!creds.geminiApiKey?.trim()) {
        throw new Error('Google Gemini API key not configured. Open AI settings to connect your key.');
      }
      const rawModel = creds.modelId || 'gemini-2.5-flash';
      const model = rawModel === 'gemini-2.0-flash' || rawModel === 'gemini-1.5-flash' || rawModel === 'gemini-1.5-pro'
        ? 'gemini-2.5-flash'
        : rawModel;
      // Direct Client-to-Google TLS: Header-based authentication prevents key exposure in proxy/access logs
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      // Convert messages to Gemini format with systemInstruction
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': creds.geminiApiKey.trim()
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: options.maxTokens ?? 2048
          }
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error (${res.status})`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return {
        text,
        model,
        latencyMs: Math.round(performance.now() - start)
      };
    }

    case 'claude': {
      if (!creds.claudeApiKey?.trim()) {
        throw new Error('Anthropic Claude API key not configured. Open AI settings to connect your key.');
      }
      const model = creds.modelId || 'claude-opus-5-5';
      const formattedMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': creds.claudeApiKey.trim(),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'dangerously-allow-browser': 'true',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens ?? 2048,
          system: systemPrompt,
          messages: formattedMessages
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Claude API error (${res.status})`);
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      return {
        text,
        model,
        latencyMs: Math.round(performance.now() - start)
      };
    }

    case 'openai': {
      if (!creds.openaiApiKey?.trim()) {
        throw new Error('OpenAI API key not configured. Open AI settings to connect your key.');
      }
      const model = creds.modelId || 'gpt-4o';
      const promptMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
      ];

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.openaiApiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: promptMessages,
          temperature: 0.2
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI API error (${res.status})`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      return {
        text,
        model,
        latencyMs: Math.round(performance.now() - start)
      };
    }

    case 'openrouter': {
      if (!creds.openrouterApiKey?.trim()) {
        throw new Error('OpenRouter is not connected. Open AI settings and sign in with OpenRouter.');
      }
      const model = creds.modelId || 'anthropic/claude-opus-5.5';
      const res = await fetch(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: openRouterHeaders(creds.openrouterApiKey),
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens ?? 2048,
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
          ]
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenRouter error (${res.status})`);
      }
      const data = await res.json();
      return {
        text: data.choices?.[0]?.message?.content || '',
        model: data.model || model,
        latencyMs: Math.round(performance.now() - start)
      };
    }

    case 'ollama': {
      const endpoint = creds.ollamaEndpoint?.trim() || 'http://localhost:11434';
      const model = creds.modelId || 'llama3:latest';
      const promptMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
      ];

      const res = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: promptMessages,
          temperature: 0.2
        })
      });

      if (!res.ok) {
        throw new Error(`Ollama error (${res.status}) connecting to ${endpoint}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      return {
        text,
        model,
        latencyMs: Math.round(performance.now() - start)
      };
    }
  }
}
