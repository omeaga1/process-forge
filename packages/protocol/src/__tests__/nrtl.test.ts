import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NRTL_PAIRS,
  PROCESS_HEATER_CONTRACT,
  bubblePoint,
  componentGamma,
  evaluateExpression,
  executeValidateUnitOp,
  findComponent,
  nrtlPair,
  validateUnitOpContract,
  type UnitOpContract
} from '../index.js';

/** Mass fractions for a binary given the first component's mole fraction. */
const byMole = (a: string, xa: number, b: string) => ({ [a]: xa * findComponent(a)!.molarMass, [b]: (1 - xa) * findComponent(b)!.molarMass });

/**
 * Ethanol–water at 101.325 kPa, mole fraction ethanol in the liquid, bubble
 * point °C and vapour mole fraction: Perry's Chemical Engineers' Handbook
 * (Carey & Lewis, 1932).
 */
const ETHANOL_WATER: [number, number, number][] = [
  [0.019, 95.5, 0.17],
  [0.0721, 89.0, 0.3891],
  [0.0966, 86.7, 0.4375],
  [0.1661, 84.1, 0.5089],
  [0.2337, 82.7, 0.5445],
  [0.3273, 81.5, 0.5826],
  [0.3965, 80.7, 0.6122],
  [0.5079, 79.8, 0.6564],
  [0.5732, 79.3, 0.6841],
  [0.6763, 78.74, 0.7385],
  [0.7472, 78.41, 0.7815],
  [0.8943, 78.15, 0.8943]
];

describe('NRTL activity coefficients', () => {
  it('boils ethanol–water where it is measured to, within 1 °C, with the vapour within 0.03', () => {
    for (const [x, t, y] of ETHANOL_WATER) {
      const b = bubblePoint(byMole('ethanol', x, 'water'), 101.325);
      assert.equal(b.model, 'NRTL');
      assert.ok(Math.abs(b.temperatureC - t) <= 1, `x ${x}: ${b.temperatureC.toFixed(2)} °C vs ${t}`);
      assert.ok(Math.abs(b.vapour.ethanol! - y) <= 0.03, `x ${x}: y ${b.vapour.ethanol!.toFixed(4)} vs ${y}`);
    }
  });

  it('puts the ethanol–water azeotrope near 89 mol % ethanol and 78.2 °C', () => {
    // Where the vapour matches the liquid: y − x changes sign.
    const gap = (x: number) => bubblePoint(byMole('ethanol', x, 'water'), 101.325).vapour.ethanol! - x;
    let lo = 0.8;
    let hi = 0.97;
    assert.ok(gap(lo) > 0 && gap(hi) < 0);
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (gap(mid) > 0) lo = mid;
      else hi = mid;
    }
    const x = (lo + hi) / 2;
    const t = bubblePoint(byMole('ethanol', x, 'water'), 101.325).temperatureC;
    assert.ok(Math.abs(x - 0.894) <= 0.02, `azeotrope at x ${x.toFixed(3)}`);
    assert.ok(Math.abs(t - 78.17) <= 0.5, `azeotrope at ${t.toFixed(2)} °C`);
  });

  it('fixes the 40 % ethanol case Raoult got 10 °C wrong', () => {
    const b = bubblePoint({ water: 0.6, ethanol: 0.4 }, 101.325);
    assert.ok(Math.abs(b.temperatureC - 83) <= 1, `${b.temperatureC} °C (Raoult said 93.6)`);
    assert.ok(Math.abs(b.vapour.ethanol! - 0.53) <= 0.03, `y ${b.vapour.ethanol}`);
    assert.deepEqual(b.pairs, ['water–ethanol']);
    assert.deepEqual(b.missing, []);
  });

  it('puts the isopropanol–water azeotrope near 68 mol % and 80.4 °C, and boils methanol–water right', () => {
    const ipa = bubblePoint(byMole('isopropanol', 0.68, 'water'), 101.325);
    assert.ok(Math.abs(ipa.temperatureC - 80.4) <= 0.7, `IPA–water ${ipa.temperatureC}`);
    assert.ok(Math.abs(ipa.vapour.isopropanol! - 0.68) <= 0.02, `IPA–water y ${ipa.vapour.isopropanol}`);
    // Methanol–water at 1 atm (Perry's): x 0.2, 81.7 °C, y 0.579; x 0.6, 71.2 °C, y 0.825.
    for (const [x, t, y] of [[0.2, 81.7, 0.579], [0.6, 71.2, 0.825]] as const) {
      const b = bubblePoint(byMole('methanol', x, 'water'), 101.325);
      assert.ok(Math.abs(b.temperatureC - t) <= 1 && Math.abs(b.vapour.methanol! - y) <= 0.03, `methanol x ${x}: ${b.temperatureC}, ${b.vapour.methanol}`);
    }
  });

  it('falls back to an ideal solution where a pair has no parameters, and says which', () => {
    const b = bubblePoint({ water: 0.6, sugar: 0.4 }, 101.325);
    assert.equal(b.model, 'ideal');
    assert.deepEqual(b.missing, ['water–sucrose']);
    assert.equal(b.gamma.water, 1);
  });

  it('gives γ at infinite dilution for a component the liquid lacks, and 1 for a pure liquid', () => {
    const inf = componentGamma('ethanol', { water: 1 }, 25);
    assert.ok(inf > 4 && inf < 8, `ethanol in water at infinite dilution, 25 °C: ${inf} (measured about 4-5)`);
    assert.equal(componentGamma('ethanol', { ethanol: 1 }, 25), 1);
  });

  it('carries the pairs the brief asked for, each with its source', () => {
    for (const [a, b] of [['ethanol', 'water'], ['methanol', 'water'], ['isopropanol', 'water'], ['acetone', 'water'], ['ethanol', 'methanol']]) {
      assert.ok(nrtlPair(a!, b!), `${a}–${b}`);
    }
    assert.ok(NRTL_PAIRS.every((p) => /ChemSep/.test(p.source) && findComponent(p.i) && findComponent(p.j)));
  });
});

