import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { WAX_COOLING_BELT_CONTRACT } from '../unitop/examples/waxCoolingBelt.js';
import { CASE_PACKER_CONTRACT } from '../unitop/examples/casePacker.js';
import { validateUnitOpContract, UnitOpContractSchema, type UnitOpContract } from '../unitop/contract.js';
import { evaluateUnitOp } from '../unitop/evaluate.js';
import { comparisonSides } from '../unitop/expression.js';
import { humaniseId, resolvePanel } from '../unitop/panel.js';

describe('check sides', () => {
  it('works out both sides of a single comparison, and nothing else', () => {
    assert.deepEqual(comparisonSides('a * 2 <= b', { a: 3, b: 10 }), { op: '<=', value: 6, limit: 10 });
    assert.equal(comparisonSides('a > 0 && b > 0', { a: 1, b: 1 }), undefined);
    assert.equal(comparisonSides('a == 1', { a: 1 }), undefined);
  });

  it('come back with each evaluated constraint', () => {
    const ev = evaluateUnitOp(WAX_COOLING_BELT_CONTRACT);
    const c = ev.constraints.find((x) => x.id === 'residence-time-sufficient')!;
    assert.equal(c.sides?.op, '>=');
    assert.equal(c.sides?.value, ev.derived.residenceTimeS);
    assert.equal(c.sides?.limit, ev.derived.conductionTimeS);
  });
});

describe('the unit panel', () => {
  it('fills in a declared panel in order, from the engine', () => {
    assert.deepEqual(validateUnitOpContract(WAX_COOLING_BELT_CONTRACT), []);
    const { declared, widgets } = resolvePanel(WAX_COOLING_BELT_CONTRACT);
    assert.equal(declared, true);
    assert.deepEqual(widgets.map((w) => w.kind), ['figure', 'figure', 'figure', 'gauge', 'gauge', 'gauge', 'trend', 'note']);
    const duty = widgets[0]!;
    assert.ok(duty.kind === 'figure' && duty.label === 'Heat removed' && duty.unit === 'kW' && duty.value > 100);
    const freeze = widgets[3]!;
    assert.ok(freeze.kind === 'gauge');
    assert.equal(freeze.keep, 'above');
    assert.equal(freeze.unit, 's');
    assert.equal(freeze.status, 'ok');
    assert.ok(freeze.limit! < freeze.value && freeze.value < freeze.max);
    const t = widgets[6]!;
    assert.ok(t.kind === 'trend' && t.points.length > 10 && t.over.name === 'beltSpeedMPerMin');
    // A thinner layer at a faster belt freezes sooner.
    assert.ok(t.points[0]!.y > t.points[t.points.length - 1]!.y);
  });

  it('shows a failing check as failing, with its message', () => {
    const slow: UnitOpContract = {
      ...WAX_COOLING_BELT_CONTRACT,
      parameters: WAX_COOLING_BELT_CONTRACT.parameters.map((p) => (p.name === 'beltSpeedMPerMin' ? { ...p, value: 3 } : p))
    };
    const freeze = resolvePanel(slow).widgets.find((w) => w.kind === 'gauge' && w.check === 'residence-time-sufficient');
    assert.ok(freeze && freeze.kind === 'gauge' && freeze.status === 'error' && /molten/.test(freeze.message ?? ''));
    assert.match(freeze.caption, /^needs /);
  });

  it('builds gauges from the checks when the contract declares none', () => {
    const { panel: _, ...bare } = WAX_COOLING_BELT_CONTRACT;
    const { declared, widgets } = resolvePanel(bare as UnitOpContract);
    assert.equal(declared, false);
    const gauges = widgets.filter((w) => w.kind === 'gauge');
    // Two checks compare a parameter with a parameter, and the rest have limits too: every one is a comparison.
    assert.equal(gauges.length, 6);
    assert.ok(widgets.some((w) => w.kind === 'trend'));
    assert.ok(resolvePanel(CASE_PACKER_CONTRACT).widgets.length >= 0);
  });

  it('rejects a panel that names what the contract does not declare', () => {
    const bad = UnitOpContractSchema.parse({
      ...WAX_COOLING_BELT_CONTRACT,
      panel: [
        { kind: 'figure', result: 'nope' },
        { kind: 'trend', result: 'residenceTimeS', over: 'totalDutyKw' },
        { kind: 'gauge', check: 'missing' },
        { kind: 'gauge', result: 'residenceTimeS' },
        { kind: 'figure', result: 'engine.unitsPerMinute' }
      ]
    });
    const issues = validateUnitOpContract(bad).filter((i) => i.path.startsWith('panel.'));
    assert.deepEqual(issues.map((i) => i.path), ['panel.0', 'panel.1', 'panel.2', 'panel.3', 'panel.4']);
  });

  it('names checks the way people read them', () => {
    assert.equal(humaniseId('belt-has-capacity'), 'Belt has capacity');
    assert.equal(humaniseId('npshMarginOk'), 'Npsh margin ok');
  });
});
