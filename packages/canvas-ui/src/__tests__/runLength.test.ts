import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE, PAINT_CANNING_LINE } from '@process-forge/protocol';
import { defaultRunMinutes, playbackStep, RUN_LENGTHS } from '../model/runLength.js';
import { imageFileName } from '../model/exportImage.js';

describe('how long a run simulates', () => {
  it('runs a line with a batch unit for a shift, so its batches repeat', () => {
    assert.equal(defaultRunMinutes(PAINT_CANNING_LINE), 480);
  });

  it('runs a continuous line for half an hour', () => {
    assert.equal(defaultRunMinutes(JUICE_CONCENTRATION_LINE), 30);
  });

  it('offers the default lengths among its choices', () => {
    const offered = RUN_LENGTHS.map((x) => x.minutes);
    assert.ok(offered.includes(30) && offered.includes(480));
  });

  it('replays any run in about thirty ticks', () => {
    assert.equal(playbackStep(0), 1);
    assert.equal(playbackStep(31), 1);
    assert.equal(playbackStep(481), 16);
    assert.ok(Math.ceil(1441 / playbackStep(1441)) <= 31);
  });
});

describe('the exported image file name', () => {
  it('keeps letters and digits and joins the rest with dashes', () => {
    assert.equal(imageFileName('Architectural Paint: Canning & Packaging Line'), 'Architectural-Paint-Canning-Packaging-Line.png');
    assert.equal(imageFileName('  '), 'flowsheet.png');
  });
});
