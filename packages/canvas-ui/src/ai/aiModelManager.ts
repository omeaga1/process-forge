/**
 * ProcessForge AI connection manager: whether OpenRouter is signed in inside
 * the app, and its key. (An MCP client is the other route: see
 * assistantRoute.ts.)
 *
 * The key is the user's own. On desktop it is stored in the OS keychain and
 * never in localStorage; in a browser there is no keychain, so localStorage is
 * the only store (stated in the UI, not hidden). Without any AI, users keep
 * full access to their created and installed unit ops.
 */

/** OpenRouter signed in inside the app, or no model. */
export type AiConnectionMode = 'openrouter' | 'offline';
// Backwards compatibility alias for components expecting AiProvider
export type AiProvider = AiConnectionMode;

export {
  type LlmCredentials,
  type ConnectionTestResult,
  OPENROUTER_MODELS,
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
  openrouter: {
    name: 'OpenRouter',
    badgeName: 'OpenRouter',
    description: 'One sign-in, many models (Claude, GPT, Gemini, open-weight), billed to your OpenRouter account.',
    isOnline: true
  },
  offline: {
    name: 'No Model Connected',
    badgeName: 'No Model',
    description: 'Sign in with OpenRouter in AI model settings, or use an MCP client.',
    isOnline: false
  }
};

// Legacy compatibility lookup
export const PROVIDER_METADATA = CONNECTION_METADATA;

const STORAGE_KEY = 'pf_ai_connection_state';
const STORAGE_KEY_LLM_CREDS = 'pf_ai_credentials';
/** Set when a removed provider was cleared; read once by the AI model dialog. */
const STORAGE_KEY_REMOVED_NOTICE = 'pf_ai_removed_provider_notice';

import type { LlmCredentials } from './llmClient.js';
import { OPENROUTER_MODELS } from './llmClient.js';

/** Credential fields that are secrets and must never reach localStorage on desktop. */
const SECRET_FIELDS = ['openrouterApiKey'] as const;

/** Keychain service name per secret. */
const SECRET_SERVICE: Record<(typeof SECRET_FIELDS)[number], string> = {
  openrouterApiKey: 'openrouter'
};

/**
 * Providers earlier versions could call directly, with the localStorage field
 * and keychain service each kept its key under. Only the migration reads this.
 */
const REMOVED_PROVIDERS = {
  gemini: { field: 'geminiApiKey', service: 'gemini', name: 'Google Gemini' },
  claude: { field: 'claudeApiKey', service: 'claude', name: 'Anthropic Claude' },
  openai: { field: 'openaiApiKey', service: 'openai', name: 'OpenAI' },
  ollama: { field: undefined, service: undefined, name: 'Ollama' }
} as const;
export type RemovedProvider = keyof typeof REMOVED_PROVIDERS;
const LEGACY_FIELDS = ['geminiApiKey', 'claudeApiKey', 'openaiApiKey', 'ollamaEndpoint'] as const;

const defaultCredentials = (): LlmCredentials => ({ provider: 'openrouter', modelId: OPENROUTER_MODELS.defaultModel });

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

/**
 * Stored settings as OpenRouter settings. Anything an earlier version saved
 * for a removed provider (its key, its model id) is dropped here, so it reads
 * as not configured even before migrateRemovedProviders() has cleaned it up.
 */
function normalize(stored: Record<string, unknown>): LlmCredentials {
  const creds = defaultCredentials();
  if (stored.provider === 'openrouter' && typeof stored.modelId === 'string' && stored.modelId) creds.modelId = stored.modelId;
  if (typeof stored.openrouterApiKey === 'string' && stored.openrouterApiKey) creds.openrouterApiKey = stored.openrouterApiKey;
  if (Array.isArray(stored.vaulted) && stored.vaulted.includes('openrouterApiKey')) creds.vaulted = ['openrouterApiKey'];
  return creds;
}

