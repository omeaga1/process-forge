/**
 * "Sign in with OpenRouter" and the OpenRouter provider, plus the model-id
 * migration that used to rewrite real models (gemini-3.8-flash, claude-opus-5)
 * as if they were fictional.
 */
import { describe, it, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  buildOpenRouterAuthUrl,
  codeChallengeS256,
  createCodeVerifier,
  exchangeOpenRouterCode
} from '../ai/openRouterAuth.js';
import {
  getLlmCredentials,
  saveLlmCredentials,
  loadLlmCredentials,
  hasValidCredentials,
  DEFAULT_PROVIDER_MODELS
} from '../ai/aiModelManager.js';
import { callLlmModel, openRouterErrorMessage } from '../ai/llmClient.js';
import { purgeAllCredentials } from '../ai/aiModelManager.js';

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear()
  };
}
const g = globalThis as unknown as { window?: Record<string, unknown>; fetch: typeof fetch };
const realFetch = g.fetch;
afterEach(() => {
  delete g.window;
  g.fetch = realFetch;
});

describe('OpenRouter PKCE', () => {
  it('computes the S256 challenge from RFC 7636 appendix B', async () => {
    assert.equal(
      await codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    );
  });

  it('makes URL-safe verifiers of the length RFC 7636 allows', () => {
    const v = createCodeVerifier();
    assert.match(v, /^[A-Za-z0-9_-]{43,128}$/);
    assert.notEqual(v, createCodeVerifier());
  });

  it('encodes a web callback, and leaves the desktop placeholder for the shell', () => {
    const web = buildOpenRouterAuthUrl('https://process-forge.pages.dev/openrouter-callback.html', 'abc');
    assert.equal(
      web,
      'https://openrouter.ai/auth?callback_url=https%3A%2F%2Fprocess-forge.pages.dev%2Fopenrouter-callback.html&code_challenge=abc&code_challenge_method=S256'
    );
    // oauth_loopback.rs only opens URLs with this exact prefix and placeholder.
    const desktop = buildOpenRouterAuthUrl('{redirect_uri}', 'abc');
    assert.ok(desktop.startsWith('https://openrouter.ai/auth?'));
    assert.ok(desktop.includes('callback_url={redirect_uri}'));
  });

  it('exchanges the code with the verifier and returns the issued key', async () => {
    let sent: { url: string; body: unknown } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ key: 'sk-or-v1-issued' }), { status: 200 });
    }) as unknown as typeof fetch;
    assert.equal(await exchangeOpenRouterCode('the-code', 'the-verifier', fake), 'sk-or-v1-issued');
    assert.equal(sent?.url, 'https://openrouter.ai/api/v1/auth/keys');
    assert.deepEqual(sent?.body, { code: 'the-code', code_verifier: 'the-verifier', code_challenge_method: 'S256' });
  });

  it('reports OpenRouter\'s own error when no key is issued', async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ error: { message: 'Invalid code' } }), { status: 400 })) as unknown as typeof fetch;
    await assert.rejects(exchangeOpenRouterCode('bad', 'v', fake), /Invalid code/);
  });
});

