import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closestNames, didYouMean, editDistance } from '../nearest.js';

describe('Did you mean', () => {
  it('counts edits, with a swap of two letters as one', () => {
    assert.equal(editDistance('kitten', 'sitting'), 3);
    assert.equal(editDistance('tempertaure', 'temperature'), 1);
    assert.equal(editDistance('Abc', 'abc'), 0);
  });

  it('finds typos, near misses and names with a word left out', () => {
    const names = ['outletTemperatureC', 'steamDutyKw', 'maxFeedGpm', 'designFlowRateGpm'];
    assert.deepEqual(closestNames('outletTempertureC', names), ['outletTemperatureC']);
    assert.deepEqual(closestNames('steamKw', names), ['steamDutyKw']);
    assert.deepEqual(closestNames('max_feed_gpm', names), ['maxFeedGpm']);
    assert.deepEqual(closestNames('flowRateGpm', names), ['designFlowRateGpm']);
    // Nothing close in spelling, but the same leading word: offered last, as a hint.
    assert.deepEqual(closestNames('outletTemp', ['outletC', 'ratedKw']), ['outletC']);
    assert.deepEqual(closestNames('targetTemp', ['targetC', 'ratedKw', 'ratedFlowGpm']), ['targetC']);
  });

  it('offers nothing when nothing is close, rather than a guess', () => {
    assert.deepEqual(closestNames('viscosity', ['steamDutyKw', 'maxFeedGpm']), []);
    assert.equal(didYouMean('viscosity', ['steamDutyKw']), '');
    assert.equal(didYouMean('stemDutyKw', ['steamDutyKw']), ' Did you mean steamDutyKw?');
  });
});
