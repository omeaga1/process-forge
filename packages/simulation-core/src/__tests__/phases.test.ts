import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  addStreamToGraph,
  createTerminalNode,
  DUST_COLLECTOR_CONTRACT,
  SPRAY_DRYER_CONTRACT,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type UnitOpContract
} from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/** Designed units that state their phases report each outlet in the units of its phase. */

const L = 'CONTINUOUS_VOLUME';
const GAL = 3.785411784e-3;

const unit = (id: string, contract: UnitOpContract): ProcessNode =>
  ({
    id,
    name: id,
    kind: 'CUSTOM_UNIT_OP',
    position: { x: 0, y: 0 },
    inputs: contract.ports.filter((p) => p.direction === 'INLET').map((p) => ({ id: p.id, name: p.name, type: 'FLUID_INPUT', flowDimension: L })),
    outputs: contract.ports.filter((p) => p.direction === 'OUTLET').map((p) => ({ id: p.id, name: p.name, type: 'FLUID_OUTPUT', flowDimension: L })),
    config: { contract }
  }) as unknown as ProcessNode;

const sink = (id: string): ProcessNode =>
  ({ id, name: id, kind: 'SURGE_TANK', position: { x: 0, y: 0 }, inputs: [{ id: 'in-0', name: 'in', type: 'FLUID_INPUT', flowDimension: L }], outputs: [], config: { capacityGallons: 1e9, initialLevelGallons: 0 } }) as unknown as ProcessNode;

const pipe = (from: string, to: string, fromPort: string, toPort: string, densityGPerCm3: number, temperatureCelsius: number, gpm: number): ProcessEdge =>
  ({
    id: `${from}:${fromPort}->${to}:${toPort}`,
    sourceNodeId: from,
    targetNodeId: to,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: gpm, operatingPressurePsi: 15, pipeDiameterInches: 24, fluid: { name: 'Stream', densityGPerCm3, viscosityCentipoise: 0.018, temperatureCelsius } }
  }) as unknown as ProcessEdge;

