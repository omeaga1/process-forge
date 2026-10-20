/**
 * Drawing kits draw a designed unit from its contract at the palette's
 * standard, and the drawing format carries what the palette's drawings use:
 * tones, moving parts, the items a line carries and a live level.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CASE_PACKER_CONTRACT,
  DRAWING_KITS,
  WAX_COOLING_BELT_CONTRACT,
  checkUnitOpDrawing,
  drawUnitOp,
  drawingQuality,
  drawingSimilarity,
  drawingToStandaloneSvg,
  drawingToSvg,
  executeValidateUnitOp,
  nearCopyOf,
  routeDrawingKit,
  type KitPort,
  type UnitOpContract,
  type UnitOpDrawing
} from '../index.js';

const port = (id: string, direction: 'INLET' | 'OUTLET', flowDimension: KitPort['flowDimension'] = 'DISCRETE_CONTAINER', phase?: string): KitPort => ({
  id,
  name: id,
  direction,
  flowDimension,
  ...(phase ? { phase } : {})
});

const items = [port('in', 'INLET'), port('out', 'OUTLET')];
const liquid = [port('in', 'INLET', 'CONTINUOUS_FLUID'), port('out', 'OUTLET', 'CONTINUOUS_FLUID')];

describe('Choosing a kit', () => {
  it('takes the equipment the name ends on: a filler feed pump is a pump', () => {
    assert.equal(routeDrawingKit({ name: 'Sanitary Filler Feed Pump P-101' }).kit, 'pump');
    assert.equal(routeDrawingKit({ name: 'Counter-Pressure Rotary Filler FL-101' }).kit, 'rotary-machine');
    assert.equal(routeDrawingKit({ name: 'Wrap-Around Film Labeler LB-101' }).kit, 'labeler');
    assert.equal(routeDrawingKit({ name: 'Lane-Fed Wrap-Around Case Packer CP-101' }).kit, 'case-packer');
    assert.equal(routeDrawingKit({ name: 'Bottle Accumulation Conveyor CV-101' }).kit, 'conveyor');
    assert.equal(routeDrawingKit({ name: 'Beverage Buffer Tank T-101' }).kit, 'tank');
    assert.equal(routeDrawingKit({ name: 'Inline Static Blender M-101' }).kit, 'inline-mixer');
    assert.equal(routeDrawingKit({ name: 'Carbonator C-101' }).kit, 'carbonator');
  });

  it('falls back to the description, then the archetype, then a generic machine', () => {
    assert.equal(routeDrawingKit({ name: 'X-1', description: 'a layer palletizer' }).kit, 'palletizer');
    assert.equal(routeDrawingKit({ name: 'X-1', archetype: 'pump' }).kit, 'pump');
    assert.deepEqual(routeDrawingKit({ name: 'X-1' }), { kit: 'machine', source: 'default', alternatives: [] });
  });
});

describe('Every kit', () => {
  for (const kit of DRAWING_KITS) {
    it(`${kit} draws a clean drawing with a nozzle on every port`, () => {
      const ports = kit === 'tank' || kit === 'carbonator' || kit === 'pump' || kit === 'inline-mixer' || kit === 'heat-exchanger' ? liquid : items;
      const { drawing } = drawUnitOp({ ports, name: 'Unit', kit });
      const check = checkUnitOpDrawing(drawing, ports);
      assert.deepEqual(check.errors, []);
      assert.deepEqual(check.warnings, []);
      assert.equal(drawing.nozzles.length, ports.length);
      assert.ok(drawing.shapes.length >= 18, `${kit}: ${drawing.shapes.length} shapes`);
      assert.ok((drawing.parts ?? []).length > 0, `${kit} has moving parts`);
      assert.deepEqual(drawingQuality(drawing, { moves: true }).warnings, []);
    });
  }
});

describe('A drawing made from a contract', () => {
  const filler = (valves: number) =>
    ({
      id: 'filler',
      name: 'Rotary Filler FL-1',
      description: 'fills PET bottles',
      ports: [port('product', 'INLET', 'CONTINUOUS_FLUID'), port('bottles', 'OUTLET')],
      parameters: [{ name: 'valveCount', label: 'Valves', unit: '-', value: valves }]
    }) as unknown as UnitOpContract;

  it('takes its numbers from the contract: a filler with more valves has more heads', () => {
    const heads = (d: UnitOpDrawing) => d.shapes.filter((s) => s.part === 'turret' && s.type === 'circle' && s.layer === 'body').length;
    assert.ok(heads(drawUnitOp({ contract: filler(16) }).drawing) > heads(drawUnitOp({ contract: filler(8) }).drawing));
  });

  it('puts each stream where it connects: product into the bowl on top, bottles out at the side', () => {
    const { drawing } = drawUnitOp({ contract: filler(12) });
    assert.equal(drawing.nozzles.find((n) => n.portId === 'product')?.side, 'top');
    assert.equal(drawing.nozzles.find((n) => n.portId === 'bottles')?.side, 'right');
  });

  it('is a variant of its own: two units of one kind are not one drawing', () => {
    const a = drawUnitOp({ contract: { ...filler(12), id: 'a', name: 'Rotary Filler FL-1' } }).drawing;
    const b = drawUnitOp({ contract: { ...filler(12), id: 'b', name: 'Rotary Filler FL-2' } }).drawing;
    assert.notDeepEqual(a, b);
    assert.deepEqual(drawUnitOp({ contract: filler(12), variant: 7 }).drawing, drawUnitOp({ contract: filler(12), variant: 7 }).drawing);
  });

  it('passes the engine as a model-designed unit with no drawing warnings', () => {
    const contract = { ...CASE_PACKER_CONTRACT, provenance: { authoredBy: 'SUB_AGENT', engineerConfirmed: [] } } as UnitOpContract;
    const verdict = executeValidateUnitOp({ contract: { ...contract, drawing: drawUnitOp({ contract }).drawing } });
    assert.equal(verdict.verdict, 'ACCEPTED');
    assert.deepEqual(verdict.gates.drawing.warnings, []);
    assert.ok((verdict.gates.drawing.quality ?? 0) >= 80);
  });
});

describe('What the format draws', () => {
  const drawing: UnitOpDrawing = {
    viewBox: { width: 100, height: 60 },
    shapes: [
      { type: 'rect', x: 10, y: 10, width: 80, height: 40, layer: 'body', tone: 'metal', weight: 'bold' },
      { type: 'rect', x: 12, y: 20, width: 76, height: 28, layer: 'fill', level: true },
      { type: 'circle', cx: 50, cy: 30, r: 8, layer: 'body', tone: 'solid', part: 'rotor' },
      { type: 'item', item: 'bottle', x: 20, y: 12, width: 8, height: 16, layer: 'body', part: 'belt' }
    ],
    nozzles: [],
    parts: [
      { id: 'rotor', motion: 'spin', periodS: 2 },
      { id: 'belt', motion: 'travel', periodS: 1, dx: 10 }
    ]
  };

  it('paints tones from the theme, with the dark theme as the fallback', () => {
    const { shell } = drawingToSvg(drawing);
    assert.match(shell, /fill: var\(--pf-bg-surface-elevated, #252930\)/);
    assert.match(shell, /stroke-width="2"/);
  });

  it('moves parts only while the unit runs, about their own centre', () => {
    const { shell } = drawingToSvg(drawing);
    assert.match(shell, /transform-origin: 50px 30px; animation: pf-spin 2s linear infinite; animation-play-state: var\(--pf-play, running\)/);
    assert.match(shell, /--pf-dx: 10px; --pf-dy: 0px; animation: pf-d-travel 1s linear infinite/);
  });

  it('scales a level shape with the liquid the unit holds, from its bottom edge', () => {
    assert.match(drawingToSvg(drawing).shell, /transform-origin: 0px 48px; transform: scaleY\(var\(--pf-level, 0.6\)\)/);
  });

  it('draws items as glyphs fitted to their box', () => {
    assert.match(drawingToSvg(drawing).shell, /<g transform="translate\(20 12\) scale\(0.08 0.16\)">/);
  });

  it('refuses a shape in a part that is not declared', () => {
    const bad = { ...drawing, shapes: [...drawing.shapes, { type: 'circle' as const, cx: 5, cy: 5, r: 2, layer: 'body' as const, part: 'ghost' }] };
    assert.match(checkUnitOpDrawing(bad, []).errors.join('\n'), /part "ghost" is not in drawing.parts/);
  });

  it('exports a whole SVG document for previews', () => {
    const svg = drawingToStandaloneSvg(drawing, { pixelWidth: 300 });
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 100 60" width="300" height="180"/);
    assert.doesNotMatch(svg, /<script|<foreignObject/);
  });
});

describe('Holding model drawings to the palette', () => {
  const asModel = (c: UnitOpContract): UnitOpContract => ({ ...c, id: `${c.id}-copy`, provenance: { authoredBy: 'SUB_AGENT', engineerConfirmed: [] } });

  it('warns about a sparse, one-colour drawing made by a model', () => {
    const verdict = executeValidateUnitOp({ contract: asModel(WAX_COOLING_BELT_CONTRACT) });
    assert.match(verdict.gates.drawing.warnings.join('\n'), /uses one colour/);
  });

  it('calls a renamed copy of a shipped drawing a copy, and lets a fork through', () => {
    const copy = asModel(WAX_COOLING_BELT_CONTRACT);
    assert.equal(nearCopyOf(copy.drawing!, copy.id)?.name, WAX_COOLING_BELT_CONTRACT.name);
    assert.match(executeValidateUnitOp({ contract: copy }).gates.drawing.warnings.join('\n'), /ships with ProcessForge/);
    assert.equal(nearCopyOf({ ...copy.drawing!, origin: { forkedFrom: 'Standard unit' } }), null);
  });

  it('leaves an engineer\'s own drawing alone', () => {
    assert.deepEqual(executeValidateUnitOp({ contract: WAX_COOLING_BELT_CONTRACT }).gates.drawing.warnings, []);
  });

  it('tells similar drawings from different ones', () => {
    const a = drawUnitOp({ ports: items, kit: 'conveyor', variant: 1 }).drawing;
    assert.equal(drawingSimilarity(a, a), 1);
    assert.ok(drawingSimilarity(a, drawUnitOp({ ports: items, kit: 'palletizer', variant: 1 }).drawing) < 0.2);
  });
});
