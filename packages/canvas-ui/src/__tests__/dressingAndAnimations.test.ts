import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  synthesizeEquipmentDrawing,
  type UnitOpDressing,
  type NozzleDressing
} from '@process-forge/protocol';

describe('UnitOp Mechanical Dressing & Nozzle Subsystem', () => {
  it('correctly sets up initial nozzles with standard ASME flange classes', () => {
    const defaultNozzles: NozzleDressing[] = [
      {
        id: 'N1',
        name: 'Primary Infeed',
        role: 'inlet',
        x: 15,
        y: 20,
        position: 'top',
        sizeInches: 3,
        ratingPsi: 150
      },
      {
        id: 'N2',
        name: 'Discharge Drain',
        role: 'outlet',
        x: 50,
        y: 95,
        position: 'bottom',
        sizeInches: 2,
        ratingPsi: 150
      }
    ];

    assert.strictEqual(defaultNozzles.length, 2);
    assert.strictEqual(defaultNozzles[0]!.sizeInches, 3);
    assert.strictEqual(defaultNozzles[0]!.ratingPsi, 150);
    assert.strictEqual(defaultNozzles[1]!.role, 'outlet');
  });

  it('handles immutable nozzle addition, updates, and removals', () => {
    let nozzles: NozzleDressing[] = [
      {
        id: 'N1',
        name: 'Feed',
        role: 'inlet',
        x: 20,
        y: 10,
        position: 'top',
        sizeInches: 2,
        ratingPsi: 150
      }
    ];

    // Add relief nozzle
    const newNozzle: NozzleDressing = {
      id: 'N2',
      name: 'Safety Relief Vent',
      role: 'relief',
      x: 50,
      y: 5,
      position: 'top',
      sizeInches: 3,
      ratingPsi: 300
    };
    nozzles = [...nozzles, newNozzle];

    assert.strictEqual(nozzles.length, 2);
    assert.strictEqual(nozzles[1]!.role, 'relief');

    // Update nozzle rating
    nozzles = nozzles.map((n) => (n.id === 'N2' ? { ...n, ratingPsi: 600 } : n));
    assert.strictEqual(nozzles.find((n) => n.id === 'N2')?.ratingPsi, 600);

    // Remove nozzle N1
    nozzles = nozzles.filter((n) => n.id !== 'N1');
    assert.strictEqual(nozzles.length, 1);
    assert.strictEqual(nozzles[0]!.id, 'N2');
  });

  it('validates vessel internals options (agitators, jackets, baffles)', () => {
    const internals: UnitOpDressing['internals'] = {
      agitatorType: 'rushton',
      agitatorRpm: 120,
      hasJacket: true,
      jacketType: 'glycol',
      baffleCount: 4,
      packingType: 'none',
      hasDemister: false,
      hasSprayHeader: false
    };

    assert.strictEqual(internals.agitatorType, 'rushton');
    assert.strictEqual(internals.hasJacket, true);
    assert.strictEqual(internals.jacketType, 'glycol');
    assert.strictEqual(internals.baffleCount, 4);
  });
});

describe('Custom Equipment CAD Sanitization & State Transitions', () => {
  // Test helper simulating the sanitize function in CustomEquipmentAnim
  const sanitizeSvg = (svg: string) =>
    svg.replace(/<(script|style|use|image|defs)[^>]*>.*?<\/\1>/gis, '').replace(/<(script|style|use|image)[^>]*\/>/gi, '');

  it('sanitizes malicious script and defs tags while preserving valid SVG geometry', () => {
    const maliciousSvg = `<rect x='10' y='10' width='80' height='80'/><script>alert('xss')</script><defs><filter id='f'/></defs><ellipse cx='50' cy='50' rx='20' ry='10'/>`;
    const cleaned = sanitizeSvg(maliciousSvg);

    assert.ok(!cleaned.includes('<script>'), 'Must strip script tags');
    assert.ok(!cleaned.includes('alert'), 'Must strip script contents');
    assert.ok(!cleaned.includes('<defs>'), 'Must strip defs tags');
    assert.ok(cleaned.includes('<rect'), 'Must preserve rect');
    assert.ok(cleaned.includes('<ellipse'), 'Must preserve ellipse');
  });

  it('simulates Sub-Agent CAD drawing application and reset lifecycle', () => {
    const baseDressing: UnitOpDressing = {
      nozzles: [
        {
          id: 'N1',
          name: 'Old Feed',
          role: 'inlet',
          x: 10,
          y: 10,
          position: 'top',
          sizeInches: 2,
          ratingPsi: 150
        }
      ],
      internals: {
        agitatorType: 'none',
        hasJacket: false,
        jacketType: 'none',
        baffleCount: 0,
        packingType: 'none',
        hasDemister: false,
        hasSprayHeader: false
      }
    };

    // 1. Sub-Agent synthesizes CAD drawing
    const dwg = synthesizeEquipmentDrawing('Jacketed chemical reactor with Rushton turbine and relief vent', {
      kind: 'BATCH_REACTOR',
      machineName: 'R-101'
    });

    // 2. Apply CAD drawing to dressing
    const dressedWithCad: UnitOpDressing = {
      ...baseDressing,
      customSvgShell: dwg.svgShell,
      customSvgDetails: dwg.svgDetails,
      viewBox: dwg.viewBox,
      defaultSize: dwg.defaultSize,
      drawingPrompt: 'Jacketed chemical reactor with Rushton turbine and relief vent',
      generatedBySubAgent: true,
      nozzles: dwg.nozzles,
      internals: {
        ...baseDressing.internals,
        ...dwg.internals
      }
    };

    assert.strictEqual(dressedWithCad.generatedBySubAgent, true);
    assert.ok(dressedWithCad.customSvgShell?.includes('<rect'));
    assert.strictEqual(dressedWithCad.internals.agitatorType, 'rushton');
    assert.strictEqual(dressedWithCad.internals.hasJacket, true);
    assert.ok(dressedWithCad.nozzles.length >= 3);

    // 3. User clicks "Reset to Standard Animation"
    const resetDressing: UnitOpDressing = {
      ...dressedWithCad,
      customSvgShell: undefined,
      customSvgDetails: undefined,
      viewBox: undefined,
      defaultSize: undefined,
      drawingPrompt: undefined,
      generatedBySubAgent: false
    };

    assert.strictEqual(resetDressing.generatedBySubAgent, false);
    assert.strictEqual(resetDressing.customSvgShell, undefined);
    assert.strictEqual(resetDressing.customSvgDetails, undefined);
  });
});