describe('Phases in the simulation', () => {
  it('a dust collector reports ACFM of clean air and kg/h of powder', () => {
    // 2.245 kg/s of dusty air at 25 °C (0.42 % magnesium stearate), stated to the engine as a volume at the air's density.
    const density = 0.001172;
    const gpm = (2.245 / (density * 1000) / GAL) * 60;
    const feed = createTerminalNode('feed', { id: 'duct', material: 'Extraction air', supplyRate: gpm, composition: { air: 0.9958, lubricant: 0.0042 } });
    let g = {
      id: 'dust',
      name: 'dust',
      version: '1',
      metadata: {},
      nodes: [feed, unit('collector', DUST_COLLECTOR_CONTRACT), sink('stack'), sink('drum')],
      edges: [pipe('collector', 'stack', 'clean_air', 'in-0', density, 25, gpm), pipe('collector', 'drum', 'hopper', 'in-0', 0.5, 25, 1)]
    } as unknown as ProcessGraph;
    g = addStreamToGraph(g, pipe('duct', 'collector', feed.outputs[0]!.id, 'dirty_air', density, 25, gpm));
    const r = simulateProcess(g, 30);
    const streams = r.nodeReports['collector']!.designedUnit!.streams!;
    const clean = streams.find((s) => s.port === 'clean_air')!;
    const hopper = streams.find((s) => s.port === 'hopper')!;
    assert.equal(clean.phase, 'GAS');
    assert.equal(hopper.phase, 'SOLID');
    // 0.0042 x 2.245 kg/s = 33.9 kg/h of dust; 99.95 % to the hopper.
    assert.ok(Math.abs(hopper.kgPerHour - 33.9) < 0.5, `hopper ${hopper.kgPerHour} kg/h`);
    assert.ok(Math.abs(clean.actualCubicFeetPerMinute! - 4040) < 60, `clean air ${clean.actualCubicFeetPerMinute} ACFM`);
    assert.ok(clean.dispersedKgPerHour!.lubricant! < 0.05, 'a trace of dust leaves with the air');
    assert.equal(clean.molarMass, 29);
  });

  it('a spray dryer sends powder as a solid and its exhaust as a humid gas', () => {
    // Liquid feed and process air arrive as one stream, by component (the engine mixes what arrives).
    const density = 0.0012;
    const gpm = (0.4814 / (density * 1000) / GAL) * 60;
    const feed = createTerminalNode('feed', { id: 'in', material: 'Feed and air', supplyRate: gpm, composition: { water: 0.0421, solids: 0.02308, air: 0.93482 } });
    let g = {
      id: 'dryer',
      name: 'dryer',
      version: '1',
      metadata: {},
      nodes: [feed, unit('dryer', SPRAY_DRYER_CONTRACT), sink('bin'), sink('stack')],
      edges: [pipe('dryer', 'bin', 'powder', 'in-0', 0.6, 90, 1), pipe('dryer', 'stack', 'exhaust', 'in-0', density, 90, gpm)]
    } as unknown as ProcessGraph;
    g = addStreamToGraph(g, pipe('in', 'dryer', feed.outputs[0]!.id, 'feed', density, 25, gpm));
    const r = simulateProcess(g, 30);
    const d = r.nodeReports['dryer']!.designedUnit!;
    assert.deepEqual(d.brokenConstraints.filter((c) => c.severity === 'ERROR'), []);
    const powder = d.streams!.find((s) => s.port === 'powder')!;
    const exhaust = d.streams!.find((s) => s.port === 'exhaust')!;
    assert.equal(powder.phase, 'SOLID');
    assert.ok(Math.abs(powder.kgPerHour - 40.9) < 0.5, `powder ${powder.kgPerHour} kg/h (2 % of the solids leave as fines)`);
    assert.ok(powder.dispersedKgPerHour!.water! > 0, 'its residual moisture is reported apart');
    assert.equal(exhaust.phase, 'GAS');
    assert.ok(exhaust.molarMass! < 28.96, 'water vapour lightens the exhaust');
    assert.equal(exhaust.temperatureC, 90);
    assert.ok(exhaust.actualCubicFeetPerMinute! > exhaust.standardCubicFeetPerMinute!, 'hot gas takes more room than at standard conditions');
  });

  it('a gas feed is stated in kg/h or SCFM, and is an ideal gas at its temperature', () => {
    const run = (feedOptions: Record<string, unknown>) => {
      const feed = createTerminalNode('feed', { id: 'duct', material: 'Extraction air', phase: 'GAS', temperatureC: 25, composition: { air: 0.9958, lubricant: 0.0042 }, ...feedOptions });
      let g = {
        id: 'dust',
        name: 'dust',
        version: '1',
        metadata: {},
        nodes: [feed, unit('collector', DUST_COLLECTOR_CONTRACT), sink('stack'), sink('drum')],
        // The pipes say water; the feed's own phase decides what it supplies.
        edges: [pipe('collector', 'stack', 'clean_air', 'in-0', 1, 20, 50), pipe('collector', 'drum', 'hopper', 'in-0', 1, 20, 50)]
      } as unknown as ProcessGraph;
      g = addStreamToGraph(g, pipe('duct', 'collector', feed.outputs[0]!.id, 'dirty_air', 1, 20, 50));
      return simulateProcess(g, 30);
    };
    const byMass = run({ supplyKgPerHour: 8082 });
    const fed = byMass.terminals.find((t) => t.nodeId === 'duct')!;
    assert.ok(Math.abs(fed.kg / 1800 - 2.245) < 0.01, `fed ${fed.kg / 1800} kg/s`);
    const clean = byMass.nodeReports['collector']!.designedUnit!.streams!.find((s) => s.port === 'clean_air')!;
    assert.ok(Math.abs(clean.actualCubicFeetPerMinute! - 4040) < 60, `clean air ${clean.actualCubicFeetPerMinute} ACFM`);
    assert.deepEqual(byMass.nodeReports['collector']!.designedUnit!.brokenConstraints.filter((c) => c.severity === 'ERROR'), []);

    const byScfm = run({ supplyScfm: 1000 });
    const fedScfm = byScfm.terminals.find((t) => t.nodeId === 'duct')!;
    // 1000 SCFM of (nearly) air is 0.568 kg/s.
    assert.ok(Math.abs(fedScfm.kg / 1800 - 0.566) < 0.01, `fed ${fedScfm.kg / 1800} kg/s`);
  });
});

