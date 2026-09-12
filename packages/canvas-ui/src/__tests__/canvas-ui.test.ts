import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { validateProcessGraph } from '@process-forge/protocol';
import { SHERWIN_WILLIAMS_PAINT_LINE } from '../templates/sherwinWilliamsPaintLine.js';

describe('Canvas UI - Sherwin-Williams Digital Twin Template', () => {
  it('passes strict graph topology and mass conservation validation', () => {
    const result = validateProcessGraph(SHERWIN_WILLIAMS_PAINT_LINE);
    assert.equal(result.valid, true);
    assert.equal(result.diagnostics.length, 0);
  });

  it('contains all 6 machines in the industrial canning line', () => {
    assert.equal(SHERWIN_WILLIAMS_PAINT_LINE.nodes.length, 6);
    const nodeKinds = SHERWIN_WILLIAMS_PAINT_LINE.nodes.map((n) => n.kind);
    assert.ok(nodeKinds.includes('BATCH_REACTOR'));
    assert.ok(nodeKinds.includes('SURGE_TANK'));
    assert.ok(nodeKinds.includes('ROTARY_FILLER'));
    assert.ok(nodeKinds.includes('CONVEYOR'));
    assert.ok(nodeKinds.includes('LABELER'));
    assert.ok(nodeKinds.includes('PALLETIZER'));
  });

  it('correctly identifies the line bottleneck at the high-speed labeler', () => {
    const result = validateProcessGraph(SHERWIN_WILLIAMS_PAINT_LINE);
    assert.equal(result.bottlenecks.bottleneckNodeId, 'labeler-500');
    assert.equal(result.bottlenecks.maximumSystemThroughputUnitsPerMin, 35);
  });

  it('verifies all nodes have assigned Sub-Agent identifiers', () => {
    for (const node of SHERWIN_WILLIAMS_PAINT_LINE.nodes) {
      assert.ok(
        node.assignedSubAgentId,
        `Node ${node.id} is missing an assignedSubAgentId for its dedicated AI software engineer`
      );
    }
  });
});
