import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { validateProcessGraph } from '@process-forge/protocol';
import { SHERWIN_WILLIAMS_PAINT_LINE } from '../templates/sherwinWilliamsPaintLine.js';
import { synthesizeEquipmentDrawing } from '@process-forge/protocol';

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

  it('identifies the batch reactor as what limits the paint line', () => {
    // 1000 gal every 20 + 45 + 20 min is about 11.8 gal/min: the reactor, not the
    // labeler (35/min), limits the paint line once liquid is simulated.
    const result = validateProcessGraph(SHERWIN_WILLIAMS_PAINT_LINE);
    assert.equal(result.bottlenecks.bottleneckNodeId, 'reactor-101');
    assert.ok(Math.abs(result.bottlenecks.maximumSystemThroughputUnitsPerMin - 1000 / 85) < 0.01);
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

  it('validates custom mechanical dressing on industrial reactors and surge vessels', () => {
    const reactor = SHERWIN_WILLIAMS_PAINT_LINE.nodes.find((n) => n.id === 'reactor-101');
    assert.ok(reactor?.dressing, 'Reactor must have dressing configured');
    assert.strictEqual(reactor.dressing.nozzles.length, 5);
    assert.strictEqual(reactor.dressing.internals.agitatorType, 'rushton');
    assert.strictEqual(reactor.dressing.internals.hasJacket, true);
    assert.strictEqual(reactor.dressing.internals.jacketType, 'steam');
    assert.strictEqual(reactor.dressing.internals.baffleCount, 4);

    const surge = SHERWIN_WILLIAMS_PAINT_LINE.nodes.find((n) => n.id === 'surge-tank-200');
    assert.ok(surge?.dressing, 'Surge tank must have dressing configured');
    assert.strictEqual(surge.dressing.nozzles.length, 4);
    assert.strictEqual(surge.dressing.internals.hasDemister, true);
  });

  it('synthesizes custom ISA-5.1 CAD drawing for sub-agent equipment and updates dressing', () => {
    const dwg = synthesizeEquipmentDrawing('Fractionation distillation tower with 6 sieve trays and top reflux nozzle', {
      kind: 'DISTILLATION_COLUMN',
      machineName: 'C-301 Solvent Recovery Column'
    });

    assert.ok(dwg.svgShell.includes('<rect'));
    assert.ok(dwg.svgShell.includes('<ellipse'));
    assert.ok(dwg.nozzles.length >= 4);

    const updatedDressing = {
      customSvgShell: dwg.svgShell,
      customSvgDetails: dwg.svgDetails,
      viewBox: dwg.viewBox,
      defaultSize: dwg.defaultSize,
      drawingPrompt: 'Fractionation distillation tower with 6 sieve trays and top reflux nozzle',
      generatedBySubAgent: true,
      nozzles: dwg.nozzles,
      internals: {
        agitatorType: 'none' as const,
        hasJacket: false,
        jacketType: 'none' as const,
        baffleCount: 0,
        packingType: 'trays' as const,
        hasDemister: true,
        hasSprayHeader: false,
        trayCount: 6
      }
    };

    assert.strictEqual(updatedDressing.generatedBySubAgent, true);
    assert.strictEqual(updatedDressing.nozzles.length, dwg.nozzles.length);
    assert.ok(updatedDressing.customSvgShell.length > 0);
  });
});
