import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  addStreamToGraph,
  createTerminalNode,
  executeValidateUnitOp,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type UnitOpContract
} from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/** Streams that carry components: mixed by every unit, reacted and separated by designed ones. */

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

const pipe = (from: string, to: string, fromPort = 'out-0', toPort = 'in-0'): ProcessEdge =>
  ({
    id: `${from}:${fromPort}->${to}:${toPort}`,
    sourceNodeId: from,
    targetNodeId: to,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 100, operatingPressurePsi: 30, pipeDiameterInches: 3, fluid: { name: 'Liquor', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 } }
  }) as unknown as ProcessEdge;

const line = (nodes: ProcessNode[], edges: ProcessEdge[]): ProcessGraph =>
  ({ id: 'components', name: 'components', version: '1.0.0', metadata: {}, nodes, edges }) as unknown as ProcessGraph;

const fluid = (composition: Record<string, number>) => ({ name: 'Liquor', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20, composition });
const tank = (id: string, composition: Record<string, number>, gpm = 20, gallons = 10000) =>
  node(id, 'SURGE_TANK', { capacityGallons: 1e6, initialLevelGallons: gallons, maxDischargeRateGpm: gpm, fluid: fluid(composition) }, [L], [L]);
const sink = (id: string) => node(id, 'SURGE_TANK', { capacityGallons: 1e6, initialLevelGallons: 0 }, [L], []);

const designed = (id: string, extra: Partial<UnitOpContract>, outlets: string[] = ['out']): UnitOpContract =>
  ({
    contractVersion: 1,
    id,
    name: id,
    description: '',
    ports: [
      { id: 'in', name: 'In', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
      ...outlets.map((p) => ({ id: p, name: p, direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }))
    ],
    parameters: [],
    derived: [],
    constraints: [],
    behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: '0' },
    provenance: { authoredBy: 'ENGINEER', engineerConfirmed: [] },
    ...extra
  }) as unknown as UnitOpContract;

describe('Components: mixing', () => {
  it('two streams mix by volume: 12% sugar and plain water, 1:1, is 6%', () => {
    const g = line(
      [tank('syrup', { water: 0.88, sugar: 0.12 }), tank('water', { water: 1 }), sink('blend')],
      [pipe('syrup', 'blend'), pipe('water', 'blend')]
    );
    const blend = simulateProcess(g, 30).nodeReports['blend']!.fluid!;
    assert.ok(Math.abs(blend.composition!.sugar! - 0.06) < 1e-6, JSON.stringify(blend.composition));
  });

  it('a product outlet reports kilograms of each component', () => {
    let g = line([tank('syrup', { water: 0.88, sugar: 0.12 }, 10), createTerminalNode('product', { id: 'out', material: 'Syrup' })], []);
    g = addStreamToGraph(g, pipe('syrup', 'out', 'out-0', g.nodes[1]!.inputs[0]!.id));
    const t = simulateProcess(g, 10).terminals.find((x) => x.nodeId === 'out')!;
    // 100 gal of 1 kg/L liquid is 378.5 kg: 12% sugar.
    assert.ok(Math.abs(t.componentsKg!.sugar! - 0.12 * 100 * 3.785411784) < 0.5, JSON.stringify(t.componentsKg));
  });
});

describe('Components: separation by recovery', () => {
  // Half the water goes overhead; every bit of sugar stays in the concentrate.
  const evaporator = designed(
    'evaporator',
    {
      components: ['water', 'sugar'],
      outlets: [
        { port: 'vapour', recovery: { water: '0.5', sugar: '0' } },
        { port: 'concentrate', recovery: { sugar: '1' } }
      ]
    },
    ['vapour', 'concentrate']
  );

  it('splits each component as declared, and the flows follow from the mass', () => {
    assert.equal(executeValidateUnitOp({ contract: evaporator }).verdict, 'ACCEPTED');
    const g = line(
      [tank('feed', { water: 0.88, sugar: 0.12 }), node('evap', 'CUSTOM_UNIT_OP', { contract: evaporator }, [L], [L, L], { in: ['in'], out: ['vapour', 'concentrate'] }), sink('vapour'), sink('conc')],
      [pipe('feed', 'evap', 'out-0', 'in'), pipe('evap', 'vapour', 'vapour'), pipe('evap', 'conc', 'concentrate')]
    );
    const r = simulateProcess(g, 30);
    const vapour = r.nodeReports['vapour']!.fluid!;
    const conc = r.nodeReports['conc']!.fluid!;
    assert.ok((vapour.composition!.water ?? 0) > 0.9999, 'the vapour is water');
    // 0.12 sugar in 0.12 + 0.44 water.
    assert.ok(Math.abs(conc.composition!.sugar! - 0.12 / 0.56) < 1e-4, JSON.stringify(conc.composition));
    const share = vapour.receivedGallons / (vapour.receivedGallons + conc.receivedGallons);
    assert.ok(Math.abs(share - 0.44) < 0.005, `vapour share ${share}`);
  });

  it('what no port recovers is lost', () => {
    // Only 90% of the sugar is recovered; the rest is lost with nothing to carry it.
    const leaky = designed('leaky', { components: ['sugar'], outlets: [{ port: 'out', recovery: { sugar: '0.9' } }] });
    const g = line([tank('feed', { water: 0.88, sugar: 0.12 }), node('u', 'CUSTOM_UNIT_OP', { contract: leaky }, [L], [L], { in: ['in'], out: ['out'] }), sink('out')], [pipe('feed', 'u', 'out-0', 'in'), pipe('u', 'out', 'out')]);
    const r = simulateProcess(g, 20);
    const u = r.nodeReports['u']!.fluid!;
    // The water is not named, so all of it goes to the one open port; 1.2% of the mass is lost.
    const lostShare = u.lostGallons! / u.receivedGallons;
    assert.ok(Math.abs(lostShare - 0.012) < 0.001, `lost ${lostShare}`);
  });
});

