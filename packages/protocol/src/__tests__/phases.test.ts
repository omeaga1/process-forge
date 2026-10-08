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
    near(d.powderKgPerH!, 40.83, 0.05, 'powder, kg/h: 98 % of the solids at 4 % moisture');
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

describe('latent heat against the stated duty', () => {
  const boiler = (dutyKw: string): UnitOpContract =>
    ({
      contractVersion: 1,
      id: 'boiler',
      name: 'Kettle boiler',
      description: '',
      ports: [
        { id: 'in', name: 'Water', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID' },
        { id: 'steam', name: 'Steam', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'GAS' },
        { id: 'blowdown', name: 'Blowdown', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID' }
      ],
      phaseChanges: [{ component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'EVAPORATION', latentHeatKjPerKg: 'latent' }],
      parameters: [{ name: 'latent', label: 'Latent heat', unit: 'kJ/kg', value: 2257, min: 2000, max: 2600 }],
      derived: [],
      constraints: [],
      behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: '1', dutyKw },
      designInlet: { massFlowKgPerS: 1, temperatureC: 100 },
      outlets: [{ port: 'steam', share: '0.9' }, { port: 'blowdown' }],
      provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] }
    }) as unknown as UnitOpContract;

  it('warns when the duty cannot pay for the evaporation it declares', () => {
    const r = executeValidateUnitOp({ contract: boiler('500') });
    assert.equal(r.verdict, 'ACCEPTED');
    near(r.phaseEnergy!.latentKw, 2031.3, 0.5, '0.9 kg/s x 2257 kJ/kg');
    assert.match(r.gates.physical.warnings.join('\n'), /phase-energy: .* 2031 kW .* duty of 500 kW/);
  });
  it('is quiet when the duty covers it', () => {
    const r = executeValidateUnitOp({ contract: boiler('2100') });
    assert.ok(!r.gates.physical.warnings.some((w) => w.startsWith('phase-energy')));
  });
});

describe('phase gate: review fixes', () => {
  it('accepts a chain of changes (melt, then evaporate)', () => {
    const c = clone(SPRAY_DRYER_CONTRACT);
    c.ports[0]!.phase = 'SOLID'; // a solid feed that melts, then its water evaporates
    c.ports[0]!.dispersed = { water: 'SOLID', solids: 'SOLID' };
    c.phaseChanges = [
      { component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'EVAPORATION', latentHeatKjPerKg: 'latentKjPerKg' },
      { component: 'water', from: 'SOLID', to: 'LIQUID', mechanism: 'MELTING', latentHeatKjPerKg: '334' }
    ];
    const issues = phaseIssues(c).map((i) => i.message).join('\n');
    assert.doesNotMatch(issues, /water/, issues);
  });
  it('does not take a cooling duty as the heat for evaporation', () => {
    const c: UnitOpContract = clone(JUICE_CONCENTRATOR_CONTRACT);
    c.ports.find((p) => p.id === 'vapour')!.phase = 'GAS';
    c.phaseChanges = [{ component: 'water', from: 'LIQUID', to: 'GAS', mechanism: 'EVAPORATION', latentHeatKjPerKg: 'latentKjPerKg' }];
    if (c.behavior.mode === 'CONTINUOUS_RATE') c.behavior.dutyKw = '-steamKw';
    assert.match(phaseIssues(c).map((i) => i.message).join('\n'), /no heat source/);
  });
  it('matches whole words, the longer phrase once', () => {
    assert.equal(matchPhaseArchetype('evaporator with a vapour condenser')?.id, 'evaporator');
    assert.equal(matchPhaseArchetype('a pulse-jet collector')?.id, 'dust-collector');
    assert.equal(matchPhaseArchetype('cooling crystalliser')?.id, 'crystalliser');
    assert.equal(matchPhaseArchetype('profiler'), null, 'no "filter" inside another word');
  });
  it('unit names are not object built-ins', () => {
    assert.equal(parseUnit('constructor'), null);
    assert.equal(parseUnit('toString/s'), null);
  });
  it('SCFM is a gas feed\'s supply only', () => {
    assert.equal(feedMassSupplyKgPerS(createTerminalNode('feed', { supplyScfm: 1000 })), undefined);
  });
});

