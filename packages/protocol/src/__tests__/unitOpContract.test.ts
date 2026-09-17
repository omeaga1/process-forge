import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  evaluateExpression,
  evaluateNumber,
  referencedNames,
  ExpressionError,
  UnitOpContractSchema,
  validateUnitOpContract,
  evaluateUnitOp,
  blockingViolations,
  explainRejection,
  type UnitOpContract
} from '../index.js';
import { WAX_COOLING_BELT_CONTRACT } from '../unitop/examples/waxCoolingBelt.js';

describe('Unit-op expression language', () => {
  it('evaluates arithmetic with correct precedence and associativity', () => {
    assert.equal(evaluateNumber('2 + 3 * 4', {}), 14);
    assert.equal(evaluateNumber('(2 + 3) * 4', {}), 20);
    assert.equal(evaluateNumber('10 - 3 - 2', {}), 5);
    assert.equal(evaluateNumber('2 ^ 3 ^ 2', {}), 512); // right associative
    assert.equal(evaluateNumber('-3 + 5', {}), 2);
  });

  it('resolves dotted references into the supplied scope', () => {
    const scope = { beltLengthM: 12, inlet: { temperatureC: 95 } };
    assert.equal(evaluateNumber('beltLengthM * 2', scope), 24);
    assert.equal(evaluateNumber('inlet.temperatureC - 55', scope), 40);
  });

  it('short-circuits && so a guard can protect a division', () => {
    assert.equal(evaluateExpression('rate > 0 && 100 / rate < 50', { rate: 0 }), false);
  });

  it('rejects unknown references rather than silently yielding NaN', () => {
    assert.throws(() => evaluateNumber('notDeclared * 2', {}), ExpressionError);
  });

  it('rejects unknown functions and names the available ones', () => {
    assert.throws(() => evaluateNumber('fetch(1)', {}), /Unknown function "fetch"/);
  });

  it('rejects division by zero instead of returning Infinity', () => {
    assert.throws(() => evaluateNumber('5 / 0', {}), /Division by zero/);
  });

  it('reports every name an expression reads, for static validation', () => {
    const names = referencedNames('a * max(b, inlet.temperatureC) + PI').sort();
    assert.deepEqual(names, ['a', 'b', 'inlet.temperatureC']);
  });

  it('has no escape hatch into the host environment', () => {
    // These are the shapes that would matter if the evaluator were eval().
    for (const hostile of [
      'constructor',
      'globalThis',
      'process.exit',
      'this.constructor',
      '__proto__'
    ]) {
      assert.throws(
        () => evaluateNumber(hostile, {}),
        ExpressionError,
        `"${hostile}" should not resolve`
      );
    }
  });

  it('is deterministic: the same expression and scope always agree', () => {
    const scope = { a: 3.7, b: 1.9 };
    const first = evaluateNumber('a * b / (a + b)', scope);
    for (let i = 0; i < 100; i++) {
      assert.equal(evaluateNumber('a * b / (a + b)', scope), first);
    }
  });
});

describe('Unit-op contract validation', () => {
  it('accepts the reference wax belt contract', () => {
    const parsed = UnitOpContractSchema.safeParse(WAX_COOLING_BELT_CONTRACT);
    assert.ok(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2));

    const issues = validateUnitOpContract(WAX_COOLING_BELT_CONTRACT);
    assert.deepEqual(issues, [], `Expected no issues, got:\n${JSON.stringify(issues, null, 2)}`);
  });

  it('catches an expression referencing something never declared', () => {
    const bad: UnitOpContract = {
      ...WAX_COOLING_BELT_CONTRACT,
      derived: [
        ...WAX_COOLING_BELT_CONTRACT.derived,
        { name: 'nonsense', label: 'Nonsense', unit: '-', expr: 'undeclaredThing * 2' }
      ]
    };
    const issues = validateUnitOpContract(bad);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /undeclaredThing/);
  });

  it('catches a forward reference between derived values', () => {
    const bad: UnitOpContract = {
      ...WAX_COOLING_BELT_CONTRACT,
      derived: [
        ...WAX_COOLING_BELT_CONTRACT.derived,
        { name: 'first', label: 'First', unit: '-', expr: 'second + 1' },
        { name: 'second', label: 'Second', unit: '-', expr: '2' }
      ]
    };
    const issues = validateUnitOpContract(bad);
    assert.ok(
      issues.some((i) => /references "second"/.test(i.message)),
      'Declaration-order resolution should make forward references an error'
    );
  });

  it('catches a parameter whose value sits outside its own physical bounds', () => {
    const bad: UnitOpContract = {
      ...WAX_COOLING_BELT_CONTRACT,
      parameters: WAX_COOLING_BELT_CONTRACT.parameters.map((p) =>
        p.name === 'beltSpeedMPerMin' ? { ...p, value: 500 } : p
      )
    };
    const issues = validateUnitOpContract(bad);
    assert.ok(issues.some((i) => /above the declared maximum/.test(i.message)));
  });

  it('catches a syntactically broken expression at authoring time', () => {
    const bad: UnitOpContract = {
      ...WAX_COOLING_BELT_CONTRACT,
      constraints: [
        { id: 'broken', expr: 'beltLengthM >', severity: 'ERROR', message: 'x' }
      ]
    };
    const issues = validateUnitOpContract(bad);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.path, /constraints.broken/);
  });
});

