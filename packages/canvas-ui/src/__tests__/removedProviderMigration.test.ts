/**
 * Settings saved by a version that could call Claude, OpenAI, Gemini or Ollama
 * directly: they read as "not configured", their keys are deleted (from
 * localStorage, and from the keychain on desktop), and the AI model dialog gets
 * a notice to show once. An OpenRouter key saved alongside them survives.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  getLlmCredentials,
  loadLlmCredentials,
  hasValidCredentials,
  getAiConnection,
  migrateRemovedProviders,
  takeRemovedProviderNotice
} from '../ai/aiModelManager.js';

function makeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k)
  };
}

const g = globalThis as unknown as { window?: Record<string, unknown> };
let storage: ReturnType<typeof makeStorage>;

function asBrowser() {
  storage = makeStorage();
  g.window = { localStorage: storage };
}
/** Desktop with a keychain that already holds entries, keyed by service. */
function asDesktop(entries: Record<string, string>) {
  storage = makeStorage();
  const vault = new Map(Object.entries(entries));
  g.window = {
    localStorage: storage,
    __TAURI_INTERNALS__: {
      invoke: async (cmd: string, a: Record<string, string>) => {
        if (cmd === 'delete_secure_token') return void vault.delete(a.service!);
        if (cmd === 'get_secure_token') {
          if (!vault.has(a.service!)) throw new Error('not found');
          return vault.get(a.service!);
        }
        if (cmd === 'save_secure_token') return void vault.set(a.service!, a.secret ?? '');
        throw new Error(cmd);
      }
    }
  };
  return vault;
}
const stored = (v: unknown) => storage.setItem('pf_ai_credentials', JSON.stringify(v));

beforeEach(() => asBrowser());
afterEach(() => {
  delete g.window;
});

describe('Removed providers', () => {
  for (const [provider, field] of [
    ['claude', 'claudeApiKey'],
    ['openai', 'openaiApiKey'],
    ['gemini', 'geminiApiKey']
  ] as const) {
    it(`a saved ${provider} key reads as not configured, is deleted, and leaves a notice`, async () => {
      stored({ provider, modelId: 'some-model', [field]: 'old-secret' });
      storage.setItem('pf_ai_connection_state', JSON.stringify({ mode: provider }));

      // Not configured even before the migration runs.
      assert.equal(hasValidCredentials(getLlmCredentials()), false);
      assert.equal(getAiConnection().mode, 'offline');

      assert.equal(await migrateRemovedProviders(), provider);
      assert.ok(!storage.getItem('pf_ai_credentials')!.includes('old-secret'), 'the old key must be deleted');
      assert.deepEqual(JSON.parse(storage.getItem('pf_ai_connection_state')!), { mode: 'offline' });

      const notice = takeRemovedProviderNotice();
      assert.match(notice ?? '', /direct API keys are no longer supported/);
      assert.match(notice ?? '', /OpenRouter/);
      assert.match(notice ?? '', /MCP client/);
      assert.equal(takeRemovedProviderNotice(), null, 'the notice is shown once');
    });
  }

  it('Ollama gets its own notice, since it had no key', async () => {
    stored({ provider: 'ollama', modelId: 'llama3:latest', ollamaEndpoint: 'http://localhost:11434' });
    assert.equal(await migrateRemovedProviders(), 'ollama');
    assert.ok(!storage.getItem('pf_ai_credentials')!.includes('11434'));
    assert.match(takeRemovedProviderNotice() ?? '', /Ollama models are no longer supported/);
  });

  it('keeps an OpenRouter key saved alongside a removed provider', async () => {
    stored({ provider: 'claude', modelId: 'claude-opus-5', claudeApiKey: 'c', openrouterApiKey: 'sk-or-keep' });
    await migrateRemovedProviders();
    const creds = getLlmCredentials();
    assert.equal(creds.provider, 'openrouter');
    assert.equal(creds.openrouterApiKey, 'sk-or-keep');
    // A Claude model id is not an OpenRouter id, so the default is used.
    assert.equal(creds.modelId, 'anthropic/claude-opus-5.5');
    assert.equal(hasValidCredentials(creds), true);
  });

  it('scrubs a stale key left by a provider that was not the one in use, without a notice', async () => {
    stored({ provider: 'openrouter', modelId: 'openrouter/free', openrouterApiKey: 'k', geminiApiKey: 'stale' });
    assert.equal(await migrateRemovedProviders(), null);
    assert.ok(!storage.getItem('pf_ai_credentials')!.includes('stale'));
    assert.equal(getLlmCredentials().openrouterApiKey, 'k');
    assert.equal(takeRemovedProviderNotice(), null);
  });

  it('deletes the removed keys from the desktop keychain, and leaves the OpenRouter one', async () => {
    const vault = asDesktop({ claude: 'c-secret', openai: 'o-secret', openrouter: 'sk-or' });
    stored({ provider: 'claude', modelId: 'claude-opus-5', vaulted: ['claudeApiKey', 'openaiApiKey', 'openrouterApiKey'] });
    assert.equal(await migrateRemovedProviders(), 'claude');
    assert.deepEqual([...vault.keys()], ['openrouter']);
    assert.deepEqual(getLlmCredentials().vaulted, ['openrouterApiKey']);
    assert.equal((await loadLlmCredentials()).openrouterApiKey, 'sk-or');
  });

  it('does nothing for current OpenRouter settings, or none', async () => {
    assert.equal(await migrateRemovedProviders(), null);
    stored({ provider: 'openrouter', modelId: 'openrouter/free', openrouterApiKey: 'k' });
    const before = storage.getItem('pf_ai_credentials');
    assert.equal(await migrateRemovedProviders(), null);
    assert.equal(storage.getItem('pf_ai_credentials'), before);
    assert.equal(takeRemovedProviderNotice(), null);
  });
});
