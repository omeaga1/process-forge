import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  getAiConfig,
  saveAiConfig,
  resetToOfflineConfig,
  testProviderConnection,
  type AiModelConfig
} from '../ai/aiModelManager.js';
import {
  dispatchUnitOpMessage,
  dispatchMasterOrchestratorMessage
} from '../ai/aiDispatch.js';
import type { ProcessNode } from '@process-forge/protocol';

describe('AI Model Connection Manager & Dispatcher', () => {
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

  it('should default to Offline Deterministic Solver when no configuration is stored', () => {
    const config = getAiConfig();
    assert.strictEqual(config.provider, 'offline');
    assert.strictEqual(config.modelId, 'deterministic-solver-v1');
  });

  it('should persist and retrieve AI provider configurations', () => {
    const customConfig: AiModelConfig = {
      provider: 'gemini',
      apiKey: 'test-gemini-key-123',
      modelId: 'gemini-2.0-flash',
      temperature: 0.3
    };
    saveAiConfig(customConfig);

    const loaded = getAiConfig();
    assert.strictEqual(loaded.provider, 'gemini');
    assert.strictEqual(loaded.apiKey, 'test-gemini-key-123');
    assert.strictEqual(loaded.modelId, 'gemini-2.0-flash');
    assert.strictEqual(loaded.temperature, 0.3);
  });

  it('should reset active provider to Offline Deterministic mode', () => {
    saveAiConfig({
      provider: 'claude',
      apiKey: 'sk-ant-test',
      modelId: 'claude-3-5-sonnet-20241022'
    });
    assert.strictEqual(getAiConfig().provider, 'claude');

    const reset = resetToOfflineConfig();
    assert.strictEqual(reset.provider, 'offline');
    assert.strictEqual(getAiConfig().provider, 'offline');
  });

  it('should test offline solver connection immediately with zero network latency', async () => {
    const res = await testProviderConnection({ provider: 'offline' });
    assert.strictEqual(res.success, true);
    assert.ok(res.latencyMs <= 5);
    assert.ok(res.message.includes('100% offline'));
  });

  it('should reject provider testing when required API key is missing', async () => {
    const res = await testProviderConnection({ provider: 'gemini', apiKey: '' });
    assert.strictEqual(res.success, false);
    assert.ok(res.message.includes('API key is required'));
  });

  it('should dispatch unit-op requests through offline solver and label badge as Offline Solver', async () => {
    const mockNode: ProcessNode = {
      id: 'cyclone-101',
      name: 'Cyclone Separator CS-101',
      kind: 'BATCH_REACTOR',
      position: { x: 100, y: 100 },
      inputs: [],
      outputs: [],
      config: { dwellTimeSeconds: 10 }
    };

    const res = await dispatchUnitOpMessage(
      'Draw a cyclone separator with bottom solids discharge',
      {
        node: mockNode,
        upstreamContext: 'Feed 50 gpm',
        downstreamContext: 'Bag filter',
        config: mockNode.config
      },
      { provider: 'offline' }
    );

    assert.strictEqual(res.isOfflineSolver, true);
    assert.strictEqual(res.senderBadge, 'Offline Solver');
    assert.ok(res.cadDrawing);
    assert.ok(res.cadDrawing?.category === 'Reactors' || res.cadDrawing?.category === 'Vessels');
    assert.ok(res.cadDrawing?.nozzles.length >= 2);
    assert.ok(res.newDressing);
  });

  it('should dispatch master orchestrator queries deterministically for bottleneck and conservation audits', async () => {
    const resBottleneck = await dispatchMasterOrchestratorMessage(
      'Where is the bottleneck?',
      {
        graphName: 'Paint Canning Line',
        nodeCount: 6,
        totalPackaged: 150,
        averageRatePerMin: 35,
        bottleneckNodeName: 'Rotary Filler RF-300',
        maxThroughput: 45
      },
      { provider: 'offline' }
    );

    assert.strictEqual(resBottleneck.isOfflineSolver, true);
    assert.ok(resBottleneck.text.includes('Rotary Filler RF-300'));
    assert.ok(resBottleneck.text.includes('45 units/min'));

    const resConservation = await dispatchMasterOrchestratorMessage(
      'Audit mass conservation',
      {
        graphName: 'Paint Canning Line',
        nodeCount: 6,
        totalPackaged: 150,
        averageRatePerMin: 35
      },
      { provider: 'offline' }
    );

    assert.ok(resConservation.text.includes('Mass Balance Audit'));
    assert.ok(resConservation.text.includes('zero mathematical drift'));
  });
});
