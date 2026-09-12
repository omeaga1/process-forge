import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { synthesizeEquipmentDrawing } from '../index.js';

describe('Equipment CAD Drawing Engine (Drawing-with-Thought)', () => {
  it('synthesizes a distillation column with multiple sieve trays and nozzles', () => {
    const dwg = synthesizeEquipmentDrawing('Fractionation distillation tower with 6 sieve trays and top reflux', {
      kind: 'DISTILLATION_COLUMN',
      machineName: 'C-101 Distillation Column'
    });

    assert.equal(dwg.category, 'Separations');
    assert.ok(dwg.svgShell.includes('<rect'));
    assert.ok(dwg.svgShell.includes('<ellipse'));
    assert.ok(dwg.svgDetails.includes('<line'));
    assert.ok(dwg.thinking.includes('Step 1'));
    assert.ok(dwg.thinking.includes('Step 6'));
    assert.ok(dwg.nozzles.length >= 4);
    assert.equal(dwg.internals.packingType, 'trays');
  });

  it('synthesizes a jacketed CSTR with Rushton turbine and cooling jacket', () => {
    const dwg = synthesizeEquipmentDrawing('Jacketed chemical reactor with high-shear Rushton impeller and cooling jacket', {
      kind: 'BATCH_REACTOR',
      machineName: 'R-200 Polymerizer'
    });

    assert.equal(dwg.category, 'Reactors');
    assert.ok(dwg.svgShell.includes('<rect'));
    assert.ok(dwg.svgDetails.includes('Rushton') || dwg.thinking.includes('rushton'));
    assert.equal(dwg.internals.agitatorType, 'rushton');
    assert.equal(dwg.internals.hasJacket, true);
    assert.ok(dwg.nozzles.some((n) => n.role === 'relief'));
  });

  it('synthesizes a spherical LPG pressure storage sphere with relief valve', () => {
    const dwg = synthesizeEquipmentDrawing('Spherical LPG storage sphere on vertical support legs with safety relief vent');

    assert.equal(dwg.category, 'Vessels');
    assert.ok(dwg.svgShell.includes('<circle'));
    assert.ok(dwg.svgDetails.includes('<line'));
    assert.ok(dwg.nozzles.some((n) => n.role === 'relief'));
    assert.ok(dwg.nozzles.some((n) => n.ratingPsi === 600));
  });

  it('synthesizes a centrifugal pump with directional discharge impeller', () => {
    const dwg = synthesizeEquipmentDrawing('Centrifugal feed pump with 3-inch suction and high pressure discharge');

    assert.equal(dwg.category, 'Fluid Movement');
    assert.ok(dwg.svgShell.includes('<polygon points='));
    assert.ok(dwg.svgShell.includes("fill='currentColor'"));
    assert.ok(dwg.nozzles.some((n) => n.role === 'inlet'));
    assert.ok(dwg.nozzles.some((n) => n.role === 'outlet'));
  });
});
