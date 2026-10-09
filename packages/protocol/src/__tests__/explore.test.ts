import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { alternativeUnits, convertUnit, parseQuantity } from '../unitop/unitConversion.js';
import { parameterInfluence, caseStudy, solveForConstraint, solveForTarget, suggestFixes, sweepParameter, sweepRange, niceValue } from '../unitop/explore.js';
import { DUST_COLLECTOR_CONTRACT } from '../unitop/examples/phaseUnits.js';
import { validateUnitOpContract, type UnitOpContract } from '../unitop/contract.js';
import { evaluateUnitOp } from '../unitop/evaluate.js';

const close = (a: number | null, b: number, tol = 1e-6) => assert.ok(a !== null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

describe('unit conversion', () => {
  it('converts temperatures with their offsets, and temperature differences without', () => {
    close(convertUnit(100, '°C', '°F'), 212);
    close(convertUnit(-40, '°F', '°C'), -40);
    close(convertUnit(0, '°C', 'K'), 273.15);
    // Specific heat: a degree C and a kelvin are the same size; a degree F is 5/9 of one.
    close(convertUnit(4.186, 'kJ/kg-K', 'BTU/lb-°F'), 1.0, 1e-3);
  });

  it('converts pressures, flows and powers by their sizes', () => {
    close(convertUnit(1, 'bar', 'psi'), 14.5038, 1e-5);
    close(convertUnit(100, 'gal/min', 'm3/h'), 22.7125, 1e-5);
    close(convertUnit(1, 'hp', 'kW'), 0.7457, 1e-4);
    close(convertUnit(1000, 'kg/h', 'lb/h'), 2204.62, 1e-5);
    close(convertUnit(1, 'ft2', 'm2'), 0.09290304);
  });

  it('refuses quantities that are not alike, and gauge to absolute', () => {
    assert.equal(convertUnit(1, 'kg', 'm'), null);
    assert.equal(convertUnit(10, 'psig', 'kPa'), null);
    close(convertUnit(10, 'psig', 'barg'), 0.689476, 1e-5);
    assert.equal(convertUnit(1, 'furlongs', 'm'), null);
  });

  it('offers the units engineers use for the same quantity, never rpm for items/min', () => {
    assert.deepEqual(alternativeUnits('°C'), ['°C', '°F', 'K']);
    assert.ok(alternativeUnits('psi').includes('bar'));
    assert.ok(alternativeUnits('ft2').includes('m2'));
    assert.deepEqual(alternativeUnits('items/min'), []);
    assert.deepEqual(alternativeUnits('bottles'), []);
    assert.deepEqual(alternativeUnits('%'), ['%', '-']);
  });

  it('reads a value typed with a unit into the parameter\'s own', () => {
    close(parseQuantity('2 bar', 'psi'), 29.0075, 1e-5);
    close(parseQuantity('212', '°C', '°F'), 100);
    close(parseQuantity('1,500', 'ft2'), 1500);
    assert.equal(parseQuantity('three', 'ft2'), null);
    assert.equal(parseQuantity('3 kg', 'ft2'), null);
  });
});

describe('exploring a design', () => {
  const undersized: UnitOpContract = {
    ...DUST_COLLECTOR_CONTRACT,
    parameters: DUST_COLLECTOR_CONTRACT.parameters.map((p) => (p.name === 'filterAreaFt2' ? { ...p, value: 300 } : p))
  };

  it('maps which filter areas pass and which blind the bags', () => {
    const { points, range } = sweepParameter(DUST_COLLECTOR_CONTRACT, 'filterAreaFt2', 40);
    assert.equal(range.log, true);
    assert.equal(points[0]!.status, 'error');
    assert.ok(points[0]!.failing.includes('air-to-cloth'));
    assert.notEqual(points[points.length - 1]!.status, 'error');
  });

  it('solves for the filter area that brings air-to-cloth inside the limit', () => {
    const before = evaluateUnitOp(undersized);
    assert.equal(before.constraints.find((c) => c.id === 'air-to-cloth')!.satisfied, false);
    const fix = solveForConstraint(undersized, 'air-to-cloth', 'filterAreaFt2');
    assert.ok(fix);
    const acfm = before.derived.acfm!;
    // The smallest area that holds: acfm / 3 ft/min, as a tidy number just above it.
    assert.ok(fix.value >= acfm / 3 && fix.value <= (acfm / 3) * 1.03, `${fix.value} vs ${acfm / 3}`);
    assert.ok(fix.fixes.includes('air-to-cloth'));
    const after = evaluateUnitOp(undersized, { parameterOverrides: { filterAreaFt2: fix.value } });
    assert.equal(after.constraints.find((c) => c.id === 'air-to-cloth')!.satisfied, true);
  });

  it('lists the knobs that move each check, through the derived values between', () => {
    const inf = parameterInfluence(DUST_COLLECTOR_CONTRACT);
    assert.ok(inf.levers['air-to-cloth']!.includes('filterAreaFt2'));
    assert.ok(inf.levers['air-to-cloth']!.includes('maxAirToCloth'));
    assert.ok(inf.derived['filterAreaFt2']!.includes('fanKw'));
    assert.ok(inf.behavior['filterAreaFt2']!.includes('behavior.dutyKw'));
    assert.ok(!inf.levers['air-to-cloth']!.includes('permitMgPerNm3'));
  });

  it('suggests one-knob fixes, the ones that clear every error first', () => {
    const fixes = suggestFixes(undersized);
    assert.ok(fixes.length > 0);
    assert.ok(fixes[0]!.allErrorsPass);
    assert.ok(fixes.some((f) => f.parameter === 'filterAreaFt2'));
  });

  it('explores an open-ended parameter a decade either side', () => {
    assert.deepEqual(sweepRange({ name: 'x', label: 'x', unit: 'kg', value: 50 }), { from: 5, to: 500, log: true });
    assert.equal(niceValue(412.3456), 412);
    assert.equal(niceValue(0.0123456), 0.0123);
  });

  it('holds counts, choices and efficiencies to what they can physically be', () => {
    const withParam = (p: object) => validateUnitOpContract({ ...DUST_COLLECTOR_CONTRACT, parameters: [...DUST_COLLECTOR_CONTRACT.parameters, p as never] });
    assert.ok(withParam({ name: 'bags', label: 'Bags', unit: 'bags', value: 12.5, integer: true }).some((i) => /whole number/.test(i.message)));
    assert.ok(
      withParam({ name: 'fabric', label: 'Fabric rating', unit: '°C', value: 150, options: [{ label: 'Polyester', value: 130 }, { label: 'Aramid', value: 200 }] }).some((i) =>
        /not one of its options/.test(i.message)
      )
    );
    assert.ok(withParam({ name: 'motorEfficiency', label: 'Motor efficiency', unit: '%', value: 104 }).some((i) => /not physical/.test(i.message)));
    assert.ok(withParam({ name: 'coldK', label: 'Cold', unit: 'K', value: -3 }).some((i) => /absolute zero/.test(i.message)));
    assert.equal(withParam({ name: 'motorEfficiency', label: 'Motor efficiency', unit: '%', value: 94 }).length, 0);
  });
});

describe('solveForTarget: specify a result, vary an input', () => {
  it('finds the filter area that gives an air-to-cloth ratio of 2 ft/min (area = ACFM / 2)', () => {
    const acfm = evaluateUnitOp(DUST_COLLECTOR_CONTRACT).derived.acfm!;
    const s = solveForTarget(DUST_COLLECTOR_CONTRACT, 'airToCloth', 2, 'filterAreaFt2');
    assert.ok(s && s.reached, JSON.stringify(s));
    close(s!.value, acfm / 2, 1e-6);
    close(s!.achieved, 2, 1e-9);
  });

  it('says when the target is out of reach, and gives the closest value in range', () => {
    // Even the largest filter in range cannot get the ratio down to 0.01 ft/min.
    const s = solveForTarget(DUST_COLLECTOR_CONTRACT, 'airToCloth', 0.01, 'filterAreaFt2');
    assert.ok(s && !s.reached, JSON.stringify(s));
    close(s!.value, 100000, 1e-6);
    assert.ok(s!.achieved > 0.01);
  });

  it('refuses an unknown parameter', () => {
    assert.equal(solveForTarget(DUST_COLLECTOR_CONTRACT, 'airToCloth', 2, 'nope'), null);
  });
});

describe('caseStudy: one setting stepped, every result tabulated', () => {
  it('steps the filter area evenly and the air-to-cloth ratio falls as ACFM / area', () => {
    const acfm = evaluateUnitOp(DUST_COLLECTOR_CONTRACT).derived.acfm!;
    const rows = caseStudy(DUST_COLLECTOR_CONTRACT, 'filterAreaFt2', 1000, 3000, 5);
    assert.deepEqual(rows.map((r) => r.value), [1000, 1500, 2000, 2500, 3000]);
    for (const r of rows) close(r.derived.airToCloth!, acfm / r.value, 1e-9);
    // Too little cloth fails the air-to-cloth limit; enough passes.
    assert.notEqual(rows[0]!.status, 'ok');
    assert.equal(rows[4]!.status, 'ok');
  });

  it('steps geometrically when asked, and gives nothing for an unknown setting', () => {
    const rows = caseStudy(DUST_COLLECTOR_CONTRACT, 'filterAreaFt2', 100, 10000, 3, { log: true });
    rows.forEach((r, i) => close(r.value, [100, 1000, 10000][i]!, 1e-9));
    assert.deepEqual(caseStudy(DUST_COLLECTOR_CONTRACT, 'nope', 1, 2, 3), []);
  });
});
