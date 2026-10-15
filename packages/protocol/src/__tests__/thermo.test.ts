import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPONENTS,
  PROCESS_HEATER_CONTRACT,
  bubblePoint,
  componentCpGas,
  componentHvap,
  componentPsat,
  componentRhoLiquid,
  componentTsat,
  createTerminalNode,
  evaluateExpression,
  executeValidateUnitOp,
  feedPropertiesFromComposition,
  findComponent,
  liquidMixture,
  molarMassOf,
  nearComponents,
  validateUnitOpContract,
  waterPsat,
  type UnitOpContract
} from '../index.js';

/**
 * The component database against published values (CRC Handbook, NIST
 * WebBook, steam tables), each with the tolerance the correlation is good to.
 */
const near = (got: number, want: number, rel: number, what: string) => assert.ok(Math.abs(got - want) <= rel * Math.abs(want), `${what}: ${got} vs ${want} (±${rel * 100}%)`);

describe('the component database', () => {
  it('boils each liquid at its normal boiling point (Antoine, within 1 %)', () => {
    const tb: [string, number][] = [['ethanol', 78.29], ['methanol', 64.7], ['acetone', 56.05], ['toluene', 110.6], ['benzene', 80.1], ['hexane', 68.7], ['isopropanol', 82.3], ['ethyl_acetate', 77.1]];
    for (const [c, t] of tb) near(componentPsat(c, t), 101.325, 0.01, `${c} at ${t} °C`);
    near(componentTsat('ethanol', 101.325), 78.29, 0.002, 'ethanol boils');
    near(componentTsat('toluene', 101.325), 110.6, 0.002, 'toluene boils');
  });

  it('matches published vapour pressures away from the boiling point', () => {
    near(componentPsat('acetone', 25), 30.8, 0.01, 'acetone at 25 °C (CRC 30.8 kPa)');
    near(componentPsat('benzene', 25), 12.7, 0.01, 'benzene at 25 °C (CRC 12.7 kPa)');
    near(componentPsat('ethanol', 25), 7.87, 0.02, 'ethanol at 25 °C (CRC 7.87 kPa)');
  });

  it('carries vapour pressure past the Antoine range continuously, and stops at the critical point', () => {
    const a = findComponent('ethanol')!.antoine!;
    const edge = a.tmaxK - 273.15;
    near(componentPsat('ethanol', edge + 0.01), componentPsat('ethanol', edge - 0.01), 0.001, 'continuous at the edge');
    near(componentPsat('ethanol', 150), 980, 0.03, 'ethanol at 150 °C');
    assert.throws(() => componentPsat('ethanol', 260), /above its critical temperature/);
  });

  it('uses the steam tables for water', () => {
    assert.equal(componentPsat('water', 100), waterPsat(100));
    near(componentTsat('water', 101.325), 99.974, 1e-5, 'water boils at 99.974 °C (ITS-90, IAPWS-IF97)');
  });

  it('gives latent heats, densities and gas heat capacities to published values', () => {
    near(componentHvap('ethanol', 78.29), 837, 0.005, 'ethanol ΔHvap at Tb');
    near(componentHvap('ethanol', 25), 920, 0.02, 'ethanol ΔHvap at 25 °C (CRC 42.3 kJ/mol)');
    near(componentHvap('water', 100), 2256.4, 0.002, 'water ΔHvap at 100 °C');
    near(componentRhoLiquid('ethanol', 20), 789.3, 1e-6, 'ethanol at 20 °C');
    near(componentRhoLiquid('toluene', 80), 809.6, 0.01, 'toluene at 80 °C');
    near(componentCpGas('air', 25), 1.005, 0.005, 'air');
    near(componentCpGas('co2', 25), 0.844, 0.01, 'CO2');
    near(componentCpGas('nitrogen', 300), 1.07, 0.01, 'N2 at 300 °C');
  });

  it('mixes sugar and salt solutions to measured densities, by volume', () => {
    near(liquidMixture({ water: 0.88, sugar: 0.12 }, 20)!.densityKgPerM3, 1048, 0.005, '12 °Brix');
    near(liquidMixture({ water: 0.6, sucrose: 0.4 }, 20)!.densityKgPerM3, 1176.5, 0.005, '40 °Brix');
    near(liquidMixture({ water: 0.88, sugar: 0.12 }, 20)!.cpKjPerKgK, 3.88, 0.01, '12 °Brix cp');
    assert.equal(liquidMixture({ water: 0.5, resin: 0.5 }, 20), undefined, 'a pseudo-component has no properties');
    assert.equal(liquidMixture({ nitrogen: 1 }, 20), undefined, 'a gas has no liquid density');
  });

  it('finds an ideal bubble point, and leaves sugar in the liquid', () => {
    near(bubblePoint({ water: 1 }, 101.325).temperatureC, 99.974, 1e-5, 'water');
    const bt = bubblePoint({ benzene: 0.5, toluene: 0.5 }, 101.325).temperatureC;
    assert.ok(bt > 90 && bt < 94, `benzene-toluene 50/50 by mass boils at ${bt} °C (about 92 °C)`);
    const sweet = bubblePoint({ water: 0.6, sugar: 0.4 }, 101.325);
    assert.ok(sweet.temperatureC > 99.974 && sweet.temperatureC < 102, `40 % sugar boils a little above water: ${sweet.temperatureC}`);
    assert.deepEqual(Object.keys(sweet.vapour), ['water']);
  });

  it('finds a component by name, alias, formula or CAS number, and suggests one for a typo', () => {
    assert.equal(findComponent('IPA')!.id, 'isopropanol');
    assert.equal(findComponent('CO2')!.id, 'carbon_dioxide');
    assert.equal(findComponent('64-17-5')!.id, 'ethanol');
    assert.equal(findComponent('Ethyl Acetate')!.id, 'ethyl_acetate');
    assert.deepEqual(nearComponents('ethonal'), ['ethanol']);
    assert.deepEqual(nearComponents('oil'), [], 'a short word is not a near miss of O2');
    assert.equal(molarMassOf('toluene'), 92.138);
    assert.ok(COMPONENTS.every((c) => c.molarMass > 0 && c.source), 'every component has a molar mass and a source');
  });
});

