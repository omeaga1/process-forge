import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { ProcessEdge, ProcessGraph, ProcessNode } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

const L = ['CONTINUOUS_VOLUME'];

const node = (id: string, kind: ProcessNode['kind'], config: Record<string, unknown>, inputs = L, outputs = L): ProcessNode =>
  ({
    id,
    name: id,
    kind,
    position: { x: 0, y: 0 },
    inputs: inputs.map((d, i) => ({ id: `in-${i}`, name: `in ${i}`, type: 'FLUID_INPUT', flowDimension: d })),
    outputs: outputs.map((d, i) => ({ id: `out-${i}`, name: `out ${i}`, type: 'FLUID_OUTPUT', flowDimension: d })),
    config
  }) as unknown as ProcessNode;

const pipe = (from: string, to: string): ProcessEdge =>
  ({
    id: `${from}->${to}`,
    sourceNodeId: from,
    targetNodeId: to,
    sourcePortId: 'out-0',
    targetPortId: 'in-0',
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 50, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: { name: 'Water', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 } }
  }) as unknown as ProcessEdge;

const line = (id: string, nodes: ProcessNode[], edges: ProcessEdge[]): ProcessGraph =>
  ({ id, name: id, version: '1.0.0', metadata: {}, nodes, edges }) as unknown as ProcessGraph;

const water = (temperatureCelsius: number) => ({ name: 'Water', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius, specificHeatKjPerKgK: 4.186 });

/** 30 gal/min of water, in kg/s. */
const KG_PER_S = (30 / 60) * 3.785411784;

/** A hot tank drains at 30 gal/min through an exchanger into a tank with no outlet. */
const coolingLine = (exchanger: Record<string, unknown>) =>
  line('cooling', [
    node('hot', 'SURGE_TANK', { capacityGallons: 2000, initialLevelGallons: 1500, maxDischargeRateGpm: 30, fluid: water(60) }),
    node('hx', 'HEAT_EXCHANGER', { shellSideFlowGpm: 80, ...exchanger }),
    node('cold', 'SURGE_TANK', { capacityGallons: 5000, initialLevelGallons: 0 }, L, [])
  ], [pipe('hot', 'hx'), pipe('hx', 'cold')]);

describe('Heat: exchangers', () => {
  it('with duty to spare, brings the flow to its target', () => {
    const r = simulateProcess(coolingLine({ targetTemperatureCelsius: 30, dutyKw: 500 }), 20);
    const hx = r.nodeReports['hx']!;
    assert.ok(Math.abs(hx.fluid!.averageOutletTemperatureC! - 30) < 0.2, `outlet ${hx.fluid!.averageOutletTemperatureC}`);
    assert.ok(Math.abs(r.nodeReports['cold']!.fluid!.temperatureC - 30) < 0.2);
    assert.equal(hx.heat!.dutyLimitedPercentage, 0);
    // Q = m cp dT = 1.893 kg/s x 4.186 x 30 K = 237.7 kW.
    const expected = KG_PER_S * 4.186 * 30;
    assert.ok(Math.abs(hx.heat!.averageDutyKw! - expected) < 2, `duty ${hx.heat!.averageDutyKw} vs ${expected}`);
    assert.ok(Math.abs(hx.heat!.energyKwh - (expected * 20) / 60) < 5, `energy ${hx.heat!.energyKwh}`);
  });

  it('when undersized, runs at its rated duty and falls short of the target', () => {
    const r = simulateProcess(coolingLine({ targetTemperatureCelsius: 30, dutyKw: 100 }), 20);
    const hx = r.nodeReports['hx']!;
    const outlet = 60 - 100 / (KG_PER_S * 4.186);
    assert.ok(Math.abs(hx.fluid!.averageOutletTemperatureC! - outlet) < 0.2, `outlet ${hx.fluid!.averageOutletTemperatureC} vs ${outlet}`);
    assert.ok(hx.heat!.dutyLimitedPercentage! > 99);
    assert.ok(Math.abs(hx.heat!.averageDutyKw! - 100) < 0.5);
    // Temperature is not throughput: the same gallons get through.
    assert.ok(Math.abs(r.nodeReports['cold']!.fluid!.receivedGallons - 600) < 2);
  });

  it('heats as well as cools', () => {
    const r = simulateProcess(
      line('heating', [
        node('feed', 'SURGE_TANK', { capacityGallons: 2000, initialLevelGallons: 1500, maxDischargeRateGpm: 30, fluid: water(10) }),
        node('hx', 'HEAT_EXCHANGER', { targetTemperatureCelsius: 50 }),
        node('out', 'SURGE_TANK', { capacityGallons: 5000, initialLevelGallons: 0 }, L, [])
      ], [pipe('feed', 'hx'), pipe('hx', 'out')]),
      10
    );
    assert.ok(Math.abs(r.nodeReports['hx']!.fluid!.averageOutletTemperatureC! - 50) < 0.2);
    assert.equal(r.nodeReports['hx']!.heat!.ratedDutyKw, undefined, 'no duty set: unlimited');
  });

  it('without a target it only passes the liquid through', () => {
    const r = simulateProcess(coolingLine({ dutyKw: 250 }), 10);
    assert.equal(r.nodeReports['hx']!.heat, undefined);
    assert.ok(Math.abs(r.nodeReports['hx']!.fluid!.averageOutletTemperatureC! - 60) < 0.01);
  });
});

