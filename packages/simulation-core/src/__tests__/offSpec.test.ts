import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE, type ProcessGraph } from '@process-forge/protocol';
import { simulateProcess } from '../index.js';

/** The juice line with one more ERROR check on the evaporator: it holds at a 20 °C design feed and breaks at the 68 °C it gets live. */
function withEvaporatorCheck(expr: string): ProcessGraph {
  const g = structuredClone(JUICE_CONCENTRATION_LINE) as ProcessGraph;
  const heater = g.nodes.find((n) => /EV-201/.test(n.name))! as any;
  const contract = heater.config.contract;
  // Checked at design for a cold feed, so the run starts; live it gets 68 °C.
  contract.designInlet = { ...contract.designInlet, temperatureC: 20 };
  contract.constraints = [
    ...(contract.constraints ?? []),
    { id: 'feed-warm-enough', expr, severity: 'ERROR', message: 'Feed too cold for this test.', hint: 'n/a' }
  ];
  return g;
}

describe('product made while a check is broken is diverted, not counted', () => {
  it('a check that always holds diverts nothing', () => {
    const base = simulateProcess(JUICE_CONCENTRATION_LINE, 20);
    const r = simulateProcess(withEvaporatorCheck('inlet.temperatureC > -100'), 20);
    assert.equal(r.totalFluidOffSpecKg, 0);
    assert.equal(r.totalFluidDeliveredKg, base.totalFluidDeliveredKg);
  });

  it('a check broken all run sends every kg of product off spec', () => {
    const r = simulateProcess(withEvaporatorCheck('inlet.temperatureC < 60'), 20);
    const product = r.terminals.find((t) => t.role === 'product')!;
    assert.ok(product.kg > 0);
    assert.equal(product.offSpecKg, product.kg);
    assert.equal(r.totalFluidDeliveredKg, 0);
    assert.ok(Math.abs(r.totalFluidOffSpecKg - product.kg) < 0.2, `${r.totalFluidOffSpecKg} vs ${product.kg}`);
  });
});
