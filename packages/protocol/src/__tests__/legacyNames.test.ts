import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BEVERAGE_BOTTLING_LINE, standardContract, validateProcessGraph } from '../index.js';

/** The bottling example saved its settings under older names; a line built from it runs at what they say. */
const settingOf = (id: string, name: string) => {
  const node = BEVERAGE_BOTTLING_LINE.nodes.find((n) => n.id === id)!;
  return standardContract(node)!.parameters.find((p) => p.name === name)!.value;
};

describe('settings under their older names', () => {
  it('a labeler at 280/min runs at 280/min, not the 40/min default', () => {
    assert.equal(settingOf('labeler-400', 'maxSpeedUnitsPerMinute'), 280);
  });

  it('a 48-head filler rated 300/min fills 48 every 9.6 s', () => {
    assert.equal(settingOf('filler-capper-200', 'nozzleCount'), 48);
    assert.equal(settingOf('filler-capper-200', 'fillTimePerCycleSeconds') + settingOf('filler-capper-200', 'indexTimePerCycleSeconds'), 9.6);
    assert.equal(settingOf('filler-capper-200', 'rejectRatePercentage'), 0.2);
  });

  it('an accumulation table at 35 m/min holding 180', () => {
    assert.ok(Math.abs(settingOf('accumulation-300', 'speedMetersPerSecond') - 35 / 60) < 1e-9);
    assert.equal(settingOf('accumulation-300', 'maxItemCapacity'), 180);
  });

  it('the static capacities agree', () => {
    const b = validateProcessGraph(BEVERAGE_BOTTLING_LINE).bottlenecks;
    assert.notEqual(b.bottleneckNodeId, 'labeler-400', 'the labeler is no longer read as 40/min');
    assert.ok(b.maximumSystemThroughputUnitsPerMin > 40);
  });
});
