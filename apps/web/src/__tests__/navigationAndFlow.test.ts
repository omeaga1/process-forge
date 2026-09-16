import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createSimulationProject,
  type SimulationProject,
  type ProcessGraph
} from '@process-forge/protocol';
import {
  SHERWIN_WILLIAMS_PAINT_LINE,
  BEVERAGE_BOTTLING_LINE,
  BLANK_LINE
} from '@process-forge/canvas-ui/dist/templates/sherwinWilliamsPaintLine.js';

// Mirror templateKey inference contract
function inferTemplateKeyFromProject(proj: SimulationProject): string {
  if (!proj || !proj.graph) return 'blank';
  const name = (proj.name || '').toLowerCase();
  const graphId = (proj.graph.id || '').toLowerCase();
  if (graphId === 'beverage-bottling-line' || name.includes('beverage')) {
    return 'beverage-bottling-line';
  }
  if (graphId === 'blank' || proj.graph.nodes.length === 0 || name.includes('custom')) {
    return 'blank';
  }
  if (graphId === 'sherwin-williams-paint-line' || name.includes('paint') || name.includes('sherwin')) {
    return 'sherwin-williams-paint-line';
  }
  return 'blank';
}

describe('ProcessForge Studio Navigation & State Synchronization', () => {
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

  it('accurately infers templateKey from diverse project graphs to prevent header desync', () => {
    // 1. Sherwin-Williams Line
    const paintProj = createSimulationProject('Sherwin-Williams Paint Canning Line', SHERWIN_WILLIAMS_PAINT_LINE);
    assert.strictEqual(inferTemplateKeyFromProject(paintProj), 'sherwin-williams-paint-line');

    // 2. Beverage Bottling Line
    const beverageProj = createSimulationProject('High-Speed Beverage Bottling Line', BEVERAGE_BOTTLING_LINE);
    assert.strictEqual(inferTemplateKeyFromProject(beverageProj), 'beverage-bottling-line');

    // 3. Custom Blank Flowsheet
    const blankProj = createSimulationProject('Custom Process Forge', BLANK_LINE);
    assert.strictEqual(inferTemplateKeyFromProject(blankProj), 'blank');

    // 4. Imported project with empty nodes
    const emptyProj = createSimulationProject('New Blank', {
      id: 'custom',
      name: 'Custom Flow',
      version: '0.1.0',
      nodes: [],
      edges: [],
      metadata: {}
    });
    assert.strictEqual(inferTemplateKeyFromProject(emptyProj), 'blank');
  });

  it('handleOpenStudio launches a blank canvas rather than the worked example', () => {
    let currentProject = createSimulationProject('Sherwin-Williams Paint Canning Line', SHERWIN_WILLIAMS_PAINT_LINE);
    let viewMode: 'landing' | 'studio' = 'landing';
    let templateKey = inferTemplateKeyFromProject(currentProject);

    // Initial state before clicking Open Studio
    assert.strictEqual(viewMode, 'landing');
    assert.strictEqual(templateKey, 'sherwin-williams-paint-line');
    assert.strictEqual(currentProject.graph.nodes.length, 6);

    // Simulate "Open Studio" click (must initialize a blank canvas)
    const handleOpenStudio = () => {
      const blank = createSimulationProject('Custom Process Forge', BLANK_LINE, {
        description: 'Clean slate industrial process flowsheet'
      });
      currentProject = blank;
      templateKey = 'blank';
      store['pf_current_project'] = JSON.stringify(blank);
      viewMode = 'studio';
    };

    handleOpenStudio();

    // Verify state after entering studio is clean blank canvas
    assert.strictEqual(viewMode, 'studio');
    assert.strictEqual(templateKey, 'blank');
    assert.ok(store['pf_current_project']);
    const saved = JSON.parse(store['pf_current_project']);
    assert.strictEqual(saved.graph.nodes.length, 0);
    assert.strictEqual(saved.name, 'Custom Process Forge');
  });

  it('switching templates updates both active graph and templateKey simultaneously', () => {
    let currentProject = createSimulationProject('Sherwin-Williams Paint Canning Line', SHERWIN_WILLIAMS_PAINT_LINE);
    let templateKey = 'sherwin-williams-paint-line';
    let viewMode: 'landing' | 'studio' = 'landing';

    const handleSelectTemplateAndLaunch = (key: string) => {
      templateKey = key;
      let targetGraph: ProcessGraph = SHERWIN_WILLIAMS_PAINT_LINE;
      let targetName = 'Sherwin-Williams Paint Canning Line';
      if (key === 'beverage-bottling-line') {
        targetGraph = BEVERAGE_BOTTLING_LINE;
        targetName = 'High-Speed Beverage Bottling Line';
      } else if (key === 'blank') {
        targetGraph = BLANK_LINE;
        targetName = 'Custom Process Forge';
      }
      currentProject = createSimulationProject(targetName, targetGraph);
      store['pf_current_project'] = JSON.stringify(currentProject);
      viewMode = 'studio';
    };

    // Switch to Beverage line
    handleSelectTemplateAndLaunch('beverage-bottling-line');
    assert.strictEqual(viewMode, 'studio');
    assert.strictEqual(templateKey, 'beverage-bottling-line');
    assert.strictEqual(currentProject.name, 'High-Speed Beverage Bottling Line');
    assert.strictEqual(currentProject.graph.nodes.length, 4);

    // Switch to Blank Canvas
    handleSelectTemplateAndLaunch('blank');
    assert.strictEqual(templateKey, 'blank');
    assert.strictEqual(currentProject.graph.nodes.length, 0);
  });

  it('returning from Studio to Hub smoothly saves changes to localStorage without losing canvas nodes', () => {
    let currentProject = createSimulationProject('Sherwin-Williams Paint Canning Line', SHERWIN_WILLIAMS_PAINT_LINE);
    let viewMode: 'landing' | 'studio' = 'studio';

    // Simulate adding an extra machine on the canvas
    const modifiedGraph: ProcessGraph = {
      ...currentProject.graph,
      nodes: [
        ...currentProject.graph.nodes,
        {
          id: 'custom-filter-101',
          name: 'High-Shear Filtration Unit',
          kind: 'SURGE_TANK',
          position: { x: 500, y: 500 },
          inputs: [],
          outputs: [],
          config: {}
        }
      ]
    };

    currentProject = {
      ...currentProject,
      graph: modifiedGraph
    };

    // Simulate clicking "Studio Hub" / brand logo to return
    const handleNavigateHome = () => {
      store['pf_current_project'] = JSON.stringify(currentProject);
      viewMode = 'landing';
    };

    handleNavigateHome();

    assert.strictEqual(viewMode, 'landing');
    assert.ok(store['pf_current_project']);
    const restored = JSON.parse(store['pf_current_project']);
    assert.strictEqual(restored.graph.nodes.length, 7);
    assert.strictEqual(restored.graph.nodes[6].id, 'custom-filter-101');
  });

  it('guarantees OmnipresentAgentWidget declares all React hooks before any early returns', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const widgetPath = path.resolve(process.cwd(), 'src/components/OmnipresentAgentWidget.tsx');
    const content = fs.readFileSync(widgetPath, 'utf-8');

    // Find the position of the early return
    const earlyReturnIdx = content.indexOf('if (isInStudioView) return null;');
    assert.ok(earlyReturnIdx !== -1, 'Early return statement should exist');

    // Ensure all hook calls in the component appear before the early return
    const hooksMatches = [...content.matchAll(/\b(use[A-Z]\w+)\s*\(/g)];
    assert.ok(hooksMatches.length > 0, 'Component must declare hooks');

    for (const match of hooksMatches) {
      const hookIdx = match.index!;
      assert.ok(
        hookIdx < earlyReturnIdx,
        `React hook "${match[1]}" at position ${hookIdx} must be invoked BEFORE early return at position ${earlyReturnIdx} to satisfy Rules of Hooks.`
      );
    }
  });
});
