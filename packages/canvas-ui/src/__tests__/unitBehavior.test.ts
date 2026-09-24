import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WAX_COOLING_BELT_CONTRACT, type ProcessGraph, type ProcessNode } from '@process-forge/protocol';
import { simulateProcess } from '@process-forge/simulation-core';
import { createDefaultProcessNode } from '../utils/nodeFactory.js';
import { describeUnitBehavior, engineKeysOf, formatDuration, formatRate } from '../model/unitBehavior.js';

const graphOf = (nodes: ProcessNode[], pairs: [string, string][] = []): ProcessGraph => ({
  id: 'behavior-test',
  name: 'Behavior test',
  version: '1.0.0',
  metadata: {},
  nodes,
  edges: pairs.map(([a, b], i) => ({
    id: `e${i}`,
    sourceNodeId: a,
    targetNodeId: b,
    sourcePortId: nodes.find((n) => n.id === a)!.outputs[0]!.id,
    targetPortId: nodes.find((n) => n.id === b)!.inputs[0]!.id,
    stream: { type: 'DISCRETE_CONTAINER_STREAM', targetPiecesPerMinute: 40, containerVolumeGallons: 1, containerType: 'CAN_1_GAL' }
  })) as ProcessGraph['edges']
});

const at = (kind: ProcessNode['kind'], id: string, config: Record<string, unknown> = {}): ProcessNode => {
  const n = createDefaultProcessNode(kind);
  return { ...n, id, config: { ...(n.config as object), ...config } as ProcessNode['config'] };
};

