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

describe('Column internals: counts must be counts of trays', () => {
  const lineCount = (prompt: string) =>
    (synthesizeEquipmentDrawing(prompt).svgDetails.match(/<line/g) || []).length;

  it('does not read a nozzle size as a tray count', () => {
    // Was: p.includes('10') matched the bare digits in "10 inch" and rendered a
    // ten-tray column. Plan 0001 section 2.3.
    assert.equal(lineCount('distillation column with a 10 inch nozzle'), 5);
  });

  it('reads an explicit tray count', () => {
    assert.equal(lineCount('distillation column with 8 sieve trays'), 8);
    assert.equal(lineCount('fractionation tower with 4 valve trays'), 4);
  });

  it('lets an explicit tray count outrank a packing keyword', () => {
    // Was: isPacked was tested first, so "absorption" won and an unambiguous
    // "6 trays" was silently discarded in favour of cross-hatching.
    const dwg = synthesizeEquipmentDrawing('absorption column with 6 trays');
    assert.equal(dwg.label, 'Distillation Column');
    assert.equal(lineCount('absorption column with 6 trays'), 6);
  });

  it('still renders packing when no tray count is given', () => {
    const dwg = synthesizeEquipmentDrawing('packed absorption column');
    assert.equal(dwg.label, 'Packed Absorption Column');
  });

  it('emits no control characters in template notes', () => {
    // A shell heredoc once turned an intended \b escape into a literal
    // backspace byte in this file, which silently disabled two regexes.
    for (const p of ['distillation column', 'centrifugal pump', 'cyclone separator']) {
      assert.ok(
        // eslint-disable-next-line no-control-regex
        !/[\x00-\x08\x0b\x0c]/.test(synthesizeEquipmentDrawing(p).templateNotes),
        `${p} notes contain a control character`
      );
    }
  });
});

describe('Template routing (plan 0001, seam 4)', () => {
  const route = (prompt: string, context?: Parameters<typeof synthesizeEquipmentDrawing>[1]) =>
    synthesizeEquipmentDrawing(prompt, context).routing;

  it('reports a tie instead of presenting the first match as settled', () => {
    // Was: first-match. "column" was tested before "cyclone", so this drew a
    // column and nothing downstream could tell that a cyclone was named too.
    const r = route('absorption column feeding a cyclone');
    assert.equal(r.family, 'column', 'declaration order is still the tie-break');
    assert.equal(r.decided, false);
    assert.deepEqual(r.alternatives, ['cyclone']);
  });

  it('is decided when one family is named', () => {
    const r = route('jacketed CSTR with a Rushton turbine');
    assert.equal(r.family, 'reactor');
    assert.equal(r.decided, true);
    assert.deepEqual(r.alternatives, []);
  });

  it('lets a named family outvote a modifier', () => {
    // "horizontal" alone meant a drum in the ladder, which tested it last; as a
    // plain keyword it would tie with every horizontal exchanger.
    assert.equal(route('horizontal shell and tube heat exchanger').family, 'exchanger');
    assert.equal(route('horizontal shell and tube heat exchanger').decided, true);
    assert.equal(route('horizontal vessel on concrete piers').family, 'drum');
    assert.equal(route('centrifugal pump, closed impeller').family, 'pump');
    assert.equal(route('centrifugal pump, closed impeller').decided, true);
  });

  it('uses the node kind when the description names no family', () => {
    assert.equal(route('jacketed, 2 m3 working volume', { kind: 'BATCH_REACTOR' }).family, 'reactor');
    // MCP passes a free-form machine type rather than a node kind.
    assert.equal(route('twin-fluid nozzle with compressed air', { kind: 'scrubber' }).family, 'spray');
  });

  it('lets the description outrank the node kind', () => {
    const r = route('distillation column', { kind: 'BATCH_REACTOR' });
    assert.equal(r.family, 'column');
    assert.equal(r.decided, true);
  });

  it('draws the generic vessel when nothing is named, not the first family', () => {
    // A uniform distribution's "winner" is whichever option was declared
    // first -- a column. hasSignal is what keeps that from being drawn.
    const r = route('two-phase separator');
    assert.equal(r.family, 'generic');
    assert.equal(r.source, 'default');
  });

  it('draws exactly what the caller asks for', () => {
    // The path an engineer takes after picking one of `alternatives`.
    const dwg = synthesizeEquipmentDrawing('absorption column feeding a cyclone', { family: 'cyclone' });
    assert.equal(dwg.label, 'Cyclone Dust Separator');
    assert.equal(dwg.routing.source, 'caller');
    assert.equal(dwg.routing.decided, true);
  });

  it('treats a condenser on a column as part of the column', () => {
    // The forge_equipment_drawing tool's own example description.
    const r = route('Distillation column with 8 sieve trays and overhead reflux condenser');
    assert.equal(r.family, 'column');
    assert.equal(r.decided, true);
    assert.equal(route('overhead condenser').family, 'exchanger');
  });

  it('does not tie a bullet with a sphere because the service is LPG', () => {
    const r = route('horizontal bullet for LPG storage');
    assert.equal(r.family, 'drum');
    assert.equal(r.decided, true);
  });
});
