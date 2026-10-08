import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { executeValidateUnitOp } from '../unitop/review.js';
import { physicsAlignment } from '../unitop/physicsAlignment.js';
import { evaluateUnitOp } from '../unitop/evaluate.js';
import { PUMP_CONTRACT } from '../unitop/examples/pump.js';
import { SPRAY_DRYER_CONTRACT, DUST_COLLECTOR_CONTRACT } from '../unitop/examples/phaseUnits.js';
import { TWO_STREAM_EXCHANGER_CONTRACT } from '../unitop/examples/twoStreamExchanger.js';
import { PROCESS_HEATER_CONTRACT } from '../unitop/examples/standardUnits.js';
import { PHASE_ARCHETYPES } from '../unitop/phases.js';
import { executeDesignUnitOp } from '../unitop/designBrief.js';
import type { UnitOpContract } from '../unitop/contract.js';

const clone = <T>(x: T): T => structuredClone(x);

describe('physics alignment: held to the equipment it declares', () => {
  it('accepts the worked pump, every requirement met', () => {
    const r = executeValidateUnitOp({ contract: PUMP_CONTRACT });
    assert.equal(r.verdict, 'ACCEPTED', r.revisionGuidance);
    assert.equal(r.gates.physicsAlignment.decidedBy, 'declared');
    assert.equal(r.gates.physicsAlignment.archetype, 'pump');
    assert.ok(r.gates.physicsAlignment.checklist.every((c) => c.met), JSON.stringify(r.gates.physicsAlignment.checklist));
  });

  it('rejects a declared pump with no shaft power, and says how to add it', () => {
    const c = clone(PUMP_CONTRACT);
    c.derived = c.derived.filter((d) => d.name !== 'shaftKw');
    c.constraints = c.constraints.filter((x) => x.id !== 'motor');
    c.derived = c.derived.map((d) => (d.name === 'temperatureRiseC' ? { ...d, expr: '0' } : d));
    c.behavior = { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: 'ratedFlowGpm' };
    const r = executeValidateUnitOp({ contract: c });
    assert.equal(r.verdict, 'REJECTED');
    assert.equal(r.gates.physicsAlignment.passed, false);
    const item = r.revisionPlan.find((i) => i.gate === 'physicsAlignment' && /shaft power/.test(i.problem));
    assert.ok(item, JSON.stringify(r.revisionPlan));
    assert.equal(item.severity, 'ERROR');
    assert.match(item.fix!, /shaftKw/);
  });

  it('rejects a declared spray dryer that never evaporates its water', () => {
    const c = clone(SPRAY_DRYER_CONTRACT) as UnitOpContract;
    c.archetype = 'spray-dryer';
    c.phaseChanges = (c.phaseChanges ?? []).filter((pc) => pc.to !== 'GAS');
    const a = physicsAlignment(c);
    assert.ok(a.errors.some((e) => e.path === 'phaseChanges' && /LIQUID→GAS/.test(e.message)), JSON.stringify(a.errors));
  });

  it('holds a storage tank to its mode', () => {
    const c = clone(PROCESS_HEATER_CONTRACT) as UnitOpContract;
    c.archetype = 'storage-tank';
    const a = physicsAlignment(c);
    assert.ok(a.errors.some((e) => e.path === 'behavior.mode'));
  });

  it('only warns when the archetype is read from the words, and says how to make it binding', () => {
    const c = clone(PUMP_CONTRACT) as UnitOpContract;
    delete c.archetype;
    c.derived = c.derived.filter((d) => d.name !== 'npshAvailableFt');
    c.constraints = c.constraints.filter((x) => x.id !== 'npsh');
    const r = executeValidateUnitOp({ contract: c });
    assert.equal(r.verdict, 'ACCEPTED', r.revisionGuidance);
    assert.equal(r.gates.physicsAlignment.decidedBy, 'inferred');
    assert.ok(r.gates.physicsAlignment.warnings.some((w) => /NPSH/.test(w)));
    assert.ok(r.revisionPlan.some((i) => i.path === 'archetype' && /archetype: 'pump'/.test(i.fix!)));
  });

  it('refuses an archetype that does not exist, naming the real ones', () => {
    const c = { ...clone(PUMP_CONTRACT), archetype: 'warp-drive' };
    const r = executeValidateUnitOp({ contract: c });
    assert.equal(r.verdict, 'REJECTED');
    assert.match(r.gates.staticAnalysis.errors.join('\n'), /not an archetype.*pump/);
  });

  it('accepts custom equipment without holding it to anything', () => {
    const c = { ...clone(PUMP_CONTRACT), archetype: 'custom' };
    const r = executeValidateUnitOp({ contract: c });
    assert.equal(r.gates.physicsAlignment.decidedBy, 'custom');
    assert.equal(r.gates.physicsAlignment.warnings.length, 0);
  });
});

