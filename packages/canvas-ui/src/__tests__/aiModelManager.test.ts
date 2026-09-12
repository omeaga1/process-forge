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
  disconnectAll
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
    assert.ok(res.text.includes('Unit-Op Forge for "Jacketed Polymerization Reactor RX-201" is in local offline mode'));
    assert.ok(res.text.includes('Connect via Model Context Protocol (MCP) or sign in with OAuth'));
    assert.ok(res.errorNotice?.includes('Unit-Op Forge offline'));
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
    assert.strictEqual(res.senderBadge, 'MCP Forge');
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
    assert.strictEqual(res.senderBadge, 'OAuth Enterprise');
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
    assert.ok(res.text.includes('Environment Forge is in local offline mode'));
    assert.ok(res.text.includes('Connect via MCP or OAuth'));
  });
});
