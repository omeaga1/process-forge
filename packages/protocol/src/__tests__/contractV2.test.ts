import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { EVAPORATOR_CONTRACT, evaluateNumber, evaluateUnitOp, executeValidateUnitOp } from '../index.js';

describe('Expressions: if() and interp()', () => {
  it('if evaluates only the branch it takes', () => {
    assert.equal(evaluateNumber('if(flow > 0, duty / flow, 0)', { flow: 0, duty: 5 }), 0);
    assert.equal(evaluateNumber('if(flow > 0, duty / flow, 0)', { flow: 2, duty: 5 }), 2.5);
    assert.throws(() => evaluateNumber('if(flow, 1, 2)', { flow: 1 }), /must be a comparison/);
  });

  it('interp is piecewise linear and clamped', () => {
    const table = 'interp(x, 0, 0, 10, 100, 20, 150)';
    assert.equal(evaluateNumber(table, { x: 5 }), 50);
    assert.equal(evaluateNumber(table, { x: 15 }), 125);
    assert.equal(evaluateNumber(table, { x: -3 }), 0);
    assert.equal(evaluateNumber(table, { x: 99 }), 150);
    assert.throws(() => evaluateNumber('interp(x, 10, 1, 0, 2)', { x: 1 }), /ascending/);
  });
});

describe('Contracts that read their inlet', () => {
  it('the evaporator example is accepted and evaluates at its design inlet', () => {
    assert.equal(executeValidateUnitOp({ contract: EVAPORATOR_CONTRACT }).verdict, 'ACCEPTED');
    const e = evaluateUnitOp(EVAPORATOR_CONTRACT);
    assert.ok(e.physicallyValid);
    assert.ok(e.outlets.vapour!.share! > 0.2 && e.outlets.vapour!.share! < 0.35);
    assert.equal(e.outlets.concentrate!.share, undefined, 'the concentrate takes the rest');
  });

  it('live values override the design inlet, field by field', () => {
    const hot = evaluateUnitOp(EVAPORATOR_CONTRACT, { inlet: { temperatureC: 90 } });
    const cold = evaluateUnitOp(EVAPORATOR_CONTRACT);
    assert.ok(hot.outlets.vapour!.share! > cold.outlets.vapour!.share!);
    // Flow and cp still come from designInlet.
    assert.equal(hot.derived.sensibleKw! < cold.derived.sensibleKw!, true);
  });

  it('an outlet on a port that is not an outlet is refused', () => {
    const bad = { ...EVAPORATOR_CONTRACT, outlets: [{ port: 'feed', share: '0.5' }] };
    const r = executeValidateUnitOp({ contract: bad });
    assert.equal(r.verdict, 'REJECTED');
    assert.match(JSON.stringify(r.gates), /not an OUTLET port/);
  });
});