describe('mixture functions in a contract', () => {
  const scope = { T: 80, P: 101.325, inlet: { x: { water: 0.6, ethanol: 0.4 } } };

  it('evaluates gamma, bubble_point and bubble_vapour on a stream composition', () => {
    const g = evaluateExpression("gamma('ethanol', inlet.x, T)", scope) as number;
    assert.ok(g > 1.5 && g < 3, `γ ethanol ${g}`);
    const t = evaluateExpression('bubble_point(inlet.x, P)', scope) as number;
    assert.ok(Math.abs(t - bubblePoint({ water: 0.6, ethanol: 0.4 }, 101.325).temperatureC) < 1e-9);
    const w = evaluateExpression("bubble_vapour('ethanol', inlet.x, P)", scope) as number;
    assert.ok(w > 0.7 && w < 0.8, `first vapour ${w} ethanol by mass (y 0.55 by mole)`);
    assert.throws(() => evaluateExpression('bubble_point(inlet.x.ethanol, P)', scope), /mass fractions as argument 1/);
    assert.throws(() => evaluateExpression('bubble_point(T, P)', scope), /mass fractions as argument 1/);
  });

  const still = (expr: string, extra: Partial<UnitOpContract> = {}): UnitOpContract => ({
    ...PROCESS_HEATER_CONTRACT,
    components: ['water', 'ethanol'],
    designInlet: { ...PROCESS_HEATER_CONTRACT.designInlet, composition: { water: 0.6, ethanol: 0.4 } },
    constraints: [
      ...PROCESS_HEATER_CONTRACT.constraints,
      { id: 'stays-liquid', expr, severity: 'WARNING', message: 'The heater would boil the stream.', hint: 'Lower targetC.' }
    ],
    ...extra
  });

  it('accepts a contract that reads a stream composition through them', () => {
    const v = executeValidateUnitOp({ contract: still('targetC < bubble_point(inlet.x, 101.325)') });
    assert.equal(v.verdict, 'ACCEPTED', v.revisionGuidance);
    const g = executeValidateUnitOp({ contract: still("gamma('ethanol', inlet.x, targetC) * psat('ethanol', targetC) < 2 * 101.325") });
    assert.equal(g.verdict, 'ACCEPTED', g.revisionGuidance);
  });

  it('rejects a composition used as a number, a number passed as a composition, and an unknown component', () => {
    assert.ok(validateUnitOpContract(still('inlet.x + 1 > 0')).some((i) => /whole composition/.test(i.message)));
    assert.ok(validateUnitOpContract(still('targetC < bubble_point(targetC, 101.325)')).some((i) => /mass fractions whole/.test(i.message)));
    const resin = still('targetC < bubble_point(inlet.x, 101.325)', { components: ['water', 'resin'] });
    assert.ok(validateUnitOpContract(resin).some((i) => /"resin" is not/.test(i.message)), JSON.stringify(validateUnitOpContract(resin)));
    const noDesign = still('targetC < bubble_point(inlet.x, 101.325)', { designInlet: { ...PROCESS_HEATER_CONTRACT.designInlet, composition: undefined } });
    assert.ok(validateUnitOpContract(noDesign).some((i) => /designInlet.composition/.test(i.message)));
  });
});