describe('physics alignment: energy and the second law at the design point', () => {
  it('catches an exchanger whose cold side leaves hotter than the hot side comes in', () => {
    const c = clone(TWO_STREAM_EXCHANGER_CONTRACT);
    // A duty that ignores the temperatures: 2000 kW into 3 kg/s of water is +160 °C.
    c.derived = c.derived.map((d) => (d.name === 'dutyKw' ? { ...d, expr: '2000' } : d));
    const a = physicsAlignment(c, evaluateUnitOp(c));
    assert.ok(a.errors.some((e) => /Temperature cross/.test(e.message) && e.path === 'outlets.cold_out'), JSON.stringify(a.errors));
    const r = executeValidateUnitOp({ contract: c });
    assert.equal(r.verdict, 'REJECTED');
  });

  it('catches channels whose sides do not trade the same heat', () => {
    const c = clone(TWO_STREAM_EXCHANGER_CONTRACT);
    c.outlets = c.outlets!.map((o) => (o.port === 'cold_out' ? { ...o, temperatureC: 'port.cold_in.temperatureC + 1' } : o));
    const a = physicsAlignment(c, evaluateUnitOp(c));
    assert.ok(a.warnings.some((w) => /does not balance/.test(w.message)), JSON.stringify(a.warnings));
  });

  it('flags an outlet heated from nowhere, and a duty too small for the temperature it claims', () => {
    const c = clone(PROCESS_HEATER_CONTRACT) as UnitOpContract;
    c.archetype = 'custom';
    c.behavior = { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm' };
    let a = physicsAlignment(c, evaluateUnitOp(c));
    assert.ok(a.warnings.some((w) => /nothing in the contract supplies it/.test(w.message)), JSON.stringify(a.warnings));
    c.behavior = { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', dutyKw: 'usedKw / 4' };
    a = physicsAlignment(c, evaluateUnitOp(c));
    assert.ok(a.warnings.some((w) => /short of/.test(w.message)), JSON.stringify(a.warnings));
    // The heater as written balances: no energy finding.
    const ok = physicsAlignment(PROCESS_HEATER_CONTRACT, evaluateUnitOp(PROCESS_HEATER_CONTRACT));
    assert.ok(!ok.warnings.some((w) => /kW/.test(w.message)), JSON.stringify(ok.warnings));
  });
});

describe('the engine counter-offers when a contract\'s own checks fail', () => {
  it('names the filter area that makes air-to-cloth hold', () => {
    const c = clone(DUST_COLLECTOR_CONTRACT);
    c.parameters = c.parameters.map((p) => (p.name === 'filterAreaFt2' ? { ...p, value: 300 } : p));
    const r = executeValidateUnitOp({ contract: c });
    assert.equal(r.verdict, 'REJECTED');
    const fix = r.suggestedFixes?.find((f) => f.parameter === 'filterAreaFt2');
    assert.ok(fix, JSON.stringify(r.suggestedFixes));
    assert.match(r.revisionGuidance, /set filterAreaFt2 to/);
    const item = r.revisionPlan.find((i) => i.path === 'constraints.air-to-cloth');
    assert.match(item!.fix!, /set (filterAreaFt2|maxAirToCloth) to/);
    // Taking the counter-offer is accepted.
    c.parameters = c.parameters.map((p) => (p.name === 'filterAreaFt2' ? { ...p, value: fix.value } : p));
    assert.equal(executeValidateUnitOp({ contract: c }).verdict, 'ACCEPTED');
  });
});

describe('the design brief hands the requirements over up front', () => {
  it('gives a pump brief its requirements, its example and the archetype to declare', () => {
    const r = executeDesignUnitOp({ description: 'a centrifugal pump moving syrup to the filler' });
    assert.equal(r.phasePlan.archetype?.id, 'pump');
    assert.ok(r.phasePlan.archetype?.requirements?.some((q) => q.id === 'power'));
    assert.match(r.brief, /archetype: 'pump'/);
    assert.ok(r.archetypeExample, 'pump example');
  });

  it('every archetype has requirements and a mode', () => {
    for (const a of PHASE_ARCHETYPES) {
      assert.ok(a.behaviorModes?.length, a.id);
      assert.ok(a.requirements?.length, a.id);
    }
  });
});
