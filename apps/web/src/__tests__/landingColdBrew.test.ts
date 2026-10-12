import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeDesignUnitOp, executeValidateUnitOp, validateProcessGraph } from '@process-forge/protocol';
import { buildColdBrewLine, COLD_BREW_CONTRACT, runColdBrew, withValues } from '../landing/coldBrew.js';

describe('Landing page: the cold-brew worked example', () => {
  it('is a design the engine accepts', () => {
    const v = executeValidateUnitOp({ contract: COLD_BREW_CONTRACT });
    assert.equal(v.verdict, 'ACCEPTED', v.revisionGuidance);
    assert.equal(v.gates.physical.warnings.length, 0, v.gates.physical.warnings.join('\n'));
  });

  it('starts from a brief that asks for the operating conditions', () => {
    const brief = executeDesignUnitOp({ description: 'scraped-surface freeze concentrator for cold-brew coffee' });
    assert.ok(brief.operatingConditions.ask.length >= 3);
    assert.match(brief.operatingConditions.instruction, /Do not fill them in from typical values/);
  });

  it('builds a valid line and closes its mass balance in the engine', () => {
    assert.equal(validateProcessGraph(buildColdBrewLine()).valid, true);
    const r = runColdBrew();
    assert.ok(r.feedKg > 800, `fed ${r.feedKg} kg`);
    assert.ok(Math.abs(r.feedKg - r.concentrateKg - r.meltKg) < 0.01 * r.feedKg, 'what goes in comes out');
    assert.ok(Math.abs(r.concentrateTdsPct - 30) < 0.5, `concentrate at ${r.concentrateTdsPct}% TDS`);
    assert.ok(r.concentrateC < 0 && r.meltC > 0);
    assert.ok(r.dutyKw > 70 && r.dutyKw < 100, `${r.dutyKw} kW`);
    assert.deepEqual(r.broken, []);
  });

  it('reports what breaks when an operating condition changes, and what fixes it', () => {
    // At 6 gal/min the 120 kW chiller Claude assumed is short, and the 0.6 m wash column carries too much ice.
    const r = runColdBrew(COLD_BREW_CONTRACT, 6);
    assert.ok(r.broken.includes('chillerKeepsUp') && r.broken.includes('columnIceLoad'), r.broken.join());
    assert.deepEqual(runColdBrew(withValues({ chillerCapacityKw: 150, columnDiameterM: 0.75 }), 6).broken, []);
  });
});
