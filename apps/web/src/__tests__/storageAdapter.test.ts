import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createSimulationProject,
  type ProcessGraph
} from '@process-forge/protocol';
import {
  saveLocalProject,
  loadCurrentLocalProject,
  listLocalProjects
} from '../storage/localStorageAdapter.js';

class MockStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

// Install mock storage into globalThis
const mockLocalStorage = new MockStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true
});

describe('Web Studio Local Storage Adapter', () => {
  const testGraph: ProcessGraph = {
    id: 'test-plant-01',
    name: 'Industrial Paint Formulation',
    version: '1.0.0',
    metadata: { facility: 'Cleveland West' },
    nodes: [
      {
        id: 'r-1',
        name: 'Dispersion Tank',
        kind: 'BATCH_REACTOR',
        position: { x: 50, y: 50 },
        inputs: [],
        outputs: [
          {
            id: 'out-1',
            name: 'Latex Flow',
            type: 'FLUID_OUTPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        config: {
          batchVolumeGallons: 500,
          dischargeRateGpm: 40
        }
      }
    ],
    edges: []
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no project has been saved yet', () => {
    const loaded = loadCurrentLocalProject();
    assert.strictEqual(loaded, null);
  });

  it('saves and restores a simulation project with accurate metadata', () => {
    const project = createSimulationProject('Plant Twin Alpha', testGraph, {
      description: 'Primary high-shear dispersion line',
      isGuest: true
    });

    saveLocalProject(project);

    const loaded = loadCurrentLocalProject();
    assert.ok(loaded, 'Loaded project should not be null');
    assert.strictEqual(loaded.name, 'Plant Twin Alpha');
    assert.strictEqual(loaded.description, 'Primary high-shear dispersion line');
    assert.strictEqual(loaded.isGuestProject, true);
    assert.strictEqual(loaded.graph.nodes.length, 1);
  });

  it('maintains a sorted project list index', () => {
    const project1 = createSimulationProject('Line 1', testGraph);
    const project2 = createSimulationProject('Line 2', testGraph);

    saveLocalProject(project1);
    saveLocalProject(project2);

    const list = listLocalProjects();
    assert.strictEqual(list.length, 2);
    // Most recent is at the top
    assert.strictEqual(list[0]?.name, 'Line 2');
    assert.strictEqual(list[1]?.name, 'Line 1');
  });

  it('handles corrupted localStorage payload gracefully without throwing', () => {
    localStorage.setItem('pf_current_project', '{{{bad-json');
    const loaded = loadCurrentLocalProject();
    assert.strictEqual(loaded, null);
  });
});
