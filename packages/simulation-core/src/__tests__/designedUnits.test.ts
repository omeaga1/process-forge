import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { executeValidateUnitOp, type ProcessEdge, type ProcessGraph, type ProcessNode, type UnitOpContract } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/**
 * Designed unit ops as full members of the line: evaluated at the conditions
 * that actually reach them, splitting and heating their outflow as declared,
 * limiting flow, and drawing liquid per cycle.
 */

const L = 'CONTINUOUS_VOLUME';
const ITEMS = 'DISCRETE_CONTAINER';

const node = (id: string, kind: ProcessNode['kind'], config: Record<string, unknown>, inputs: string[] = [], outputs: string[] = [], portIds?: { in?: string[]; out?: string[] }): ProcessNode =>
  ({
    id,
    name: id,
    kind,
    position: { x: 0, y: 0 },
    inputs: inputs.map((d, i) => ({ id: portIds?.in?.[i] ?? `in-${i}`, name: `in ${i}`, type: d === ITEMS ? 'CONTAINER_INPUT' : 'FLUID_INPUT', flowDimension: d })),
    outputs: outputs.map((d, i) => ({ id: portIds?.out?.[i] ?? `out-${i}`, name: `out ${i}`, type: d === ITEMS ? 'CONTAINER_OUTPUT' : 'FLUID_OUTPUT', flowDimension: d })),
    config
  }) as unknown as ProcessNode;

const pipe = (from: string, to: string, fromPort = 'out-0', toPort = 'in-0', temperatureCelsius = 20): ProcessEdge =>
  ({
    id: `${from}:${fromPort}->${to}`,
    sourceNodeId: from,
    targetNodeId: to,
    sourcePortId: fromPort,
    targetPortId: toPort,
    stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 50, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: { name: 'Juice', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius, specificHeatKjPerKgK: 4.186 } }
  }) as unknown as ProcessEdge;

const line = (nodes: ProcessNode[], edges: ProcessEdge[]): ProcessGraph =>
  ({ id: 'designed', name: 'designed', version: '1.0.0', metadata: {}, nodes, edges }) as unknown as ProcessGraph;

const water = (t: number) => ({ name: 'Juice', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: t, specificHeatKjPerKgK: 4.186 });

/**
 * A single-effect evaporator: a fixed steam duty first heats the feed to 100 °C,
 * then boils off what the rest of the duty can. So the hotter the feed, the
 * more it evaporates: a unit that depends on what flows in.
 */
