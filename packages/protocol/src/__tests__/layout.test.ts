import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  flipLayout,
  placePoint,
  placedSize,
  rotateLayout,
  scaleLayout,
  compactLayout,
  layoutTransform
} from '../layout/placement.js';
import { labelSpot, moveRun, orthogonalize, polylineHits, routePipe, routeThrough, roundedPath, waypointsOf, type Rect } from '../layout/routing.js';
import { ProcessEdgeSchema } from '../streams.js';
import { ProcessNodeSchema } from '../nodes.js';

const orthogonal = (pts: { x: number; y: number }[]) =>
  pts.every((p, i) => i === 0 || Math.abs(p.x - pts[i - 1]!.x) < 0.5 || Math.abs(p.y - pts[i - 1]!.y) < 0.5);

describe('unit placement: size, turn and mirror', () => {
  it('a quarter turn swaps the box and carries each nozzle round clockwise', () => {
    assert.deepEqual(placedSize(100, 60, { rotation: 90 }), { width: 60, height: 100, drawnWidth: 100, drawnHeight: 60 });
    // A suction on the left, halfway down, ends up on top, halfway across.
    assert.deepEqual(placePoint(0, 50, 'left', { rotation: 90 }), { x: 50, y: 0, side: 'top' });
    // The top-right corner goes to the bottom-right.
    assert.deepEqual(placePoint(100, 0, 'top', { rotation: 90 }), { x: 100, y: 100, side: 'right' });
    assert.deepEqual(placePoint(100, 0, 'right', { rotation: 180 }), { x: 0, y: 100, side: 'left' });
    assert.deepEqual(placePoint(20, 30, 'bottom', { rotation: 270 }), { x: 30, y: 80, side: 'right' });
  });

  it('mirrors before it turns, like the CSS that draws it', () => {
    assert.deepEqual(placePoint(10, 40, 'left', { flipX: true }), { x: 90, y: 40, side: 'right' });
    assert.equal(layoutTransform({ rotation: 90, flipX: true }), 'rotate(90deg) scaleX(-1)');
    assert.equal(layoutTransform(undefined), '');
  });

  it('four quarter turns come back to where they started, and mirroring twice undoes itself', () => {
    let l = rotateLayout(undefined, 1);
    for (let i = 0; i < 3; i++) l = rotateLayout(l, 1);
    assert.equal(l, undefined);
    assert.equal(flipLayout(flipLayout({ rotation: 90 }))?.rotation, 90);
    assert.equal(flipLayout(flipLayout(undefined)), undefined);
  });

  it('a mirrored turned unit mirrors on screen: left and right swap, top and bottom stay', () => {
    const turned = { rotation: 90 as const };
    const before = placePoint(0, 50, 'left', turned); // top
    const after = placePoint(0, 50, 'left', flipLayout(turned));
    assert.equal(before.side, 'top');
    assert.equal(after.side, 'top');
    assert.equal(after.x, 100 - before.x);
    assert.equal(after.y, before.y);
  });

  it('keeps the scale in range and stores nothing for the defaults', () => {
    assert.equal(scaleLayout(undefined, 9)?.scale, 3);
    assert.equal(scaleLayout(undefined, 0.1)?.scale, 0.5);
    assert.equal(compactLayout({ scale: 1, rotation: 0, flipX: false }), undefined);
    assert.ok(ProcessNodeSchema.shape.layout.safeParse({ scale: 1.5, rotation: 270 }).success);
    assert.ok(!ProcessNodeSchema.shape.layout.safeParse({ rotation: 45 }).success);
  });
});