describe('OpenRouter provider', () => {
  it('counts as configured once a key is saved, and keeps it off localStorage on desktop', async () => {
    const vault = new Map<string, string>();
    g.window = {
      localStorage: makeStorage(),
      __TAURI_INTERNALS__: {
        invoke: async (cmd: string, a: Record<string, string>) => {
          const k = `${a.service}:${a.account}`;
          if (cmd === 'save_secure_token') return void vault.set(k, a.secret ?? '');
          if (cmd === 'get_secure_token') {
            if (!vault.has(k)) throw new Error('not found');
            return vault.get(k);
          }
          if (cmd === 'delete_secure_token') return void vault.delete(k);
          throw new Error(cmd);
        }
      }
    };
    saveLlmCredentials({ provider: 'openrouter', modelId: 'anthropic/claude-opus-5.5', openrouterApiKey: 'sk-or-v1-secret' });
    await new Promise((r) => setTimeout(r, 0));
    const sync = getLlmCredentials();
    assert.equal(sync.openrouterApiKey, undefined);
    assert.deepEqual(sync.vaulted, ['openrouterApiKey']);
    assert.equal(hasValidCredentials(sync), true);
    assert.equal((await loadLlmCredentials()).openrouterApiKey, 'sk-or-v1-secret');
  });

  it('calls the OpenAI-compatible endpoint with a Bearer key and the system prompt first', async () => {
    let req: { url: string; init: RequestInit } | undefined;
    g.fetch = (async (url: string, init: RequestInit) => {
      req = { url, init };
      return new Response(JSON.stringify({ model: 'anthropic/claude-opus-5.5', choices: [{ message: { content: 'hi' } }] }), {
        status: 200
      });
    }) as unknown as typeof fetch;
    const out = await callLlmModel(
      { provider: 'openrouter', modelId: 'anthropic/claude-opus-5.5', openrouterApiKey: 'sk-or-v1-k' },
      [{ role: 'user', content: 'hello' }],
      'be brief',
      { maxTokens: 8192 }
    );
    assert.equal(out.text, 'hi');
    assert.equal(req?.url, 'https://openrouter.ai/api/v1/chat/completions');
    const headers = req?.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer sk-or-v1-k');
    const body = JSON.parse(String(req?.init.body));
    assert.equal(body.max_tokens, 8192);
    assert.deepEqual(body.messages[0], { role: 'system', content: 'be brief' });
  });

  it('offers a default that is in its own list', () => {
    const p = DEFAULT_PROVIDER_MODELS.openrouter;
    assert.ok(p.models.some((m) => m.id === p.defaultModel));
  });
});

describe('OpenRouter errors, said plainly', () => {
  it('tells a new account how to get going when it has no credit', () => {
    assert.match(openRouterErrorMessage(402), /credit/);
    assert.match(openRouterErrorMessage(402), /Free models/);
  });
  it('points a revoked key at signing in again', () => {
    assert.match(openRouterErrorMessage(401), /sign in with OpenRouter again/);
  });
  it("keeps OpenRouter's own detail for anything else", () => {
    assert.equal(openRouterErrorMessage(400, 'Invalid model'), 'Invalid model');
  });
  it('surfaces a 402 from a real call as that message', async () => {
    g.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Insufficient credits' } }), { status: 402 })) as unknown as typeof fetch;
    await assert.rejects(
      callLlmModel({ provider: 'openrouter', modelId: 'anthropic/claude-opus-5.5', openrouterApiKey: 'k' }, [], 's'),
      /openrouter\.ai\/credits/
    );
  });
  it('offers a free model, so a new account can test without credit', () => {
    assert.ok(DEFAULT_PROVIDER_MODELS.openrouter.models.some((m) => m.id === 'openrouter/free'));
  });
});

describe('Purge all keys', () => {
  it('removes the OpenRouter key from the keychain too', async () => {
    const vault = new Map<string, string>([
      ['com.processforge.studio:openrouter:api_key', 'sk-or'],
      ['com.processforge.studio:claude:api_key', 'sk-ant']
    ]);
    g.window = {
      localStorage: makeStorage(),
      __TAURI_INTERNALS__: {
        invoke: async (cmd: string, a: Record<string, string>) => {
          const svc = (a.service ?? '').startsWith('com.processforge.studio:') ? a.service : `com.processforge.studio:${a.service}`;
          if (cmd === 'delete_secure_token') return void vault.delete(`${svc}:${a.account}`);
          throw new Error(cmd);
        }
      }
    };
    await purgeAllCredentials();
    assert.deepEqual([...vault.keys()], []);
  });
});

describe('Stored model ids', () => {
  for (const [provider, modelId] of [
    ['gemini', 'gemini-3.8-flash'],
    ['gemini', 'gemini-3.6-flash'],
    ['claude', 'claude-opus-5']
  ] as const) {
    it(`keeps ${modelId}: it is a real model`, () => {
      g.window = { localStorage: makeStorage() };
      (g.window.localStorage as ReturnType<typeof makeStorage>).setItem(
        'pf_ai_credentials',
        JSON.stringify({ provider, modelId })
      );
      assert.equal(getLlmCredentials().modelId, modelId);
    });
  }

  it('still moves a retired Gemini id forward', () => {
    g.window = { localStorage: makeStorage() };
    (g.window.localStorage as ReturnType<typeof makeStorage>).setItem(
      'pf_ai_credentials',
      JSON.stringify({ provider: 'gemini', modelId: 'gemini-1.5-pro' })
    );
    assert.notEqual(getLlmCredentials().modelId, 'gemini-1.5-pro');
  });
});