describe('Components: reactions', () => {
  it('a continuous reactor converts 80% of A into B', () => {
    const reactor = designed('pfr', {
      components: ['A', 'B'],
      reactions: [{ id: 'a-to-b', limiting: 'A', conversion: '0.8', coefficients: { A: -1, B: 1 } }]
    });
    assert.equal(executeValidateUnitOp({ contract: reactor }).verdict, 'ACCEPTED');
    const g = line([tank('feed', { A: 1 }), node('pfr', 'CUSTOM_UNIT_OP', { contract: reactor }, [L], [L], { in: ['in'], out: ['out'] }), sink('out')], [pipe('feed', 'pfr', 'out-0', 'in'), pipe('pfr', 'out', 'out')]);
    const out = simulateProcess(g, 10).nodeReports['out']!.fluid!.composition!;
    assert.ok(Math.abs(out.A! - 0.2) < 1e-6 && Math.abs(out.B! - 0.8) < 1e-6, JSON.stringify(out));
  });

  it('conversion can follow the live feed, and a short co-reactant stops the reaction and is reported', () => {
    // A + 0.5 B -> 1.5 C by mass, conversion of A 90%; the feed has too little B.
    const reactor = designed('pfr2', {
      components: ['A', 'B', 'C'],
      designInlet: { composition: { A: 0.6, B: 0.4 } },
      reactions: [{ id: 'make-c', limiting: 'A', conversion: 'if(inlet.x.B > 0.2, 0.9, 0.5)', coefficients: { A: -1, B: -0.5, C: 1.5 } }]
    });
    assert.equal(executeValidateUnitOp({ contract: reactor }).verdict, 'ACCEPTED');
    const g = line([tank('feed', { A: 0.8, B: 0.2 }), node('pfr', 'CUSTOM_UNIT_OP', { contract: reactor }, [L], [L], { in: ['in'], out: ['out'] }), sink('out')], [pipe('feed', 'pfr', 'out-0', 'in'), pipe('pfr', 'out', 'out')]);
    const r = simulateProcess(g, 10);
    const out = r.nodeReports['out']!.fluid!.composition!;
    // x_B = 0.2 is not > 0.2, so conversion 0.5: 0.4 of A wants 0.2 of B, exactly what there is.
    assert.ok(Math.abs(out.A! - 0.4) < 1e-6 && (out.B ?? 0) < 1e-6 && Math.abs(out.C! - 0.6) < 1e-6, JSON.stringify(out));
    const hot = line([tank('feed', { A: 0.7, B: 0.3 }), node('pfr', 'CUSTOM_UNIT_OP', { contract: reactor }, [L], [L], { in: ['in'], out: ['out'] }), sink('out')], [pipe('feed', 'pfr', 'out-0', 'in'), pipe('pfr', 'out', 'out')]);
    const r2 = simulateProcess(hot, 10);
    // Conversion 0.9 of 0.7 A wants 0.315 B; only 0.3 is there, so B runs out.
    assert.deepEqual(r2.nodeReports['pfr']!.designedUnit!.shortReactions, ['make-c']);
    assert.ok((r2.nodeReports['out']!.fluid!.composition!.B ?? 0) < 1e-9);
  });

  it('a batch reacts in the HOLD phase marked react', () => {
    const batch = {
      ...designed('bat', {
        components: ['A', 'B'],
        designInlet: { composition: { A: 1 } },
        reactions: [{ id: 'r', limiting: 'A', conversion: '0.9', coefficients: { A: -1, B: 1 } }]
      }),
      behavior: {
        mode: 'BATCH',
        batchGallons: '200',
        phases: [
          { name: 'Fill', kind: 'FILL', rateGpm: '100' },
          { name: 'React', kind: 'HOLD', seconds: '300', react: true },
          { name: 'Empty', kind: 'DRAIN', rateGpm: '100' }
        ]
      }
    } as unknown as UnitOpContract;
    assert.equal(executeValidateUnitOp({ contract: batch }).verdict, 'ACCEPTED');
    const g = line([node('bat', 'CUSTOM_UNIT_OP', { contract: batch }, [L], [L], { in: ['in'], out: ['out'] }), sink('out')], [pipe('bat', 'out', 'out')]);
    const out = simulateProcess(g, 30).nodeReports['out']!.fluid!.composition!;
    assert.ok(Math.abs(out.A! - 0.1) < 1e-6 && Math.abs(out.B! - 0.9) < 1e-6, JSON.stringify(out));
  });
});

