import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
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
import { simulateProcess } from '../engine.js';

/**
 * The run's own heat and mass balance. Mass must close on every line, to
 * rounding: a line that does not is an engine fault. Energy is the check on
 * a contract: a unit that heats, cools or changes phase must state a duty its
 * streams bear out.
 */

const place = (unit: string, id: string, options: Parameters<typeof createStandardUnitOp>[1] = {}): ProcessNode => {
  const item = findStandardUnitOp(unit);
  assert.ok(item, `catalog has "${unit}"`);
  return { ...createStandardUnitOp(item, options), id, name: id };
};

const designed = (contract: UnitOpContract, id: string): ProcessNode => ({ ...contractToProcessNode(contract, { position: { x: 0, y: 0 } }), id, name: id });

const pipe = (from: ProcessNode, to: ProcessNode, fromPort = from.outputs[0]!.id, toPort = to.inputs[0]!.id): ProcessEdge =>
  ({
    id: `${from.id}:${fromPort}->${to.id}:${toPort}`,
    sourceNodeId: from.id,
    targetNodeId: to.id,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 40, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: { name: 'Water', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 15 } }
  }) as unknown as ProcessEdge;

const line = (nodes: ProcessNode[], edges: ProcessEdge[]): ProcessGraph => {
  let g = { id: 'balance-test', name: 'balance test', version: '1.0.0', metadata: {}, nodes, edges: [] } as unknown as ProcessGraph;
  for (const e of edges) g = addStreamToGraph(g, e);
  return g;
};

const water = () => ({ ...place('feed', 'water', { supplyKgPerHour: 2000, composition: { water: 1 } }), config: { ...(place('feed', 'w').config as object), supplyKgPerHour: 2000, composition: { water: 1 }, temperatureC: 15, specificHeatKjPerKgK: 4.18, densityGPerCm3: 1 } }) as ProcessNode;

/** A heater line: 2,000 kg/h of water at 15 °C heated to 60 °C needs 2000/3600 × 4.18 × 45 = 104.5 kW. */
function heaterLine(contract: UnitOpContract): ProcessGraph {
  const feed = water();
  const heater = designed(contract, 'heater');
  const out = place('product', 'out');
  return line([feed, heater, out], [pipe(feed, heater), pipe(heater, out)]);
}

const heaterTo60: UnitOpContract = { ...PROCESS_HEATER_CONTRACT, parameters: PROCESS_HEATER_CONTRACT.parameters.map((p) => (p.name === 'targetC' ? { ...p, value: 60 } : p)) };

