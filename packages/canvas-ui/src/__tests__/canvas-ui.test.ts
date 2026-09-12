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

  it('verifies visual positions are non-overlapping and ordered horizontally', () => {
    let lastX = -1;
    for (const node of SHERWIN_WILLIAMS_PAINT_LINE.nodes) {
      assert.ok(node.position.x >= 0, 'Node X position must be non-negative');
      assert.ok(node.position.y >= 0, 'Node Y position must be non-negative');
      assert.ok(node.position.x > lastX, `Node ${node.id} should be ordered downstream from previous node`);
      lastX = node.position.x;
    }
  });

  it('verifies strict phase transition contract at rotary filler (fluid to discrete cans)', () => {
    const filler = SHERWIN_WILLIAMS_PAINT_LINE.nodes.find((n) => n.kind === 'ROTARY_FILLER');
    assert.ok(filler, 'Rotary filler must be present');

    const inputPort = filler.inputs.find((p) => p.flowDimension === 'CONTINUOUS_VOLUME');
    const outputPort = filler.outputs.find((p) => p.flowDimension === 'DISCRETE_CONTAINER');

    assert.ok(inputPort, 'Filler must accept CONTINUOUS_VOLUME fluid');
    assert.ok(outputPort, 'Filler must output DISCRETE_CONTAINER pieces');
  });

  it('validates edge streams preserve container specifications on packaging line', () => {
    const discreteEdges = SHERWIN_WILLIAMS_PAINT_LINE.edges.filter(
      (e) => e.stream.type === 'DISCRETE_CONTAINER_STREAM'
    );
    assert.strictEqual(discreteEdges.length, 3); // filler->conveyor, conveyor->labeler, labeler->palletizer

    for (const edge of discreteEdges) {
      if (edge.stream.type === 'DISCRETE_CONTAINER_STREAM') {
        assert.strictEqual(edge.stream.containerVolumeGallons, 1.0);
        assert.strictEqual(edge.stream.containerType, 'CAN_1_GAL');
        assert.ok(edge.stream.targetPiecesPerMinute > 0);
      }
    }
  });
});
