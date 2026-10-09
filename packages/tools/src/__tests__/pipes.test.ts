import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE } from '@process-forge/protocol';
import { simulateLine } from '../line.js';

describe('simulate_process_line reports every pipe, as a stream report', () => {
  it('the juice line: the heated feed into the evaporator, and the concentrate out', () => {
    const r = simulateLine(JUICE_CONCENTRATION_LINE, 10);
    assert.equal(r.pipes.length, JUICE_CONCENTRATION_LINE.edges.length);
    const feed = r.pipes.find((p) => /E-101/.test(p.from.unit) && /EV-201/.test(p.to.unit))!;
    assert.equal(feed.temperatureC, 68);
    assert.ok(feed.kgPerHour! > 4000);
    assert.equal(feed.phase, 'LIQUID');
    const concentrate = r.pipes.find((p) => /EV-201/.test(p.from.unit) && p.phase === 'LIQUID')!;
    assert.ok(Math.abs(concentrate.composition!.sugar! - 0.415) < 0.005, JSON.stringify(concentrate));
  });
});
