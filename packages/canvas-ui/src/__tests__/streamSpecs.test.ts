import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE, applyFlowsheetEdit } from '@process-forge/protocol';
import { solveSteadyState } from '@process-forge/simulation-core';
import { specifiedFigures } from '../model/streamSpecs.js';

/**
 * A stream report tells the engineer's inputs from the solver's results: only
 * a stream leaving a feed carries inputs.
 */
describe("which of a stream's figures the engineer set", () => {
  const steady = solveSteadyState(JUICE_CONCENTRATION_LINE);
  const feedStream = steady.streams.find((s) => s.from === 'Apple Juice F-100')!;

  it("marks a feed's supply, temperature and mix as set, and the kg/h worked out from them as calculated", () => {
    const set = specifiedFigures(JUICE_CONCENTRATION_LINE, feedStream.id, feedStream);
    assert.deepEqual([...set].sort(), ['gpm', 'mix', 'temperatureC']);
  });

  it('marks nothing downstream of a feed', () => {
    const next = steady.streams.find((s) => s.from === 'Juice Feed Pump P-101')!;
    assert.equal(specifiedFigures(JUICE_CONCENTRATION_LINE, next.id, next).size, 0);
  });

  it('calls a feed flow calculated when the line takes less than the feed supplies', () => {
    assert.equal(specifiedFigures(JUICE_CONCENTRATION_LINE, feedStream.id, { ...feedStream, gpm: 15 }).has('gpm'), false);
  });

  it('follows the feed: a supply stated in kg/h marks the mass flow instead', () => {
    const feed = JUICE_CONCENTRATION_LINE.nodes.find((n) => n.name === 'Apple Juice F-100')!;
    const edit = applyFlowsheetEdit(JUICE_CONCENTRATION_LINE, { op: 'update-unit', unit: feed.id, parameters: { supplyKgPerHour: 3000 } });
    assert.ok(edit.ok, JSON.stringify(edit));
    const s = solveSteadyState(edit.graph).streams.find((x) => x.id === feedStream.id)!;
    assert.ok(specifiedFigures(edit.graph, s.id, s).has('kgPerHour'), JSON.stringify(s));
  });
});
