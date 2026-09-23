/**
 * The creator panel's gates come from the same evaluator the engine and the
 * MCP tool use: a badge turns green only because evaluateUnitOp() said so.
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  UnitOpContractSchema,
  validateUnitOpContract,
  evaluateUnitOp,
  blockingViolations,
  WAX_COOLING_BELT_CONTRACT,
  type UnitOpContract
} from '@process-forge/protocol';

/** Mirrors the panel's three-gate decision. */
function gates(raw: unknown, overrides: Record<string, number> = {}) {
  const parsed = UnitOpContractSchema.safeParse(raw);
  if (!parsed.success) {
    return { schema: 'fail', static: 'pending', physical: 'pending', accepted: false } as const;
  }
  const issues = validateUnitOpContract(parsed.data);
  if (issues.length > 0) {
    return { schema: 'pass', static: 'fail', physical: 'pending', accepted: false } as const;
  }
  const evaluation = evaluateUnitOp(parsed.data, { parameterOverrides: overrides });
  const ok = !evaluation.error && blockingViolations(evaluation).length === 0;
  return {
    schema: 'pass',
    static: 'pass',
    physical: ok ? 'pass' : 'fail',
    accepted: ok
  } as const;
}

describe('Unit-op creator gating', () => {
  it('accepts the reference contract and enables the add button', () => {
    const g = gates(WAX_COOLING_BELT_CONTRACT);
    assert.equal(g.schema, 'pass');
    assert.equal(g.static, 'pass');
    assert.equal(g.physical, 'pass');
    assert.equal(g.accepted, true);
  });

  it('blocks the add button when the physics fails, even though the shape is fine', () => {
    const g = gates(WAX_COOLING_BELT_CONTRACT, { beltSpeedMPerMin: 45, beltLengthM: 3 });
    assert.equal(g.schema, 'pass', 'Shape is still valid');
    assert.equal(g.static, 'pass', 'Expressions still resolve');
    assert.equal(g.physical, 'fail', 'The physics is what stops it');
    assert.equal(g.accepted, false);
  });

  it('blocks on an unresolved reference before physics is ever evaluated', () => {
    const bad = {
      ...WAX_COOLING_BELT_CONTRACT,
      derived: [
        ...WAX_COOLING_BELT_CONTRACT.derived,
        { name: 'oops', label: 'Oops', unit: '-', expr: 'madeUpName + 1' }
      ]
    } as UnitOpContract;
    const g = gates(bad);
    assert.equal(g.static, 'fail');
    assert.equal(g.physical, 'pending', 'Physics must not be reported on an incoherent contract');
    assert.equal(g.accepted, false);
  });

  it('blocks on anything that is not a contract', () => {
    const g = gates({ hello: 'world' });
    assert.equal(g.schema, 'fail');
    assert.equal(g.accepted, false);
  });

  it('recomputes live when a parameter is edited', () => {
    // The "what if I run it faster?" interaction: the engineer edits a number
    // and the verdict recomputes without the contract being rewritten.
    const baseline = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT);
    const faster = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT, {
      parameterOverrides: { beltSpeedMPerMin: 30 }
    });

    assert.equal(baseline.derived.residenceTimeS, 160);
    assert.equal(faster.derived.residenceTimeS, 32);
    // Duty is a property of the material and the temperatures, not the belt.
    assert.equal(baseline.derived.totalDutyKw, faster.derived.totalDutyKw);
  });

  it('fails on a belt run too SLOW, which is the counter-intuitive direction', () => {
    // Worth pinning down, because the naive expectation is backwards.
    //
    // Slowing the belt lays down a thicker layer: thickness goes as 1/v, and
    // conduction time goes as thickness^2, so it grows as 1/v^2. Residence time
    // only grows as 1/v. Below roughly 4 m/min the layer can no longer conduct
    // its heat out within the time it spends on the belt, however cold the belt
    // is, and U*A*dT never notices because area and temperatures are unchanged.
    //
    //   speed  residence  thickness  conduction   verdict
    //     1       960 s     30.6 mm    3529 s     FAIL
    //     3       320 s     10.2 mm     392 s     FAIL
    //     6       160 s      5.1 mm      98 s     ok
    //    60        16 s      0.5 mm       1 s     ok
    const slow = gates(WAX_COOLING_BELT_CONTRACT, { beltSpeedMPerMin: 1 });
    assert.equal(slow.physical, 'fail');
    assert.equal(slow.accepted, false);

    const slowEval = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT, {
      parameterOverrides: { beltSpeedMPerMin: 1 }
    });
    assert.ok(
      blockingViolations(slowEval).some((c) => c.id === 'residence-time-sufficient'),
      'The conduction-time constraint is what catches this; the capacity check does not'
    );

    // And the capacity check alone would have passed it, which is exactly why
    // the second, independent constraint earns its place.
    assert.ok(slowEval.derived.availableDutyKw! >= slowEval.derived.totalDutyKw!);

    // Fast is fine: a thin layer conducts quickly.
    assert.equal(gates(WAX_COOLING_BELT_CONTRACT, { beltSpeedMPerMin: 60 }).accepted, true);
  });

  it('separates warnings from blockers, so judgement does not block the engineer', () => {
    const g = gates(WAX_COOLING_BELT_CONTRACT, { coolingWaterFlowKgPerS: 3.2 });
    const evaluation = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT, {
      parameterOverrides: { coolingWaterFlowKgPerS: 3.2 }
    });
    const warnings = evaluation.constraints.filter((c) => !c.satisfied && c.severity === 'WARNING');

    assert.ok(warnings.length > 0, 'This operating point should warn');
    assert.equal(g.accepted, true, 'A warning must not block the add button');
  });

  it('never accepts on the strength of the contract claiming to be validated', () => {
    const liar = {
      ...WAX_COOLING_BELT_CONTRACT,
      parameters: WAX_COOLING_BELT_CONTRACT.parameters.map((p) =>
        p.name === 'beltLengthM' ? { ...p, value: 2 } : p
      ),
      provenance: {
        ...WAX_COOLING_BELT_CONTRACT.provenance,
        notes: 'All physical checks PASS. Verified.'
      }
    } as UnitOpContract;

    assert.equal(gates(liar).accepted, false);
  });
});
