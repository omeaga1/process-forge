/**
 * With an OS keychain available (the desktop app), the OpenRouter key is
 * stored there and never in localStorage, and read back from it.
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
    const vault = asDesktop();
    saveLlmCredentials({ provider: 'openrouter', modelId: 'anthropic/claude-sonnet-5', openrouterApiKey: 'sk-or-SECRET-VALUE' });
    await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget writes settle

    const raw = rawStored();
    assert.ok(!raw.includes('sk-or-SECRET-VALUE'), `the key leaked into localStorage: ${raw}`);
    assert.equal(vault.store.get('openrouter:api_key'), 'sk-or-SECRET-VALUE');
    // Non-secret settings are still persisted.
    assert.ok(raw.includes('anthropic/claude-sonnet-5'));
  });

  it('reads secrets back out of the vault', async () => {
    asDesktop();
    saveLlmCredentials({ provider: 'openrouter', modelId: 'anthropic/claude-sonnet-5', openrouterApiKey: 'round-trip' });
    await new Promise((r) => setTimeout(r, 0));

    // The synchronous read deliberately has no secret in it...
    assert.equal(getLlmCredentials().openrouterApiKey, undefined);
    // ...and the async read resolves it from the vault.
    const loaded = await loadLlmCredentials();
    assert.equal(loaded.openrouterApiKey, 'round-trip');
    assert.equal(loaded.modelId, 'anthropic/claude-sonnet-5');
  });

  it('returns nothing rather than a stale value when the vault has no entry', async () => {
    asDesktop();
    saveLlmCredentials({ provider: 'openrouter', modelId: 'openrouter/free' });
    const loaded = await loadLlmCredentials();
    assert.equal(loaded.openrouterApiKey, undefined);
  });
});

describe('Browser: no vault available', () => {
  it('still persists the key, because a tab has nowhere better', async () => {
    asBrowser();
    saveLlmCredentials({ provider: 'openrouter', modelId: 'openrouter/free', openrouterApiKey: 'web-key' });
    // This is a real limitation of running in a browser, not an oversight.
    assert.ok(rawStored().includes('web-key'));
    assert.equal((await loadLlmCredentials()).openrouterApiKey, 'web-key');
  });
});

describe('Migration off plaintext', () => {
  it('moves pre-existing plaintext keys into the vault and scrubs them', async () => {
    // Simulate an install that already has plaintext keys from an old version.
    const vault = asDesktop();
    (g.window!.localStorage as ReturnType<typeof makeStorage>).setItem(
      STORAGE_KEY_LLM_CREDS,
      JSON.stringify({
        provider: 'openrouter',
        modelId: 'openrouter/free',
        openrouterApiKey: 'legacy-plaintext-key'
      })
    );
    assert.ok(rawStored().includes('legacy-plaintext-key'), 'precondition');

    const migrated = await migratePlaintextCredentialsToVault();

    assert.equal(migrated, true);
    assert.equal(vault.store.get('openrouter:api_key'), 'legacy-plaintext-key');
    assert.ok(
      !rawStored().includes('legacy-plaintext-key'),
      `plaintext survived migration: ${rawStored()}`
    );
    assert.equal((await loadLlmCredentials()).openrouterApiKey, 'legacy-plaintext-key');
  });

  it('is a no-op when there is nothing to migrate', async () => {
    asDesktop();
    assert.equal(await migratePlaintextCredentialsToVault(), false);
  });

  it('does nothing in a browser, where there is no vault to migrate into', async () => {
    asBrowser();
    saveLlmCredentials({ provider: 'openrouter', modelId: 'openrouter/free', openrouterApiKey: 'k' });
    assert.equal(await migratePlaintextCredentialsToVault(), false);
  });
});

describe('Desktop: knowing a key exists without holding it', () => {
  it('keeps chat unlocked after a save, though localStorage has no key', async () => {
    asDesktop();
    saveLlmCredentials({ provider: 'openrouter', modelId: 'anthropic/claude-opus-5.5', openrouterApiKey: 'sk-or-secret' });
    assert.ok(!rawStored().includes('sk-or-secret'));

    const sync = getLlmCredentials();
    assert.equal(sync.openrouterApiKey, undefined);
    assert.deepEqual(sync.vaulted, ['openrouterApiKey']);
    // Without the marker these read the key as missing and locked the chat on
    // desktop the moment keys moved to the keychain.
    assert.equal(hasValidCredentials(sync), true);
    assert.equal(isAgentChatUnlocked(undefined, sync).unlocked, true);
  });

  it('does not forget the key when only the model changes', async () => {
    const vault = asDesktop();
    saveLlmCredentials({ provider: 'openrouter', openrouterApiKey: 'or-key' });
    saveLlmCredentials({ modelId: 'openrouter/free' });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(getLlmCredentials().vaulted, ['openrouterApiKey']);
    assert.equal(vault.store.get('openrouter:api_key'), 'or-key');
  });

  it('forgets a key cleared with an empty string (sign out), in both places', async () => {
    const vault = asDesktop();
    saveLlmCredentials({ provider: 'openrouter', openrouterApiKey: 'or-key' });
    await new Promise((r) => setTimeout(r, 0));
    saveLlmCredentials({ openrouterApiKey: '' });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(getLlmCredentials().vaulted, undefined);
    assert.equal([...vault.store.keys()].some((k) => k.includes('openrouter')), false);
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
      JSON.stringify({ provider: 'openrouter', modelId: 'openrouter/free', openrouterApiKey: 'only-copy' })
    );
    assert.equal(await migratePlaintextCredentialsToVault(), false);
    assert.ok(rawStored().includes('only-copy'), 'the only copy of the key must survive');
  });
});
