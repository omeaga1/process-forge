import { describe, it } from 'node:test';
import assert from 'node:assert';

import { executeSimulateLine } from '../tools/simulateLine.js';
import { executeDiagnoseBottlenecks } from '../tools/diagnoseBottlenecks.js';
import { executeQueryUnitSubAgent } from '../tools/queryUnitSubAgent.js';
import { executePackageUnitOp } from '../tools/packageUnitOp.js';
import { createProcessForgeMcpServer } from '../server.js';
import { SHERWIN_WILLIAMS_PAINT_LINE } from '../templates.js';

describe('ProcessForge MCP Server Tools', () => {
  it('executes simulate_process_line on Sherwin-Williams paint line and detects labeler bottleneck', () => {
    const res = executeSimulateLine({
      templateName: 'sherwin-williams-paint-line',
      durationMinutes: 15
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.durationMinutes, 15);
    assert.ok(res.totalUnitsPackaged > 0, 'Packaged units should be greater than 0');
    assert.strictEqual(res.identifiedBottleneckNodeId, 'labeler-500');
    assert.ok(res.machineMetrics.length === 6, 'Should report metrics for all 6 machines');
    assert.ok(res.engineeringDiagnosis.includes('LB-500') || res.engineeringDiagnosis.includes('labeler'));
  });

  it('diagnoses bottlenecks and validates topology', () => {
    const res = executeDiagnoseBottlenecks({
      templateName: 'sherwin-williams-paint-line'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isValidTopology, true);
    assert.strictEqual(res.bottleneckNodeId, 'labeler-500');
    assert.strictEqual(res.maxLineThroughputPpm, 35);
    assert.ok(res.actionableRecommendations.length > 0);
  });

  it('acts as expert domain software engineer when querying unit subagent for Rotary Filler', () => {
    const res = executeQueryUnitSubAgent({
      machineType: 'ROTARY_FILLER',
      unitName: 'RF-300 Rotary Piston Filler',
      inquiry: 'We are running high-viscosity 1,800 cP latex paint. How should we configure cycle time?',
      currentConfig: {
        nozzleCount: 10,
        containerVolumeGallons: 1.0
      },
      upstreamContext: {
        flowRateGpm: 45,
        viscosityCentipoise: 1800
      }
    });

    assert.strictEqual(res.machineType, 'ROTARY_FILLER');
    assert.ok(res.softwareEngineerResponse.includes('RF-300'));
    assert.ok(res.softwareEngineerResponse.includes('viscous') || res.softwareEngineerResponse.includes('latex'));
    assert.ok(res.suggestedCapabilityPackages.includes('@forge/pkg-rheology'));

    // Check Generative UI schema
    assert.strictEqual(res.generativeUiSchema.widgetType, 'ROTARY_FILLER_INSPECTOR');
    const nozzleControl = res.generativeUiSchema.interactiveControls.find((c) => c.fieldKey === 'nozzleCount');
    assert.ok(nozzleControl, 'Should generate nozzleCount control');
    assert.strictEqual(nozzleControl.currentValue, 10);
  });

  it('packages a machine into an Obsidian-style .pfu bundle for ForgeHub', () => {
    const node = SHERWIN_WILLIAMS_PAINT_LINE.nodes[2]!; // Rotary filler
    const bundle = executePackageUnitOp({
      node,
      author: 'Industrial Automation Lead',
      description: 'High-speed 10-nozzle rotary filling machine with tare scale feedback',
      category: 'FILLING',
      tags: ['packaging', 'paint', 'canning']
    });

    assert.ok(bundle.pluginId.startsWith('pfu-'));
    assert.strictEqual(bundle.category, 'FILLING');
    assert.strictEqual(bundle.author, 'Industrial Automation Lead');
    assert.ok(bundle.subAgentPersona.systemPrompt.includes('RF-300') || bundle.subAgentPersona.systemPrompt.includes('Filler'));
    assert.ok(bundle.serializedBundle.length > 0);

    const parsed = JSON.parse(bundle.serializedBundle);
    assert.strictEqual(parsed.bundleVersion, '1.0.0');
    assert.strictEqual(parsed.name, node.name);
  });

  it('initializes MCP server instance with tool capabilities', () => {
    const server = createProcessForgeMcpServer();
    assert.ok(server);
  });
});
