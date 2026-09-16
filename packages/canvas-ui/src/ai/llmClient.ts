/**
 * ProcessForge Multi-Provider LLM Client (Bring-Your-Own-Subscription)
 * Connects directly to Google Gemini, Anthropic Claude, OpenAI, or Local Ollama.
 * Zero middleman servers: your API keys and prompts stay 100% in your browser.
 */

export type LlmProvider = 'gemini' | 'claude' | 'openai' | 'ollama';

export interface LlmCredentials {
  provider: LlmProvider;
  modelId: string;
  geminiApiKey?: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
  ollamaEndpoint?: string;
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
  gemini: {
    defaultModel: 'gemini-3.6-flash',
    models: [
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash' },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
    ]
  },
  claude: {
    defaultModel: 'claude-3-7-sonnet-latest',
    models: [
      { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' }
    ]
  },
  openai: {
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3-mini', name: 'o3-mini' }
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
        const rawModel = creds.modelId || 'gemini-3.6-flash';
        const model = rawModel === 'gemini-2.0-flash' || rawModel === 'gemini-1.5-flash' || rawModel === 'gemini-1.5-pro'
          ? 'gemini-3.6-flash'
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
        const model = creds.modelId || 'claude-3-5-haiku-latest';
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
  systemPrompt: string
): Promise<LlmCallResult> {
  const start = performance.now();
  switch (creds.provider) {
    case 'gemini': {
      if (!creds.geminiApiKey?.trim()) {
        throw new Error('Google Gemini API key not configured. Open AI settings to connect your key.');
      }
      const rawModel = creds.modelId || 'gemini-3.6-flash';
      const model = rawModel === 'gemini-2.0-flash' || rawModel === 'gemini-1.5-flash' || rawModel === 'gemini-1.5-pro'
        ? 'gemini-3.6-flash'
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
            maxOutputTokens: 2048
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
      const model = creds.modelId || 'claude-3-7-sonnet-latest';
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
          max_tokens: 2048,
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
