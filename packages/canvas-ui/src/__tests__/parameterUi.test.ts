import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DUST_COLLECTOR_CONTRACT, PUMP_CONTRACT, sweepParameter, type UnitOpParameter } from '@process-forge/protocol';
import { controlFor, feasibleBand, groupParameters, isCountUnit, stepFor, unitPreferenceKey, displayUnitsFor } from '../model/parameterUi.js';

const P = (x: Partial<UnitOpParameter>): UnitOpParameter => ({ name: 'x', label: 'X', unit: '-', value: 1, ...x });

describe('the control each parameter gets', () => {
  it('a choice is a select, a yes/no a switch, a count a stepper, a bounded value a slider', () => {
    assert.equal(controlFor(P({ options: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] })), 'select');
    assert.equal(controlFor(P({ name: 'explosionProtected', label: 'Explosion protection fitted (1 yes, 0 no)', min: 0, max: 1, value: 1 })), 'toggle');
    assert.equal(controlFor(P({ name: 'nozzleCount', label: 'Filling nozzles', unit: 'nozzles', value: 10, min: 1, max: 64 })), 'stepper');
    assert.equal(controlFor(P({ name: 'bags', unit: 'bags', value: 12.5 })), 'number');
    assert.equal(controlFor(P({ unit: 'ft2', value: 1500, min: 10, max: 100000 })), 'slider');
    assert.equal(controlFor(P({ unit: 'kg', value: 3 })), 'number');
    assert.equal(controlFor(P({ unit: 'K', value: 273.15, min: 273.15, max: 273.15 })), 'fixed');
    // What the contract asks for wins, if it can be honoured.
    assert.equal(controlFor(P({ unit: 'kg', value: 3, ui: { control: 'slider' } })), 'number');
    assert.equal(controlFor(P({ unit: 'kg', value: 3, min: 0, max: 9, ui: { control: 'number' } })), 'number');
  });

  it('knows counts from fractions', () => {
    assert.ok(isCountUnit('nozzles'));
    assert.ok(isCountUnit('items'));
    assert.ok(!isCountUnit('%'));
    assert.ok(!isCountUnit('-'));
    assert.ok(!isCountUnit('kg'));
  });

  it('steps by a tidy fraction of the range, or one for counts', () => {
    assert.equal(stepFor(P({ unit: 'ft2', min: 0, max: 1000 })), 10);
    assert.equal(stepFor(P({ unit: 'nozzles', value: 4 })), 1);
    assert.equal(stepFor(P({ unit: '-', min: 0.3, max: 0.9 })), 0.005);
  });
});

describe('sections', () => {
  it('uses the contract\'s own groups, constants folded at the end', () => {
    const groups = groupParameters(PUMP_CONTRACT.parameters);
    assert.deepEqual(
      groups.map((g) => g.name),
      ['Rating', 'Suction', 'Advanced and constants']
    );
    assert.ok(groups[2]!.folded);
    assert.deepEqual(groups[2]!.params.map((p) => p.name), ['gravity']);
  });

  it('groups by kind of quantity when there are many and none are given', () => {
    const groups = groupParameters(DUST_COLLECTOR_CONTRACT.parameters);
    const names = groups.map((g) => g.name);
    assert.ok(names.includes('Temperatures'));
    assert.ok(names.includes('Pressures'));
    // Fixed constants (R, normal conditions) are tucked away.
    assert.ok(groups.find((g) => g.folded)!.params.some((p) => p.name === 'normalK'));
  });
});

describe('where along a knob the design works', () => {
  it('colours the filter-area track and finds the passing run around the value', () => {
    const s = sweepParameter(DUST_COLLECTOR_CONTRACT, 'filterAreaFt2', 41);
    const band = feasibleBand(s, 1500);
    assert.equal(band.segments[0]!.status, 'error');
    assert.ok(band.passing?.containsValue);
    // The edge is exact: air-to-cloth = acfm / area reaches 3 ft/min there.
    assert.ok(band.passing!.from > 1300 && band.passing!.from <= 1500, String(band.passing!.from));
    // Below the passing run, it says where to go.
    const low = feasibleBand(s, 50);
    assert.equal(low.passing?.containsValue, false);
  });

  it('offers other units of the same kind, and remembers a choice per kind of quantity', () => {
    assert.deepEqual(displayUnitsFor(P({ unit: '°C' })), ['°C', '°F', 'K']);
    assert.deepEqual(displayUnitsFor(P({ unit: 'nozzles' })), []);
    assert.equal(unitPreferenceKey('°C'), unitPreferenceKey('K'));
    assert.notEqual(unitPreferenceKey('psig'), unitPreferenceKey('psi'));
  });
});
