/**
 * With an OS keychain available (the desktop app), API keys are stored there
 * and never in localStorage, for every provider, and read back from it.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  saveLlmCredentials,
  getLlmCredentials,
  loadLlmCredentials,
  migratePlaintextCredentialsToVault,
  hasSecureVault,
  hasValidCredentials,
  isAgentChatUnlocked
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
  // __TAURI_INTERNALS__ is what Tauri v2 injects. window.__TAURI__ only exists
  // with app.withGlobalTauri, which this app does not set; the previous
  // harness simulated it, so these tests passed against an environment that
  // no shipped build had.
  g.window = { localStorage: makeStorage(), __TAURI_INTERNALS__: { invoke: vault.invoke } };
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
      'claude is stored in the vault too'
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

describe('Desktop: knowing a key exists without holding it', () => {
  it('keeps chat unlocked after a save, though localStorage has no key', async () => {
    asDesktop();
    saveLlmCredentials({ provider: 'claude', modelId: 'claude-opus-5', claudeApiKey: 'sk-ant-secret' });
    assert.ok(!rawStored().includes('sk-ant-secret'));

    const sync = getLlmCredentials();
    assert.equal(sync.claudeApiKey, undefined);
    assert.deepEqual(sync.vaulted, ['claudeApiKey']);
    // Without the marker these read the key as missing and locked the chat on
    // desktop the moment keys moved to the keychain.
    assert.equal(hasValidCredentials(sync), true);
    assert.equal(isAgentChatUnlocked(undefined, sync).unlocked, true);
  });

  it('does not forget one provider\'s key when another is saved', async () => {
    const vault = asDesktop();
    saveLlmCredentials({ provider: 'gemini', geminiApiKey: 'g-key' });
    saveLlmCredentials({ provider: 'claude', claudeApiKey: 'c-key' });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual([...(getLlmCredentials().vaulted ?? [])].sort(), ['claudeApiKey', 'geminiApiKey']);
    assert.equal(vault.store.get('com.processforge.studio:gemini:api_key') ?? vault.store.get('gemini:api_key'), 'g-key');
  });

  it('forgets a key cleared with an empty string, in both places', async () => {
    const vault = asDesktop();
    saveLlmCredentials({ provider: 'openai', openaiApiKey: 'o-key' });
    await new Promise((r) => setTimeout(r, 0));
    saveLlmCredentials({ openaiApiKey: '' });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(getLlmCredentials().vaulted, undefined);
    assert.equal([...vault.store.keys()].some((k) => k.includes('openai')), false);
  });

  it('detects the vault from __TAURI_INTERNALS__ alone', () => {
    asDesktop();
    assert.equal('__TAURI__' in (g.window as object), false);
    assert.equal(hasSecureVault(), true);
  });
});

describe('Migration never loses a key', () => {
  it('keeps a plaintext key whose keychain write failed', async () => {
    asDesktop();
    (g.window as any).__TAURI_INTERNALS__.invoke = async () => {
      throw new Error('keychain locked');
    };
    (g.window!.localStorage as ReturnType<typeof makeStorage>).setItem(
      STORAGE_KEY_LLM_CREDS,
      JSON.stringify({ provider: 'openai', modelId: 'gpt', openaiApiKey: 'only-copy' })
    );
    assert.equal(await migratePlaintextCredentialsToVault(), false);
    assert.ok(rawStored().includes('only-copy'), 'the only copy of the key must survive');
  });
});