describe('What a unit does, in the engine\'s terms', () => {
  it('states a filler\'s rate as the engine runs it, and the engine agrees', () => {
    const filler = at('ROTARY_FILLER', 'f', { nozzleCount: 8, fillTimePerCycleSeconds: 8.5, indexTimePerCycleSeconds: 1.5, rejectRatePercentage: 0 });
    const b = describeUnitBehavior(filler, graphOf([filler]));
    assert.ok(b.simulated);
    assert.strictEqual(b.capacityPerMin, 48);
    assert.match(b.headline, /Fills 8 containers every 10 s/);

    const run = simulateProcess(graphOf([filler]), 60, { seed: 1 });
    const made = run.nodeReports['f']!.unitsProduced;
    assert.ok(Math.abs(made / 60 - 48) < 1, `engine made ${made / 60}/min`);
  });

  it('gives a labeler\'s good-output rate, net of inspection failures', () => {
    const labeler = at('LABELER', 'l', { maxSpeedUnitsPerMinute: 60, opticalInspectionFailRate: 10 });
    const b = describeUnitBehavior(labeler, graphOf([labeler]));
    assert.strictEqual(b.capacityPerMin, 54);
    assert.deepStrictEqual(b.engineKeys.sort(), ['maxSpeedUnitsPerMinute', 'opticalInspectionFailRate']);
  });

  it('says an unpiped pump has nothing flowing through it', () => {
    const pump = at('PUMP', 'p');
    const b = describeUnitBehavior(pump, graphOf([pump]));
    assert.strictEqual(b.simulated, false);
    assert.strictEqual(b.capacityPerMin, null);
    assert.deepStrictEqual(engineKeysOf(pump), []);
    assert.match(b.details.join(' '), /No liquid pipe connects to it/);
  });

  it('warns that a palletizer layer over 100 never starts', () => {
    const pal = at('PALLETIZER', 'pl', { containersPerLayer: 120 });
    const b = describeUnitBehavior(pal, graphOf([pal]));
    assert.strictEqual(b.capacityPerMin, 0);
    assert.match(b.details[0]!, /never starts/);
  });

  it('knows where a unit sits in the line', () => {
    const f = at('ROTARY_FILLER', 'f');
    const l = at('LABELER', 'l');
    const g = graphOf([f, l], [['f', 'l']]);
    assert.strictEqual(describeUnitBehavior(f, g).role, 'source');
    assert.strictEqual(describeUnitBehavior(l, g).role, 'end');
  });

  it('describes a designed continuous unit from its contract, and says it does not pace the line', () => {
    const belt = at('CUSTOM_UNIT_OP', 'belt', { contract: WAX_COOLING_BELT_CONTRACT });
    const b = describeUnitBehavior(belt, graphOf([belt]));
    assert.strictEqual(b.simulated, false);
    assert.ok(b.keyFigures && b.keyFigures.length > 0, 'shows the engine\'s computed figures');
    assert.match(b.details.join(' '), /steady state/);
    assert.deepStrictEqual(engineKeysOf(belt), ['contract']);
  });

  it('describes a designed cycle unit: a 30-minute printer makes 2 parts an hour', () => {
    const printer = at('CUSTOM_UNIT_OP', 'printer', {
      contract: {
        ...WAX_COOLING_BELT_CONTRACT,
        id: 'printer-test',
        derived: [],
        constraints: [],
        parameters: [{ name: 'cycleMin', label: 'Cycle', unit: 'min', value: 30, min: 1, max: 600 }],
        behavior: { mode: 'DISCRETE_CYCLE', cycleSeconds: 'cycleMin * 60', unitsPerCycle: '1' }
      }
    });
    const b = describeUnitBehavior(printer, graphOf([printer]));
    assert.ok(b.simulated, b.details.join(' | '));
    assert.match(b.headline, /Makes 1 unit every 30 min/);
    assert.deepStrictEqual(formatRate(b.capacityPerMin), { value: '2', per: '/h' });
  });

  it('a piped tank, pump and filler are simulated, with liquid rates', () => {
    const tank = at('SURGE_TANK', 'tank', { capacityGallons: 800, initialLevelGallons: 400, maxDischargeRateGpm: 45 });
    const pump = at('PUMP', 'pump', { designFlowRateGpm: 40 });
    const filler = at('ROTARY_FILLER', 'filler');
    const g = graphOf([tank, pump, filler], [['tank', 'pump'], ['pump', 'filler']]);

    const t = describeUnitBehavior(tank, g);
    assert.ok(t.simulated);
    assert.strictEqual(t.rateUnit, 'gal');
    assert.match(t.headline, /800 gal, starting at 400 gal/);
    assert.ok(engineKeysOf(tank).includes('maxDischargeRateGpm') || t.engineKeys.includes('maxDischargeRateGpm'));

    const p = describeUnitBehavior(pump, g);
    assert.ok(p.simulated);
    assert.strictEqual(p.capacityPerMin, 40);
    assert.deepStrictEqual(formatRate(p.capacityPerMin, 'gal'), { value: '40', per: ' gal/min' });

    const f = describeUnitBehavior(filler, g);
    assert.match(f.details.join(' '), /draws .* gal from/);
    assert.ok(f.engineKeys.includes('containerVolumeGallons'));
  });

  it('a batch reactor states its batch cycle and average rate', () => {
    const reactor = at('BATCH_REACTOR', 'r', { batchVolumeGallons: 1000, fillDurationMinutes: 20, reactionDurationMinutes: 45, dischargeRateGpm: 50 });
    const b = describeUnitBehavior(reactor, graphOf([reactor]));
    assert.ok(b.simulated);
    assert.match(b.headline, /1,000 gal batches, one every 85 min/);
    assert.ok(Math.abs(b.capacityPerMin! - 1000 / 85) < 1e-9);
  });

  it('formats slow rates per hour and long cycles in minutes', () => {
    assert.deepStrictEqual(formatRate(1 / 30), { value: '2', per: '/h' });
    assert.deepStrictEqual(formatRate(48), { value: '48', per: '/min' });
    assert.strictEqual(formatDuration(1800), '30 min');
    assert.strictEqual(formatDuration(10), '10 s');
  });
});
