import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as protocol from '@process-forge/protocol';
import {
  CONCENTRATE_PUMP_CONTRACT,
  engineInfluence,
  engineResults,
  evaluateUnitOp,
  parameterInfluence,
  resultsOf,
  type UnitOpContract
} from '@process-forge/protocol';
import { distinctResults, KEY_SETTINGS, keySettings, layoutGroups, MORE_SETTINGS } from '../model/specLayout.js';
import { unitSystemPrefs } from '../model/unitSystems.js';
import { unitPreferenceKey } from '../model/parameterUi.js';

const layoutOf = (c: UnitOpContract) => {
  const influence = parameterInfluence(c);
  const movers = engineInfluence(c);
  return { key: keySettings(c, influence, movers), groups: layoutGroups(c, influence, movers) };
};

/** Every example contract the protocol ships: the rules must hold for any of them, not one. */
const EXAMPLES = Object.entries(protocol).filter(
  (e): e is [string, UnitOpContract] => /_CONTRACT$/.test(e[0]) && typeof e[1] === 'object' && e[1] !== null && 'parameters' in e[1] && 'behavior' in e[1]
);

describe("a unit's spec sheet, laid out from its contract", () => {
  it('shows a pump the specs its checks turn on, and the rest under More', () => {
    const { key, groups } = layoutOf(CONCENTRATE_PUMP_CONTRACT);
    const names = key.map((p) => p.name);
    for (const n of ['differentialPsi', 'efficiency', 'motorKw']) assert.ok(names.includes(n), `${n} is a key spec`);
    assert.ok(!names.includes('gravity'), 'a constant is never a key spec');
    assert.ok(key.length <= KEY_SETTINGS);
    const more = groups.find((g) => g.name === MORE_SETTINGS);
    assert.ok(more?.folded);
    assert.equal(key.length + more!.params.length, CONCENTRATE_PUMP_CONTRACT.parameters.length, 'nothing is lost, only folded');
  });

  it('lets a contract name its key specs with ui.primary', () => {
    const c: UnitOpContract = {
      ...CONCENTRATE_PUMP_CONTRACT,
      parameters: CONCENTRATE_PUMP_CONTRACT.parameters.map((p) => (p.name === 'staticSuctionFt' || p.name === 'npshRequiredFt' ? { ...p, ui: { ...p.ui, primary: true } } : p))
    };
    assert.deepEqual(layoutOf(c).key.map((p) => p.name), ['staticSuctionFt', 'npshRequiredFt']);
  });

  it('keeps every example contract whole, and never shows more than the key specs first', () => {
    assert.ok(EXAMPLES.length >= 15, `found ${EXAMPLES.length} example contracts`);
    for (const [name, c] of EXAMPLES) {
      const { key, groups } = layoutOf(c);
      assert.ok(key.length <= KEY_SETTINGS, `${name}: ${key.length} key specs`);
      const shown = groups.flatMap((g) => g.params.map((p) => p.name)).sort();
      assert.deepEqual(shown, c.parameters.map((p) => p.name).sort(), `${name}: every parameter is on the sheet`);
    }
  });
});

describe('each result once', () => {
  it("drops the pump's results that restate a setting, the feed or the engine's figures", () => {
    const c = CONCENTRATE_PUMP_CONTRACT;
    const ev = evaluateUnitOp(c);
    const values = resultsOf(ev);
    const rows = [...engineResults(ev), ...c.derived].map((d) => ({ ...d, value: values[d.name]! })).filter((d) => d.value !== undefined);
    const feed = [{ name: 'volumetricFlowGpm', label: 'Inlet flow', unit: 'gal/min', value: c.designInlet!.volumetricFlowGpm! }];
    const kept = distinctResults(rows, [...c.parameters, ...feed]).map((d) => d.name);
    assert.ok(!kept.includes('flowM3PerS'), 'flow in m3/s is the inlet flow again');
    assert.ok(!kept.includes('dpKpa'), 'kPa is the psi setting again');
    assert.ok(!kept.includes('shaftKw'), "shaft power is the engine's duty again");
    for (const n of ['engine.capacityGpm', 'engine.dutyKw', 'headFt', 'npshAvailableFt']) assert.ok(kept.includes(n), `${n} stays`);
  });

  it('never merges two dimensionless results that happen to agree', () => {
    const kept = distinctResults(
      [
        { name: 'a', unit: '-', value: 0.5 },
        { name: 'b', unit: '-', value: 0.5 }
      ],
      []
    );
    assert.equal(kept.length, 2);
  });

  it('compares temperatures with their offsets, and differences without', () => {
    const kept = distinctResults([{ name: 'tOut', label: 'Outlet temperature', unit: '°F', value: 158 }], [{ name: 'tIn', unit: '°C', value: 70 }]);
    assert.equal(kept.length, 0, '158 °F is 70 °C');
  });
});

describe('the unit system switch', () => {
  it('sets one unit for each kind of quantity', () => {
    const us = unitSystemPrefs('us');
    assert.equal(us[unitPreferenceKey('°C')!], '°F');
    assert.equal(us[unitPreferenceKey('m3/h')!], 'gal/min');
    assert.equal(us[unitPreferenceKey('m')!], 'ft', 'ft, not in, for lengths');
    assert.deepEqual(unitSystemPrefs('design'), {});
  });
});
