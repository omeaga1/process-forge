import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  describeDimension,
  dimensionIssues,
  executeValidateUnitOp,
  inferDimension,
  parseUnit,
  unitWarnings,
  validateUnitOpContract,
  DIMENSIONLESS,
  POWER,
  SPECIFIC_HEAT,
  VOLUME_FLOW,
  CASE_PACKER_CONTRACT,
  CRYSTALLISER_CONTRACT,
  EVAPORATOR_CONTRACT,
  FDM_PRINTER_CONTRACT,
  JUICE_CONCENTRATOR_CONTRACT,
  NEUTRALISER_CONTRACT,
  STANDARD_EQUIPMENT_CATALOG,
  WAX_COOLING_BELT_CONTRACT,
  type Dimension,
  type UnitOpContract
} from '../index.js';

const same = (a: Dimension | null, b: readonly number[]) => assert.deepEqual(a?.map((v) => v + 0), [...b, 0, 0, 0, 0, 0].slice(0, 5));

describe('Electrical units', () => {
  it('reads volts, amps, ohms and siemens so an ohmic heater is unit-checked', () => {
    same(parseUnit('V'), [1, 2, -3, 0, -1]);
    same(parseUnit('ohm'), [1, 2, -3, 0, -2]);
    same(parseUnit('S/m'), [-1, -3, 3, 0, 2]);
    assert.equal(describeDimension(parseUnit('V/m')!), 'electric field strength');
    // Ohm's law and P = V^2 / R come out as a power.
    const units: Record<string, string> = { v: 'V', i: 'A', r: 'ohm' };
    const env = (n: string) => ({ kind: 'dim' as const, dim: parseUnit(units[n]!)! });
    const p = inferDimension('v * i', env).result;
    assert.equal(p.kind, 'dim');
    if (p.kind === 'dim') same(p.dim, POWER);
    const q = inferDimension('v * v / r', env).result;
    if (q.kind === 'dim') same(q.dim, POWER);
  });
});

describe('Unit parsing', () => {
  it('reduces engineering units to mass, length, time and temperature', () => {
    same(parseUnit('kW'), POWER);
    same(parseUnit('gal/min'), VOLUME_FLOW);
    same(parseUnit('m3/h'), VOLUME_FLOW);
    same(parseUnit('kJ/kg-K'), SPECIFIC_HEAT);
    same(parseUnit('W/m2-K'), [1, 0, -3, -1]);
    same(parseUnit('°C/min'), [0, 0, -1, 1]);
    same(parseUnit('g/cm3'), [1, -3, 0, 0]);
    same(parseUnit('1/min'), [0, 0, -1, 0]);
    same(parseUnit('s^-1'), [0, 0, -1, 0]);
    same(parseUnit('mm³'), [0, 3, 0, 0]);
  });

  it('treats counts and ratios as dimensionless', () => {
    for (const u of ['-', '%', '', 'bottles', 'items/cycle', 'cases']) same(parseUnit(u), DIMENSIONLESS);
  });

  it('returns null for a unit it does not know, rather than guessing', () => {
    assert.equal(parseUnit('flux capacitor'), null);
    assert.equal(parseUnit('E-301'), null);
  });

  it('names common dimensions in messages', () => {
    assert.equal(describeDimension(POWER), 'power');
    assert.equal(describeDimension(VOLUME_FLOW), 'volumetric flow');
  });
});

