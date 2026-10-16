import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  CONTINUOUS_DRYER_CONTRACT,
  CRYSTALLISER_CONTRACT,
  DECANTER_CENTRIFUGE_CONTRACT,
  SOLIDS_FILTER_CONTRACT,
  DISTILLATION_COLUMN_CONTRACT,
  executeValidateUnitOp,
  type UnitOpContract
} from '../index.js';

const fixed = (c: UnitOpContract) => (executeValidateUnitOp({ contract: c }).gates.physicsAlignment as unknown as { warnings: string[] }).warnings.some((w) => /typed-in numbers/.test(w));

describe('A split that ignores the feed is called out', () => {
  it('flags a share that is a typed-in number', () => {
    assert.equal(fixed(DISTILLATION_COLUMN_CONTRACT), true);
    // The crystalliser as it used to be: decant a fixed fraction of the batch.
    const old = {
      ...CRYSTALLISER_CONTRACT,
      behavior: {
        ...CRYSTALLISER_CONTRACT.behavior,
        phases: (CRYSTALLISER_CONTRACT.behavior as { phases: Record<string, unknown>[] }).phases.map((p) => (p.name === 'Decant liquor' ? { ...p, gallons: '600', retain: undefined } : p))
      }
    } as UnitOpContract;
    assert.equal(fixed(old), true);
  });
  it('does not flag units whose split follows from the feed', () => {
    for (const c of [CRYSTALLISER_CONTRACT, DECANTER_CENTRIFUGE_CONTRACT, SOLIDS_FILTER_CONTRACT, CONTINUOUS_DRYER_CONTRACT]) assert.equal(fixed(c), false, c.name);
  });
});
