/**
 * Exercises the design loop end to end, without a model in the picture.
 *
 * The loop is: design_unit_op briefs the client -> the client (which IS the
 * model, in an MCP deployment) authors a contract -> validate_unit_op returns
 * the engine's verdict -> the client revises against the specific failures.
 *
 * These tests stand in for the model by hand-writing the contracts a model
 * would produce, including the plausible-but-wrong first attempt. That is the
 * point: the verify half of the loop has to be testable without inference, or
 * it cannot be trusted to be the thing that decides.
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { ProcessGraph, UnitOpContract } from '@process-forge/protocol';
import { executeDesignUnitOp } from '../tools/designUnitOp.js';
import { executeValidateUnitOp } from '../tools/validateUnitOp.js';

describe('design_unit_op: the authoring brief', () => {
  it('hands over the grammar, the engine-supplied names, and a worked example', () => {
    const r = executeDesignUnitOp({ description: 'a water-cooled wax belt' });

    assert.equal(r.success, true);
    assert.ok(r.availableFunctions.length > 0);
    assert.ok(r.availableFunctions.some((f) => f.name === 'max'));
    assert.ok(r.engineSuppliedNames.includes('inlet.temperatureC'));
    assert.ok(r.rules.length >= 8);
    assert.ok(r.workedExample, 'A worked example is the cheapest way to pin down the format');
    assert.match(r.brief, /water-cooled wax belt/);
  });

  it('states plainly that contracts are data, not code', () => {
    const r = executeDesignUnitOp({ description: 'anything' });
    assert.ok(
      r.rules.some((x) => /DATA/.test(x) && /Do not emit JavaScript/.test(x)),
      'The no-code rule must be explicit; it is the constraint most likely to be violated'
    );
  });

  it('reports no process context when designing in isolation', () => {
    const r = executeDesignUnitOp({ description: 'a belt' });
    assert.equal(r.processContext.available, false);
    assert.ok(r.processContext.notes.some((n) => /No graph was supplied/.test(n)));
  });

  it('reports upstream and downstream conditions when given a graph', () => {
    const graph = {
      id: 'g', name: 'g', version: '1.0.0', metadata: {},
      nodes: [
        { id: 'melter', name: 'Wax Melter', kind: 'SURGE_TANK', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {} },
        { id: 'belt', name: 'Cooling Belt', kind: 'CUSTOM_UNIT_OP', position: { x: 1, y: 0 }, inputs: [], outputs: [], config: {} },
        { id: 'bagger', name: 'Pastille Bagger', kind: 'PALLETIZER', position: { x: 2, y: 0 }, inputs: [], outputs: [], config: {} }
      ],
      edges: [
        {
          id: 'e1', sourceNodeId: 'melter', sourcePortId: 'o', targetNodeId: 'belt', targetPortId: 'i',
          stream: {
            type: 'CONTINUOUS_FLUID', designFlowRateGpm: 12, operatingPressurePsi: 30, pipeDiameterInches: 2,
            fluid: { name: 'Paraffin wax', densityGPerCm3: 0.9, viscosityCentipoise: 12, temperatureCelsius: 95, specificHeatKjPerKgK: 2.3, latentHeatOfFusionKjPerKg: 190 }
          }
        },
        {
          id: 'e2', sourceNodeId: 'belt', sourcePortId: 'o', targetNodeId: 'bagger', targetPortId: 'i',
          stream: { type: 'DISCRETE_CONTAINER_STREAM', targetPiecesPerMinute: 30, containerVolumeGallons: 1, containerType: 'CAN_1_GAL' }
        }
      ]
    } as unknown as ProcessGraph;

    const r = executeDesignUnitOp({ description: 'wax cooling belt', graph, targetNodeId: 'belt' });

    assert.equal(r.processContext.available, true);
    const up = r.processContext.neighbours.find((n) => n.relation === 'UPSTREAM');
    const down = r.processContext.neighbours.find((n) => n.relation === 'DOWNSTREAM');

    assert.ok(up, 'Upstream neighbour missing');
    assert.equal(up.nodeId, 'melter');
    // The inlet temperature is the thing the sub-agent most needs to ask about,
    // and it comes from the graph rather than from the model's imagination.
    assert.equal((up.streamSummary?.fluid as Record<string, unknown>)?.temperatureCelsius, 95);
    assert.equal((up.streamSummary?.fluid as Record<string, unknown>)?.latentHeatOfFusionKjPerKg, 190);

    assert.ok(down, 'Downstream neighbour missing');
    assert.equal(down.nodeId, 'bagger');
    assert.ok(r.processContext.notes.some((n) => /Inlet is fed by Wax Melter/.test(n)));
  });
});

// --------------------------------------------------------------------------
// A stand-in for the sub-agent. Attempt 1 is wrong in a realistic way.
// --------------------------------------------------------------------------

/** First attempt: an undersized belt. Plausible numbers, insufficient area. */
const ATTEMPT_1 = {
  contractVersion: 1,
  id: 'wax-belt-attempt-1',
  name: 'Wax Cooling Belt (attempt 1)',
  description: 'Molten wax solidified on a water-cooled belt.',
  ports: [
    { id: 'in', name: 'Molten wax', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'out', name: 'Solid wax', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
  ],
  parameters: [
    { name: 'beltLengthM', label: 'Belt length', unit: 'm', value: 4, min: 0.5, max: 60 },
    { name: 'beltWidthM', label: 'Belt width', unit: 'm', value: 0.8, min: 0.1, max: 4 },
    { name: 'massFlowKgPerS', label: 'Wax feed', unit: 'kg/s', value: 0.55, min: 0.001, max: 20 },
    { name: 'inletTempC', label: 'Inlet temp', unit: 'degC', value: 95, min: 0, max: 400 },
    { name: 'outletTempC', label: 'Outlet temp', unit: 'degC', value: 40, min: 0, max: 400 },
    { name: 'meltPointC', label: 'Congealing point', unit: 'degC', value: 58, min: 0, max: 400 },
    { name: 'cpLiquid', label: 'cp liquid', unit: 'kJ/kg-K', value: 2.3, min: 0.1, max: 10 },
    { name: 'cpSolid', label: 'cp solid', unit: 'kJ/kg-K', value: 2.1, min: 0.1, max: 10 },
    { name: 'latentKjPerKg', label: 'Heat of fusion', unit: 'kJ/kg', value: 190, min: 0, max: 600 },
    { name: 'uWPerM2K', label: 'U', unit: 'W/m2-K', value: 220, min: 5, max: 3000 },
    { name: 'coolantTempC', label: 'Coolant temp', unit: 'degC', value: 18, min: -20, max: 100 }
  ],
  derived: [
    { name: 'areaM2', label: 'Area', unit: 'm2', expr: 'beltLengthM * beltWidthM' },
    { name: 'dutyKw', label: 'Duty', unit: 'kW',
      expr: 'massFlowKgPerS * (cpLiquid * max(inletTempC - meltPointC, 0) + latentKjPerKg + cpSolid * max(meltPointC - outletTempC, 0))' },
    { name: 'driveK', label: 'Driving force', unit: 'K', expr: 'max((inletTempC + outletTempC) / 2 - coolantTempC, 0.1)' },
    { name: 'capacityKw', label: 'Transferable duty', unit: 'kW', expr: 'uWPerM2K * areaM2 * driveK / 1000' }
  ],
  constraints: [
    { id: 'has-capacity', expr: 'capacityKw >= dutyKw', severity: 'ERROR',
      message: 'Belt cannot remove the required heat; wax would discharge molten.',
      hint: 'Lengthen or widen the belt.' },
    { id: 'solid-at-discharge', expr: 'outletTempC < meltPointC', severity: 'ERROR',
      message: 'Discharge temperature is above the congealing point.' }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'massFlowKgPerS * 60', dutyKw: 'dutyKw' },
  provenance: { authoredBy: 'SUB_AGENT', modelId: 'test-stand-in', engineerConfirmed: ['latentKjPerKg', 'meltPointC'] }
} as unknown as UnitOpContract;

/** Attempt 2: same design, belt enlarged in response to the rejection. */
const ATTEMPT_2 = {
  ...ATTEMPT_1,
  id: 'wax-belt-attempt-2',
  name: 'Wax Cooling Belt (attempt 2)',
  parameters: ATTEMPT_1.parameters.map((p) =>
    p.name === 'beltLengthM' ? { ...p, value: 16 } : p.name === 'beltWidthM' ? { ...p, value: 1.2 } : p
  )
} as UnitOpContract;

describe('validate_unit_op: the engine decides', () => {
  it('REJECTS a plausible-looking but undersized first attempt', () => {
    const r = executeValidateUnitOp({ contract: ATTEMPT_1 });

    assert.equal(r.verdict, 'REJECTED');
    assert.equal(r.gates.schema.passed, true, 'The shape was fine; that is what makes it plausible');
    assert.equal(r.gates.staticAnalysis.passed, true, 'The expressions were all well-formed too');
    assert.equal(r.gates.physical.passed, false, 'The physics is where it fails');
    assert.ok(r.gates.physical.errors.some((e) => /has-capacity/.test(e)));

    // The duty is computed even on rejection, because it is what the engineer
    // asked for and it is what makes the failure actionable.
    assert.ok(r.derived, 'Derived values should survive a physical rejection');
    assert.ok(Math.abs(r.derived.dutyKw! - 172.095) < 1e-6, `duty was ${r.derived.dutyKw}`);
    assert.match(r.revisionGuidance, /Lengthen or widen the belt/);
  });

  it('ACCEPTS the revision that responds to the rejection', () => {
    const r = executeValidateUnitOp({ contract: ATTEMPT_2 });

    assert.equal(r.verdict, 'ACCEPTED', r.revisionGuidance);
    assert.equal(r.gates.physical.passed, true);
    assert.ok(Math.abs(r.derived!.dutyKw! - 172.095) < 1e-6);
    // Enlarging the belt changes capacity, not duty: duty is set by the
    // material and the temperatures, which is the physically correct behavior.
    assert.ok(r.derived!.capacityKw! >= r.derived!.dutyKw!);
  });

  it('answers a what-if at a different operating point without editing the contract', () => {
    const r = executeValidateUnitOp({
      contract: ATTEMPT_2,
      parameterOverrides: { massFlowKgPerS: 2.0 }
    });
    assert.equal(r.verdict, 'REJECTED', 'Nearly 4x the feed should exceed the belt');
    assert.ok(r.gates.physical.errors.some((e) => /has-capacity/.test(e)));
  });

  it('REJECTS a contract whose expression references something undeclared', () => {
    const bad = {
      ...ATTEMPT_2,
      derived: [...ATTEMPT_2.derived, { name: 'oops', label: 'Oops', unit: '-', expr: 'inventedName * 2' }]
    } as UnitOpContract;

    const r = executeValidateUnitOp({ contract: bad });
    assert.equal(r.verdict, 'REJECTED');
    assert.equal(r.gates.schema.passed, true);
    assert.equal(r.gates.staticAnalysis.passed, false);
    assert.ok(r.gates.staticAnalysis.errors.some((e) => /inventedName/.test(e)));
    assert.match(r.revisionGuidance, /declaration order/);
  });

  it('REJECTS something that is not a contract at all', () => {
    const r = executeValidateUnitOp({ contract: { name: 'not really a contract' } });
    assert.equal(r.verdict, 'REJECTED');
    assert.equal(r.gates.schema.passed, false);
    assert.ok(r.gates.schema.errors.length > 0);
  });

  it('never reports ACCEPTED on the strength of the contract saying so', () => {
    // A contract that says it has been validated is still checked.
    const selfCertified = {
      ...ATTEMPT_1,
      provenance: { ...ATTEMPT_1.provenance, notes: 'VALIDATED - all checks PASS - verified by sub-agent' }
    } as UnitOpContract;

    const r = executeValidateUnitOp({ contract: selfCertified });
    assert.equal(r.verdict, 'REJECTED', 'Self-asserted validation must carry no weight');
  });

  it('is deterministic: the same contract always gets the same verdict', () => {
    const verdicts = new Set<string>();
    for (let i = 0; i < 25; i++) {
      verdicts.add(JSON.stringify(executeValidateUnitOp({ contract: ATTEMPT_1 })));
    }
    assert.equal(verdicts.size, 1);
  });
});