describe('The spray drying example line', () => {
  it('runs with every check holding, and closes its mass balance across liquid, gas and solid', async () => {
    const { SPRAY_DRYING_LINE, EXAMPLE_LINES, executeValidateUnitOp } = await import('@process-forge/protocol');
    assert.equal(EXAMPLE_LINES['spray-drying-line'], SPRAY_DRYING_LINE);
    for (const n of SPRAY_DRYING_LINE.nodes) {
      const contract = (n.config as { contract?: unknown }).contract;
      if (contract) assert.equal(executeValidateUnitOp({ contract }).verdict, 'ACCEPTED', n.id);
    }
    const r = simulateProcess(SPRAY_DRYING_LINE, 60);
    for (const id of ['spray-dryer-1', 'baghouse-1']) assert.deepEqual(r.nodeReports[id]!.designedUnit!.brokenConstraints, [], id);
    const kg = (id: string) => r.terminals.find((t) => t.nodeId === id)!.kg;
    const fed = kg('feed-solution') + kg('feed-air');
    const out = kg('product-powder') + kg('product-fines') + kg('stack');
    assert.ok(Math.abs(fed - out) / fed < 0.002, `in ${fed} kg, out ${out} kg`);
    // The water leaves as vapour up the stack, not in the baghouse hopper.
    assert.deepEqual(Object.keys(r.terminals.find((t) => t.nodeId === 'product-fines')!.componentsKg!), ['solids']);
    const exhaust = r.nodeReports['spray-dryer-1']!.designedUnit!.streams!.find((s) => s.port === 'exhaust')!;
    assert.ok(exhaust.actualCubicFeetPerMinute! > 1000 && exhaust.actualCubicFeetPerMinute! < 1100, `${exhaust.actualCubicFeetPerMinute} ACFM`);
  });
});

describe('Each inlet on its own: port.<id>.*', () => {
  it('a venturi scrubber reads its gas and its water separately, live', async () => {
    const { VENTURI_SCRUBBER_CONTRACT } = await import('@process-forge/protocol');
    const run = (waterKgPerHour: number) => {
      const gas = createTerminalNode('feed', { id: 'flue', material: 'Flue gas', phase: 'GAS', temperatureC: 180, supplyKgPerHour: 7056, composition: { air: 0.988, water: 0.009, dust: 0.003 } });
      const water = createTerminalNode('feed', { id: 'water', material: 'Scrubbing water', phase: 'LIQUID', temperatureC: 20, supplyKgPerHour: waterKgPerHour, composition: { water: 1 } });
      let g = {
        id: 'scrub',
        name: 'scrub',
        version: '1',
        metadata: {},
        nodes: [gas, water, unit('venturi', VENTURI_SCRUBBER_CONTRACT), sink('stack'), sink('pond')],
        edges: [pipe('venturi', 'stack', 'gas_out', 'in-0', 0.001, 46, 50), pipe('venturi', 'pond', 'liquor_out', 'in-0', 1, 46, 50)]
      } as unknown as ProcessGraph;
      g = addStreamToGraph(g, pipe('flue', 'venturi', gas.outputs[0]!.id, 'gas_in', 0.001, 180, 50));
      g = addStreamToGraph(g, pipe('water', 'venturi', water.outputs[0]!.id, 'liquor_in', 1, 20, 50));
      return simulateProcess(g, 20);
    };
    const ok = run(11358);
    const d = ok.nodeReports['venturi']!.designedUnit!;
    assert.deepEqual(d.brokenConstraints.filter((c) => c.severity === 'ERROR'), [], JSON.stringify(d.brokenConstraints));
    const liquor = d.streams!.find((s) => s.port === 'liquor_out')!;
    // 0.3 % of 7056 kg/h is 21.2 kg/h of dust, nearly all caught in the liquor.
    assert.ok(Math.abs(liquor.dispersedKgPerHour!.dust! - 21.2) < 0.5, JSON.stringify(liquor));
    const gasOut = d.streams!.find((s) => s.port === 'gas_out')!;
    assert.ok(gasOut.molarMass! < 28.6, `the gas leaves humid (M = ${gasOut.molarMass})`);
    // Starve it of water: the L/G check breaks at the conditions it actually got, because it reads the water port itself.
    const dry = run(1500);
    assert.ok(dry.nodeReports['venturi']!.designedUnit!.brokenConstraints.some((c) => c.id === 'enough-liquor'), 'L/G read live from port.liquor_in');
  });
});


