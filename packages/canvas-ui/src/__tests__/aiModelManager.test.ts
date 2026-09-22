import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  getAiConnection,
  saveAiConnection,
  resetToOfflineConfig,
  testProviderConnection,
  initiateOAuthLogin,
  signOutOAuth,
  disconnectMcp,
  disconnectAll,
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

describe('AI Connection Manager & Zero-Key Architecture (ADR-0005)', () => {
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

  it('should default to Offline (Local Unit-Ops Only) with zero raw keys', async () => {
    const conn = getAiConnection();
    assert.strictEqual(conn.mode, 'offline');
    assert.strictEqual(conn.mcp.status, 'disconnected');
    assert.strictEqual(conn.oauth.status, 'unauthenticated');
    assert.strictEqual((conn as any).apiKey, undefined);

    const testRes = await testProviderConnection({ provider: 'offline' });
    assert.strictEqual(testRes.success, true);
    assert.ok(testRes.message.includes('Offline mode'));
  });

  it('should configure and persist MCP connection parameters', () => {
    const conn = getAiConnection();
    conn.mode = 'mcp';
    conn.mcp.endpoint = 'http://localhost:3001/mcp';
    conn.mcp.status = 'connected';
    conn.mcp.serverName = 'custom-process-forge-mcp';
    saveAiConnection(conn);

    const loaded = getAiConnection();
    assert.strictEqual(loaded.mode, 'mcp');
    assert.strictEqual(loaded.mcp.endpoint, 'http://localhost:3001/mcp');
    assert.strictEqual(loaded.mcp.status, 'connected');
    assert.strictEqual(loaded.mcp.serverName, 'custom-process-forge-mcp');
  });

  it('should authenticate via OAuth 2.0 PKCE with zero raw keys and persist session', () => {
    const session = initiateOAuthLogin('google', {
      email: 'lead.engineer@industrial-chem.com',
      name: 'Dr. Elena Rostova',
      organization: 'Industrial Chem Systems'
    });

    assert.strictEqual(session.mode, 'oauth');
    assert.strictEqual(session.oauth.status, 'authenticated');
    assert.strictEqual(session.oauth.userEmail, 'lead.engineer@industrial-chem.com');
    assert.ok(session.oauth.token?.startsWith('pkce_google_session_'));
    assert.strictEqual((session as any).apiKey, undefined);

    const reloaded = getAiConnection();
    assert.strictEqual(reloaded.mode, 'oauth');
    assert.strictEqual(reloaded.oauth.userEmail, 'lead.engineer@industrial-chem.com');
  });

  it('should revert to offline mode upon OAuth sign-out', () => {
    initiateOAuthLogin('github');
    assert.strictEqual(getAiConnection().mode, 'oauth');

    const signedOut = signOutOAuth();
    assert.strictEqual(signedOut.mode, 'offline');
    assert.strictEqual(signedOut.oauth.status, 'unauthenticated');
    assert.strictEqual(getAiConnection().mode, 'offline');
  });

  it('should revert to offline mode upon MCP disconnect or disconnectAll', () => {
    const conn = getAiConnection();
    conn.mode = 'mcp';
    saveAiConnection(conn);

    const disconnected = disconnectMcp();
    assert.strictEqual(disconnected.mode, 'offline');
    assert.strictEqual(disconnected.mcp.status, 'disconnected');

    initiateOAuthLogin('sso');
    assert.strictEqual(getAiConnection().mode, 'oauth');

    const allDisconnected = disconnectAll();
    assert.strictEqual(allDisconnected.mode, 'offline');
    assert.strictEqual(allDisconnected.mcp.status, 'disconnected');
    assert.strictEqual(allDisconnected.oauth.status, 'unauthenticated');
  });

  it('in offline mode: dispatchUnitOpMessage informs user that sub-agents require connection (no fake chat)', async () => {
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
    assert.ok(res.text.includes('Unit-Op Studio for "Jacketed Polymerization Reactor RX-201" is in local offline mode'));
    assert.ok(res.text.includes('Connect via Model Context Protocol (MCP) or sign in with OAuth'));
    assert.ok(res.errorNotice?.includes('Unit-Op Studio offline'));
  });

  it('when MCP is connected: dispatchUnitOpMessage executes CAD drawing via MCP tool', async () => {
    const mockNode: ProcessNode = {
      id: 'sep-301',
      name: 'Liquid-Gas Separator V-301',
      kind: 'SURGE_TANK',
      position: { x: 200, y: 200 },
      inputs: [],
      outputs: [],
      config: {}
    };

    const res = await dispatchUnitOpMessage(
      'Draft an ASME horizontal flash separator with top demister pad and 3 nozzles',
      {
        node: mockNode,
        upstreamContext: 'High pressure stream',
        downstreamContext: 'Condenser',
        config: mockNode.config
      },
      { provider: 'mcp' }
    );

    assert.strictEqual(res.isOfflineSolver, false);
    assert.strictEqual(res.senderBadge, 'MCP Connected');
    assert.ok(res.text.includes('[MCP Tool: forge_equipment_drawing]'));
    assert.ok(res.cadDrawing);
    assert.ok(res.cadDrawing?.nozzles.length >= 2);
    assert.ok(res.newDressing);
  });

  it('when OAuth is connected: dispatchUnitOpMessage formats response under enterprise compliance', async () => {
    initiateOAuthLogin('google', {
      email: 'chief.engineer@dow.com',
      name: 'Sarah Chen',
      organization: 'Dow Chemical Plant Operations'
    });

    const mockNode: ProcessNode = {
      id: 'tank-401',
      name: 'Storage Sphere T-401',
      kind: 'SURGE_TANK',
      position: { x: 300, y: 300 },
      inputs: [],
      outputs: [],
      config: {}
    };

    const res = await dispatchUnitOpMessage(
      'Audit tank capacity and draft spherical pressure vessel geometry',
      {
        node: mockNode,
        upstreamContext: 'Process line',
        downstreamContext: 'Offloading rack',
        config: mockNode.config
      },
      { provider: 'oauth' }
    );

    assert.strictEqual(res.isOfflineSolver, false);
    assert.strictEqual(res.senderBadge, 'Enterprise SSO');
    assert.ok(res.text.includes('Dow Chemical Plant Operations'));
    assert.ok(res.cadDrawing);
  });

  it('in offline mode: dispatchMasterOrchestratorMessage informs user that master agent is offline', async () => {
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
    // Offline is the default with no key configured. This used to refuse with
    // "Connect via MCP or OAuth to generate new unit operations" -- for a pump,
    // which needs no model, on a product advertising offline execution.
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

  it('agent chat lockout: isAgentChatUnlocked locks chat until credentials or MCP detected', () => {
    resetToOfflineConfig();
    const locked = isAgentChatUnlocked(getAiConnection(), { provider: 'gemini', modelId: 'gemini-2.5-flash' });
    assert.strictEqual(locked.unlocked, false);
    assert.strictEqual(locked.activeProvider, 'none');
    assert.ok(locked.reason?.includes('No API key or active MCP connection detected'));

    // Unlocks with Gemini API key
    const geminiUnlocked = isAgentChatUnlocked(getAiConnection(), {
      provider: 'gemini',
      modelId: 'gemini-2.5-flash',
      geminiApiKey: 'AIzaSyTestKey12345'
    });
    assert.strictEqual(geminiUnlocked.unlocked, true);
    assert.strictEqual(geminiUnlocked.activeProvider, 'gemini');

    // Unlocks with Claude API key
    const claudeUnlocked = isAgentChatUnlocked(getAiConnection(), {
      provider: 'claude',
      modelId: 'claude-opus-5',
      claudeApiKey: 'sk-ant-api03-test-token'
    });
    assert.strictEqual(claudeUnlocked.unlocked, true);
    assert.strictEqual(claudeUnlocked.activeProvider, 'claude');

    // Unlocks with OpenAI API key
    const openaiUnlocked = isAgentChatUnlocked(getAiConnection(), {
      provider: 'openai',
      modelId: 'gpt-4o',
      openaiApiKey: 'sk-proj-test-token'
    });
    assert.strictEqual(openaiUnlocked.unlocked, true);
    assert.strictEqual(openaiUnlocked.activeProvider, 'openai');

    // Unlocks with active MCP connection (Zero-Key architecture)
    const mcpState = getAiConnection();
    mcpState.mode = 'mcp';
    mcpState.mcp.status = 'connected';
    const mcpUnlocked = isAgentChatUnlocked(mcpState);
    assert.strictEqual(mcpUnlocked.unlocked, true);
    assert.strictEqual(mcpUnlocked.activeProvider, 'mcp');
  });

  it('key security: maskApiKey masks credentials to prevent shoulder-surfing and screen share exposure', () => {
    assert.strictEqual(maskApiKey('sk-ant-api03-1234567890abcdef'), 'sk-a...cdef');
    assert.strictEqual(maskApiKey('AIzaSyD-abc123xyz789'), 'AIza...z789');
    assert.strictEqual(maskApiKey('short'), '••••••••');
    assert.strictEqual(maskApiKey(''), '');
    assert.strictEqual(maskApiKey(undefined), '');
  });

  it('credential purge: purgeAllCredentials securely wipes all credentials and resets to offline', async () => {
    saveLlmCredentials({
      provider: 'gemini',
      geminiApiKey: 'AIzaSySecretToBePurged123',
      claudeApiKey: 'sk-ant-secret',
      openaiApiKey: 'sk-proj-secret'
    });

    const beforePurge = getLlmCredentials();
    assert.strictEqual(beforePurge.geminiApiKey, 'AIzaSySecretToBePurged123');

    await purgeAllCredentials();

    const afterPurge = getLlmCredentials();
    assert.strictEqual(afterPurge.geminiApiKey, undefined);
    assert.strictEqual(afterPurge.claudeApiKey, undefined);
    assert.strictEqual(afterPurge.openaiApiKey, undefined);
    assert.strictEqual(getAiConnection().mode, 'offline');
    assert.strictEqual(isAgentChatUnlocked().unlocked, false);
  });

  it('direct TLS & header security: testLlmConnection sends Gemini key via x-goog-api-key header and NOT in URL query', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      capturedUrl = url;
      capturedHeaders = opts.headers || {};
      return {
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] })
      } as any;
    };

    try {
      const result = await testLlmConnection({
        provider: 'gemini',
        modelId: 'gemini-2.5-flash',
        geminiApiKey: 'AIzaSyDirectHeaderKey999'
      });

      assert.strictEqual(result.ok, true);
      // Verify query string does NOT leak the API key in the URL
      assert.ok(!capturedUrl.includes('?key='), 'Gemini URL must not contain ?key= query string');
      assert.ok(!capturedUrl.includes('AIzaSyDirectHeaderKey999'), 'API key must not be present anywhere in URL');
      // Verify key is securely sent in header
      assert.strictEqual(capturedHeaders['x-goog-api-key'], 'AIzaSyDirectHeaderKey999');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
