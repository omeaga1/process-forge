import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE, SPRAY_DRYING_LINE } from '@process-forge/protocol';
import { compareScenarios, simulateLine } from '../line.js';

/**
 * Lines that make liquid or powder, not items. A run of one has no
 * "units per minute", and saying its bottleneck is "unknown-bottleneck"
 * leaves the model to guess. These say what sets the rate, in figures.
 */
describe('liquid lines: what sets the rate', () => {
  it('names the feed that sets the juice line\'s rate and the unit that would limit next', () => {
    const r = simulateLine(JUICE_CONCENTRATION_LINE, 60);
    assert.notEqual(r.identifiedBottleneckNodeId, 'unknown-bottleneck');
    assert.equal(r.lineLimit?.by, 'feed');
    assert.equal(r.lineLimit?.nodeId, 'juice-f-100', 'the juice feed, not the cooling water (it reaches no product)');
    const first = r.lineLimit!.headroom[0]!;
    assert.equal(first.unitId, 'juice-p-101');
    assert.ok(first.usedPercent > 70 && first.usedPercent < 90, `pump ${first.usedPercent}%`);
    assert.match(r.engineeringDiagnosis, /runs at what its feed supplies, "Apple Juice F-100" \(20 gal\/min\)/);
    assert.match(r.engineeringDiagnosis, /First to limit if it rises: "Juice Feed Pump P-101"/);
  });

  it('judges what-ifs on a liquid line by what it sends out, by mass', () => {
    const r = compareScenarios(JUICE_CONCENTRATION_LINE, {
      durationMinutes: 30,
      scenarios: [
        { name: 'More juice', changes: [{ unit: 'F-100', parameters: { supplyRate: 24 } }] },
        { name: 'Hotter preheat', changes: [{ unit: 'E-101', parameters: { targetC: 69 } }] }
      ]
    });
    assert.match(r.summary, /^Baseline: [\d.]+ kg\/h out, limited by the supply of Apple Juice F-100\./);
    const more = r.scenarios[0]!;
    assert.ok(more.liquidOutChangePercent! > 5, `more juice: ${more.liquidOutChangePercent}%`);
    assert.match(r.summary, /Best: More juice\./);
  });

  it('refuses a setting a unit does not have instead of reporting +0 %', () => {
    const r = compareScenarios(JUICE_CONCENTRATION_LINE, {
      durationMinutes: 10,
      scenarios: [{ name: 'Typo', changes: [{ unit: 'E-101', parameters: { outletTempertureC: 75 } }] }]
    });
    const s = r.scenarios[0]!;
    assert.equal(s.applied.length, 0);
    assert.match(s.warnings![0]!, /has no setting "outletTempertureC", so nothing was changed/);
  });

  it('says a powder line is limited by its feed, in kg/h', () => {
    const r = simulateLine(SPRAY_DRYING_LINE, 60);
    assert.ok(r.lineLimit, 'a limit is reported');
    assert.ok(['feed', 'none'].includes(r.lineLimit!.by));
    assert.ok(r.streams.every((t) => t.phase !== 'GAS' || t.gallons === 0), 'no gas in gallons');
  });
});
