/**
 * Same seed, same result: the engine's randomness (rejects, inspection) comes
 * only from its seeded generator.
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { ProcessGraph } from '@process-forge/protocol';
import { createRng, seedFromString, DEFAULT_SIMULATION_SEED } from '../rng.js';
import { simulateProcess, SimulationEngine } from '../engine.js';

type Node = ProcessGraph['nodes'][number];

function buildLine(id = 'seed-test-line'): ProcessGraph {
  const port = (pid: string, dir: 'DISCRETE_OUTPUT' | 'DISCRETE_INPUT') => ({
    id: pid, name: pid, type: dir, flowDimension: 'DISCRETE_CONTAINER' as const
  });
  return {
    id,
    name: 'Seed Test Line',
    version: '1.0.0',
    metadata: {},
    nodes: [
      {
        id: 'filler-1', name: 'Filler', kind: 'ROTARY_FILLER',
        position: { x: 0, y: 0 }, inputs: [], outputs: [port('out', 'DISCRETE_OUTPUT')],
        config: {
          nozzleCount: 10, fillTimePerCycleSeconds: 10, indexTimePerCycleSeconds: 2,
          bufferQueueCapacity: 40, rejectRatePercentage: 5.0
        }
      },
      {
        id: 'labeler-1', name: 'Labeler', kind: 'LABELER',
        position: { x: 1, y: 0 }, inputs: [port('in', 'DISCRETE_INPUT')], outputs: [],
        config: { maxSpeedUnitsPerMinute: 45, opticalInspectionFailRate: 3.0 }
      }
    ] as unknown as Node[],
    edges: [
      {
        id: 'e1', sourceNodeId: 'filler-1', sourcePortId: 'out',
        targetNodeId: 'labeler-1', targetPortId: 'in',
        stream: {
          type: 'DISCRETE_CONTAINER_STREAM', targetPiecesPerMinute: 50,
          containerVolumeGallons: 1, containerType: 'CAN_1_GAL'
        }
      }
    ]
  } as unknown as ProcessGraph;
}

describe('Seeded RNG', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 1000; i++) {
      assert.equal(a.next(), b.next());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const diverged = Array.from({ length: 20 }, () => a.next() !== b.next());
    assert.ok(diverged.some(Boolean), 'Two seeds should not track each other');
  });

  it('stays within [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
    }
  });

  it('is roughly uniform, so a reject rate means what it says', () => {
    const rng = createRng(7);
    const N = 100000;
    let below = 0;
    for (let i = 0; i < N; i++) if (rng.next() < 0.25) below++;
    const observed = below / N;
    assert.ok(
      Math.abs(observed - 0.25) < 0.01,
      `Expected ~25% below 0.25, got ${(observed * 100).toFixed(2)}%`
    );
  });

  it('normalises hostile seeds rather than degrading to NaN', () => {
    for (const seed of [-1, 3.7, 0, 2 ** 40, Number.MAX_SAFE_INTEGER]) {
      const v = createRng(seed).next();
      assert.ok(Number.isFinite(v) && v >= 0 && v < 1, `seed ${seed} gave ${v}`);
    }
  });

  it('derives a stable seed from a string', () => {
    assert.equal(seedFromString('paint-line-01'), seedFromString('paint-line-01'));
    assert.notEqual(seedFromString('paint-line-01'), seedFromString('paint-line-02'));
  });

  it('has no shared global state between generators', () => {
    const a = createRng(5);
    const b = createRng(5);
    a.next();
    a.next();
    a.next();
    // b is untouched by a's draws.
    assert.equal(b.next(), createRng(5).next());
  });
});

describe('Engine reproducibility', () => {
  it('reproduces a run exactly from its reported seed', () => {
    // The result carries the seed so whoever receives a report can replay it,
    // not just whoever produced it.
    const first = simulateProcess(buildLine(), 30);
    const replay = simulateProcess(buildLine(), 30, { seed: first.seed });

    assert.equal(replay.seed, first.seed);
    assert.deepEqual(replay.nodeReports, first.nodeReports);
    assert.equal(replay.totalUnitsPackaged, first.totalUnitsPackaged);
    assert.equal(replay.totalUnitsScrapped, first.totalUnitsScrapped);
  });

  it('gives different results for different seeds, so the seed is real', () => {
    const outcomes = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      outcomes.add(JSON.stringify(simulateProcess(buildLine(), 30).totalUnitsScrapped));
      outcomes.add(String(simulateProcess(buildLine(), 30, { seed }).totalUnitsScrapped));
    }
    assert.ok(
      outcomes.size > 1,
      'Every seed produced the same scrap count; the seed is not reaching the draws'
    );
  });

  it('derives the default seed from the graph id, so identity implies reproducibility', () => {
    const a = simulateProcess(buildLine('line-A'), 30);
    const b = simulateProcess(buildLine('line-A'), 30);
    const c = simulateProcess(buildLine('line-B'), 30);

    assert.equal(a.seed, b.seed);
    assert.deepEqual(a.nodeReports, b.nodeReports);
    assert.notEqual(a.seed, c.seed, 'A different graph should not silently share a seed');
  });

  it('exposes the seed on the engine as well as the result', () => {
    const engine = new SimulationEngine(buildLine(), { seed: 4242 });
    assert.equal(engine.seed, 4242);
    assert.equal(engine.run(5).seed, 4242);
  });

  it('uses the documented default when a graph has no id to hash', () => {
    assert.equal(createRng().seed, DEFAULT_SIMULATION_SEED);
  });

  it('lets two designs be compared under identical random draws', () => {
    // This is the point of the whole exercise: if the seed moves between runs,
    // a throughput difference between two designs might just be noise.
    const slow = buildLine('compare');
    const fast = buildLine('compare');
    (fast.nodes[1]!.config as Record<string, unknown>).maxSpeedUnitsPerMinute = 60;

    const a = simulateProcess(slow, 30, { seed: 777 });
    const b = simulateProcess(fast, 30, { seed: 777 });

    assert.equal(a.seed, b.seed);
    assert.ok(
      b.totalUnitsPackaged >= a.totalUnitsPackaged,
      `A faster labeler should not package fewer units under the same seed ` +
        `(slow=${a.totalUnitsPackaged}, fast=${b.totalUnitsPackaged})`
    );
  });
});