describe('component functions in a contract', () => {
  it('evaluates psat, tsat, hvap and the rest with the component named in quotes', () => {
    near(evaluateExpression("psat('ethanol', T)", { T: 78.29 }) as number, 101.3, 0.005, 'psat');
    near(evaluateExpression("tsat('water', P)", { P: 31.2 }) as number, 70.1, 0.002, 'tsat');
    near(evaluateExpression('molar_mass("co2")', {}) as number, 44.009, 1e-6, 'double quotes too');
    assert.throws(() => evaluateExpression('psat(ethanol, T)', { T: 50, ethanol: 1 }), /takes a component name first, in quotes/);
    assert.throws(() => evaluateExpression("'ethanol' * 2", {}), /can only name a component/);
  });

  it('rejects a contract that names a component the database does not have, saying which it meant', () => {
    const c: UnitOpContract = {
      ...PROCESS_HEATER_CONTRACT,
      derived: [...PROCESS_HEATER_CONTRACT.derived, { name: 'pv', label: 'Vapour pressure', unit: 'kPa', expr: "psat('ethonal', targetC)" }]
    };
    const issues = validateUnitOpContract(c);
    assert.ok(issues.some((i) => i.path === 'derived.pv' && /did you mean ethanol/.test(i.message)), JSON.stringify(issues));
    assert.equal(executeValidateUnitOp({ contract: c }).verdict, 'REJECTED');
    const ok: UnitOpContract = { ...c, derived: [...PROCESS_HEATER_CONTRACT.derived, { name: 'pv', label: 'Vapour pressure', unit: 'kPa', expr: "psat('ethanol', targetC)" }] };
    assert.equal(executeValidateUnitOp({ contract: ok }).verdict, 'ACCEPTED', executeValidateUnitOp({ contract: ok }).revisionGuidance);
  });

  it('warns when a contract lists a component one typo from a known one', () => {
    const c: UnitOpContract = { ...PROCESS_HEATER_CONTRACT, components: ['water', 'ethonal', 'solids'] };
    const v = executeValidateUnitOp({ contract: c });
    const warnings = v.gates.staticAnalysis.warnings ?? [];
    assert.ok(warnings.some((w) => /ethonal.*ethanol/.test(w)), JSON.stringify(warnings));
    assert.ok(!warnings.some((w) => /solids/.test(w)), 'a pseudo-component is fine');
  });
});

describe('a feed that states its composition and not its properties', () => {
  it('gets them from the database instead of passing for water or air', () => {
    const syrup = createTerminalNode('feed', { id: 's', material: 'Syrup', composition: { water: 0.6, sucrose: 0.4 } });
    const p = feedPropertiesFromComposition(syrup, 20);
    near(p.densityGPerCm3!, 1.1765, 0.005, 'syrup density');
    const gas = createTerminalNode('feed', { id: 'g', material: 'CO2', phase: 'GAS', composition: { co2: 1 } });
    near(feedPropertiesFromComposition(gas, 25).specificHeatKjPerKgK!, 0.844, 0.01, 'CO2 cp');
    const unknown = createTerminalNode('feed', { id: 'u', material: 'Resin', composition: { resin: 1 } });
    assert.deepEqual(feedPropertiesFromComposition(unknown, 20), {});
  });
});