export function getLlmCredentials(): LlmCredentials {
  if (typeof window === 'undefined' || !window.localStorage) return defaultCredentials();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_LLM_CREDS);
    if (raw) return normalize(JSON.parse(raw) as Record<string, unknown>);
  } catch (e) {}
  return defaultCredentials();
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
  if (creds.provider !== 'openrouter') return false;
  return Boolean(creds.openrouterApiKey?.trim()) || Boolean(creds.vaulted?.includes('openrouterApiKey'));
}

export interface AgentChatLockStatus {
  unlocked: boolean;
  activeProvider: string;
  reason?: string;
}

/**
 * In-app chat needs an OpenRouter sign-in.
 * (`_state` is kept for callers; the sign-in lives in the credentials.)
 */
export function isAgentChatUnlocked(
  _state?: AiConnectionState,
  creds?: LlmCredentials
): AgentChatLockStatus {
  const activeCreds = creds || getLlmCredentials();

  if (hasValidCredentials(activeCreds)) {
    return {
      unlocked: true,
      activeProvider: activeCreds.provider
    };
  }

  return {
    unlocked: false,
    activeProvider: 'none',
    reason: 'No AI model is connected. Sign in with OpenRouter in AI model settings to chat here.'
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
  // Every secret, from the one list, so a new one is purged too.
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

/**
 * One-time cleanup for settings saved by a version that could call Gemini,
 * Claude, OpenAI or Ollama directly. Those settings now read as "not
 * configured"; this deletes the stale keys (from localStorage, and from the OS
 * keychain on desktop, best-effort) and leaves a notice for the AI model
 * dialog to show once. An OpenRouter key saved alongside them is kept.
 *
 * The localStorage part runs synchronously, before the returned promise's first
 * await, so a caller can read takeRemovedProviderNotice() right after calling
 * it. Resolves to the removed provider that was in use, if any. Safe to call
 * repeatedly.
 */
export async function migrateRemovedProviders(): Promise<RemovedProvider | null> {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  let stored: Record<string, unknown>;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_LLM_CREDS);
    stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return null;
  }

  const wasInUse = (Object.keys(REMOVED_PROVIDERS) as RemovedProvider[]).find((p) => p === stored.provider) ?? null;
  const vaulted = Array.isArray(stored.vaulted) ? (stored.vaulted as string[]) : [];
  const staleInVault = Object.values(REMOVED_PROVIDERS).filter((p) => p.field && vaulted.includes(p.field));
  const staleInStorage = LEGACY_FIELDS.some((f) => f in stored);
  if (!wasInUse && staleInVault.length === 0 && !staleInStorage) return null;

  try {
    window.localStorage.setItem(STORAGE_KEY_LLM_CREDS, JSON.stringify(normalize(stored)));
    if (wasInUse) window.localStorage.setItem(STORAGE_KEY_REMOVED_NOTICE, wasInUse);
  } catch {}
  // The connection mode named the same provider; it now reads as offline, so store that.
  const conn = getAiConnection();
  saveAiConnection(conn);

  // Best-effort: a keychain entry that is already gone is not an error worth showing.
  for (const p of staleInVault) if (p.service) await deleteTauriSecureToken(p.service, 'api_key');
  return wasInUse;
}

/**
 * The notice left by migrateRemovedProviders(), cleared as it is read so it is
 * shown once. Null when there is nothing to say.
 */
export function takeRemovedProviderNotice(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  let provider: string | null = null;
  try {
    provider = window.localStorage.getItem(STORAGE_KEY_REMOVED_NOTICE);
    window.localStorage.removeItem(STORAGE_KEY_REMOVED_NOTICE);
  } catch {
    return null;
  }
  if (!provider || !(provider in REMOVED_PROVIDERS)) return null;
  if (provider === 'ollama') {
    return 'Local Ollama models are no longer supported, so that setting was removed. Sign in with OpenRouter below for AI in the app (it includes open-weight models), or use an MCP client.';
  }
  const name = REMOVED_PROVIDERS[provider as RemovedProvider].name;
  return `Your ${name} API key was removed: direct API keys are no longer supported. Sign in with OpenRouter below (it reaches the same models), or use an MCP client.`;
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
    // Providers since removed (gemini, claude, openai, ollama) read as offline too.
    const m: AiConnectionMode = mode === 'openrouter' ? 'openrouter' : 'offline';
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