describe('Dimension inference', () => {
  const env = (units: Record<string, string>) => (name: string) => {
    const d = units[name] !== undefined ? parseUnit(units[name]!) : null;
    return d ? ({ kind: 'dim', dim: d } as const) : ({ kind: 'unknown' } as const);
  };

  it('follows products and quotients', () => {
    const { result, problems } = inferDimension('m * cp * dT', env({ m: 'kg/s', cp: 'kJ/kg-K', dT: 'K' }));
    assert.deepEqual(problems, []);
    assert.equal(result.kind, 'dim');
    if (result.kind === 'dim') same(result.dim, POWER);
  });

  it('rejects adding unlike quantities', () => {
    const { problems } = inferDimension('flow + volume', env({ flow: 'gal/min', volume: 'gal' }));
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /volumetric flow and volume/);
  });

  it('lets a bare number take the other side of a sum or comparison', () => {
    assert.deepEqual(inferDimension('T + 273.15 > 300', env({ T: '°C' })).problems, []);
    assert.deepEqual(inferDimension('max(flow, 0)', env({ flow: 'kg/s' })).problems, []);
  });

  it('keeps conversion factors out of the check', () => {
    const { result } = inferDimension('rate / 60 * 1000', env({ rate: 'kg/min' }));
    assert.equal(result.kind, 'dim');
  });

  it('handles powers, roots and lookups', () => {
    const area = inferDimension('pow(d, 2) * PI / 4', env({ d: 'm' })).result;
    if (area.kind === 'dim') same(area.dim, [0, 2, 0, 0]);
    const root = inferDimension('sqrt(a)', env({ a: 'm2' })).result;
    if (root.kind === 'dim') same(root.dim, [0, 1, 0, 0]);
    assert.equal(inferDimension('interp(T, 20, 1, 80, 2)', env({ T: '°C' })).problems.length, 0);
    assert.equal(inferDimension('exp(T)', env({ T: 'K' })).problems.length, 1);
    assert.equal(inferDimension('exp(-Ea / (R * T))', env({ Ea: 'kJ/kg', R: 'kJ/kg-K', T: 'K' })).problems.length, 0);
  });

  it('does not check what reads an unknown unit', () => {
    assert.deepEqual(inferDimension('x + flow', env({ flow: 'gal/min' })).problems, []);
  });
});

const base = (): UnitOpContract => ({
  contractVersion: 1,
  id: 'units-test',
  name: 'Units test',
  description: '',
  ports: [
    { id: 'in', name: 'In', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'out', name: 'Out', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
  ],
  parameters: [
    { name: 'ratedFlow', label: 'Rated flow', unit: 'gal/min', value: 100, min: 1 },
    { name: 'duty', label: 'Duty', unit: 'kW', value: 50, min: 0 }
  ],
  derived: [],
  constraints: [],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: 'ratedFlow', dutyKw: 'duty' },
  designInlet: { volumetricFlowGpm: 50, temperatureC: 20, massFlowKgPerS: 3, specificHeatKjPerKgK: 4.18 },
  provenance: { authoredBy: 'SUB_AGENT', engineerConfirmed: [] }
});

describe('Contract unit checks', () => {
  it('accepts a contract whose units agree', () => {
    assert.deepEqual(dimensionIssues(base()), []);
  });

  it('rejects a field fed the wrong kind of quantity', () => {
    const c = base();
    c.behavior = { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'ratedFlow', capacityGpm: 'duty' };
    const issues = validateUnitOpContract(c);
    assert.ok(issues.some((i) => i.path === 'behavior.capacityGpm' && i.unit && /volumetric flow.*power/.test(i.message)));
  });

  it('rejects a derived value that does not work out to its declared unit', () => {
    const c = base();
    c.derived = [{ name: 'dutyNeeded', label: 'Duty needed', unit: 'kW', expr: 'inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK' }];
    const issues = dimensionIssues(c);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /declared in kW.*power/);
  });

  it('catches a unit hidden in a bare number by refusing the mismatch it causes', () => {
    const c = base();
    c.parameters.push({ name: 'massFlow', label: 'Mass flow', unit: 'kg/s', value: 2 });
    // 1000 is a density in kg/m3: written bare, the result is not a volumetric flow.
    c.derived = [{ name: 'volFlow', label: 'Volume flow', unit: 'm3/s', expr: 'massFlow / 1000' }];
    assert.equal(dimensionIssues(c).length, 1);
  });

  it('warns, without rejecting, about a unit it cannot check', () => {
    const c = base();
    c.parameters.push({ name: 'widgetness', label: 'Widgetness', unit: 'flux capacitor', value: 1 });
    assert.deepEqual(validateUnitOpContract(c), []);
    assert.equal(unitWarnings(c).length, 1);
    const verdict = executeValidateUnitOp({ contract: c });
    assert.equal(verdict.verdict, 'ACCEPTED');
    assert.equal(verdict.gates.staticAnalysis.warnings?.length, 1);
  });

  it('passes every contract that ships with ProcessForge', () => {
    const shipped = [
      WAX_COOLING_BELT_CONTRACT,
      FDM_PRINTER_CONTRACT,
      EVAPORATOR_CONTRACT,
      CASE_PACKER_CONTRACT,
      CRYSTALLISER_CONTRACT,
      JUICE_CONCENTRATOR_CONTRACT,
      NEUTRALISER_CONTRACT,
      ...STANDARD_EQUIPMENT_CATALOG.flatMap((i) => (i.contract ? [i.contract] : []))
    ];
    for (const c of shipped) assert.deepEqual(dimensionIssues(c), [], c.id);
  });
});