describe('An inlet port with no pipe', () => {
  it('reads as no flow, not as its design values', async () => {
    const { VENTURI_SCRUBBER_CONTRACT } = await import('@process-forge/protocol');
    const gas = createTerminalNode('feed', { id: 'flue', material: 'Flue gas', phase: 'GAS', temperatureC: 180, supplyKgPerHour: 7056, composition: { air: 0.988, water: 0.009, dust: 0.003 } });
    let g = {
      id: 'scrub',
      name: 'scrub',
      version: '1',
      metadata: {},
      nodes: [gas, unit('venturi', VENTURI_SCRUBBER_CONTRACT), sink('stack'), sink('pond')],
      edges: [pipe('venturi', 'stack', 'gas_out', 'in-0', 0.001, 46, 50), pipe('venturi', 'pond', 'liquor_out', 'in-0', 1, 46, 50)]
    } as unknown as ProcessGraph;
    g = addStreamToGraph(g, pipe('flue', 'venturi', gas.outputs[0]!.id, 'gas_in', 0.001, 180, 50));
    const r = simulateProcess(g, 10);
    const broken = r.nodeReports['venturi']!.designedUnit!.brokenConstraints.map((c) => c.id);
    assert.ok(broken.includes('enough-liquor'), `no water piped, so L/G is 0: ${broken.join(', ')}`);
  });
});

describe('Sizing gas and solids in their own units', () => {
  const dustyAir = () => createTerminalNode('feed', { id: 'duct', material: 'Extraction air', phase: 'GAS', temperatureC: 25, supplyKgPerHour: 8082, composition: { air: 0.9958, lubricant: 0.0042 } });
  const tank = (id: string, gallons: number): ProcessNode =>
    ({ id, name: id, kind: 'SURGE_TANK', position: { x: 0, y: 0 }, inputs: [{ id: 'in-0', name: 'in', type: 'FLUID_INPUT', flowDimension: L }], outputs: [], config: { capacityGallons: gallons, initialLevelGallons: 0 } }) as unknown as ProcessNode;
  const line = (contract: UnitOpContract, drumGallons: number) => {
    const feed = dustyAir();
    let g = {
      id: 'g',
      name: 'g',
      version: '1',
      metadata: {},
      nodes: [feed, unit('collector', contract), sink('stack'), tank('drum', drumGallons)],
      edges: [pipe('collector', 'stack', 'clean_air', 'in-0', 0.0012, 25, 50), pipe('collector', 'drum', 'hopper', 'in-0', 0.25, 25, 5)]
    } as unknown as ProcessGraph;
    g = addStreamToGraph(g, pipe('duct', 'collector', feed.outputs[0]!.id, 'dirty_air', 0.0012, 25, 50));
    return simulateProcess(g, 30);
  };

  it('a mass capacity (capacityKgPerHour) limits what a gas unit passes', async () => {
    const { DUST_COLLECTOR_CONTRACT } = await import('@process-forge/protocol');
    const limited = JSON.parse(JSON.stringify(DUST_COLLECTOR_CONTRACT)) as UnitOpContract;
    if (limited.behavior.mode === 'CONTINUOUS_RATE') limited.behavior.capacityKgPerHour = '4000';
    const r = line(limited, 1000);
    const fed = r.terminals.find((t) => t.nodeId === 'duct')!;
    assert.ok(Math.abs((fed.kg / 30) * 60 - 4000) < 80, `fed ${(fed.kg / 30) * 60} kg/h`);
  });

  it('a drum under a hopper fills by the powder\'s bulk volume, not the air\'s', async () => {
    const { DUST_COLLECTOR_CONTRACT } = await import('@process-forge/protocol');
    // 34 kg/h of stearate at 250 kg/m³ is about 36 gal/h: 18 gal in half an hour fits a 30-gal drum.
    const r = line(DUST_COLLECTOR_CONTRACT, 30);
    const drum = r.nodeReports['drum']!.fluid!;
    assert.ok(Math.abs(drum.receivedKg - 17) < 1, `drum got ${drum.receivedKg} kg`);
    assert.ok(drum.levelGallons < 30, `${drum.levelGallons} gal in a 30-gal drum`);
    const fed = r.terminals.find((t) => t.nodeId === 'duct')!;
    assert.ok(Math.abs((fed.kg / 30) * 60 - 8082) < 100, 'the collector is not held back by its drum');
  });
});

