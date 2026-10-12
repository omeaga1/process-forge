import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { executeDesignUnitOp, operatingConditionsFor, OPERATING_CONDITIONS_INSTRUCTION, PAINT_CANNING_LINE, phasePlanFor } from '../index.js';

describe('the design brief asks for operating conditions instead of assuming them', () => {
  it('asks for each inlet stream of the matched equipment, in its own units, and says not to use typical values', () => {
    const r = executeDesignUnitOp({ description: 'shell and tube heat exchanger' });
    const inlets = phasePlanFor('shell and tube heat exchanger').archetype!.ports.filter((p) => p.direction === 'INLET');
    assert.ok(inlets.length >= 2);
    for (const p of inlets) {
      const line = r.operatingConditions.ask.find((a) => a.includes(`(${p.id},`));
      assert.ok(line, `asks about ${p.id}`);
      assert.match(line!, /flow .*temperature and pressure/);
      assert.ok(line!.includes(p.flowUnits), `${p.id} in its flow units`);
    }
    assert.ok(r.operatingConditions.ask.some((a) => /Utilities/.test(a)));
    assert.ok(r.operatingConditions.ask.some((a) => /Operating pressure/.test(a)));
    assert.equal(r.operatingConditions.instruction, OPERATING_CONDITIONS_INSTRUCTION);
    assert.match(OPERATING_CONDITIONS_INSTRUCTION, /Do not fill them in from typical values/);
    assert.match(OPERATING_CONDITIONS_INSTRUCTION, /Assumed: confirm/);
    assert.match(r.brief, /Before you write anything, ask the engineer for the operating conditions/);
    assert.match(r.nextStep, /^Ask the engineer for the operating conditions/);
  });

  it('asks generically when no equipment matched', () => {
    const r = executeDesignUnitOp({ description: 'a thing that does something to a stream' });
    assert.match(r.operatingConditions.ask[0]!, /^Feed: .*flow rate, temperature and pressure/);
  });

  it('names what the flowsheet already gives, to confirm rather than ask', () => {
    const target = PAINT_CANNING_LINE.edges.find((e) => e.stream.type === 'CONTINUOUS_FLUID')!.targetNodeId;
    const r = executeDesignUnitOp({ description: 'a heater', graph: PAINT_CANNING_LINE, targetNodeId: target });
    const inlet = r.processContext.suggestedDesignInlet;
    assert.ok(inlet, 'the paint line feeds this unit a liquid');
    assert.deepEqual(r.operatingConditions, operatingConditionsFor(r.phasePlan, inlet));
    if (inlet!.volumetricFlowGpm !== undefined) assert.ok(r.operatingConditions.fromFlowsheet.includes(`Feed flow ${inlet!.volumetricFlowGpm} gal/min`));
    assert.ok(r.operatingConditions.fromFlowsheet.length > 0);
    assert.match(r.brief, /The flowsheet already gives: .*Confirm these rather than ask/);
  });
});

describe('the phase plan does not mistake one concentrator for another', () => {
  it('reads a freeze concentrator as no evaporator, and still finds the evaporator', () => {
    assert.notEqual(phasePlanFor('scraped-surface freeze concentrator for cold-brew coffee').archetype?.id, 'evaporator');
    assert.equal(phasePlanFor('falling-film evaporator to concentrate juice').archetype?.id, 'evaporator');
    assert.ok(!executeDesignUnitOp({ description: 'freeze concentrator for cold brew' }).operatingConditions.ask.some((a) => /Vapour/.test(a)), 'no vapour outlet to ask about');
  });
});
