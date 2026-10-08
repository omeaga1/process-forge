import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  acfmToScfm,
  createTerminalNode,
  feedGasDensityGPerCm3,
  feedMassSupplyKgPerS,
  mixtureMolarMass,
  executeValidateUnitOp,
  grainsPerFt3ToGPerM3,
  humidityRatio,
  idealGasDensity,
  isPhaseAware,
  matchPhaseArchetype,
  parseUnit,
  phaseIssues,
  phaseWarnings,
  portPhase,
  relativeHumidity,
  scfmToKgPerS,
  stokesVelocity,
  validateUnitOpContract,
  waterLatentHeatKjPerKg,
  waterSaturationPressureKpa,
  DUST_COLLECTOR_CONTRACT,
  JUICE_CONCENTRATOR_CONTRACT,
  PHASE_ARCHETYPES,
  SPRAY_DRYER_CONTRACT,
  VOLUME,
  VOLUME_FLOW,
  type UnitOpContract
} from '../index.js';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} not within ${tol} of ${b}`);

describe('phase physics helpers', () => {
  it('air density from the ideal gas law', () => {
    near(idealGasDensity(20), 1.204, 0.002, 'air at 20 °C');
    near(idealGasDensity(0), 1.293, 0.002, 'air at 0 °C');
    near(idealGasDensity(200), 0.746, 0.002, 'air at 200 °C');
  });
  it('ACFM and SCFM', () => {
    near(acfmToScfm(1000, 20), 1000, 1e-9, 'at standard temperature');
    near(acfmToScfm(1000, 200), 619.6, 0.5, 'hot gas takes up more room');
    near(scfmToKgPerS(1000), 0.5683, 0.001, '1000 SCFM of air');
  });
  it('water: saturation pressure, latent heat, humidity', () => {
    near(waterSaturationPressureKpa(100), 101.3, 0.3, 'boils at 100 °C');
    near(waterSaturationPressureKpa(25), 3.17, 0.02, 'at 25 °C');
    near(waterLatentHeatKjPerKg(100), 2256.4, 0.5, 'at 100 °C');
    near(waterLatentHeatKjPerKg(150), 2113.7, 10, 'at 150 °C');
    near(waterLatentHeatKjPerKg(200), 1940.7, 10, 'at 200 °C');
    near(waterLatentHeatKjPerKg(40), 2406, 5, 'at 40 °C');
    near(humidityRatio(waterSaturationPressureKpa(25)), 0.0201, 0.0005, 'saturated air at 25 °C');
    near(relativeHumidity(25, humidityRatio(waterSaturationPressureKpa(25))), 1, 1e-9, 'saturated is 100 %');
  });
  it('dust and particles', () => {
    near(grainsPerFt3ToGPerM3(1), 2.288, 0.001, '1 gr/ft3');
    near(stokesVelocity(10, 1000, 1.2), 0.00301, 0.0001, 'a 10 um droplet settles at ~3 mm/s');
  });
  it('gas and dust units are dimension-checked', () => {
    assert.deepEqual(parseUnit('ACFM'), VOLUME_FLOW);
    assert.deepEqual(parseUnit('Nm3'), VOLUME);
    assert.notEqual(parseUnit('mg/Nm3'), null);
    assert.notEqual(parseUnit('gr/ft3'), null);
  });
});

describe('phase-aware worked examples', () => {
  it('the dust collector is accepted, with flows in the units of their phase', () => {
    const r = executeValidateUnitOp({ contract: DUST_COLLECTOR_CONTRACT });
    assert.equal(r.verdict, 'ACCEPTED', r.revisionGuidance);
    const d = r.derived!;
    near(d.acfm!, 4040, 20, 'ACFM');
    near(d.airToCloth!, 2.69, 0.02, 'air-to-cloth, ft/min');
    near(d.collectedKgPerH!, 33.9, 0.1, 'powder to the hopper, kg/h');
    assert.ok(d.outletMgPerNm3! < 10, 'emission under the limit');
    const unprotected = executeValidateUnitOp({ contract: DUST_COLLECTOR_CONTRACT, parameterOverrides: { explosionProtected: 0 } });
    assert.match(unprotected.gates.physical.warnings.join('\n'), /combustible-dust/);
    const overloaded = executeValidateUnitOp({ contract: DUST_COLLECTOR_CONTRACT, parameterOverrides: { filterAreaFt2: 1000 } });
    assert.equal(overloaded.verdict, 'REJECTED', 'air-to-cloth 4 ft/min is too fast for a stearate');
  });
  it('the spray dryer is accepted: liquid in, powder and humid air out, the energy balance closes', () => {
    const r = executeValidateUnitOp({ contract: SPRAY_DRYER_CONTRACT });
    assert.equal(r.verdict, 'ACCEPTED', r.revisionGuidance);
    const d = r.derived!;
    assert.ok(d.heatAvailableKw! >= d.heatNeededKw!);
    near(d.exhaustRh!, 0.095, 0.01, 'exhaust RH');
    near(d.powderKgPerH!, 41.7, 0.2, 'powder, kg/h');
    assert.deepEqual(phaseWarnings(SPRAY_DRYER_CONTRACT), []);
  });
  it('a spray dryer starved of air is physically rejected', () => {
    const r = executeValidateUnitOp({ contract: SPRAY_DRYER_CONTRACT, parameterOverrides: { airInletC: 150 } });
    assert.equal(r.verdict, 'REJECTED');
    assert.match(r.gates.physical.errors.join('\n'), /energy-balance/);
  });
});

describe('the phase gate', () => {
  it('leaves contracts that state no phases alone', () => {
    assert.equal(isPhaseAware(JUICE_CONCENTRATOR_CONTRACT), false);
    assert.deepEqual(phaseIssues(JUICE_CONCENTRATOR_CONTRACT), []);
  });

  it('defaults a port\'s phase from its flow dimension', () => {
    assert.equal(portPhase({ flowDimension: 'CONTINUOUS_FLUID' }), 'LIQUID');
    assert.equal(portPhase({ flowDimension: 'DISCRETE_CONTAINER' }), 'ITEMS');
    assert.equal(portPhase({ flowDimension: 'CONTINUOUS_FLUID', phase: 'GAS' }), 'GAS');
  });

  it('rejects a solid that appears from a liquid with no phase change', () => {
    const c = clone(SPRAY_DRYER_CONTRACT);
    delete c.phaseChanges;
    const issues = validateUnitOpContract(c).map((i) => i.message).join('\n');
    assert.match(issues, /"solids" leaves by "powder" as SOLID, but it enters only as LIQUID/);
    assert.match(issues, /mechanism: 'CRYSTALLISATION'|mechanism: 'DRYING'|mechanism: 'SOLIDIFICATION'/);
  });

  it('rejects a gas outlet when nothing gaseous enters or forms', () => {
    const c: UnitOpContract = clone(JUICE_CONCENTRATOR_CONTRACT);
    c.ports.find((p) => p.id === 'vapour')!.phase = 'GAS';
    const issues = phaseIssues(c).map((i) => i.message).join('\n');
    assert.match(issues, /outlet "vapour" sends out a GAS, but nothing comes in as GAS/);
    // Declaring the evaporation fixes it; the steam duty is the heat source.
    c.phaseChanges = [{ component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'EVAPORATION', latentHeatKjPerKg: 'latentKjPerKg' }];
    assert.deepEqual(phaseIssues(c), []);
    assert.equal(executeValidateUnitOp({ contract: c }).verdict, 'ACCEPTED');
  });

  it('requires a heat source for evaporation', () => {
    const c: UnitOpContract = clone(JUICE_CONCENTRATOR_CONTRACT);
    c.ports.find((p) => p.id === 'vapour')!.phase = 'GAS';
    c.phaseChanges = [{ component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'EVAPORATION' }];
    if (c.behavior.mode === 'CONTINUOUS_RATE') delete c.behavior.dutyKw;
    const issues = phaseIssues(c).map((i) => i.message).join('\n');
    assert.match(issues, /takes heat .*no heat source/);
    assert.match(phaseWarnings(c).map((w) => w.message).join('\n'), /no latentHeatKjPerKg/);
  });

  it('rejects a mechanism that cannot make the change', () => {
    const c = clone(SPRAY_DRYER_CONTRACT);
    c.phaseChanges![0]!.mechanism = 'CONDENSATION';
    assert.match(phaseIssues(c).map((i) => i.message).join('\n'), /CONDENSATION does not take a component from LIQUID to GAS/);
  });

  it('rejects a dust that changes phase in a dust collector', () => {
    const c = clone(DUST_COLLECTOR_CONTRACT);
    delete c.ports[0]!.dispersed; // the lubricant now "enters as GAS"
    assert.match(phaseIssues(c).map((i) => i.message).join('\n'), /"lubricant" leaves by "hopper" as SOLID, but it enters only as GAS/);
  });

  it('keeps items and continuous phases apart', () => {
    const c = clone(DUST_COLLECTOR_CONTRACT);
    c.ports[2]!.phase = 'ITEMS';
    assert.match(phaseIssues(c).map((i) => i.message).join('\n'), /ITEMS needs flowDimension DISCRETE_CONTAINER/);
  });
});

describe('phase archetypes', () => {
  it('match equipment by its description, specific names first', () => {
    assert.equal(matchPhaseArchetype('pulse jet dust collector catching powdered lubricant')?.id, 'dust-collector');
    assert.equal(matchPhaseArchetype('spray chamber drying a milk concentrate')?.id, 'spray-dryer');
    assert.equal(matchPhaseArchetype('a co-current spray dryer')?.id, 'spray-dryer');
    assert.equal(matchPhaseArchetype('rotary dryer for sand')?.id, 'fluid-bed-dryer');
    assert.equal(matchPhaseArchetype('rotary tablet press')?.id, 'tablet-press');
    assert.equal(matchPhaseArchetype('a centrifugal pump'), null);
  });
  it('every archetype plan passes the phase gate', () => {
    for (const a of PHASE_ARCHETYPES) {
      const contract = {
        contractVersion: 1,
        id: a.id,
        name: a.name,
        description: a.summary,
        components: a.components,
        phaseChanges: a.phaseChanges.map((pc) => ({ ...pc, latentHeatKjPerKg: '0' })),
        ports: a.ports.map((p) => ({
          id: p.id,
          name: p.name,
          direction: p.direction,
          role: p.role ?? 'MATERIAL',
          flowDimension: p.phase === 'ITEMS' ? 'DISCRETE_CONTAINER' : 'CONTINUOUS_FLUID',
          required: true,
          phase: p.phase,
          ...(p.dispersed ? { dispersed: p.dispersed } : {}),
          ...(p.carries ? { carries: p.carries } : {})
        })),
        parameters: [],
        derived: [],
        constraints: [],
        behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: '1', dutyKw: '1' },
        provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] }
      } as unknown as UnitOpContract;
      assert.deepEqual(phaseIssues(contract), [], a.id);
    }
  });
});

describe('feeds in their own units', () => {
  it('mixture molar mass', () => {
    near(mixtureMolarMass({ air: 1 }), 28.96, 1e-9, 'air');
    near(mixtureMolarMass({ air: 0.95, water: 0.05 }), 28.106, 0.005, 'humid air is lighter');
    near(mixtureMolarMass(undefined), 28.96, 0.01, 'unknown is air-like');
  });
  it('a feed stated in kg/h or SCFM', () => {
    near(feedMassSupplyKgPerS(createTerminalNode('feed', { supplyKgPerHour: 3600 }))!, 1, 1e-12, 'kg/h');
    near(feedMassSupplyKgPerS(createTerminalNode('feed', { phase: 'GAS', supplyScfm: 1000, composition: { air: 1 } }))!, 0.5683, 0.001, 'SCFM');
    assert.equal(feedMassSupplyKgPerS(createTerminalNode('feed', { supplyRate: 30 })), undefined, 'gal/min stays gal/min');
    near(feedGasDensityGPerCm3(createTerminalNode('feed', { phase: 'GAS' }), 20)!, 0.001204, 0.000002, 'air at 20 °C');
    assert.equal(feedGasDensityGPerCm3(createTerminalNode('feed', {}), 20), undefined, 'a liquid feed keeps its density');
  });
});
