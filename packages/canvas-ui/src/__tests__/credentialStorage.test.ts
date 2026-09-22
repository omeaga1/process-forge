/**
 * API keys must not sit in plaintext localStorage when an OS keychain is
 * available.
 *
 * The audited state: `saveLlmCredentials` wrote every key to localStorage
 * unconditionally and first; the keychain copy covered only gemini and openai
 * (never claude); and `get_secure_token` was defined in Rust and registered as
 * a handler but never invoked from TypeScript, so the read path was always
 * localStorage. The vault was write-only decoration and every key was in
 * plaintext regardless. See docs/audit/01-claims.md.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  saveLlmCredentials,
  getLlmCredentials,
  loadLlmCredentials,
  migratePlaintextCredentialsToVault,
  hasSecureVault
} from '../ai/aiModelManager.js';

const STORAGE_KEY_LLM_CREDS = 'pf_ai_credentials';

/** Minimal localStorage stand-in. */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    get size() {
      return map.size;
    }
  };
}

/** Stand-in for the Tauri keychain bridge. */
function makeVault() {
  const store = new Map<string, string>();
  return {
    store,
    invoke: async (cmd: string, args: Record<string, string>) => {
      const key = `${args.service}:${args.account}`;
      if (cmd === 'save_secure_token') {
        store.set(key, args.secret ?? '');
        return undefined;
      }
      if (cmd === 'get_secure_token') {
        const v = store.get(key);
        if (v === undefined) throw new Error('not found');
        return v;
      }
      if (cmd === 'delete_secure_token') {
        store.delete(key);
        return undefined;
      }
      throw new Error(`unknown command ${cmd}`);
    }
  };
}

const g = globalThis as unknown as { window?: Record<string, unknown> };

function asDesktop() {
  const vault = makeVault();
  g.window = { localStorage: makeStorage(), __TAURI__: { core: { invoke: vault.invoke } } };
  return vault;
}
function asBrowser() {
  g.window = { localStorage: makeStorage() };
}
function rawStored(): string {
  return (g.window!.localStorage as ReturnType<typeof makeStorage>).getItem(
    STORAGE_KEY_LLM_CREDS
  ) ?? '';
}

beforeEach(() => asBrowser());
afterEach(() => {
  delete g.window;
});

describe('Secure vault detection', () => {
  it('reports a vault inside the desktop shell', () => {
    asDesktop();
    assert.equal(hasSecureVault(), true);
  });
  it('reports no vault in a browser tab', () => {
    asBrowser();
    assert.equal(hasSecureVault(), false);
  });
});

describe('Desktop: secrets go to the keychain, never to localStorage', () => {
  it('writes no API key into localStorage', async () => {
    asDesktop();
    saveLlmCredentials({
      provider: 'claude',
      modelId: 'claude-sonnet-5',
      claudeApiKey: 'sk-ant-SECRET-VALUE',
      geminiApiKey: 'AIza-SECRET-VALUE',
      openaiApiKey: 'sk-openai-SECRET-VALUE'
    });
    await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget writes settle

    const raw = rawStored();
    for (const secret of ['sk-ant-SECRET-VALUE', 'AIza-SECRET-VALUE', 'sk-openai-SECRET-VALUE']) {
      assert.ok(!raw.includes(secret), `"${secret}" leaked into localStorage: ${raw}`);
    }
    // Non-secret settings are still persisted.
    assert.ok(raw.includes('claude-sonnet-5'));
  });

  it('stores all three providers in the vault, claude included', async () => {
    const vault = asDesktop();
    saveLlmCredentials({
      provider: 'claude',
      modelId: 'claude-sonnet-5',
      claudeApiKey: 'c-key',
      geminiApiKey: 'g-key',
      openaiApiKey: 'o-key'
    });
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(vault.store.get('gemini:api_key'), 'g-key');
    assert.equal(vault.store.get('openai:api_key'), 'o-key');
    assert.equal(
      vault.store.get('claude:api_key'),
      'c-key',
      'claude was previously missing from the vault entirely'
    );
  });

  it('reads secrets back out of the vault', async () => {
    asDesktop();
    saveLlmCredentials({ provider: 'claude', modelId: 'claude-sonnet-5', claudeApiKey: 'round-trip' });
    await new Promise((r) => setTimeout(r, 0));

    // The synchronous read deliberately has no secret in it...
    assert.equal(getLlmCredentials().claudeApiKey, undefined);
    // ...and the async read resolves it from the vault.
    const loaded = await loadLlmCredentials();
    assert.equal(loaded.claudeApiKey, 'round-trip');
    assert.equal(loaded.modelId, 'claude-sonnet-5');
  });

  it('returns nothing rather than a stale value when the vault has no entry', async () => {
    asDesktop();
    saveLlmCredentials({ provider: 'gemini', modelId: 'gemini-2.5-flash' });
    const loaded = await loadLlmCredentials();
    assert.equal(loaded.geminiApiKey, undefined);
  });
});

describe('Browser: no vault available', () => {
  it('still persists the key, because a tab has nowhere better', async () => {
    asBrowser();
    saveLlmCredentials({ provider: 'gemini', modelId: 'gemini-2.5-flash', geminiApiKey: 'web-key' });
    // This is a real limitation of running in a browser, not an oversight.
    assert.ok(rawStored().includes('web-key'));
    assert.equal((await loadLlmCredentials()).geminiApiKey, 'web-key');
  });
});

describe('Migration off plaintext', () => {
  it('moves pre-existing plaintext keys into the vault and scrubs them', async () => {
    // Simulate an install that already has plaintext keys from an old version.
    const vault = asDesktop();
    (g.window!.localStorage as ReturnType<typeof makeStorage>).setItem(
      STORAGE_KEY_LLM_CREDS,
      JSON.stringify({
        provider: 'openai',
        modelId: 'gpt-4o',
        openaiApiKey: 'legacy-plaintext-key'
      })
    );
    assert.ok(rawStored().includes('legacy-plaintext-key'), 'precondition');

    const migrated = await migratePlaintextCredentialsToVault();

    assert.equal(migrated, true);
    assert.equal(vault.store.get('openai:api_key'), 'legacy-plaintext-key');
    assert.ok(
      !rawStored().includes('legacy-plaintext-key'),
      `plaintext survived migration: ${rawStored()}`
    );
    assert.equal((await loadLlmCredentials()).openaiApiKey, 'legacy-plaintext-key');
  });

  it('is a no-op when there is nothing to migrate', async () => {
    asDesktop();
    assert.equal(await migratePlaintextCredentialsToVault(), false);
  });

  it('does nothing in a browser, where there is no vault to migrate into', async () => {
    asBrowser();
    saveLlmCredentials({ provider: 'gemini', modelId: 'gemini-2.5-flash', geminiApiKey: 'k' });
    assert.equal(await migratePlaintextCredentialsToVault(), false);
  });
});
