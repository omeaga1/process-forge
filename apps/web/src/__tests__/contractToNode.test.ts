/**
 * A contract that survives the engine's checks has to become an actual node on
 * an actual flowsheet, or the whole design loop produces a validated object
 * with nowhere to go. This is that last link.
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { WAX_COOLING_BELT_CONTRACT, ProcessNodeSchema } from '@process-forge/protocol';
import { simulateProcess } from '@process-forge/simulation-core';
import { contractToProcessNode } from '../unitop/contractToNode.js';

describe('Contract to flowsheet node', () => {
  it('produces a node that satisfies the protocol schema', () => {
    const node = contractToProcessNode(WAX_COOLING_BELT_CONTRACT);
    const parsed = ProcessNodeSchema.safeParse(node);
    assert.ok(
      parsed.success,
      parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)
    );
  });

  it('carries the contract where the engine looks for it', () => {
    const node = contractToProcessNode(WAX_COOLING_BELT_CONTRACT);
    const cfg = node.config as Record<string, unknown>;
    assert.equal(cfg.contract, WAX_COOLING_BELT_CONTRACT);
  });

  it('maps inlets and outlets to the right port directions and dimensions', () => {
    const node = contractToProcessNode(WAX_COOLING_BELT_CONTRACT);

    // The wax belt has two inlets (wax, cooling water) and two outlets.
    assert.equal(node.inputs.length, 2);
    assert.equal(node.outputs.length, 2);
    for (const p of node.inputs) {
      assert.equal(p.type, 'FLUID_INPUT');
      assert.equal(p.flowDimension, 'CONTINUOUS_VOLUME');
    }
    for (const p of node.outputs) {
      assert.equal(p.type, 'FLUID_OUTPUT');
    }
  });

  it('maps a discrete contract port to a discrete node port', () => {
    const discrete = {
      ...WAX_COOLING_BELT_CONTRACT,
      ports: [
        { id: 'in', name: 'Parts in', direction: 'INLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true },
        { id: 'out', name: 'Parts out', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true }
      ]
    } as typeof WAX_COOLING_BELT_CONTRACT;

    const node = contractToProcessNode(discrete);
    assert.equal(node.inputs[0]!.type, 'DISCRETE_INPUT');
    assert.equal(node.inputs[0]!.flowDimension, 'DISCRETE_CONTAINER');
    assert.equal(node.outputs[0]!.type, 'DISCRETE_OUTPUT');
  });

  it('mirrors parameters into config so the property inspector has something to show', () => {
    const node = contractToProcessNode(WAX_COOLING_BELT_CONTRACT);
    const cfg = node.config as Record<string, unknown>;
    assert.equal(cfg.beltLengthM, 16);
    assert.equal(cfg.waxMassFlowKgPerS, 0.55);
  });

  it('gives each node a distinct id', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => contractToProcessNode(WAX_COOLING_BELT_CONTRACT).id)
    );
    assert.equal(ids.size, 50);
  });

  it('honours an explicit id and position', () => {
    const node = contractToProcessNode(WAX_COOLING_BELT_CONTRACT, {
      id: 'belt-1',
      position: { x: 10, y: 20 }
    });
    assert.equal(node.id, 'belt-1');
    assert.deepEqual(node.position, { x: 10, y: 20 });
  });

  it('produces a node the engine will actually accept into a run', () => {
    // The end-to-end point: describe -> contract -> node -> simulation. The
    // engine re-evaluates the contract at construction, so if the mapping
    // dropped or mangled it, this throws.
    const node = contractToProcessNode(WAX_COOLING_BELT_CONTRACT, { id: 'belt-1' });
    const graph = {
      id: 'mount-test',
      name: 'Mount Test',
      version: '1.0.0',
      metadata: {},
      nodes: [node],
      edges: []
    };

    const result = simulateProcess(graph as never, 5);
    assert.ok(result.nodeReports['belt-1'], 'the contract node did not reach the report');
    assert.equal(result.simulatedTimeSeconds, 300);
  });

  it('refuses a node whose contract is not physically valid', () => {
    // Shrink the belt until it cannot remove the duty. The engine must reject
    // it at construction rather than simulating nonsense.
    const broken = {
      ...WAX_COOLING_BELT_CONTRACT,
      parameters: WAX_COOLING_BELT_CONTRACT.parameters.map((p) =>
        p.name === 'beltLengthM' ? { ...p, value: 1 } : p
      )
    } as typeof WAX_COOLING_BELT_CONTRACT;

    const graph = {
      id: 'mount-test-bad',
      name: 'Mount Test',
      version: '1.0.0',
      metadata: {},
      nodes: [contractToProcessNode(broken, { id: 'belt-bad' })],
      edges: []
    };

    assert.throws(() => simulateProcess(graph as never, 5), /not physically valid/);
  });
});
