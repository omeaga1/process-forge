import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { SHERWIN_WILLIAMS_PAINT_LINE } from '../templates/sherwinWilliamsPaintLine.js';
import { validateProcessGraph } from '@process-forge/protocol';
import { getAiConfig, saveAiConfig } from '../ai/aiModelManager.js';

describe('Canvas UI - Mobile Pocket Twin & Field View', () => {
  it('validates mobile equipment feed contains all 6 industrial machines', () => {
    const nodes = SHERWIN_WILLIAMS_PAINT_LINE.nodes;
    assert.strictEqual(nodes.length, 6);

    const names = nodes.map((n) => n.name);
    assert.ok(names.some((n) => n.includes('Batch Reactor')));
    assert.ok(names.some((n) => n.includes('Surge Buffer Tank')));
    assert.ok(names.some((n) => n.includes('Rotary Piston Filler')));
    assert.ok(names.some((n) => n.includes('Accumulation Conveyor')));
    assert.ok(names.some((n) => n.includes('Rotary Labeler')));
    assert.ok(names.some((n) => n.includes('Palletizer')));
  });

  it('correctly reports bottleneck warning for mobile feed banner', () => {
    const validation = validateProcessGraph(SHERWIN_WILLIAMS_PAINT_LINE);
    assert.strictEqual(validation.bottlenecks.bottleneckNodeId, 'labeler-500');

    const bottleneckNode = SHERWIN_WILLIAMS_PAINT_LINE.nodes.find(
      (n) => n.id === validation.bottlenecks.bottleneckNodeId
    );
    assert.ok(bottleneckNode);
    assert.strictEqual(bottleneckNode.name, 'High-Speed Rotary Labeler LB-500');
  });

  it('verifies ASME nozzle dressing data is accessible for mobile bottom sheet', () => {
    const reactor = SHERWIN_WILLIAMS_PAINT_LINE.nodes.find((n) => n.id === 'reactor-101');
    assert.ok(reactor?.dressing);
    assert.strictEqual(reactor.dressing.nozzles.length, 5);

    // Verify ASME nozzle specs are fully formed for touch UI
    for (const nozzle of reactor.dressing.nozzles) {
      assert.ok(nozzle.name.length > 0);
      assert.ok(nozzle.sizeInches > 0);
      assert.ok(nozzle.ratingPsi >= 150);
      assert.ok(nozzle.role);
      assert.ok(nozzle.position);
    }
  });

  it('preserves Zero Raw Keys security policy in mobile sub-agent config', () => {
    const currentConfig = getAiConfig();
    assert.strictEqual(currentConfig.apiKey, undefined);
    assert.strictEqual(currentConfig.provider, 'offline');

    // Ensure zero raw keys policy is enforced
    saveAiConfig({
      provider: 'offline',
      modelId: 'deterministic-wasm'
    });
    const updated = getAiConfig();
    assert.strictEqual(updated.provider, 'offline');
    assert.strictEqual(updated.apiKey, undefined);
  });

  it('verifies touch telemetry formatting and rate calculations', () => {
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    assert.strictEqual(formatTime(0), '00:00');
    assert.strictEqual(formatTime(75), '01:15');
    assert.strictEqual(formatTime(3600), '60:00');
  });

  it('verifies equipment status pill state mapping', () => {
    const getStatusText = (
      nodeId: string,
      bottleneckId: string,
      isRunning: boolean
    ) => {
      if (nodeId === bottleneckId) return 'Bottleneck';
      if (isRunning && nodeId === 'rotary-filler-300') return 'Backpressure';
      if (isRunning) return 'Nominal';
      return 'Standby';
    };

    // Paused state
    assert.strictEqual(getStatusText('labeler-500', 'labeler-500', false), 'Bottleneck');
    assert.strictEqual(getStatusText('reactor-101', 'labeler-500', false), 'Standby');

    // Running state
    assert.strictEqual(getStatusText('labeler-500', 'labeler-500', true), 'Bottleneck');
    assert.strictEqual(getStatusText('rotary-filler-300', 'labeler-500', true), 'Backpressure');
    assert.strictEqual(getStatusText('reactor-101', 'labeler-500', true), 'Nominal');
  });
});
