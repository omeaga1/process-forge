import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  synthesizeEquipmentDrawing,
  UnitOpDressingSchema,
  NozzleDressingSchema
} from '../index.js';

describe('Equipment CAD Drawing Template Library', () => {
  it('synthesizes a distillation column with multiple sieve trays and nozzles', () => {
    const dwg = synthesizeEquipmentDrawing('Fractionation distillation tower with 6 sieve trays and top reflux', {
      kind: 'DISTILLATION_COLUMN',
      machineName: 'C-101 Distillation Column'
    });

    assert.equal(dwg.category, 'Separations');
    assert.ok(dwg.svgShell.includes('<rect'));
    assert.ok(dwg.svgShell.includes('<ellipse'));
    assert.ok(dwg.svgDetails.includes('<line'));
    assert.ok(dwg.templateNotes.includes('Form:'));
    assert.ok(dwg.templateNotes.includes('Connections:'));
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
    assert.ok(dwg.svgDetails.includes('Rushton') || dwg.templateNotes.includes('rushton'));
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

  it('synthesizes a shell & tube heat exchanger with baffles and process nozzles', () => {
    const dwg = synthesizeEquipmentDrawing('Horizontal shell and tube heat exchanger with cooling water tube pass', {
      kind: 'HEAT_EXCHANGER',
      machineName: 'E-101 Process Cooler'
    });

    assert.equal(dwg.category, 'Heat Transfer');
    assert.ok(dwg.svgShell.includes('<rect'));
    assert.ok(dwg.svgShell.includes('<ellipse'));
    assert.ok(dwg.svgDetails.includes('<line'));
    assert.equal(dwg.internals.baffleCount, 5);
    assert.ok(dwg.nozzles.length >= 4);
    assert.ok(dwg.nozzles.some((n) => n.ratingPsi === 300));
  });

  it('synthesizes a cyclone dust separator with hopper and vortex vent', () => {
    const dwg = synthesizeEquipmentDrawing('Gas-solid cyclone separator for catalyst recovery', {
      kind: 'SEPARATOR',
      machineName: 'CY-50 Cyclone'
    });

    assert.equal(dwg.category, 'Separations');
    assert.ok(dwg.svgShell.includes('<polygon points='));
    assert.ok(dwg.svgShell.includes('<rect'));
    assert.ok(dwg.nozzles.some((n) => n.role === 'vent'));
    assert.ok(dwg.nozzles.some((n) => n.role === 'drain'));
  });

  it('synthesizes a twin-fluid spray atomizer with conical dispersion', () => {
    const dwg = synthesizeEquipmentDrawing('Twin-fluid spray scrubber atomizer nozzle with compressed air feed', {
      kind: 'SPRAY_CHAMBER',
      machineName: 'SP-10 Atomizer'
    });

    assert.equal(dwg.category, 'Utilities');
    assert.ok(dwg.svgShell.includes('<polygon points='));
    assert.ok(dwg.svgDetails.includes('<line'));
    assert.equal(dwg.internals.hasSprayHeader, true);
    assert.ok(dwg.nozzles.some((n) => n.role === 'utility'));
  });

  it('synthesizes a horizontal bullet pressure vessel with saddle mounts', () => {
    const dwg = synthesizeEquipmentDrawing('Horizontal bullet surge drum for LPG storage with relief valve', {
      kind: 'SURGE_TANK',
      machineName: 'V-400 Bullet Drum'
    });

    assert.equal(dwg.category, 'Vessels');
    assert.ok(dwg.svgShell.includes('<rect'));
    assert.ok(dwg.svgShell.includes('<ellipse'));
    assert.ok(dwg.svgDetails.includes('<rect'));
    assert.ok(dwg.nozzles.some((n) => n.role === 'relief' || n.role === 'vent'));
  });

  it('synthesizes a default process vessel with custom name and baffles when prompted', () => {
    const dwg = synthesizeEquipmentDrawing('Cylindrical mixing vessel with internal wall baffles and steam jacket', {
      machineName: 'TK-99 Mix Tank'
    });

    assert.equal(dwg.category, 'Vessels');
    assert.ok(dwg.label.includes('TK-99'));
    assert.ok(dwg.svgDetails.includes('<line'));
    assert.equal(dwg.internals.hasJacket, true);
    assert.equal(dwg.internals.baffleCount, 4);
  });
});

describe('Unit-Op Dressing Zod Schema Validation', () => {
  it('validates a complete mechanical dressing payload with custom SVG and nozzles', () => {
    const payload = {
      nozzles: [
        {
          id: 'N1',
          name: 'Feed Inlet',
          role: 'inlet',
          x: 25,
          y: 10,
          position: 'top',
          sizeInches: 4,
          ratingPsi: 300
        },
        {
          id: 'N2',
          name: 'Bottom Drain',
          role: 'drain',
          x: 50,
          y: 95,
          position: 'bottom',
          sizeInches: 2,
          ratingPsi: 150
        }
      ],
      internals: {
        agitatorType: 'rushton',
        agitatorRpm: 150,
        hasJacket: true,
        jacketType: 'steam',
        baffleCount: 4,
        hasDemister: false,
        hasSprayHeader: false
      },
      customSvgShell: "<rect x='20' y='20' width='60' height='60'/>",
      customSvgDetails: "<line x1='50' y1='20' x2='50' y2='60'/>",
      viewBox: '0 0 100 100',
      defaultSize: { width: 80, height: 110 },
      drawingPrompt: 'Custom Jacketed Reactor',
      generatedBySubAgent: true
    };

    const parsed = UnitOpDressingSchema.parse(payload);
    assert.strictEqual(parsed.generatedBySubAgent, true);
    assert.strictEqual(parsed.nozzles.length, 2);
    assert.strictEqual(parsed.internals.agitatorType, 'rushton');
    assert.strictEqual(parsed.internals.baffleCount, 4);
  });

  it('rejects invalid nozzle coordinates outside 0-100 boundary range', () => {
    assert.throws(() => {
      NozzleDressingSchema.parse({
        id: 'N-bad',
        name: 'Out of Bounds Nozzle',
        role: 'inlet',
        x: 120, // Invalid: exceeds 100
        y: 50,
        position: 'top',
        sizeInches: 2,
        ratingPsi: 150
      });
    });

    assert.throws(() => {
      NozzleDressingSchema.parse({
        id: 'N-bad2',
        name: 'Negative coordinate nozzle',
        role: 'outlet',
        x: 50,
        y: -10, // Invalid: negative
        position: 'bottom',
        sizeInches: 2,
        ratingPsi: 150
      });
    });
  });

  it('rejects negative pipe sizes and negative flange pressure ratings', () => {
    assert.throws(() => {
      NozzleDressingSchema.parse({
        id: 'N-bad-size',
        name: 'Negative size',
        role: 'inlet',
        x: 50,
        y: 50,
        position: 'left',
        sizeInches: -2, // Invalid: negative size
        ratingPsi: 150
      });
    });

    assert.throws(() => {
      NozzleDressingSchema.parse({
        id: 'N-bad-psi',
        name: 'Negative rating',
        role: 'inlet',
        x: 50,
        y: 50,
        position: 'left',
        sizeInches: 2,
        ratingPsi: -150 // Invalid: negative rating
      });
    });
  });
});
