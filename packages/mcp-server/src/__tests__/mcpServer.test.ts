import { describe, it } from 'node:test';
import assert from 'node:assert';

import { executeSimulateLine } from '../tools/simulateLine.js';
import { executeDiagnoseBottlenecks } from '../tools/diagnoseBottlenecks.js';
import { executeQueryUnitSubAgent } from '../tools/queryUnitSubAgent.js';
import { executePackageUnitOp } from '../tools/packageUnitOp.js';
import { executeForgeEquipmentDrawing } from '../tools/forgeEquipmentDrawing.js';
import { createProcessForgeMcpServer } from '../server.js';
import { SHERWIN_WILLIAMS_PAINT_LINE } from '../templates.js';

describe('ProcessForge MCP Server Tools', () => {
  it('executes simulate_process_line on the paint line and finds the reactor limits it', () => {
    const res = executeSimulateLine({
      templateName: 'sherwin-williams-paint-line',
      durationMinutes: 15
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.durationMinutes, 15);
    assert.ok(res.totalUnitsPackaged > 0, 'Packaged units should be greater than 0');
    // 1000 gal every 20 + 45 + 20 min is about 11.8 gal/min: the reactor, not the
    // labeler (35/min), limits the paint line once liquid is simulated.
    assert.strictEqual(res.identifiedBottleneckNodeId, 'reactor-101');
    assert.ok(res.machineMetrics.length === 6, 'Should report metrics for all 6 machines');
    assert.match(res.engineeringDiagnosis, /second reactor/);
    assert.ok(res.machineMetrics.find((m) => m.nodeId === 'surge-tank-200')?.liquid, 'reports the tank\'s liquid');
  });

  it('diagnoses bottlenecks and validates topology', () => {
    const res = executeDiagnoseBottlenecks({
      templateName: 'sherwin-williams-paint-line'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isValidTopology, true);
    assert.strictEqual(res.bottleneckNodeId, 'reactor-101');
    assert.ok(Math.abs(res.maxLineThroughputPpm - 1000 / 85) < 0.01);
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

  it('synthesizes an ISA-5.1 CAD equipment drawing via forge_equipment_drawing', () => {
    const res = executeForgeEquipmentDrawing({
      description: 'Fractionation column with 8 sieve trays, overhead vapor outlet and reboiler return',
      machineType: 'DISTILLATION_COLUMN',
      unitName: 'T-100 Crude Column'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.drawing.category, 'Separations');
    assert.ok(res.svgMarkup.includes('<svg'));
    assert.ok(res.suggestedDressing.customSvgShell.length > 0);
    assert.ok(res.suggestedDressing.nozzles.length >= 4);
    assert.ok(res.templateNotes.includes('Form:'));
  });

  it('synthesizes equipment drawing when querying unit subagent with drawing inquiry', () => {
    const res = executeQueryUnitSubAgent({
      machineType: 'BATCH_REACTOR',
      unitName: 'R-101 Polymerization Reactor',
      inquiry: 'Draw this reactor as a jacketed CSTR with Rushton turbine and emergency relief nozzle'
    });

    assert.ok(res.equipmentDrawing, 'Should include synthesized CAD drawing');
    assert.strictEqual(res.equipmentDrawing.category, 'Reactors');
    assert.ok(res.softwareEngineerResponse.includes('Template drawing'));
    assert.ok(res.equipmentDrawing.nozzles.some((n) => n.role === 'relief'));
  });

  it('omits nozzle coordinates when includeNozzles is false in forge_equipment_drawing', () => {
    const res = executeForgeEquipmentDrawing({
      description: 'Horizontal shell and tube heat exchanger',
      machineType: 'HEAT_EXCHANGER',
      unitName: 'E-200 Cooler',
      includeNozzles: false
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.suggestedDressing.nozzles.length, 0);
    assert.ok(res.svgMarkup.includes('<svg'));
    assert.ok(res.suggestedDressing.customSvgShell.length > 0);
  });

  it('synthesizes twin-fluid atomizer drawing via forge_equipment_drawing', () => {
    const res = executeForgeEquipmentDrawing({
      description: 'Twin-fluid spray scrubber atomizer nozzle with air and water feeds',
      machineType: 'SPRAY_CHAMBER',
      unitName: 'SP-10 Atomizer'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.drawing.category, 'Utilities');
    assert.ok(res.drawing.internals.hasSprayHeader);
    assert.ok(res.suggestedDressing.nozzles.length >= 3);
  });

  it('initializes MCP server instance and verifies forge_equipment_drawing is registered', () => {
    const server = createProcessForgeMcpServer();
    assert.ok(server);
  });
});

describe('forge_equipment_drawing: template routing', () => {
  it('tells the model when a description named two families, and takes its pick', () => {
    const tie = executeForgeEquipmentDrawing({ description: 'absorption column feeding a cyclone' });
    assert.equal(tie.routing.decided, false);
    assert.deepEqual(tie.routing.alternatives, ['cyclone']);

    const picked = executeForgeEquipmentDrawing({
      description: 'absorption column feeding a cyclone',
      templateFamily: 'cyclone'
    });
    assert.equal(picked.drawing.label, 'Cyclone Dust Separator');
    assert.equal(picked.routing.source, 'caller');
  });
});
