import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { CONTINUOUS_DRYER_CONTRACT, CRYSTALLISER_CONTRACT, DECANTER_CENTRIFUGE_CONTRACT, type ProcessEdge, type ProcessGraph, type ProcessNode, type UnitOpContract } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/**
 * A magnesium sulfate crystallisation line, end to end: what the dryer and
 * the centrifuge do follows from what the crystalliser made, not from numbers
 * typed into each unit.
 */

const L = 'CONTINUOUS_VOLUME';
const node = (id: string, kind: ProcessNode['kind'], config: Record<string, unknown>, inputs: string[] = [], outputs: string[] = [], ids?: { in?: string[]; out?: string[] }): ProcessNode =>
  ({
    id,
    name: id,
    kind,
    position: { x: 0, y: 0 },
    inputs: inputs.map((d, i) => ({ id: ids?.in?.[i] ?? `in-${i}`, name: `in ${i}`, type: 'FLUID_INPUT', flowDimension: d })),
    outputs: outputs.map((d, i) => ({ id: ids?.out?.[i] ?? `out-${i}`, name: `out ${i}`, type: 'FLUID_OUTPUT', flowDimension: d })),
    config
  }) as unknown as ProcessNode;
const pipe = (from: string, to: string, fromPort: string, toPort = 'in-0', t = 20): ProcessEdge =>
  ({
    id: `${from}:${fromPort}->${to}`,
    sourceNodeId: from,
    targetNodeId: to,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 200, operatingPressurePsi: 30, pipeDiameterInches: 3, fluid: { name: 'Brine', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: t, specificHeatKjPerKgK: 3.6 } }
  }) as unknown as ProcessEdge;
const sink = (id: string) => node(id, 'SURGE_TANK', { capacityGallons: 1e6, initialLevelGallons: 0 }, [L], []);

const withParams = (c: UnitOpContract, over: Record<string, number>): UnitOpContract =>
  ({ ...c, parameters: c.parameters.map((p) => (p.name in over ? { ...p, value: over[p.name]! } : p)) }) as UnitOpContract;

const build = (cryst: UnitOpContract) =>
  ({
    id: 'epsom',
    name: 'epsom',
    version: '1.0.0',
    metadata: {},
    nodes: [
      node('feed', 'SURGE_TANK', { capacityGallons: 1e5, initialLevelGallons: 1e5, maxDischargeRateGpm: 200, fluid: { name: 'Brine', densityGPerCm3: 1.2, viscosityCentipoise: 1, temperatureCelsius: 25, composition: { water: 0.7, mgso4: 0.3 } } }, [L], [L]),
      node('cryst', 'CUSTOM_UNIT_OP', { contract: cryst }, [L], [L, L], { in: ['feed'], out: ['liquor', 'slurry'] }),
      node('cent', 'CUSTOM_UNIT_OP', { contract: withParams(DECANTER_CENTRIFUGE_CONTRACT, { ratedFlowGpm: 150, maxFlowGpm: 200, pasteSolidsPct: 70 }) }, [L], [L, L], { in: ['in'], out: ['centrate', 'solids'] }),
      node('dryer', 'CUSTOM_UNIT_OP', { contract: withParams(CONTINUOUS_DRYER_CONTRACT, { availableKw: 5000, productMoisturePct: 1 }) }, [L], [L, L], { in: ['in'], out: ['product', 'vapour'] }),
      sink('liquor'),
      sink('centrate'),
      sink('product'),
      sink('vapour')
    ],
    edges: [
      pipe('feed', 'cryst', 'out-0', 'feed', 25),
      pipe('cryst', 'liquor', 'liquor'),
      pipe('cryst', 'cent', 'slurry', 'in'),
      pipe('cent', 'centrate', 'centrate'),
      pipe('cent', 'dryer', 'solids', 'in'),
      pipe('dryer', 'product', 'product'),
      pipe('dryer', 'vapour', 'vapour')
    ]
  }) as unknown as ProcessGraph;

describe('Crystallisation line: each unit works from what reaches it', () => {
  it('the dryer takes the moisture the centrifuge left, and its duty is the heat its streams took', () => {
    const r = simulateProcess(build(CRYSTALLISER_CONTRACT), 24 * 60);
    const cryst = r.nodeReports['cryst']!.designedUnit!.streams!.find((s) => s.port === 'slurry')!;
    const cent = r.nodeReports['cent']!.designedUnit!.streams!;
    const paste = cent.find((s) => s.port === 'solids')!;
    const centrate = cent.find((s) => s.port === 'centrate')!;
    const dryer = r.nodeReports['dryer']!.designedUnit!.streams!;
    const product = dryer.find((s) => s.port === 'product')!;
    const vapour = dryer.find((s) => s.port === 'vapour')!;

    // The centrifuge catches the crystals (at its rated recovery) and the paste is the set dryness.
    const crystalsIn = cryst.componentsKg!['crystals']!;
    assert.ok(Math.abs(paste.componentsKg!['crystals']! / crystalsIn - 0.95) < 0.02, `recovery ${paste.componentsKg!['crystals']! / crystalsIn}`);
    assert.ok(Math.abs(paste.componentsKg!['crystals']! / paste.kg - 0.7) < 0.03, `paste solids ${paste.componentsKg!['crystals']! / paste.kg}`);
    assert.ok((centrate.componentsKg!['crystals'] ?? 0) > 0, 'the uncaught crystals go to the centrate');

    // The dryer evaporates the water that arrived, and only water leaves as vapour.
    const waterIn = paste.componentsKg!['water']!;
    // Water in, less the 1% left in the product, leaves as vapour.
    assert.ok(Math.abs(vapour.componentsKg!['water']! - (waterIn - product.componentsKg!['water']!)) < waterIn * 0.01, 'the water that arrived leaves as vapour');
    assert.ok(Math.abs(product.componentsKg!['water']! / product.kg - 0.01) < 0.002, 'product moisture is the set 1%');
    assert.equal(vapour.componentsKg!['crystals'] ?? 0, 0, 'no crystals in the vapour');
    assert.ok(Math.abs((product.componentsKg!['crystals'] ?? 0) - paste.componentsKg!['crystals']!) < paste.componentsKg!['crystals']! * 0.005, `the crystals all reach the product: ${JSON.stringify({ paste, product, vapour })}`);

    // The mass balance closes and the dryer's duty agrees with its streams.
    const dryerEnergy = r.balance.energy.find((e) => e.nodeId === 'dryer')!;
    assert.equal(dryerEnergy.verdict, 'consistent', dryerEnergy.note);
    assert.ok(r.balance.mass.closes, `mass balance ${JSON.stringify(r.balance.mass)}`);
  });

  it('cooling less crystallises less, so the dryer has less to do', () => {
    const cold = simulateProcess(build(CRYSTALLISER_CONTRACT), 24 * 60);
    const warm = simulateProcess(build(withParams(CRYSTALLISER_CONTRACT, { finalC: 30 })), 24 * 60);
    // Per batch: a warmer final temperature also shortens the cycle, so compare what each batch made.
    const made = (r: typeof cold) => (r.nodeReports['product']!.fluid!.receivedKg) / r.nodeReports['cryst']!.fluid!.batches!;
    assert.ok(made(warm) < made(cold) * 0.7, `${made(warm)} vs ${made(cold)}`);
  });
});