describe('Components: from a feed arrow, and the worked examples', () => {
  it('a feed supplies its composition, and the juice concentrator keeps all the sugar', async () => {
    const { JUICE_CONCENTRATOR_CONTRACT: J, NEUTRALISER_CONTRACT: N } = await import('@process-forge/protocol');
    assert.equal(executeValidateUnitOp({ contract: J }).verdict, 'ACCEPTED');
    assert.equal(executeValidateUnitOp({ contract: N }).verdict, 'ACCEPTED');
    const feed = createTerminalNode('feed', { id: 'juice', material: 'Juice', supplyRate: 30, composition: { water: 0.88, sugar: 0.12 } });
    let g = line(
      [feed, node('conc', 'CUSTOM_UNIT_OP', { contract: J }, [L], [L, L], { in: ['juice'], out: ['vapour', 'concentrate'] }), sink('vapour'), sink('product')],
      [pipe('conc', 'vapour', 'vapour'), pipe('conc', 'product', 'concentrate')]
    );
    g = addStreamToGraph(g, pipe('juice', 'conc', feed.outputs[0]!.id, 'juice'));
    const r = simulateProcess(g, 30);
    const fed = r.terminals.find((t) => t.nodeId === 'juice')!;
    const product = r.nodeReports['product']!.fluid!;
    const vapour = r.nodeReports['vapour']!.fluid!;
    const sugarIn = fed.componentsKg!.sugar!;
    // The pipes in this test carry liquid at 1 kg/L.
    const sugarOut = product.composition!.sugar! * product.receivedGallons * 3.785411784;
    assert.ok(Math.abs(sugarOut - sugarIn) / sugarIn < 0.01, `sugar in ${sugarIn} kg, out ${sugarOut} kg`);
    assert.ok((vapour.composition!.water ?? 0) > 0.9999);
    assert.ok(product.composition!.sugar! > 0.12, 'the concentrate is more concentrated than the juice');
  });
});

describe('Components: validation', () => {
  const v = (extra: Partial<UnitOpContract>, outlets?: string[]) => executeValidateUnitOp({ contract: designed('x', extra, outlets) }).verdict;
  it('refuses reactions that do not conserve mass, consume nothing, or name unknown components', () => {
    assert.equal(v({ components: ['A', 'B'], reactions: [{ id: 'r', limiting: 'A', conversion: '0.5', coefficients: { A: -1, B: 0.9 } }] }), 'REJECTED');
    assert.equal(v({ components: ['A', 'B'], reactions: [{ id: 'r', limiting: 'B', conversion: '0.5', coefficients: { A: -1, B: 1 } }] }), 'REJECTED');
    assert.equal(v({ components: ['A'], reactions: [{ id: 'r', limiting: 'A', conversion: '0.5', coefficients: { A: -1, Z: 1 } }] }), 'REJECTED');
  });
  it('refuses a share and recoveries together, recoveries over 1, and inlet.x without a design composition', () => {
    assert.equal(v({ components: ['A'], outlets: [{ port: 'out', share: '0.5', recovery: { A: '1' } }] }), 'REJECTED');
    assert.equal(v({ components: ['A'], outlets: [{ port: 'a', recovery: { A: '0.7' } }, { port: 'b', recovery: { A: '0.6' } }] }, ['a', 'b']), 'REJECTED');
    assert.equal(v({ components: ['A'], derived: [{ name: 'xa', label: 'x', unit: '-', expr: 'inlet.x.A' }] }), 'REJECTED');
    assert.equal(v({ components: ['A'], designInlet: { composition: { A: 0.3 } }, derived: [{ name: 'xa', label: 'x', unit: '-', expr: 'inlet.x.A' }] }), 'ACCEPTED');
  });
});
