/**
 * ProcessForge AI connection manager: which assistant route is in use (an AI
 * provider inside the app, an MCP client, or none) and the provider
 * credentials.
 *
 * Keys are the user's own. On desktop they are stored in the OS keychain and
 * never in localStorage; in a browser there is no keychain, so localStorage is
 * the only store (stated in the UI, not hidden). Without any AI, users keep
 * full access to their created and installed unit ops.
 */

/** The AI provider in use inside the app, or none. (An MCP client is a separate route: see assistantRoute.ts.) */
export type AiConnectionMode = 'gemini' | 'claude' | 'openai' | 'ollama' | 'openrouter' | 'offline';
// Backwards compatibility alias for components expecting AiProvider
export type AiProvider = AiConnectionMode;

export {
  type LlmProvider,
  type LlmCredentials,
  type ConnectionTestResult,
  DEFAULT_PROVIDER_MODELS,
  testLlmConnection,
  callLlmModel,
  maskApiKey
} from './llmClient.js';

export interface AiConnectionState {
  mode: AiConnectionMode;
  provider: AiConnectionMode; // Alias for mode
}

// Backwards-compatible legacy interface shape for existing callers
export interface AiModelConfig {
  provider: AiConnectionMode;
  mode?: AiConnectionMode;
  modelId?: string;
  temperature?: number;
  customEndpoint?: string;
  apiKey?: string;
}

export const DEFAULT_CONNECTION_STATE: AiConnectionState = {
  mode: 'offline',
  provider: 'offline'
};

export const DEFAULT_AI_CONFIG: AiModelConfig = {
  provider: 'offline',
  mode: 'offline',
  modelId: 'offline',
  temperature: 0.2
};

export const CONNECTION_METADATA: Record<
  AiConnectionMode,
  {
    name: string;
    badgeName: string;
    description: string;
    isOnline: boolean;
  }
> = {
  gemini: {
    name: 'Google Gemini',
    badgeName: 'Gemini',
    description: 'Your own Google AI Studio API key, called directly from this device.',
    isOnline: true
  },
  claude: {
    name: 'Anthropic Claude',
    badgeName: 'Claude',
    description: 'Your own Anthropic Console API key, called directly from this device.',
    isOnline: true
  },
  openai: {
    name: 'OpenAI',
    badgeName: 'GPT',
    description: 'Your own OpenAI Platform API key, called directly from this device.',
    isOnline: true
  },
  openrouter: {
    name: 'OpenRouter',
    badgeName: 'OpenRouter',
    description: 'One sign-in, many models (Claude, GPT, Gemini, open-weight), billed to your OpenRouter account.',
    isOnline: true
  },
  ollama: {
    name: 'Local Ollama',
    badgeName: 'Ollama',
    description: 'A model running in Ollama on this computer. Nothing leaves it.',
    isOnline: true
  },
  offline: {
    name: 'No Model Connected',
    badgeName: 'No Model',
    description:
      'Sign in with OpenRouter, add a Claude, GPT or Gemini key, or use a local Ollama model, in AI model settings.',
    isOnline: false
  },
};

// Legacy compatibility lookup
export const PROVIDER_METADATA = CONNECTION_METADATA;

const STORAGE_KEY = 'pf_ai_connection_state';
const STORAGE_KEY_LLM_CREDS = 'pf_ai_credentials';

import type { LlmCredentials } from './llmClient.js';
import { DEFAULT_PROVIDER_MODELS } from './llmClient.js';

/** Credential fields that are secrets and must never reach localStorage on desktop. */
const SECRET_FIELDS = ['geminiApiKey', 'claudeApiKey', 'openaiApiKey', 'openrouterApiKey'] as const;

/** Keychain service name per provider secret. */
const SECRET_SERVICE: Record<(typeof SECRET_FIELDS)[number], string> = {
  geminiApiKey: 'gemini',
  claudeApiKey: 'claude',
  openaiApiKey: 'openai',
  openrouterApiKey: 'openrouter'
};

/**
 * True when the OS keychain is reachable, i.e. we are inside the Tauri shell.
 *
 * This is the pivot for the whole module. On the desktop the keychain is the
 * only place a secret is written. In the browser there is no keychain, so
 * localStorage remains the only option -- that is a real limitation of running
 * in a tab, and it is stated rather than papered over.
 */
export function hasSecureVault(): boolean {
  return tauriInvoke() !== undefined;
}

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/**
 * The Tauri IPC bridge.
 *
 * Tauri v2 always injects `__TAURI_INTERNALS__`. The friendlier
 * `window.__TAURI__` global exists only when `app.withGlobalTauri` is set,
 * which this app does not set, so checking only `__TAURI__` would miss it.
 */
function tauriInvoke(): TauriInvoke | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: TauriInvoke };
    __TAURI__?: { core?: { invoke?: TauriInvoke } };
  };
  const fn = w.__TAURI_INTERNALS__?.invoke ?? w.__TAURI__?.core?.invoke;
  return typeof fn === 'function' ? fn : undefined;
}

type SecretField = (typeof SECRET_FIELDS)[number];