describe('Wax cooling belt: the engineering answer', () => {
  it('computes the cooling duty the engineer came for', () => {
    const r = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT);
    assert.equal(r.error, undefined, r.error ? JSON.stringify(r.error) : '');

    // Hand check, 0.55 kg/s wax:
    //   sensible liquid: 0.55 * 2.3 * (95 - 58) =  46.805 kW
    //   latent:          0.55 * 190            = 104.5   kW
    //   sensible solid:  0.55 * 2.1 * (58 - 40) =  20.79  kW
    //   total                                   = 172.095 kW
    assert.ok(Math.abs(r.derived.sensibleLiquidKw! - 46.805) < 1e-6);
    assert.ok(Math.abs(r.derived.latentKw! - 104.5) < 1e-6);
    assert.ok(Math.abs(r.derived.sensibleSolidKw! - 20.79) < 1e-6);
    assert.ok(
      Math.abs(r.derived.totalDutyKw! - 172.095) < 1e-6,
      `Expected 172.095 kW, got ${r.derived.totalDutyKw}`
    );

    // Latent heat dominates, which is the physically interesting part: this is
    // a solidification duty, not a sensible-cooling duty.
    assert.ok(r.derived.latentKw! > r.derived.sensibleLiquidKw! + r.derived.sensibleSolidKw!);
  });

  it('relates belt speed to residence time, which is the knob being turned', () => {
    const slow = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT, {
      parameterOverrides: { beltSpeedMPerMin: 6 }
    });
    const fast = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT, {
      parameterOverrides: { beltSpeedMPerMin: 12 }
    });

    assert.equal(slow.derived.residenceTimeS, 160); // 16 m at 0.1 m/s
    assert.equal(fast.derived.residenceTimeS, 80);
    // Duty is set by mass flow and enthalpy change, not by belt speed.
    assert.equal(slow.derived.totalDutyKw, fast.derived.totalDutyKw);
    // But a faster belt lays down a thinner layer.
    assert.ok(fast.derived.waxLayerThicknessMm! < slow.derived.waxLayerThicknessMm!);
  });

  it('accepts the baseline design as physically valid', () => {
    const r = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT);
    assert.equal(
      r.physicallyValid,
      true,
      `Baseline should be valid:\n${explainRejection(r)}`
    );
    assert.equal(blockingViolations(r).length, 0);
  });

  it('REJECTS a belt run too fast to remove the heat', () => {
    // The engineer asks "can I run this at 45 m/min?" The engine answers, and
    // the answer is a computed constraint failure rather than a model opinion.
    const r = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT, {
      parameterOverrides: { beltSpeedMPerMin: 45, beltLengthM: 3 }
    });

    assert.equal(r.physicallyValid, false, 'A 3 m belt at 45 m/min should not be accepted');
    const blocking = blockingViolations(r);
    assert.ok(blocking.length > 0);
    assert.ok(
      blocking.some((c) => c.id === 'belt-has-capacity'),
      `Expected the capacity check to fail. Got: ${blocking.map((c) => c.id).join(', ')}`
    );
    // The rejection has to be actionable, because it becomes the next turn's
    // context for the sub-agent that proposed the design.
    assert.match(explainRejection(r), /Slow the belt/);
  });

  it('REJECTS a discharge temperature above the congealing point', () => {
    const r = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT, {
      parameterOverrides: { waxOutletTempC: 70 }
    });
    assert.equal(r.physicallyValid, false);
    assert.ok(blockingViolations(r).some((c) => c.id === 'discharge-below-melting-point'));
  });

  it('warns without blocking when cooling water rise is excessive', () => {
    const r = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT, {
      parameterOverrides: { coolingWaterFlowKgPerS: 3.2 }
    });
    const rise = r.constraints.find((c) => c.id === 'cooling-water-rise-acceptable');
    assert.ok(rise);
    assert.equal(rise.satisfied, false);
    assert.equal(rise.severity, 'WARNING');
    // A warning must not block: it is engineering judgement, not impossibility.
    assert.equal(blockingViolations(r).length, 0);
    assert.equal(r.physicallyValid, true);
  });

  it('reports duty and residence time through the behavior contract', () => {
    const r = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT);
    assert.equal(r.behavior.mode, 'CONTINUOUS_RATE');
    if (r.behavior.mode === 'CONTINUOUS_RATE') {
      assert.ok(Math.abs(r.behavior.throughputPerMinute - 33) < 1e-6); // 0.55 kg/s * 60
      assert.ok(Math.abs((r.behavior.dutyKw ?? 0) - 172.095) < 1e-6);
      assert.equal(r.behavior.residenceTimeSeconds, 160);
    }
  });

  it('is deterministic across repeated evaluations', () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      outcomes.add(JSON.stringify(evaluateUnitOp(WAX_COOLING_BELT_CONTRACT)));
    }
    assert.equal(outcomes.size, 1, 'Contract evaluation must be reproducible');
  });
});
