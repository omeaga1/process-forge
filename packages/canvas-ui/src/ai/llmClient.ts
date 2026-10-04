/**
 * ProcessForge's in-app LLM client: OpenRouter, on the engineer's own
 * OpenRouter sign-in. Calls go straight from the user's device to OpenRouter,
 * which routes them to the model's own provider under OpenRouter's terms. No
 * ProcessForge server is in the path.
 *
 * OpenRouter is the only model provider inside the app; the other route is an
 * MCP client (ADR-0009). Direct provider keys were removed.
 */

export interface LlmCredentials {
  /** Always 'openrouter'. Kept as a field because stored settings carry it. */
  provider: 'openrouter';
  modelId: string;
  /** Issued by "Sign in with OpenRouter" (OAuth PKCE), or pasted. */
  openrouterApiKey?: string;
  /**
   * Desktop only: the key is held in the OS keychain. Lets synchronous code
   * know a key EXISTS without the key itself being in localStorage. The value
   * is loaded with loadLlmCredentials().
   */
  vaulted?: 'openrouterApiKey'[];
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

/** Models offered in the AI model dialog. Any other OpenRouter model id can be typed in. */
export const OPENROUTER_MODELS: { defaultModel: string; models: { id: string; name: string }[] } = {
  // Checked against OpenRouter's live catalogue (2026-09-23).
  defaultModel: 'anthropic/claude-opus-5.5',
  models: [
    { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5' },
    { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' },
    { id: 'openai/gpt-6-sol', name: 'GPT-6 Sol' },
    { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
    { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick' },
    { id: 'openrouter/auto', name: 'Auto (OpenRouter picks)' },
    // Free, and support tool calling, so the in-app assistant works on them
    // (checked against OpenRouter's catalogue 2026-09-27; rate-limited, and
    // some free providers log prompts). Largest first: designing a unit
    // needs a capable model.
    { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra (free, assistant)' },
    { id: 'thinkingmachines/inkling:free', name: 'Inkling (free, assistant)' },
    { id: 'qwen/qwen3.8-27b:free', name: 'Qwen 3.8 27B (free, assistant)' },
    { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free, assistant)' },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super (free, assistant)' },
    // Needs no credit, so a brand-new account can test the connection. It
    // picks a different free model per request, so the assistant is uneven on it.
    { id: 'openrouter/free', name: 'Any free model (rate-limited)' }
  ]
};

/**
 * OpenRouter: one account, many models (Claude, GPT, Gemini, open-weight).
 * OpenAI-compatible API. The two headers identify the app on OpenRouter's side
 * and are optional.
 */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * OpenRouter's status codes, said plainly. A new account has no credit (402)
 * and a key revoked in OpenRouter's settings fails with 401; both are normal
 * and both need something different from the user.
 */
export function openRouterErrorMessage(status: number, detail?: string): string {
  switch (status) {
    case 401:
      return 'OpenRouter rejected the key. It may have been revoked; sign in with OpenRouter again.';
    case 402:
      return 'Your OpenRouter account has no credit for this model. Add credit at openrouter.ai/credits, or choose "Free models".';
    case 403:
      return `OpenRouter refused this request${detail ? `: ${detail}` : ''}.`;
    case 429:
      return 'OpenRouter is rate-limiting this key (free models especially). Wait a minute and try again.';
    default:
      return detail || `OpenRouter error (HTTP ${status}).`;
  }
}
export function openRouterHeaders(key: string): Record<string, string> {
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

/** Checks the sign-in and the chosen model with a one-word request. */
export async function testLlmConnection(creds: LlmCredentials): Promise<ConnectionTestResult> {
  const start = performance.now();
  try {
    if (!creds.openrouterApiKey?.trim()) {
      return { ok: false, error: 'OpenRouter is not connected' };
    }
    const model = creds.modelId || OPENROUTER_MODELS.defaultModel;
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: openRouterHeaders(creds.openrouterApiKey),
      body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: 'user', content: 'Respond with exactly: OK' }] })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(openRouterErrorMessage(res.status, errData.error?.message));
    }
    return { ok: true, latencyMs: Math.round(performance.now() - start), modelName: model };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Connection test failed' };
  }
}

/** One chat completion on OpenRouter. */
export async function callLlmModel(
  creds: LlmCredentials,
  messages: LlmChatMessage[],
  systemPrompt: string,
  /** A full unit-op contract does not fit in the 2,048 tokens a chat reply gets. */
  options: { maxTokens?: number } = {}
): Promise<LlmCallResult> {
  const start = performance.now();
  if (!creds.openrouterApiKey?.trim()) {
    throw new Error('OpenRouter is not connected. Open AI settings and sign in with OpenRouter.');
  }
  const model = creds.modelId || OPENROUTER_MODELS.defaultModel;
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
    throw new Error(openRouterErrorMessage(res.status, err.error?.message));
  }
  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    model: data.model || model,
    latencyMs: Math.round(performance.now() - start)
  };
}
