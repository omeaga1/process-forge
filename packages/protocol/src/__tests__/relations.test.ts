import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { airRho, waterCp, waterHvap, waterPsat, waterRho, waterTsat } from '../unitop/properties.js';
import { evaluateNumber } from '../unitop/expression.js';
import { validateUnitOpContract, type UnitOpContract } from '../unitop/contract.js';
import { executeValidateUnitOp } from '../unitop/review.js';
import { evaluateUnitOp } from '../unitop/evaluate.js';
import { physicsAlignment } from '../unitop/physicsAlignment.js';
import { PUMP_CONTRACT } from '../unitop/examples/pump.js';
import { PROCESS_HEATER_CONTRACT } from '../unitop/examples/standardUnits.js';
import { DUST_COLLECTOR_CONTRACT } from '../unitop/examples/phaseUnits.js';

const near = (a: number, b: number, rel: number) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} vs ${b}`);
const clone = <T>(x: T): T => structuredClone(x);

describe('property functions', () => {
  it('match the steam tables', () => {
    near(waterPsat(100), 101.418, 1e-4); // IF97: 0.101418 MPa at 373.15 K
    near(waterPsat(25), 3.1699, 1e-3);
    near(waterTsat(101.325), 99.974, 1e-4);
    near(waterTsat(1000), 179.88, 1e-3);
    near(waterPsat(waterTsat(500)), 500, 1e-6);
    near(waterRho(20), 998.21, 1e-4);
    near(waterRho(4), 999.97, 1e-4);
    near(waterCp(25), 4.1813, 2e-3);
    near(waterHvap(100), 2256.4, 1e-3);
    near(airRho(20, 101.325), 1.2045, 1e-3);
  });

  it('are callable from a contract, and refuse to extrapolate', () => {
    near(evaluateNumber('water_psat(T)', { T: 100 }), 101.418, 1e-4);
    assert.throws(() => evaluateNumber('water_rho(T)', { T: 200 }), /water_rho needs 0 to 150/);
  });

  it('check that what is passed in is the right kind of quantity, and in the right unit', () => {
    const base = clone(PUMP_CONTRACT) as UnitOpContract;
    const withDerived = (expr: string, extra: UnitOpContract['parameters'] = []) => {
      const c = clone(base);
      c.parameters.push(...extra);
      c.derived.push({ name: 'psatCheck', label: 'Saturation pressure', unit: 'kPa', expr });
      return validateUnitOpContract(c);
    };
    assert.equal(withDerived('water_psat(inlet.temperatureC)').length, 0);
    assert.ok(withDerived('water_psat(motorKw)').some((i) => /takes T as temperature/.test(i.message)));
    assert.ok(withDerived('water_psat(liquidK)', [{ name: 'liquidK', label: 'Liquid temperature', unit: 'K', value: 300, min: 273, max: 600 }]).some((i) => /in °C, but "liquidK" is in K/.test(i.message)));
    assert.ok(
      withDerived('water_tsat(suctionGauge)', [{ name: 'suctionGauge', label: 'Suction gauge', unit: 'psig', value: 5, min: 0, max: 100 }]).some((i) => /gauge pressure/.test(i.message))
    );
  });
});

describe('governing relations, checked in SI', () => {
  it('hold for the shipped pump, heater and dust collector', () => {
    for (const c of [PUMP_CONTRACT, PROCESS_HEATER_CONTRACT, DUST_COLLECTOR_CONTRACT]) {
      const rel = physicsAlignment(c, evaluateUnitOp(c)).relations;
      assert.ok(rel.length > 0, c.name);
      assert.ok(rel.every((r) => r.status === 'holds'), `${c.name}: ${JSON.stringify(rel)}`);
    }
  });

  it('catch a pump whose power is off by a thousand, which the dimension check cannot', () => {
    const c = clone(PUMP_CONTRACT);
    // W labelled kW: dimensionally a power either way.
    c.derived = c.derived.map((d) => (d.name === 'hydraulicKw' ? { ...d, expr: 'flowM3PerS * dpKpa * 1000' } : d));
    c.parameters = c.parameters.map((p) => (p.name === 'motorKw' ? { ...p, value: 55 } : p));
    c.constraints = c.constraints.filter((x) => x.id !== 'motor');
    const r = executeValidateUnitOp({ contract: c });
    assert.equal(r.verdict, 'REJECTED');
    const rel = r.gates.physicsAlignment.relations.find((x) => x.id === 'power-balance')!;
    assert.equal(rel.status, 'fails');
    assert.ok(r.revisionPlan.some((i) => /does not hold/.test(i.problem)));
  });

  it('catch a heater whose outlet temperature does not follow from its duty', () => {
    const c = clone(PROCESS_HEATER_CONTRACT) as UnitOpContract;
    c.derived = c.derived.map((d) => (d.name === 'outletC' ? { ...d, expr: 'targetC + 5' } : d));
    const rel = physicsAlignment(c, evaluateUnitOp(c)).relations[0]!;
    assert.equal(rel.status, 'fails');
  });

  it('binds a role where the contract says, and says when it cannot', () => {
    const c = clone(DUST_COLLECTOR_CONTRACT) as UnitOpContract;
    c.roles = { flow: 'normalM3PerH' };
    const rel = physicsAlignment(c, evaluateUnitOp(c)).relations[0]!;
    // Normal flow is not the actual flow: told to use it, the relation fails.
    assert.equal(rel.status, 'fails');
    c.roles = { flow: 'nope' };
    const unbound = physicsAlignment(c, evaluateUnitOp(c));
    assert.equal(unbound.relations[0]!.status, 'unbound');
    assert.ok(unbound.warnings.some((w) => w.path === 'roles'));
  });
});
