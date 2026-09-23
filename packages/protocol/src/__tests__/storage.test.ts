import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  createSimulationProject,
  exportSimulationProject,
  importSimulationProject,
  type ProcessGraph
} from '../index.js';

describe('Simulation Project Storage & Serialization', () => {
  const sampleGraph: ProcessGraph = {
    id: 'graph-test-01',
    name: 'Sample Packaging Line',
    version: '1.0.0',
    metadata: {},
    nodes: [
      {
        id: 'node-1',
        name: 'Rotary Filler',
        kind: 'ROTARY_FILLER',
        position: { x: 100, y: 100 },
        inputs: [],
        outputs: [
          {
            id: 'out-1',
            name: 'Filled Cans',
            type: 'DISCRETE_OUTPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        config: {
          nozzleCount: 12,
          containerVolumeGallons: 1.0
        },
        assignedSubAgentId: 'subagent-rf-1'
      }
    ],
    edges: []
  };

  it('constructs a new SimulationProject with guest mode defaulted to true', () => {
    const project = createSimulationProject('My Test Simulation', sampleGraph);

    assert.strictEqual(project.name, 'My Test Simulation');
    assert.strictEqual(project.isGuestProject, true);
    assert.strictEqual(project.schemaVersion, '1.0.0');
    assert.ok(project.id.startsWith('proj-'));
    assert.strictEqual(project.graph.nodes.length, 1);
  });

  it('exports and imports a complete simulation project without data loss', () => {
    const project = createSimulationProject('Sherwin Williams Digital Twin', sampleGraph, {
      description: 'Cleveland Coatings Plant Line Twin',
      isGuest: true
    });

    // Add conversation history
    project.subAgentHistories['subagent-rf-1'] = [
      {
        id: 'msg-1',
        sender: 'USER',
        text: 'Can we run 2,000 cP paint through these nozzles?',
        timestampIso: new Date().toISOString()
      },
      {
        id: 'msg-2',
        sender: 'SUB_AGENT',
        text: 'Yes, increasing diving stroke depth to 85% prevents foaming.',
        timestampIso: new Date().toISOString()
      }
    ];

    const exportedJson = exportSimulationProject(project);
    assert.ok(typeof exportedJson === 'string');
    assert.ok(exportedJson.includes('Cleveland Coatings Plant Line Twin'));

    const imported = importSimulationProject(exportedJson);
    assert.strictEqual(imported.id, project.id);
    assert.strictEqual(imported.name, project.name);
    assert.strictEqual(imported.description, project.description);
    assert.strictEqual(imported.subAgentHistories['subagent-rf-1']?.length, 2);
    assert.strictEqual((imported.graph.nodes[0]?.config as any)?.nozzleCount, 12);
  });

  it('rejects corrupted or invalid project JSON', () => {
    assert.throws(() => {
      importSimulationProject('invalid-json');
    }, /Failed to parse project JSON/);

    assert.throws(() => {
      importSimulationProject(JSON.stringify({ id: 'bad-proj', name: 'missing-graph' }));
    });
  });

  it('keeps nozzle placements and their port links through export and import', () => {
    const graph: ProcessGraph = {
      ...sampleGraph,
      nodes: sampleGraph.nodes.map((n, i) =>
        i === 0
          ? {
              ...n,
              dressing: {
                nozzles: [
                  { id: 'N1', name: 'Discharge', role: 'outlet', x: 15.8, y: 54.2, position: 'left', sizeInches: 3, ratingPsi: 150, portId: 'out-1' },
                  { id: 'N2', name: 'Vent', role: 'vent', x: 50, y: 0, position: 'top', sizeInches: 2, ratingPsi: 150 }
                ],
                internals: {} as never
              }
            }
          : n
      )
    } as ProcessGraph;
    const imported = importSimulationProject(exportSimulationProject(createSimulationProject('Nozzles', graph)));
    const nozzles = imported.graph.nodes[0]?.dressing?.nozzles ?? [];
    assert.deepStrictEqual(
      nozzles.map((z) => [z.id, z.x, z.y, z.position, z.portId]),
      [
        ['N1', 15.8, 54.2, 'left', 'out-1'],
        ['N2', 50, 0, 'top', undefined]
      ]
    );
  });
});