const evaporator = (overrides: Partial<UnitOpContract> = {}): UnitOpContract =>
  ({
    contractVersion: 1,
    id: 'evaporator',
    name: 'Single-effect evaporator',
    description: '',
    ports: [
      { id: 'feed', name: 'Feed', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
      { id: 'vapour', name: 'Vapour', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
      { id: 'concentrate', name: 'Concentrate', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
    ],
    parameters: [
      { name: 'steamDutyKw', label: 'Steam duty', unit: 'kW', value: 1500, min: 0 },
      { name: 'maxFeedGpm', label: 'Tube capacity', unit: 'gal/min', value: 25, min: 1 }
    ],
    derived: [
      { name: 'sensibleKw', label: 'Heat to boiling', unit: 'kW', expr: 'inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK * max(0, 100 - inlet.temperatureC)' },
      { name: 'vapourShare', label: 'Evaporated', unit: '-', expr: 'if(inlet.massFlowKgPerS > 0, clamp((steamDutyKw - sensibleKw) / (inlet.massFlowKgPerS * 2257), 0, 0.9), 0)' }
    ],
    constraints: [
      { id: 'enough-steam', expr: 'steamDutyKw > sensibleKw', severity: 'ERROR', message: 'The steam cannot even bring the feed to a boil.' },
      { id: 'worth-it', expr: 'vapourShare > 0.2', severity: 'WARNING', message: 'Less than a fifth of the feed evaporates.' }
    ],
    behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: 'maxFeedGpm', dutyKw: 'steamDutyKw' },
    designInlet: { temperatureC: 20, volumetricFlowGpm: 25, massFlowKgPerS: 1.58, specificHeatKjPerKgK: 4.186, densityGPerCm3: 1 },
    outlets: [
      { port: 'vapour', share: 'vapourShare', temperatureC: '100' },
      { port: 'concentrate', temperatureC: '100' }
    ],
    provenance: { authoredBy: 'ENGINEER', engineerConfirmed: [] },
    ...overrides
  }) as UnitOpContract;

const evaporatorLine = (feedC: number, contract = evaporator()) =>
  line(
    [
      node('feed', 'SURGE_TANK', { capacityGallons: 100000, initialLevelGallons: 50000, maxDischargeRateGpm: 40, fluid: water(feedC) }, [L], [L]),
      node('evap', 'CUSTOM_UNIT_OP', { contract }, [L], [L, L], { in: ['feed'], out: ['vapour', 'concentrate'] }),
      node('condensate', 'SURGE_TANK', { capacityGallons: 100000, initialLevelGallons: 0 }, [L], []),
      node('product', 'SURGE_TANK', { capacityGallons: 100000, initialLevelGallons: 0 }, [L], [])
    ],
    [pipe('feed', 'evap', 'out-0', 'feed', feedC), pipe('evap', 'condensate', 'vapour'), pipe('evap', 'product', 'concentrate')]
  );

/** The vapour share at a steady 25 gal/min of feed at `feedC`. */
const expectedShare = (feedC: number) => {
  const kgPerS = (25 / 60) * 3.785411784;
  return Math.min(0.9, Math.max(0, (1500 - kgPerS * 4.186 * (100 - feedC)) / (kgPerS * 2257)));
};

describe('Designed units: validation reads the design point', () => {
  it('a design that reads inlet.* is accepted with designInlet and rejected without it', () => {
    assert.equal(executeValidateUnitOp({ contract: evaporator() }).verdict, 'ACCEPTED');
    const bare = evaporator({ designInlet: undefined });
    const r = executeValidateUnitOp({ contract: bare });
    assert.equal(r.verdict, 'REJECTED');
    assert.match(JSON.stringify(r.gates), /give designInlet\.massFlowKgPerS/);
  });

  it('outlet shares that add up to more than all the flow are refused', () => {
    const bad = evaporator({ outlets: [{ port: 'vapour', share: '0.7' }, { port: 'concentrate', share: '0.6' }] });
    assert.equal(executeValidateUnitOp({ contract: bad }).verdict, 'REJECTED');
  });
});

describe('Designed units: evaluated live, at what actually reaches them', () => {
  it('limits the flow to its capacity, and splits it by the live vapour share', () => {
    const r = simulateProcess(evaporatorLine(20), 60);
    const evap = r.nodeReports['evap']!;
    const vapour = r.nodeReports['condensate']!.fluid!.receivedGallons;
    const product = r.nodeReports['product']!.fluid!.receivedGallons;
    // The tank could send 40 gal/min; the evaporator takes 25.
    assert.ok(Math.abs(vapour + product - 25 * 60) < 30, `through ${vapour + product}`);
    const share = vapour / (vapour + product);
    assert.ok(Math.abs(share - expectedShare(20)) < 0.01, `share ${share} vs ${expectedShare(20)}`);
    // Both outlets leave at 100 °C.
    assert.ok(Math.abs(r.nodeReports['product']!.fluid!.temperatureC - 100) < 0.01);
    assert.ok(evap.designedUnit!.liveEvaluations > 3000);
    assert.equal(evap.designedUnit!.capacityGpm, 25);
    // 1500 kW for the hour it ran.
    assert.ok(Math.abs(evap.heat!.energyKwh - 1500) < 30, `energy ${evap.heat!.energyKwh}`);
  });

  it('a hotter feed evaporates more, because the design reads the inlet temperature', () => {
    const cold = simulateProcess(evaporatorLine(20), 30);
    const hot = simulateProcess(evaporatorLine(70), 30);
    const share = (r: typeof cold) => {
      const v = r.nodeReports['condensate']!.fluid!.receivedGallons;
      return v / (v + r.nodeReports['product']!.fluid!.receivedGallons);
    };
    assert.ok(share(hot) > share(cold) + 0.05, `hot ${share(hot)}, cold ${share(cold)}`);
    assert.ok(Math.abs(share(hot) - expectedShare(70)) < 0.01);
  });

  it('times the constraints it breaks at the conditions it saw', () => {
    // Designed for a 95 °C feed, where 400 kW is plenty; the line sends it
    // 20 °C feed, which 400 kW cannot bring to a boil.
    const weak = evaporator({
      parameters: [
        { name: 'steamDutyKw', label: 'Steam duty', unit: 'kW', value: 400, min: 0 },
        { name: 'maxFeedGpm', label: 'Tube capacity', unit: 'gal/min', value: 25, min: 1 }
      ],
      designInlet: { temperatureC: 95, volumetricFlowGpm: 25, massFlowKgPerS: 1.58, specificHeatKjPerKgK: 4.186, densityGPerCm3: 1 }
    });
    assert.equal(executeValidateUnitOp({ contract: weak }).verdict, 'ACCEPTED', 'fine at its design point');
    const r = simulateProcess(evaporatorLine(20, weak), 10);
    const broken = r.nodeReports['evap']!.designedUnit!.brokenConstraints;
    assert.equal(broken[0]!.id, 'enough-steam');
    assert.equal(broken[0]!.severity, 'ERROR');
    assert.ok(broken[0]!.seconds > 500, `broken for ${broken[0]!.seconds} s`);
  });

  it('what no outlet takes is lost, and not counted as product', () => {
    // Only the concentrate is declared, at 70%; the rest is driven off.
    const dryer = evaporator({ outlets: [{ port: 'concentrate', share: '0.7' }], constraints: [] });
    const g = evaporatorLine(20, dryer);
    g.edges = g.edges.filter((e) => e.sourcePortId !== 'vapour');
    g.nodes = g.nodes.filter((n) => n.id !== 'condensate');
    const r = simulateProcess(g, 20);
    const product = r.nodeReports['product']!.fluid!.receivedGallons;
    const lost = r.nodeReports['evap']!.fluid!.lostGallons!;
    assert.ok(Math.abs(product / (product + lost) - 0.7) < 0.005);
    assert.ok(r.totalFluidDeliveredGallons < product + lost - 100, 'the loss is not output');
  });
});

describe('Designed units: cycle units that draw liquid', () => {
  // A resin press: 2 gal of resin makes 4 parts every 10 s, fed from a small tank.
  const press: UnitOpContract = {
    contractVersion: 1,
    id: 'press',
    name: 'Resin press',
    description: '',
    ports: [
      { id: 'resin', name: 'Resin', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
      { id: 'parts', name: 'Parts', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'DISCRETE_CONTAINER', required: true }
    ],
    parameters: [{ name: 'shotGallons', label: 'Shot', unit: 'gal', value: 2, min: 0.1 }],
    derived: [],
    constraints: [],
    behavior: { mode: 'DISCRETE_CYCLE', cycleSeconds: '10', unitsPerCycle: '4', liquidPerCycleGallons: 'shotGallons' },
    provenance: { authoredBy: 'ENGINEER', engineerConfirmed: [] }
  } as UnitOpContract;

  const pressLine = (tankGpm: number, gallons: number) =>
    line(
      [
        node('tank', 'SURGE_TANK', { capacityGallons: 1000, initialLevelGallons: gallons, maxDischargeRateGpm: tankGpm, fluid: water(20) }, [L], [L]),
        node('press', 'CUSTOM_UNIT_OP', { contract: press }, [L], [ITEMS], { in: ['resin'], out: ['parts'] })
      ],
      [pipe('tank', 'press', 'out-0', 'resin')]
    );

  it('accepts a liquid-drawing design', () => {
    assert.equal(executeValidateUnitOp({ contract: press }).verdict, 'ACCEPTED');
  });

  it('runs at its cycle when the liquid keeps up', () => {
    // 6 cycles a minute need 12 gal/min; the tank sends 20.
    const r = simulateProcess(pressLine(20, 1000), 10);
    const made = r.nodeReports['press']!.unitsProduced;
    assert.ok(made >= 230 && made <= 240, `made ${made}`); // 24/min for 10 min
  });

  it('is starved by a slow feed, and stops when the tank runs dry', () => {
    // 6 gal/min feeds 3 shots a minute: 12 parts a minute, not 24.
    const slow = simulateProcess(pressLine(6, 1000), 10).nodeReports['press']!;
    assert.ok(slow.unitsProduced >= 110 && slow.unitsProduced <= 125, `slow made ${slow.unitsProduced}`);
    assert.ok(slow.starvedTimeSeconds > 200);
    // 100 gallons is 50 shots: 200 parts at most, however long it runs.
    const dry = simulateProcess(pressLine(20, 100), 30).nodeReports['press']!;
    assert.equal(dry.unitsProduced, 200);
  });
});
