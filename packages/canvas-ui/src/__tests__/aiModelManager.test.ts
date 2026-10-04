import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  getAiConnection,
  saveAiConnection,
  resetToOfflineConfig,
  isAgentChatUnlocked,
  maskApiKey,
  purgeAllCredentials,
  saveLlmCredentials,
  getLlmCredentials,
  testLlmConnection
} from '../ai/aiModelManager.js';
import {
  dispatchUnitOpMessage,
  dispatchMasterOrchestratorMessage
} from '../ai/aiDispatch.js';
import type { ProcessNode } from '@process-forge/protocol';

describe('AI connection manager', () => {
  // Mock localStorage for Node.js test environment
  const store: Record<string, string> = {};
  beforeEach(() => {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
    (global as any).window = {
      localStorage: {
        getItem: (k: string) => store[k] || null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        }
      }
    };
  });

  it('defaults to no AI model, and stores no key in the connection state', () => {
    const conn = getAiConnection();
    assert.strictEqual(conn.mode, 'offline');
    assert.strictEqual((conn as any).apiKey, undefined);
  });

  it("reads an older version's 'mcp' or 'oauth' mode as offline (those modes did nothing)", () => {
    store['pf_ai_connection_state'] = JSON.stringify({ mode: 'mcp', mcp: { status: 'connected' } });
    assert.strictEqual(getAiConnection().mode, 'offline');
    store['pf_ai_connection_state'] = JSON.stringify({ mode: 'oauth' });
    assert.strictEqual(getAiConnection().mode, 'offline');
    saveAiConnection({ mode: 'openrouter', provider: 'openrouter' });
    assert.strictEqual(getAiConnection().mode, 'openrouter');
    assert.deepStrictEqual(JSON.parse(store['pf_ai_connection_state']!), { mode: 'openrouter' });
  });

  it('reads a removed provider (claude, openai, gemini, ollama) as offline', () => {
    for (const mode of ['claude', 'openai', 'gemini', 'ollama']) {
      store['pf_ai_connection_state'] = JSON.stringify({ mode });
      assert.strictEqual(getAiConnection().mode, 'offline', mode);
    }
  });

  it('with no model: the unit-op studio says what still works', async () => {
    const mockNode: ProcessNode = {
      id: 'rx-201',
      name: 'Jacketed Polymerization Reactor RX-201',
      kind: 'BATCH_REACTOR',
      position: { x: 100, y: 100 },
      inputs: [],
      outputs: [],
      config: { batchVolumeGallons: 1000 }
    };

    resetToOfflineConfig();

    const res = await dispatchUnitOpMessage(
      'Redesign this reactor with cooling coils',
      {
        node: mockNode,
        upstreamContext: 'Monomer Feed 25 gpm',
        downstreamContext: 'Flash Drum V-202',
        config: mockNode.config
      },
      { provider: 'offline' }
    );

    assert.strictEqual(res.isOfflineSolver, true);
    assert.strictEqual(res.senderBadge, 'Offline (Local Only)');
    assert.ok(res.text.includes('"Jacketed Polymerization Reactor RX-201" can be edited and simulated'));
    assert.ok(res.text.includes('Connect a model in AI settings, or use an MCP client'));
    assert.ok(!/OAuth|SSO|Enterprise/.test(res.text));
  });

  it('with no model: the flowsheet assistant says it is offline and what it can still do', async () => {
    resetToOfflineConfig();

    const res = await dispatchMasterOrchestratorMessage(
      'Optimize plant throughput',
      {
        graphName: 'Architectural Coatings Line',
        nodeCount: 5,
        totalPackaged: 200,
        averageRatePerMin: 40
      },
      { provider: 'offline' }
    );

    assert.strictEqual(res.isOfflineSolver, true);
    assert.ok(res.text.includes('Working offline'));
    // Says what IS possible offline, rather than only what is not.
    assert.ok(res.text.includes('add a surge tank'));
    assert.strictEqual(res.createdNode, undefined, 'a throughput question must not create a node');
  });

  it('in offline mode: a plain request for standard equipment is fulfilled with no model', async () => {
    // Standard equipment needs no model.
    resetToOfflineConfig();
    const res = await dispatchMasterOrchestratorMessage(
      'add a surge tank',
      { graphName: 'Architectural Coatings Line', nodeCount: 5, totalPackaged: 0, averageRatePerMin: 0 },
      { provider: 'offline' }
    );
    assert.strictEqual(res.isOfflineSolver, true);
    assert.ok(res.createdNode, 'offline mode should place standard equipment');
    assert.strictEqual(res.createdNode.kind, 'SURGE_TANK');
  });

  it('in offline mode: an ambiguous request asks instead of guessing', async () => {
    resetToOfflineConfig();
    const res = await dispatchMasterOrchestratorMessage(
      'add a reactor with a feed pump',
      { graphName: 'Architectural Coatings Line', nodeCount: 5, totalPackaged: 0, averageRatePerMin: 0 },
      { provider: 'offline' }
    );
    assert.strictEqual(res.createdNode, undefined);
    assert.ok(res.clarification);
    assert.deepEqual(res.clarification.options.map((o) => o.kind).sort(), ['BATCH_REACTOR', 'PUMP']);
  });

  it('in-app chat is locked until an AI model is connected', () => {
    resetToOfflineConfig();
    const locked = isAgentChatUnlocked(getAiConnection(), { provider: 'openrouter', modelId: 'openrouter/free' });
    assert.strictEqual(locked.unlocked, false);
    assert.strictEqual(locked.activeProvider, 'none');
    assert.ok(locked.reason?.includes('No AI model is connected'));

    const unlocked = isAgentChatUnlocked(getAiConnection(), {
      provider: 'openrouter',
      modelId: 'openrouter/free',
      openrouterApiKey: 'sk-or-v1-test'
    });
    assert.strictEqual(unlocked.unlocked, true);
    assert.strictEqual(unlocked.activeProvider, 'openrouter');
  });

  it('maskApiKey shows only the ends of a key', () => {
    assert.strictEqual(maskApiKey('sk-ant-api03-1234567890abcdef'), 'sk-a...cdef');
    assert.strictEqual(maskApiKey('AIzaSyD-abc123xyz789'), 'AIza...z789');
    assert.strictEqual(maskApiKey('short'), '••••••••');
    assert.strictEqual(maskApiKey(''), '');
    assert.strictEqual(maskApiKey(undefined), '');
  });

  it('purgeAllCredentials removes every key and returns to no model', async () => {
    saveLlmCredentials({ provider: 'openrouter', openrouterApiKey: 'sk-or-SecretToBePurged123' });

    const beforePurge = getLlmCredentials();
    assert.strictEqual(beforePurge.openrouterApiKey, 'sk-or-SecretToBePurged123');
    assert.strictEqual(getAiConnection().mode, 'openrouter');

    await purgeAllCredentials();

    const afterPurge = getLlmCredentials();
    assert.strictEqual(afterPurge.openrouterApiKey, undefined);
    assert.strictEqual(getAiConnection().mode, 'offline');
    assert.strictEqual(isAgentChatUnlocked().unlocked, false);
  });

  it('sends the key in a header, never in the URL', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      capturedUrl = url;
      capturedHeaders = opts.headers || {};
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'OK' } }] })
      } as any;
    };

    try {
      const result = await testLlmConnection({
        provider: 'openrouter',
        modelId: 'openrouter/free',
        openrouterApiKey: 'sk-or-DirectHeaderKey999'
      });

      assert.strictEqual(result.ok, true);
      assert.strictEqual(capturedUrl, 'https://openrouter.ai/api/v1/chat/completions');
      assert.ok(!capturedUrl.includes('sk-or-DirectHeaderKey999'), 'API key must not be present anywhere in URL');
      assert.strictEqual(capturedHeaders.Authorization, 'Bearer sk-or-DirectHeaderKey999');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