describe('calculate_stream', () => {
  it('converts a humid gas between ACFM, SCFM, Nm3/h and kg/s, with its dew point', async () => {
    const { calculateStream } = await import('../index.js');
    const r = calculateStream({ phase: 'GAS', flow: { value: 4000, unit: 'ACFM' }, temperatureC: 25, relativeHumidity: 0.5 });
    assert.equal(r.success, true);
    near(r.humidity!.humidityRatioKgPerKg, 0.00988, 0.0002, 'Y at 25 °C, 50 %');
    near(r.humidity!.dewPointC, 13.9, 0.2, 'dew point');
    near(r.volume!.actualCubicFeetPerMinute, 4000, 1e-6, 'round trip');
    const back = calculateStream({ phase: 'GAS', flow: { value: r.volume!.standardCubicFeetPerMinute!, unit: 'SCFM' }, temperatureC: 25, composition: r.composition! });
    near(back.mass!.kgPerS, r.mass!.kgPerS, 0.005, 'SCFM back to the same mass');
  });
  it('a powder by its bulk density, a liquid in gal/min, and refuses SCFM of a solid', async () => {
    const { calculateStream } = await import('../index.js');
    near(calculateStream({ phase: 'SOLID', flow: { value: 75, unit: 'lb/h' }, densityKgPerM3: 250 }).mass!.kgPerHour, 34.02, 0.01, 'lb/h');
    near(calculateStream({ phase: 'LIQUID', flow: { value: 10, unit: 'gal/min' } }).mass!.kgPerS, 0.6309, 0.001, 'water');
    assert.equal(calculateStream({ phase: 'SOLID', flow: { value: 1, unit: 'SCFM' } }).success, false);
  });
});

describe('port.<id>.* names', () => {
  it('validate needs a design value for each port a contract reads, and checks their units', async () => {
    const { VENTURI_SCRUBBER_CONTRACT } = await import('../index.js');
    assert.equal(executeValidateUnitOp({ contract: VENTURI_SCRUBBER_CONTRACT }).verdict, 'ACCEPTED');
    const noDesign = clone(VENTURI_SCRUBBER_CONTRACT);
    delete noDesign.designPorts;
    assert.match(validateUnitOpContract(noDesign).map((i) => i.message).join('\n'), /give designPorts\.gas_in\.massFlowKgPerS/);
    const wrongUnit = clone(VENTURI_SCRUBBER_CONTRACT);
    wrongUnit.derived.push({ name: 'bad', label: 'bad', unit: 'kW', expr: 'port.gas_in.temperatureC' });
    assert.match(validateUnitOpContract(wrongUnit).map((i) => i.message).join('\n'), /bad/);
    const unknownPort = clone(VENTURI_SCRUBBER_CONTRACT);
    unknownPort.derived.push({ name: 'nope', label: 'nope', unit: '°C', expr: 'port.steam.temperatureC' });
    assert.match(validateUnitOpContract(unknownPort).map((i) => i.message).join('\n'), /port\.steam\.temperatureC/);
  });
  it('the brief hands a scrubber the scrubber example', async () => {
    const { executeDesignUnitOp } = await import('../index.js');
    const r = executeDesignUnitOp({ description: 'venturi scrubber on a dryer exhaust' });
    assert.equal((r.phaseChangeExample as { id: string }).id, 'venturi-scrubber-v1');
    assert.ok(r.rules.some((x) => x.includes('port.<portId>')));
  });
});

describe('second review fixes', () => {
  it('designPorts must name continuous inlet ports, and calculate_stream refuses impossible temperatures', async () => {
    const { VENTURI_SCRUBBER_CONTRACT, calculateStream } = await import('../index.js');
    const c = clone(VENTURI_SCRUBBER_CONTRACT);
    c.designPorts!.gas_out = { temperatureC: 40 };
    assert.match(validateUnitOpContract(c).map((i) => i.message).join('\n'), /"gas_out", which is not a continuous INLET port/);
    assert.equal(calculateStream({ phase: 'GAS', flow: { value: 1, unit: 'kg/s' }, temperatureC: -300 }).success, false);
    near(Object.values(calculateStream({ phase: 'GAS', flow: { value: 1, unit: 'kg/s' }, composition: { air: 0.5 } }).composition!).reduce((a, v) => a + v, 0), 1, 1e-9, 'normalised');
  });
  it('the scrubber balances the gas heat against evaporation and warming its water', async () => {
    const { VENTURI_SCRUBBER_CONTRACT } = await import('../index.js');
    const d = executeValidateUnitOp({ contract: VENTURI_SCRUBBER_CONTRACT }).derived!;
    assert.ok(Math.abs(d.heatGivenKw! - d.heatNeededKw!) / d.heatGivenKw! < 0.05, `${d.heatGivenKw} vs ${d.heatNeededKw}`);
  });
});