/**
 * Strips every secret, recording which ones are in the keychain so that
 * synchronous checks (is chat unlocked? which provider?) still know a key
 * exists without it being readable here.
 */
function withoutSecrets(creds: LlmCredentials, vaulted: SecretField[]): LlmCredentials {
  const copy: LlmCredentials = { ...creds };
  for (const f of SECRET_FIELDS) delete copy[f];
  if (vaulted.length > 0) copy.vaulted = [...new Set(vaulted)];
  else delete copy.vaulted;
  return copy;
}

export function getLlmCredentials(): LlmCredentials {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { provider: 'gemini', modelId: 'gemini-2.5-flash' };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_LLM_CREDS);
    if (raw) {
      const parsed = JSON.parse(raw) as LlmCredentials;
      // Stored model ids the provider has retired move to its current
      // default. List only ids that are actually retired.
      const RETIRED_GEMINI = new Set([
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro'
      ]);
      const RETIRED_CLAUDE = new Set([
        'claude-3-7-sonnet-latest',
        'claude-3-5-haiku-latest',
        'claude-3-opus-latest'
      ]);
      if (parsed.provider === 'gemini' && (!parsed.modelId || RETIRED_GEMINI.has(parsed.modelId))) {
        parsed.modelId = DEFAULT_PROVIDER_MODELS.gemini.defaultModel;
      }
      if (parsed.provider === 'claude' && (!parsed.modelId || RETIRED_CLAUDE.has(parsed.modelId))) {
        parsed.modelId = 'claude-opus-5-5';
      }
      return parsed;
    }
  } catch (e) {}
  return { provider: 'gemini', modelId: 'gemini-2.5-flash' };
}

export function saveLlmCredentials(creds: Partial<LlmCredentials>): LlmCredentials {
  const current = getLlmCredentials();
  const updated: LlmCredentials = { ...current, ...creds };

  // On desktop the OS keychain is the store of record, and the localStorage
  // copy carries no secrets.
  const secure = hasSecureVault();
  // A field passed as '' is a request to forget that key.
  const cleared = SECRET_FIELDS.filter((f) => f in creds && !creds[f]);
  const vaulted = [
    ...(current.vaulted ?? []).filter((f) => !cleared.includes(f)),
    ...SECRET_FIELDS.filter((f) => Boolean(updated[f]))
  ];
  const persisted = secure ? withoutSecrets(updated, vaulted) : updated;
  if (secure) updated.vaulted = [...new Set(vaulted)];

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY_LLM_CREDS, JSON.stringify(persisted));
    } catch (e) {}
  }

  if (secure) {
    for (const field of SECRET_FIELDS) {
      const value = updated[field];
      if (value) {
        // Fire-and-forget by design: a keychain write must not block the UI.
        // Failures are surfaced by the read path returning nothing, not by
        // pretending the secret was stored.
        void saveTauriSecureToken(SECRET_SERVICE[field], 'api_key', value);
      }
    }
    for (const field of cleared) void deleteTauriSecureToken(SECRET_SERVICE[field], 'api_key');
  }

  // Automatically switch connection mode to the authenticated provider
  if (hasValidCredentials(updated)) {
    try {
      const conn = getAiConnection();
      conn.mode = updated.provider;
      conn.provider = updated.provider;
      saveAiConnection(conn);
    } catch {}
  }

  return updated;
}

export function hasValidCredentials(creds?: LlmCredentials | null): boolean {
  if (!creds) return false;
  const has = (f: SecretField) => Boolean(creds[f]?.trim()) || Boolean(creds.vaulted?.includes(f));
  switch (creds.provider) {
    case 'gemini':
      return has('geminiApiKey');
    case 'claude':
      return has('claudeApiKey');
    case 'openai':
      return has('openaiApiKey');
    case 'openrouter':
      return has('openrouterApiKey');
    case 'ollama':
      return Boolean(creds.ollamaEndpoint?.trim() || true);
    default:
      return false;
  }
}

export interface AgentChatLockStatus {
  unlocked: boolean;
  activeProvider: string;
  reason?: string;
}

/**
 * In-app chat needs an AI model: a provider key, OpenRouter sign-in, or Ollama.
 * (`_state` is kept for callers; the provider choice lives in the credentials.)
 */
export function isAgentChatUnlocked(
  _state?: AiConnectionState,
  creds?: LlmCredentials
): AgentChatLockStatus {
  const activeCreds = creds || getLlmCredentials();

  // An AI provider in the app with a key (or Ollama).
  if (hasValidCredentials(activeCreds)) {
    return {
      unlocked: true,
      activeProvider: activeCreds.provider
    };
  }

  return {
    unlocked: false,
    activeProvider: 'none',
    reason: 'No AI model is connected. Add a key or sign in with OpenRouter in AI model settings to chat here.'
  };
}

/**
 * 1-Click Complete Purge: Deletes all stored keys from localStorage and OS Keyring
 */
