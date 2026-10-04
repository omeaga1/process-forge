import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { flowPeriodSeconds, liveLabel, mixHex, pipeColor } from '../components/edges/streamLook.js';

describe('How a stream looks', () => {
  const base = '#2dd5b7';
  const cold = '#7aa7ff';
  const hot = '#ff8f5a';

  it('keeps a pipe its own colour across the ambient band, and when the temperature is unknown', () => {
    for (const t of [15, 20, 35]) assert.equal(pipeColor(base, cold, hot, t), base);
    assert.equal(pipeColor(base, cold, hot, undefined), base);
  });

  it('shades toward blue as it gets colder and toward ember as it gets hotter, fully at 10 and 90 °C', () => {
    assert.equal(pipeColor(base, cold, hot, 10), cold);
    assert.equal(pipeColor(base, cold, hot, -5), cold);
    assert.equal(pipeColor(base, cold, hot, 90), hot);
    assert.equal(pipeColor(base, cold, hot, 150), hot);
    assert.equal(pipeColor(base, cold, hot, 62.5), mixHex(base, hot, 0.5));
  });

  it('mixes colours channel by channel', () => {
    assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
    assert.equal(mixHex('#102030', '#102030', 0.7), '#102030');
  });

  it('moves the bore faster the more flows, and not at all with no flow', () => {
    assert.equal(flowPeriodSeconds(0, 120), 0);
    assert.ok(flowPeriodSeconds(5, 120) > flowPeriodSeconds(60, 120));
    assert.equal(flowPeriodSeconds(500, 120), 0.35);
  });

  it('labels a running pipe with its live figures', () => {
    assert.equal(liveLabel(true, 42.54, 64.6), '42.5 gpm · 65 °C');
    assert.equal(liveLabel(true, 120), '120 gpm');
    assert.equal(liveLabel(false, 18), '18 /min');
  });
});
