import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE, executeValidateUnitOp, heuristicProvider, type ProcessGraph, type UnitOpContract } from '@process-forge/protocol';
import { FORGE_TOOLS } from '../registry.js';
import type { ToolHost } from '../host.js';

/** A host with a flowsheet in memory and, when asked, an image renderer. */
function host(graph: ProcessGraph, renderSvg?: ToolHost['renderSvg']): ToolHost {
  return {
    surface: 'mcp',
    readOpen: async () => ({ graph }),
    addUnit: async () => ({ success: false }),
    addDesignedUnit: async () => ({ success: false }),
    addStream: async () => ({ success: false }),
    edit: async () => ({ success: false }),
    requestPublish: async () => ({ success: false }),
    ...(renderSvg ? { renderSvg } : {}),
    decider: {} as ToolHost['decider'],
    communityApiBase: 'http://localhost:9'
  };
}

const tool = (name: string) => FORGE_TOOLS.find((t) => t.name === name)!;

const capper = {
  contractVersion: 1,
  id: 'screw-capper',
  name: 'Rotary Screw Capper CP-201',
  description: 'Applies 28 mm closures to filled PET bottles.',
  ports: [
    { id: 'bottles', name: 'Filled bottles', direction: 'INLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true },
    { id: 'caps', name: 'Closures', direction: 'INLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true },
    { id: 'capped', name: 'Capped bottles', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true }
  ],
  parameters: [{ name: 'heads', label: 'Capping heads', unit: '-', value: 12, min: 1, max: 40 }],
  derived: [],
  constraints: [],
  behavior: { mode: 'DISCRETE_CYCLE', cycleSeconds: '0.4', unitsPerCycle: '1', inputs: [{ port: 'bottles', perCycle: '1' }, { port: 'caps', perCycle: '1' }], itemsRequired: true },
  provenance: { authoredBy: 'SUB_AGENT', engineerConfirmed: [] }
} as unknown as UnitOpContract;

describe('draw_unit_op', () => {
  it('draws a contract as its own equipment, every port on the drawing, ready to validate', async () => {
    const r = (await tool('draw_unit_op').run({ contract: capper }, host(JUICE_CONCENTRATION_LINE))) as any;
    assert.equal(r.success, true);
    assert.equal(r.kit, 'rotary-machine');
    assert.equal(r.settings.capper, true);
    assert.deepEqual(r.report.errors, []);
    assert.deepEqual(r.report.warnings, []);
    assert.deepEqual(r.drawing.nozzles.map((n: any) => n.portId).sort(), ['bottles', 'capped', 'caps']);
    const verdict = executeValidateUnitOp({ contract: { ...capper, drawing: r.drawing } });
    assert.equal(verdict.verdict, 'ACCEPTED');
  });

  it('says what it needs when given nothing to draw', async () => {
    const r = (await tool('draw_unit_op').run({}, host(JUICE_CONCENTRATION_LINE))) as any;
    assert.equal(r.success, false);
    assert.match(r.error, /contract/);
  });
});

describe('preview_unit_drawing', () => {
  it('hands back an image when the host can render one', async () => {
    const drawn = (await tool('draw_unit_op').run({ contract: capper }, host(JUICE_CONCENTRATION_LINE))) as any;
    let seen = '';
    const r = (await tool('preview_unit_drawing').run({ contract: { ...capper, drawing: drawn.drawing } }, host(JUICE_CONCENTRATION_LINE, async (svg) => ((seen = svg), { png: 'iVBORw0KGgo=' })))) as any;
    assert.equal(r.success, true);
    assert.deepEqual(r.image, { mimeType: 'image/png', data: 'iVBORw0KGgo=' });
    assert.match(seen, /^<svg xmlns/);
    assert.ok(r.report.quality >= 80);
  });

  it('falls back to the SVG and the report without a renderer', async () => {
    const drawn = (await tool('draw_unit_op').run({ contract: capper }, host(JUICE_CONCENTRATION_LINE))) as any;
    const r = (await tool('preview_unit_drawing').run({ drawing: drawn.drawing }, host(JUICE_CONCENTRATION_LINE))) as any;
    assert.equal(r.success, true);
    assert.equal(r.image, undefined);
    assert.match(r.imageUnavailable, /cannot render/);
    assert.match(r.svg, /^<svg/);
  });
});

describe('fork_unit_op', () => {
  it('forks a Standard unit into a contract with a drawing to reshape, under a new id', async () => {
    const r = (await tool('fork_unit_op').run({ from: 'rotary-filler', name: 'Hot-Fill Filler FL-301' }, host(JUICE_CONCENTRATION_LINE))) as any;
    assert.equal(r.success, true, r.error);
    assert.match(r.forkedFrom, /Standard unit/);
    assert.equal(r.contract.name, 'Hot-Fill Filler FL-301');
    assert.match(r.contract.id, /-fork-/);
    assert.match(r.contract.drawing.origin.forkedFrom, /Standard unit/);
    assert.equal(r.contract.drawing.origin.kit, 'rotary-machine');
    assert.equal(executeValidateUnitOp({ contract: r.contract }).verdict, 'ACCEPTED');
  });

  it('forks a designed unit on the flowsheet and keeps its drawing', async () => {
    const r = (await tool('fork_unit_op').run({ from: 'P-101' }, host(JUICE_CONCENTRATION_LINE))) as any;
    assert.equal(r.success, true, r.error);
    assert.match(r.forkedFrom, /on the flowsheet/);
    assert.ok(r.contract.drawing.shapes.length > 0);
  });
});

describe('design_unit_op', () => {
  it('briefs the model with what a run actually sends into the unit, not the pipe defaults', async () => {
    const r = (await tool('design_unit_op').run({ description: 'a plate preheater for apple juice', targetUnit: 'E-101' }, { ...host(JUICE_CONCENTRATION_LINE), decider: { id: heuristicProvider.id, ask: (s, q) => heuristicProvider.ask(s, q), lastSource: { by: 'offline' } } } as ToolHost)) as any;
    const inlet = r.processContext.suggestedDesignInlet;
    assert.ok(inlet.volumetricFlowGpm > 0);
    assert.notEqual(inlet.volumetricFlowGpm, 45);
    assert.ok(inlet.composition && Object.keys(inlet.composition).length > 0);
    assert.match(r.processContext.notes.join(' '), /what a run of the line sends into this unit/);
  });
});