export async function purgeAllCredentials(): Promise<void> {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY_LLM_CREDS);
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }
  // Every provider secret, from the one list, so a new provider is purged too.
  for (const field of SECRET_FIELDS) await deleteTauriSecureToken(SECRET_SERVICE[field], 'api_key');
  resetToOfflineConfig();
}

/** Reads a secret from the OS keychain. */
async function getTauriSecureToken(service: string, account: string): Promise<string | undefined> {
  const invoke = tauriInvoke();
  if (!invoke) return undefined;
  try {
    const value = await invoke('get_secure_token', { service, account });
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  } catch {
    // A miss is normal: nothing has been stored for this provider yet.
    return undefined;
  }
}

/**
 * The credentials to actually use: non-secret settings from localStorage, with
 * every secret loaded from the OS keychain on desktop.
 *
 * Callers that need a key must await this rather than reading
 * getLlmCredentials() directly, because on desktop the synchronous read
 * deliberately has no secrets in it.
 */
export async function loadLlmCredentials(): Promise<LlmCredentials> {
  const base = getLlmCredentials();
  if (!hasSecureVault()) return base;

  const resolved: LlmCredentials = { ...base };
  for (const field of SECRET_FIELDS) {
    const fromVault = await getTauriSecureToken(SECRET_SERVICE[field], 'api_key');
    if (fromVault) resolved[field] = fromVault;
  }
  return resolved;
}

/**
 * One-time migration for anyone who already has plaintext keys in localStorage
 * from a previous version: move them into the keychain and scrub the plaintext.
 * Safe to call repeatedly.
 */
export async function migratePlaintextCredentialsToVault(): Promise<boolean> {
  if (!hasSecureVault()) return false;
  const existing = getLlmCredentials();
  const secrets = SECRET_FIELDS.filter((f) => Boolean(existing[f]));
  if (secrets.length === 0) return false;

  // Scrub only what the keychain confirmed. A key whose write failed stays in
  // localStorage rather than being deleted from the one place it exists.
  const moved: SecretField[] = [];
  for (const field of secrets) {
    if (await saveTauriSecureToken(SECRET_SERVICE[field], 'api_key', existing[field] as string)) moved.push(field);
  }
  if (moved.length === 0) return false;
  const kept: LlmCredentials = withoutSecrets(existing, [...(existing.vaulted ?? []), ...moved]);
  for (const field of secrets) if (!moved.includes(field)) kept[field] = existing[field];
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY_LLM_CREDS, JSON.stringify(kept));
    } catch (e) {}
  }
  return true;
}

/** Resolves true only when the keychain accepted the secret. */
async function saveTauriSecureToken(service: string, account: string, secret: string): Promise<boolean> {
  const invoke = tauriInvoke();
  if (!invoke) return false;
  try {
    await invoke('save_secure_token', { service, account, secret });
    return true;
  } catch (e) {
    console.warn('Could not save to native secure token vault:', e);
    return false;
  }
}

async function deleteTauriSecureToken(service: string, account: string): Promise<void> {
  const invoke = tauriInvoke();
  if (invoke) {
    try {
      await invoke('delete_secure_token', { service, account });
    } catch (e) {
      console.warn('Could not delete from native secure token vault:', e);
    }
  }
}

/** The stored provider choice (the key itself is separate: see getLlmCredentials). */
export function getAiConnection(): AiConnectionState {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_CONNECTION_STATE;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONNECTION_STATE;
    const mode = (JSON.parse(raw) as { mode?: string }).mode;
    // Older versions stored 'mcp' and 'oauth' modes that did nothing; they read as offline.
    const known: AiConnectionMode[] = ['gemini', 'claude', 'openai', 'ollama', 'openrouter'];
    const m = known.includes(mode as AiConnectionMode) ? (mode as AiConnectionMode) : 'offline';
    return { mode: m, provider: m };
  } catch {
    return DEFAULT_CONNECTION_STATE;
  }
}

export function saveAiConnection(state: AiConnectionState): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: state.mode }));
    }
  } catch (err) {
    console.error('Failed to persist AI connection state:', err);
  }
}

/**
 * Backwards compatibility helper for getAiConfig()
 */
export function getAiConfig(): AiModelConfig {
  const creds = getLlmCredentials();
  const conn = getAiConnection();
  if (hasValidCredentials(creds)) {
    return {
      provider: creds.provider,
      mode: creds.provider,
      modelId: creds.modelId,
      temperature: 0.2
    };
  }
  return {
    provider: conn.mode,
    mode: conn.mode,
    modelId: 'offline',
    temperature: 0.2
  };
}

/**
 * Backwards compatibility helper for saveAiConfig()
 */
export function saveAiConfig(config: Partial<AiModelConfig>): void {
  const next: AiConnectionMode = config.provider ?? 'offline';
  saveAiConnection({ mode: next, provider: next });
}

/**
 * Reset connection to Offline (Local Unit-Ops Only)
 */
export function resetToOfflineConfig(): AiModelConfig {
  const conn = getAiConnection();
  conn.mode = 'offline';
  conn.provider = 'offline';
  saveAiConnection(conn);
  return getAiConfig();
}