describe('pipe routing', () => {
  // A tank between a pump and a filler, all on one row.
  const pump: Rect = { x: 0, y: 0, width: 100, height: 100 };
  const tank: Rect = { x: 220, y: -20, width: 120, height: 160 };
  const filler: Rect = { x: 460, y: 0, width: 100, height: 100 };

  it('goes round a unit that sits in the way, never through it', () => {
    const route = routePipe({ x: 100, y: 50, side: 'right' }, { x: 460, y: 50, side: 'left' }, [pump, tank, filler]);
    assert.ok(orthogonal(route));
    assert.ok(!polylineHits(route.slice(1, -1), [tank]), JSON.stringify(route));
    assert.deepEqual(route[0], { x: 100, y: 50 });
    assert.deepEqual(route[route.length - 1], { x: 460, y: 50 });
    // Leaves and enters along the nozzles' own axes.
    assert.equal(route[1]!.y, 50);
    assert.equal(route[route.length - 2]!.y, 50);
  });

  it('runs straight when nothing is in the way', () => {
    const route = routePipe({ x: 100, y: 50, side: 'right' }, { x: 460, y: 50, side: 'left' }, [pump, filler]);
    assert.equal(route.length, 4);
    assert.ok(route.every((p) => p.y === 50));
  });

  it('takes the fewest bends when it has to turn: out of a top nozzle into a side one', () => {
    const route = routePipe({ x: 50, y: 0, side: 'top' }, { x: 460, y: 50, side: 'left' }, [pump, filler]);
    assert.ok(orthogonal(route));
    // Up, across, down, into the side: three bends at most.
    assert.ok(route.length <= 6, JSON.stringify(route));
  });

  it('pushes a lead out past a unit right in front of the nozzle', () => {
    const block: Rect = { x: 110, y: 20, width: 40, height: 60 };
    const route = routePipe({ x: 100, y: 50, side: 'right' }, { x: 460, y: 50, side: 'left' }, [pump, block, filler]);
    assert.ok(orthogonal(route));
    assert.ok(!polylineHits(route.slice(2, -1), [block]), JSON.stringify(route));
  });

  it('follows the bends drawn by hand, adding elbows to keep runs square', () => {
    const route = routeThrough({ x: 100, y: 50, side: 'right' }, { x: 460, y: 50, side: 'left' }, [{ x: 200, y: 250 }]);
    assert.ok(orthogonal(route), JSON.stringify(route));
    assert.ok(route.some((p) => p.y === 250));
    assert.deepEqual(orthogonalize([{ x: 0, y: 0 }, { x: 10, y: 10 }], 'right', 'left'), [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 }
    ]);
  });

  it('drags a run sideways and stores it as bends', () => {
    const route = routePipe({ x: 100, y: 50, side: 'right' }, { x: 460, y: 50, side: 'left' }, [pump, filler]);
    // One straight run between the leads: drag it down 120.
    const bends = moveRun(route, 1, 120);
    const rerouted = routeThrough({ x: 100, y: 50, side: 'right' }, { x: 460, y: 50, side: 'left' }, bends);
    assert.ok(orthogonal(rerouted));
    assert.ok(rerouted.some((p) => p.y === 170), JSON.stringify(rerouted));
    // And the route round the tank keeps its bends when stored and drawn again.
    const round = routePipe({ x: 100, y: 50, side: 'right' }, { x: 460, y: 50, side: 'left' }, [pump, tank, filler]);
    const again = routeThrough({ x: 100, y: 50, side: 'right' }, { x: 460, y: 50, side: 'left' }, waypointsOf(round));
    assert.deepEqual(again, round);
  });

  it('draws rounded elbows and finds the middle of the pipe', () => {
    const p = roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 10);
    assert.match(p.d, /^M 0 0 L 90 0 Q 100 0 100 10 L 100 100$/);
    assert.equal(p.length, 200);
    assert.deepEqual(p.mid, { x: 100, y: 0 });
  });

  it('stores a hand-drawn route on the stream', () => {
    const edge = {
      id: 'e1',
      sourceNodeId: 'a',
      sourcePortId: 'out',
      targetNodeId: 'b',
      targetPortId: 'in',
      stream: { type: 'DISCRETE_CONTAINER_STREAM', targetPiecesPerMinute: 60, containerVolumeGallons: 1, containerType: 'CAN_1_GAL' },
      waypoints: [{ x: 10, y: 20 }]
    };
    assert.deepEqual(ProcessEdgeSchema.parse(edge).waypoints, [{ x: 10, y: 20 }]);
  });
});

describe('pipes between close neighbours', () => {
  it('leave a nozzle clear of their own unit only, not pushed through the next one', () => {
    // A pump whose discharge faces a heater 50 px away: the lead must not jump past the heater.
    const pumpBody: Rect = { x: 0, y: 0, width: 100, height: 100 };
    const heaterBody: Rect = { x: 150, y: 0, width: 120, height: 60 };
    const route = routePipe({ x: 100, y: 20, side: 'right' }, { x: 150, y: 30, side: 'left' }, [pumpBody, heaterBody], { fromOwn: [pumpBody], toOwn: [heaterBody] });
    assert.ok(route.every((p) => p.x >= 100 && p.x <= 150), JSON.stringify(route));
  });
});

describe('a unit right below a lead', () => {
  it('still blocks with its body: the pipe goes round it into a side nozzle', () => {
    // An evaporator's bottom lead ends 7 px above a pump whose suction faces left: the pipe must not run down through the pump.
    const pump: Rect = { x: 800, y: 420, width: 226, height: 194 };
    const route = routePipe({ x: 840.5, y: 391, side: 'bottom' }, { x: 843, y: 525, side: 'left' }, [pump], { toOwn: [pump] });
    const inner = route.slice(1, -1);
    assert.ok(!polylineHits(inner.slice(0, -1), [pump]), JSON.stringify(route));
    // It arrives moving right, into the suction.
    const last = route[route.length - 2]!;
    assert.ok(last.x < 800 && Math.abs(last.y - 525) < 1, JSON.stringify(route));
  });
});

describe('labelSpot', () => {
  it('stays in the middle when the middle is clear', () => {
    const p = labelSpot([{ x: 0, y: 0 }, { x: 200, y: 0 }], 40, 14, []);
    assert.deepEqual(p, { x: 100, y: 0 });
  });
  it('moves along the pipe off a unit that covers the middle', () => {
    const p = labelSpot([{ x: 0, y: 0 }, { x: 200, y: 0 }], 40, 14, [{ x: 80, y: -20, width: 40, height: 40 }]);
    assert.ok(p.x + 20 <= 80 || p.x - 20 >= 120, `clear of the unit: ${p.x}`);
    assert.equal(p.y, 0);
  });
  it('turns a corner when a whole run is covered', () => {
    const p = labelSpot([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }], 40, 14, [{ x: -10, y: -30, width: 200, height: 60 }]);
    assert.equal(p.x, 100);
    assert.ok(p.y - 7 >= 30, `below the cover: ${p.y}`);
  });
});
