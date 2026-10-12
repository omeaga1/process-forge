import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  createTerminalNode,
  defaultTerminalNozzle,
  snapTerminalNozzle,
  terminalNozzle,
  withTerminalNozzle
} from '../terminals.js';
import { ProcessNodeSchema } from '../nodes.js';

describe('a feed or outlet arrow’s nozzle', () => {
  it('sits at a feed’s tip and an outlet’s tail until it is moved', () => {
    const feed = createTerminalNode('feed', { id: 'f1' });
    const product = createTerminalNode('product', { id: 'p1' });
    assert.deepEqual(terminalNozzle(feed), { x: 100, y: 50, side: 'right' });
    assert.deepEqual(terminalNozzle(product), defaultTerminalNozzle('product'));
  });

  it('moves, carrying the port id so the pipe on it stays attached, and goes back', () => {
    const feed = createTerminalNode('feed', { id: 'f1' });
    const dressing = withTerminalNozzle(feed, { x: 40, y: 100, side: 'bottom' });
    assert.equal(dressing.nozzles.length, 1);
    assert.equal(dressing.nozzles[0]!.portId, feed.outputs[0]!.id);
    assert.equal(dressing.nozzles[0]!.role, 'outlet');
    const moved = ProcessNodeSchema.parse({ ...feed, dressing });
    assert.deepEqual(terminalNozzle(moved), { x: 40, y: 100, side: 'bottom' });
    assert.deepEqual(terminalNozzle({ ...moved, dressing: withTerminalNozzle(moved, undefined) }), { x: 100, y: 50, side: 'right' });
  });

  it('snaps onto the arrow’s outline', () => {
    // Near the tip: the tip itself.
    assert.deepEqual(snapTerminalNozzle('feed', 97, 55, 200), { x: 100, y: 50, side: 'right' });
    // Above the middle: the top edge.
    assert.deepEqual(snapTerminalNozzle('feed', 50, 10, 200), { x: 50, y: 0, side: 'top' });
    // Along the top, but past where the tip starts: held where the edge ends (200 px wide, 18 px tip).
    assert.deepEqual(snapTerminalNozzle('feed', 94, -5, 200), { x: 91, y: 0, side: 'top' });
    // A feed's square tail.
    assert.deepEqual(snapTerminalNozzle('feed', 1, 30, 200), { x: 0, y: 30, side: 'left' });
    // An outlet's notched tail: in the notch at the middle (14 px of 200).
    assert.deepEqual(snapTerminalNozzle('product', 2, 50, 200), { x: 7, y: 50, side: 'left' });
  });
});
