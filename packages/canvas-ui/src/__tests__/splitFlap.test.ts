import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { flapCells } from '../components/dock/SplitFlap.js';

describe('Split-flap readout', () => {
  it('right-aligns numbers and left-aligns words in a fixed number of cells', () => {
    assert.deepEqual(flapCells('42', 4), [' ', ' ', '4', '2']);
    assert.deepEqual(flapCells('B-101', 6, 'left'), ['B', '-', '1', '0', '1', ' ']);
  });

  it('clips a value longer than the board', () => {
    assert.deepEqual(flapCells('REACTORS', 4, 'left'), ['R', 'E', 'A', 'C']);
  });
});
