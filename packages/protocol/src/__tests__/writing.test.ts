import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { writingWarnings, WRITING_RULES, EVAPORATOR_CONTRACT, type UnitOpContract } from '../index.js';

describe('writing rules', () => {
  it('warns on a wall-of-text description and long field help', () => {
    const c = {
      ...EVAPORATOR_CONTRACT,
      description: 'A. '.repeat(10) + 'x'.repeat(300),
      parameters: [{ ...EVAPORATOR_CONTRACT.parameters[0], description: 'y'.repeat(140) }]
    } as UnitOpContract;
    const paths = writingWarnings(c).map((w) => w.path);
    assert.ok(paths.includes('description'));
    assert.ok(paths.includes('parameters[0].description'));
  });
  it('passes a short one', () => {
    const c = { ...EVAPORATOR_CONTRACT, description: 'Falling-film evaporator that concentrates juice with steam.', parameters: [], derived: [] } as unknown as UnitOpContract;
    assert.deepEqual(writingWarnings(c), []);
  });
  it('states the limits to the model', () => assert.match(WRITING_RULES, /240 chars/));
});
