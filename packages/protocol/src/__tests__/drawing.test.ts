/**
 * A unit op's drawing is part of its contract: the engine checks that it can
 * be drawn and piped, and the app renders it from numbers only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WAX_COOLING_BELT_CONTRACT,
  checkUnitOpDrawing,
  drawingToDressing,
  drawingToSvg,
  executeValidateUnitOp,
  pathPoints,
  type UnitOpContract
} from '../index.js';

const clone = (): UnitOpContract => JSON.parse(JSON.stringify(WAX_COOLING_BELT_CONTRACT));

describe('Path data', () => {
  it('follows absolute and relative commands to the points they pass through', () => {
    const r = pathPoints('M 10 10 l 20 0 V 30 h -20 z');
    assert.ok(!('error' in r));
    assert.deepEqual(r.points, [
      [10, 10],
      [30, 10],
      [30, 30],
      [10, 30],
      [10, 10]
    ]);
  });

  it('treats extra pairs after M as line-tos, and takes arc end points', () => {
    const r = pathPoints('M0 0 10 0 A 5 5 0 0 1 10 10');
    assert.ok(!('error' in r));
    assert.deepEqual(r.points, [
      [0, 0],
      [10, 0],
      [10, 10]
    ]);
  });

  it('refuses anything that is not path data', () => {
    for (const bad of ['M 0 0 L 10 10 "/><script>alert(1)</script>', 'M 0 0 L 10', '10 10', 'M 0 0 url(#x)']) {
      assert.ok('error' in pathPoints(bad), bad);
    }
  });
});

describe('The drawing gate', () => {
  it('accepts the reference contract, whose nozzles all sit on the equipment', () => {
    const r = executeValidateUnitOp({ contract: WAX_COOLING_BELT_CONTRACT });
    assert.equal(r.verdict, 'ACCEPTED');
    assert.deepEqual(r.gates.drawing, { passed: true, errors: [], warnings: [] });
  });

  it('rejects a port with no nozzle, because it could not be piped', () => {
    const c = clone();
    c.drawing!.nozzles = c.drawing!.nozzles.filter((n) => n.portId !== 'wax-out');
    const r = executeValidateUnitOp({ contract: c });
    assert.equal(r.verdict, 'REJECTED');
    assert.match(r.gates.drawing.errors.join('\n'), /wax-out.*no nozzle/);
    assert.match(r.revisionGuidance, /cannot be drawn and piped/);
  });

  it('rejects nozzles for ports that do not exist, and two nozzles on one port', () => {
    const c = clone();
    c.drawing!.nozzles.push({ portId: 'steam-in', x: 50, y: 0, side: 'top' }, { portId: 'wax-in', x: 30, y: 17.8, side: 'top' });
    const { errors } = checkUnitOpDrawing(c.drawing!, c.ports);
    assert.ok(errors.some((e) => /steam-in.*not a port/.test(e)));
    assert.ok(errors.some((e) => /wax-in.*2 nozzles/.test(e)));
  });

  it('rejects shapes outside the viewBox, which would be cut off', () => {
    const c = clone();
    c.drawing!.shapes.push({ type: 'circle', cx: 215, cy: 45, r: 20, layer: 'body' });
    assert.match(checkUnitOpDrawing(c.drawing!, c.ports).errors.join('\n'), /outside the 220 x 90 viewBox/);
  });

  it('warns about a nozzle floating off the equipment or facing inward', () => {
    const c = clone();
    const n = c.drawing!.nozzles.find((z) => z.portId === 'wax-in')!;
    n.x = 50;
    n.y = 12;
    n.side = 'bottom';
    const { errors, warnings } = checkUnitOpDrawing(c.drawing!, c.ports);
    assert.deepEqual(errors, []);
    assert.ok(warnings.some((w) => /wax-in.*from the nearest body outline/.test(w)));
    assert.ok(warnings.some((w) => /wax-in.*faces bottom/.test(w)));
  });

  it('a contract without a drawing still passes, with a warning that it will look generic', () => {
    const c = clone();
    delete c.drawing;
    const r = executeValidateUnitOp({ contract: c });
    assert.equal(r.verdict, 'ACCEPTED');
    assert.match(r.gates.drawing.warnings[0]!, /generic vessel/);
  });
});

describe('Rendering', () => {
  it('rebuilds path data from its numbers, never the raw string', () => {
    const svg = drawingToSvg({
      viewBox: { width: 100, height: 100 },
      shapes: [{ type: 'path', d: 'M10,10L90,10 90.456789,90z', layer: 'body' }],
      nozzles: []
    });
    assert.equal(svg.shell, '<path d="M 10 10 L 90 10 90.46 90 z"/>');
  });

  it('puts details apart from the body, and tints fills', () => {
    const svg = drawingToSvg(WAX_COOLING_BELT_CONTRACT.drawing!);
    assert.ok(svg.shell.includes('fill="rgba(16, 185, 129, 0.26)"'));
    assert.ok(svg.details.includes('stroke-dasharray="4 3"'));
    assert.equal(svg.viewBox, '0 0 220 90');
  });

  it("turns the drawing into canvas nozzles linked to the contract's ports", () => {
    const d = drawingToDressing(WAX_COOLING_BELT_CONTRACT.drawing!, WAX_COOLING_BELT_CONTRACT.ports);
    assert.deepEqual(
      d.nozzles.map((z) => [z.portId, z.role, z.position]),
      [
        ['wax-in', 'inlet', 'top'],
        ['cw-in', 'inlet', 'left'],
        ['cw-out', 'outlet', 'right'],
        ['wax-out', 'outlet', 'right']
      ]
    );
    assert.equal(d.viewBox, '0 0 220 90');
    assert.ok(d.customSvgShell && d.customSvgShell.length > 0);
    assert.equal(d.defaultSize!.width, 190, 'a wide unit gets a wide box');
  });
});