describe('the heat and mass balance', () => {
  it('closes mass on every example line, to rounding', () => {
    for (const [name, g] of Object.entries(EXAMPLE_LINES)) {
      const m = simulateProcess(g, 90).balance.mass;
      assert.ok(m.closes, `${name}: ${m.closureKg} kg unaccounted (${m.relativeError})`);
      for (const [c, b] of Object.entries(m.components)) assert.ok(Math.abs(b.closureKg) < 1e-3 * Math.max(1, b.inKg, b.outKg), `${name} ${c}: ${JSON.stringify(b)}`);
    }
  });

  it('closes through breakdowns, over different seeds and run lengths', () => {
    let g = EXAMPLE_LINES['juice-concentration-line']!;
    g = { ...g, nodes: g.nodes.map((n) => (n.id === 'juice-ev-201' || n.id === 'juice-p-401' ? { ...n, config: { ...(n.config as object), contract: { ...((n.config as { contract: UnitOpContract }).contract), reliability: { mtbfMinutes: '20', mttrMinutes: '4' } } } } : n)) as ProcessNode[] };
    for (const [minutes, seed] of [[45, 1], [90, 7], [200, 42]] as const) {
      const r = simulateProcess(g, minutes, { seed });
      assert.ok(Object.values(r.nodeReports).some((x) => x.downTimeSeconds > 0), 'breakdowns happened');
      assert.ok(r.balance.mass.closes, `${minutes} min, seed ${seed}: ${r.balance.mass.closureKg} kg (${r.balance.mass.relativeError})`);
    }
  });

  it('counts what a filler draws into containers, and what tanks held at the start', () => {
    const m = simulateProcess(EXAMPLE_LINES['paint-canning-line']!, 90).balance.mass;
    assert.ok(m.breakdown.intoContainersKg > 0, 'paint went into cans');
    assert.ok(m.breakdown.heldAtStartKg > 0, 'the surge tank starts with paint in it');
    assert.ok(m.closes);
  });

  it('books what reactions make and use, so each component closes', () => {
    const feed = { ...place('feed', 'feed'), config: { ...(place('feed', 'f').config as object), supplyKgPerHour: 1800, composition: { reactant: 0.3, water: 0.7 }, temperatureC: 20 } } as ProcessNode;
    const cstr = place('cstr', 'cstr');
    const out = place('product', 'out');
    const m = simulateProcess(line([feed, cstr, out], [pipe(feed, cstr), pipe(cstr, out)]), 60).balance.mass;
    assert.ok(m.closes, `${m.closureKg}`);
    assert.ok(m.components.reactant!.generatedKg < 0, 'reactant used');
    assert.ok(Math.abs(m.components.reactant!.generatedKg + m.components.product!.generatedKg) < 0.5, 'what is used is what is made');
    assert.ok(Math.abs(m.components.product!.closureKg) < 1e-3);
  });

  it('agrees with a heater whose duty follows from its stream', () => {
    const r = simulateProcess(heaterLine(heaterTo60), 60);
    const e = r.balance.energy.find((x) => x.nodeId === 'heater')!;
    assert.equal(e.kind, 'heater');
    assert.equal(e.verdict, 'consistent', e.note);
    // 104.5 kW for an hour, less the first second before liquid arrives.
    assert.ok(Math.abs(e.impliedHeatKwh - 104.5) < 1, `${e.impliedHeatKwh} kWh`);
    assert.ok(Math.abs(e.statedDutyKwh! - e.impliedHeatKwh) < 0.5);
  });

  it('catches a heater that states its rated duty rather than the duty its stream takes', () => {
    // A model's easy mistake: dutyKw = ratedKw. The outlet still reaches 60 °C, so nothing else looks wrong.
    const claims: UnitOpContract = { ...heaterTo60, behavior: { ...heaterTo60.behavior, dutyKw: 'ratedKw' } as UnitOpContract['behavior'] };
    const r = simulateProcess(heaterLine(claims), 60);
    const e = r.balance.energy.find((x) => x.nodeId === 'heater')!;
    assert.equal(e.verdict, 'mismatch');
    assert.ok(e.statedDutyKwh! > 800 && e.impliedHeatKwh < 110, JSON.stringify(e));
    assert.match(e.note, /does not follow from its temperatures and flows/);
  });

  it('catches a heater that raises the temperature and states no duty at all', () => {
    const { dutyKw: _drop, ...rest } = heaterTo60.behavior as { dutyKw?: string };
    const free: UnitOpContract = { ...heaterTo60, behavior: rest as UnitOpContract['behavior'] };
    const e = simulateProcess(heaterLine(free), 30).balance.energy.find((x) => x.nodeId === 'heater')!;
    assert.equal(e.verdict, 'mismatch');
    assert.match(e.note, /states no duty/);
  });

  it('closes an exchanger whose two sides trade heat, and a recycle loop through it', () => {
    const syrup = { ...place('feed', 'syrup'), config: { ...(place('feed', 's').config as object), supplyKgPerHour: 3000, composition: { water: 0.8, sugar: 0.2 }, temperatureC: 15, specificHeatKjPerKgK: 3.7, densityGPerCm3: 1.08 } } as ProcessNode;
    const pump = place('pump', 'pump', { parameters: { designFlowRateGpm: 20 } });
    const regen = place('two-stream-exchanger', 'regen', { parameters: { areaM2: 20, uKwPerM2K: 0.8, foulingFactor: 0.85, coldMaxC: 85 } });
    const heater = place('heater', 'heater', { parameters: { targetC: 90, ratedKw: 300, ratedFlowGpm: 40 } });
    const out = place('product', 'out');
    const g = line(
      [syrup, pump, regen, heater, out],
      [pipe(syrup, pump), pipe(pump, regen, undefined, 'cold_in'), pipe(regen, heater, 'cold_out'), pipe(heater, regen, undefined, 'hot_in'), pipe(regen, out, 'hot_out')]
    );
    const r = simulateProcess(g, 60);
    assert.ok(r.balance.mass.closes, `${r.balance.mass.closureKg}`);
    const ex = r.balance.energy.find((x) => x.nodeId === 'regen')!;
    assert.equal(ex.kind, 'exchanger');
    assert.equal(ex.verdict, 'consistent', ex.note);
    const h = r.balance.energy.find((x) => x.nodeId === 'heater')!;
    assert.equal(h.verdict, 'consistent', h.note);
  });
});