/** 100 gal of water: 1 min fill, 2 min react at 70 °C, 2 min discharge at 50 gal/min. */
const reactorLine = (jacketDutyKw?: number) =>
  line('reactor', [
    node('r', 'BATCH_REACTOR', {
      batchVolumeGallons: 100,
      fillDurationMinutes: 1,
      reactionDurationMinutes: 2,
      dischargeRateGpm: 50,
      fluid: water(70),
      ...(jacketDutyKw !== undefined ? { jacketDutyKw } : {})
    }, [], L),
    node('tank', 'SURGE_TANK', { capacityGallons: 100000, initialLevelGallons: 0 }, L, [])
  ], [pipe('r', 'tank')]);

describe('Heat: reactor jackets', () => {
  // A batch charges at 20 °C: 100 gal x 3.785 kg x 4.186 kJ/kg.K x 50 K = 79,229 kJ.
  const heatUpKj = 100 * 3.785411784 * 4.186 * 50;

  it('a jacket that is too small stretches every batch', () => {
    const jacket = 50; // kW: 1,585 s, about 26 min, to heat a batch
    const heatSeconds = heatUpKj / jacket;
    const r = simulateProcess(reactorLine(jacket), 120);
    const rep = r.nodeReports['r']!;
    // A batch: 1 min fill + heat-up + 2 min react + 2 min discharge.
    const cycle = 60 + heatSeconds + 120 + 120;
    assert.equal(rep.fluid!.batches, Math.floor((120 * 60) / cycle), `batches ${rep.fluid!.batches}, cycle ${cycle} s`);
    assert.equal(rep.heat!.jacketDutyKw, jacket);
    const phases = new Set(r.telemetryLog.filter((t) => t.nodeId === 'r').map((t) => t.phase));
    assert.ok(phases.has('HEATING'), 'telemetry shows the batch heating');
    // Everything it sent left at the reaction temperature.
    assert.ok(Math.abs(rep.fluid!.averageOutletTemperatureC! - 70) < 0.01);
    assert.ok(Math.abs(r.nodeReports['tank']!.fluid!.temperatureC - 70) < 0.01);
    // Heating time and energy agree with the jacket running flat out.
    assert.ok(Math.abs(rep.heat!.energyKwh - (jacket * rep.heat!.heatingTimeSeconds!) / 3600) < 0.2);
  });

  it('with no jacket duty, batches reach temperature at once, and the heat is still counted', () => {
    const r = simulateProcess(reactorLine(), 60);
    const rep = r.nodeReports['r']!;
    assert.equal(rep.fluid!.batches, 12, '5 min batches, as before');
    assert.equal(rep.heat!.jacketDutyKw, undefined);
    // 12 or 13 batches charged in the hour (the 13th may be under way).
    const perBatchKwh = heatUpKj / 3600;
    assert.ok(rep.heat!.energyKwh >= 12 * perBatchKwh - 0.5 && rep.heat!.energyKwh <= 13 * perBatchKwh + 0.5, `energy ${rep.heat!.energyKwh}`);
  });

  it('a big jacket costs little time', () => {
    const slow = simulateProcess(reactorLine(50), 120).nodeReports['r']!.fluid!.batches!;
    const fast = simulateProcess(reactorLine(2000), 120).nodeReports['r']!.fluid!.batches!;
    assert.ok(fast > slow * 4, `fast ${fast}, slow ${slow}`);
  });
});

describe('Heat: mixing', () => {
  it('a tank holds the volume-weighted temperature of what it received', () => {
    // 100 gal at 20 °C, then one 100 gal batch at 70 °C: 45 °C.
    const g = line('mix', [
      node('r', 'BATCH_REACTOR', { batchVolumeGallons: 100, fillDurationMinutes: 1, reactionDurationMinutes: 1, dischargeRateGpm: 100, fluid: water(70) }, [], L),
      node('tank', 'SURGE_TANK', { capacityGallons: 1000, initialLevelGallons: 100, fluid: water(20) }, L, [])
    ], [pipe('r', 'tank')]);
    const r = simulateProcess(g, 3.5);
    const t = r.nodeReports['tank']!.fluid!;
    assert.ok(Math.abs(t.levelGallons - 200) < 1, `level ${t.levelGallons}`);
    assert.ok(Math.abs(t.temperatureC - 45) < 0.3, `temperature ${t.temperatureC}`);
  });
});
