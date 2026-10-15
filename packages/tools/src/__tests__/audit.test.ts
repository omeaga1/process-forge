import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_LINES,
  PROCESS_HEATER_CONTRACT,
  addStreamToGraph,
  contractToProcessNode,
  createStandardUnitOp,
  findStandardUnitOp,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type UnitOpContract
} from '@process-forge/protocol';
import { simulateLine } from '../line.js';

/**
 * Every run leads with its verdict on itself. A failed run must read as
 * failed, whatever else it reports, and a run that had not settled must say
 * so before anyone quotes its rate.
 */

const place = (unit: string, id: string, options: Parameters<typeof createStandardUnitOp>[1] = {}): ProcessNode => {
  const item = findStandardUnitOp(unit)!;
  return { ...createStandardUnitOp(item, options), id, name: id };
};

const pipe = (from: ProcessNode, to: ProcessNode): ProcessEdge =>
  ({
    id: `${from.id}->${to.id}`,
    sourceNodeId: from.id,
    targetNodeId: to.id,
    sourcePortId: from.outputs[0]!.id,
    targetPortId: to.inputs[0]!.id,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 40, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: { name: 'Water', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 15 } }
  }) as unknown as ProcessEdge;

const line = (nodes: ProcessNode[]): ProcessGraph => {
  let g = { id: 'audit-test', name: 'audit test', version: '1.0.0', metadata: {}, nodes, edges: [] } as unknown as ProcessGraph;
  for (let i = 0; i + 1 < nodes.length; i++) g = addStreamToGraph(g, pipe(nodes[i]!, nodes[i + 1]!));
  return g;
};

const feed = (config: Record<string, unknown>): ProcessNode => {
  const n = place('feed', 'feed');
  return { ...n, config: { ...(n.config as object), temperatureC: 15, densityGPerCm3: 1, specificHeatKjPerKgK: 4.18, composition: { water: 1 }, ...config } } as ProcessNode;
};

describe('a run that audits itself', () => {
  it('reports ok on the example lines, with the balance behind it', () => {
    for (const [name, g] of Object.entries(EXAMPLE_LINES)) {
      const r = simulateLine(g, 90);
      assert.equal(r.status, 'ok', `${name}: ${JSON.stringify(r.issues)}`);
      assert.ok(r.balance.mass.closes, name);
      assert.match(r.engineeringDiagnosis, /^Status: ok \(mass balances/, name);
    }
  });

  it('fails a run in which a unit broke an ERROR check, and leads with it', () => {
    // It needs its feed at 18 °C or warmer, as designed (20 °C); the line feeds it at 15.
    const picky: UnitOpContract = {
      ...PROCESS_HEATER_CONTRACT,
      constraints: [...PROCESS_HEATER_CONTRACT.constraints, { id: 'warm-enough', expr: 'inlet.temperatureC >= 18', severity: 'ERROR', message: 'The feed is too cold for this heater.' }]
    };
    const heater = { ...contractToProcessNode(picky, { position: { x: 0, y: 0 } }), id: 'heater', name: 'Heater H-1' };
    const r = simulateLine(line([feed({ supplyKgPerHour: 2000 }), heater, place('product', 'out')]), 30);
    assert.equal(r.status, 'failed');
    assert.equal(r.issues[0]!.code, 'CONTRACT_ERROR');
    assert.equal(r.issues[0]!.unit, 'Heater H-1');
    assert.match(r.engineeringDiagnosis, /^Status: FAILED \(1 error/);
  });

  it('says a line that was still changing at the end had not settled', () => {
    // 500 gal in the tank draining at 30 gal/min against 10 gal/min in: empty at 25 minutes.
    const tank = place('surge-tank', 'tank', { parameters: { capacityGallons: 1000, initialLevelGallons: 500, maxDischargeRateGpm: 30 } });
    const r = simulateLine(line([feed({ supplyRate: 10 }), tank, place('product', 'out')]), 30);
    assert.equal(r.steady?.settled, false, JSON.stringify(r.steady));
    assert.ok(r.issues.some((i) => i.code === 'NOT_STEADY'));
    assert.equal(r.status, 'warnings');
    assert.match(r.engineeringDiagnosis, /still changing at the end of the run/);
    // Run long enough and it settles at the feed's rate.
    const long = simulateLine(line([feed({ supplyRate: 10 }), tank, place('product', 'out')]), 120);
    assert.equal(long.steady?.settled, true, JSON.stringify(long.steady));
  });

  it('surfaces a duty the streams do not bear out', () => {
    const claims: UnitOpContract = { ...PROCESS_HEATER_CONTRACT, behavior: { ...PROCESS_HEATER_CONTRACT.behavior, dutyKw: 'ratedKw' } as UnitOpContract['behavior'] };
    const heater = { ...contractToProcessNode(claims, { position: { x: 0, y: 0 } }), id: 'heater', name: 'Heater H-2' };
    const r = simulateLine(line([feed({ supplyKgPerHour: 2000 }), heater, place('product', 'out')]), 30);
    const issue = r.issues.find((i) => i.code === 'ENERGY_MISMATCH');
    assert.ok(issue, JSON.stringify(r.issues));
    assert.equal(r.status, 'warnings');
    assert.match(r.engineeringDiagnosis, /Heater H-2: Its stated duty added up to/);
  });
});