describe('A batch reads what each inlet charged', () => {
  it('port.<id>.chargedKg and port.<id>.temperatureC describe the batch in hand at each phase', async () => {
    const { executeValidateUnitOp } = await import('@process-forge/protocol');
    const kettle = {
      contractVersion: 1,
      id: 'two-feed-kettle',
      name: 'Two-feed kettle',
      description: 'Charges from two feeds, then holds for a time set by how much of feed A it got.',
      ports: [
        { id: 'a', name: 'Feed A', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
        { id: 'b', name: 'Feed B', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
        { id: 'out', name: 'Out', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
      ],
      parameters: [
        { name: 'batchGal', label: 'Batch', unit: 'gal', value: 100, min: 1, max: 1000 },
        { name: 'kgPerSecond', label: 'Hold per kg of A', unit: 'kg/s', value: 10, min: 1, max: 100 }
      ],
      derived: [],
      constraints: [],
      behavior: {
        mode: 'BATCH',
        batchGallons: 'batchGal',
        phases: [
          { name: 'Fill', kind: 'FILL', rateGpm: '20' },
          { name: 'Hold', kind: 'HOLD', seconds: 'port.a.chargedKg / kgPerSecond', temperatureC: 'port.b.temperatureC' },
          { name: 'Drain', kind: 'DRAIN', rateGpm: '50' }
        ]
      },
      designPorts: { a: { chargedKg: 190 }, b: { temperatureC: 80 } },
      provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] }
    } as unknown as UnitOpContract;
    assert.equal(executeValidateUnitOp({ contract: kettle }).verdict, 'ACCEPTED', executeValidateUnitOp({ contract: kettle }).revisionGuidance);
    const fa = createTerminalNode('feed', { id: 'fa', material: 'A', supplyRate: 5, temperatureC: 20 });
    const fb = createTerminalNode('feed', { id: 'fb', material: 'B', supplyRate: 5, temperatureC: 80 });
    let g = {
      id: 'k',
      name: 'k',
      version: '1',
      metadata: {},
      nodes: [fa, fb, unit('kettle', kettle), sink('tote')],
      edges: [pipe('kettle', 'tote', 'out', 'in-0', 1, 20, 50)]
    } as unknown as ProcessGraph;
    g = addStreamToGraph(g, pipe('fa', 'kettle', fa.outputs[0]!.id, 'a', 1, 20, 5));
    g = addStreamToGraph(g, pipe('fb', 'kettle', fb.outputs[0]!.id, 'b', 1, 80, 5));
    const r = simulateProcess(g, 120);
    const d = r.nodeReports['kettle']!.designedUnit!;
    const batches = r.nodeReports['kettle']!.fluid!.batches!;
    assert.ok(batches >= 2, `${batches} batches`);
    // Each 100-gal batch takes about half from A: ~189 kg, so ~19 s of hold.
    const holdPerBatch = d.secondsByPhase!.Hold! / batches;
    assert.ok(holdPerBatch > 15 && holdPerBatch < 23, `hold ${holdPerBatch} s per batch`);
    assert.deepEqual(d.brokenConstraints, []);
  });
});

describe('Channels: two streams through one unit without mixing', () => {
  it('a two-stream exchanger heats the cold water from the hot, and each leaves by its own outlet', async () => {
    const { TWO_STREAM_EXCHANGER_CONTRACT, executeValidateUnitOp } = await import('@process-forge/protocol');
    assert.equal(executeValidateUnitOp({ contract: TWO_STREAM_EXCHANGER_CONTRACT }).verdict, 'ACCEPTED');
    const hot = createTerminalNode('feed', { id: 'hot', material: 'Hot water', supplyKgPerHour: 7200, temperatureC: 90, specificHeatKjPerKgK: 4.19, composition: { hot_water: 1 } });
    const cold = createTerminalNode('feed', { id: 'cold', material: 'Cooling water', supplyKgPerHour: 10800, temperatureC: 20, specificHeatKjPerKgK: 4.18, composition: { cold_water: 1 } });
    const out = (id: string): ProcessNode => createTerminalNode('product', { id, material: id });
    let g = {
      id: 'hx',
      name: 'hx',
      version: '1',
      metadata: {},
      nodes: [hot, cold, unit('hx', TWO_STREAM_EXCHANGER_CONTRACT), out('hot-return'), out('warm-water')],
      edges: []
    } as unknown as ProcessGraph;
    g = addStreamToGraph(g, pipe('hot', 'hx', hot.outputs[0]!.id, 'hot_in', 1, 90, 50));
    g = addStreamToGraph(g, pipe('cold', 'hx', cold.outputs[0]!.id, 'cold_in', 1, 20, 50));
    g = addStreamToGraph(g, pipe('hx', 'hot-return', 'hot_out', g.nodes.find((n) => n.id === 'hot-return')!.inputs[0]!.id, 1, 40, 50));
    g = addStreamToGraph(g, pipe('hx', 'warm-water', 'cold_out', g.nodes.find((n) => n.id === 'warm-water')!.inputs[0]!.id, 1, 50, 50));
    const r = simulateProcess(g, 30);
    const t = (id: string) => r.terminals.find((x) => x.nodeId === id)!;
    // Nothing mixes: each outlet gets only its own water, all of it.
    assert.deepEqual(Object.keys(t('hot-return').componentsKg!), ['hot_water']);
    assert.deepEqual(Object.keys(t('warm-water').componentsKg!), ['cold_water']);
    assert.ok(Math.abs(t('hot-return').kg - t('hot').kg) / t('hot').kg < 0.01);
    // Effectiveness-NTU at 2 and 3 kg/s: hot leaves near 42 °C, cold near 52 °C.
    assert.ok(Math.abs(t('hot-return').temperatureC! - 42.2) < 1, `hot out ${t('hot-return').temperatureC}`);
    assert.ok(Math.abs(t('warm-water').temperatureC! - 51.9) < 1, `cold out ${t('warm-water').temperatureC}`);
    // The heat balance closes: what the hot side lost, the cold side gained.
    const lost = (t('hot').kg * 4.19 * (90 - t('hot-return').temperatureC!)) / 3600;
    const gained = (t('cold').kg * 4.18 * (t('warm-water').temperatureC! - 20)) / 3600;
    assert.ok(Math.abs(lost - gained) / lost < 0.02, `lost ${lost} kWh, gained ${gained} kWh`);
  });
});
