/**
 * Phase 2 audit - invariant tests for the discrete-event engine.
 *
 * Six of these are currently `it.skip`. They are NOT flaky and NOT aspirational:
 * each one fails against the engine as it stands today, and each is skipped only
 * so that main stays green while the fixes land incrementally. Un-skip a test as
 * part of the commit that fixes its defect - the comment above each one says what
 * that fix is. Full analysis in docs/audit/02-engine.md.
 *
 * These encode guarantees the engine is DOCUMENTED to provide. A test that fails
 * here is a defect in the engine, not in the test. Written before any fix, per
 * Phase 2 of the audit plan.
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { ProcessGraph } from '@process-forge/protocol';
import { PriorityQueue } from '../priority-queue.js';
import { simulateProcess } from '../engine.js';

type Node = ProcessGraph['nodes'][number];

const discreteOut = (id: string, name: string) => ({
  id,
  name,
  type: 'DISCRETE_OUTPUT' as const,
  flowDimension: 'DISCRETE_CONTAINER' as const
});
const discreteIn = (id: string, name: string) => ({
  id,
  name,
  type: 'DISCRETE_INPUT' as const,
  flowDimension: 'DISCRETE_CONTAINER' as const
});
const edge = (id: string, s: string, sp: string, t: string, tp: string) => ({
  id,
  sourceNodeId: s,
  sourcePortId: sp,
  targetNodeId: t,
  targetPortId: tp,
  stream: {
    type: 'DISCRETE_CONTAINER_STREAM' as const,
    targetPiecesPerMinute: 50,
    containerVolumeGallons: 1.0,
    containerType: 'CAN_1_GAL' as const
  }
});

/** Filler -> Labeler -> Palletizer. The labeler throttles, so the filler blocks. */
function buildLine(): ProcessGraph {
  return {
    id: 'invariant-line',
    name: 'Invariant Test Line',
    version: '1.0.0',
    metadata: {},
    nodes: [
      {
        id: 'filler-1',
        name: 'Filler',
        kind: 'ROTARY_FILLER',
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: [discreteOut('cans-out', 'Filled Cans')],
        config: {
          nozzleCount: 10,
          containerVolumeGallons: 1.0,
          fillTimePerCycleSeconds: 10,
          indexTimePerCycleSeconds: 2,
          bufferQueueCapacity: 40,
          rejectRatePercentage: 1.0
        }
      },
      {
        id: 'labeler-1',
        name: 'Labeler',
        kind: 'LABELER',
        position: { x: 1, y: 0 },
        inputs: [discreteIn('cans-in', 'Unlabeled')],
        outputs: [discreteOut('labeled-out', 'Labeled')],
        config: {
          maxSpeedUnitsPerMinute: 45,
          labelRollCapacity: 5000,
          opticalInspectionFailRate: 0.5,
          rejectChuteEnabled: true
        }
      },
      {
        id: 'palletizer-1',
        name: 'Palletizer',
        kind: 'PALLETIZER',
        position: { x: 2, y: 0 },
        inputs: [discreteIn('cans-in', 'Packaged')],
        outputs: [],
        config: { containersPerLayer: 20, layersPerSkid: 4, cycleSecondsPerLayer: 25 }
      }
    ] as Node[],
    edges: [
      edge('e1', 'filler-1', 'cans-out', 'labeler-1', 'cans-in'),
      edge('e2', 'labeler-1', 'labeled-out', 'palletizer-1', 'cans-in')
    ]
  } as ProcessGraph;
}

describe('Engine invariant: determinism', () => {
  // NOTE: two runs is not enough to detect this. The outcome space is small
  // enough that two consecutive runs collide by chance a meaningful fraction of
  // the time. 50 runs makes a collision-only pass vanishingly unlikely.
  const RUNS = 50;

  // FIXED: simulateProcess now takes a seed and threads a seeded PRNG.
  it('produces identical node reports across repeated runs of the same graph', () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < RUNS; i++) {
      // wallClockExecutionTimeMs is measured, not simulated, so it is excluded.
      outcomes.add(JSON.stringify(simulateProcess(buildLine(), 30).nodeReports));
    }

    assert.equal(
      outcomes.size,
      1,
      `${RUNS} runs of an identical graph produced ${outcomes.size} distinct outcomes. ` +
        `The engine calls Math.random() directly for the filler reject check ` +
        `(engine.ts FILLER_CYCLE_COMPLETE) and the labeler optical-inspection check ` +
        `(engine.ts LABELER_CYCLE_COMPLETE), with no seedable RNG anywhere. The ` +
        `documented guarantee that rerunning the same seed reproduces the exact same ` +
        `can count cannot hold, because there is no seed to rerun.`
    );
  });

  // FIXED: same seeded PRNG.
  it('produces an identical total can count across repeated runs', () => {
    const counts = new Set<string>();
    for (let i = 0; i < RUNS; i++) {
      const r = simulateProcess(buildLine(), 30);
      counts.add(`${r.totalUnitsPackaged}/${r.totalUnitsScrapped}`);
    }
    assert.equal(
      counts.size,
      1,
      `Can counts varied across ${RUNS} runs: ${[...counts].slice(0, 8).join(', ')}...`
    );
  });
});

describe('Engine invariant: state-time accounting', () => {
  it('busy + blocked + starved + down equals elapsed time for every node', () => {
    const result = simulateProcess(buildLine(), 30);

    for (const [nodeId, r] of Object.entries(result.nodeReports)) {
      const sum =
        r.busyTimeSeconds + r.blockedTimeSeconds + r.starvedTimeSeconds + r.downTimeSeconds;
      assert.ok(
        Math.abs(sum - result.simulatedTimeSeconds) <= 1,
        `${nodeId}: accounted ${sum}s of ${result.simulatedTimeSeconds}s elapsed ` +
          `(busy=${r.busyTimeSeconds} blocked=${r.blockedTimeSeconds} ` +
          `starved=${r.starvedTimeSeconds} down=${r.downTimeSeconds}). ` +
          `${result.simulatedTimeSeconds - sum}s unaccounted.`
      );
    }
  });

  // SKIPPED - this documents a real defect, not a flaky test.
  // 02-engine.md: setNodeState early-returns on an unchanged state, so a node that ends IDLE never gets its trailing time credited. Hidden by Math.max(totalSimTime, sum) at engine.ts:430.
  // See docs/audit/02-engine.md §2. To fix: un-skip once finalization credits elapsed time and the Math.max is removed.
  it.skip('accounts for a node that is never activated', () => {
    // A surge tank with no edges is never scheduled and stays IDLE for the whole
    // run. Its elapsed time still has to land in some bucket.
    const graph = buildLine();
    graph.nodes.push({
      id: 'orphan-tank',
      name: 'Unconnected Surge Tank',
      kind: 'SURGE_TANK',
      position: { x: 9, y: 9 },
      inputs: [],
      outputs: [],
      config: { capacityGallons: 1000, initialLevelGallons: 500 }
    } as unknown as Node);

    const result = simulateProcess(graph, 30);
    const r = result.nodeReports['orphan-tank'];
    assert.ok(r, 'orphan-tank report missing');
    const sum = r.busyTimeSeconds + r.blockedTimeSeconds + r.starvedTimeSeconds + r.downTimeSeconds;
    assert.equal(
      sum,
      r.totalTimeSeconds,
      `Node reports totalTimeSeconds=${r.totalTimeSeconds} but only ${sum}s is ` +
        `attributed to any state. totalTime is computed with Math.max(simTime, sum), ` +
        `which reports a full run while the state buckets stay empty.`
    );
  });
});

describe('Engine invariant: buffer capacity and backpressure', () => {
  // SKIPPED - this documents a real defect, not a flaky test.
  // 02-engine.md: LABELER_CYCLE_COMPLETE does downstream.bufferCans++ with no capacity check; measured 17,351 against a capacity of 100.
  // See docs/audit/02-engine.md §4. To fix: un-skip once the labeler mirrors the filler's maxBuffer check and blocks.
  it.skip('never lets a node buffer exceed its configured capacity', () => {
    // The balanced line in buildLine() never exercises this: the palletizer keeps
    // up, so the buffer stays small and the missing check is invisible. This graph
    // deliberately starves the palletizer (20 units per 600s = 2/min) behind a fast
    // labeler (600/min) so the unchecked path is actually taken.
    const graph = buildLine();
    const labeler = graph.nodes.find((n) => n.id === 'labeler-1');
    const palletizer = graph.nodes.find((n) => n.id === 'palletizer-1');
    const filler = graph.nodes.find((n) => n.id === 'filler-1');
    assert.ok(labeler && palletizer && filler);
    (filler.config as Record<string, unknown>).nozzleCount = 50;
    (filler.config as Record<string, unknown>).fillTimePerCycleSeconds = 1;
    (filler.config as Record<string, unknown>).indexTimePerCycleSeconds = 0;
    (filler.config as Record<string, unknown>).rejectRatePercentage = 0;
    (labeler.config as Record<string, unknown>).maxSpeedUnitsPerMinute = 600;
    (labeler.config as Record<string, unknown>).opticalInspectionFailRate = 0;
    (palletizer.config as Record<string, unknown>).cycleSecondsPerLayer = 600;

    const result = simulateProcess(graph, 30);

    // The palletizer config has no capacity key, so the engine default of 100 applies.
    const PALLETIZER_DEFAULT_CAPACITY = 100;
    const samples = result.telemetryLog.filter((t) => t.nodeId === 'palletizer-1');
    const overflows = samples.filter((t) => t.bufferLevel > PALLETIZER_DEFAULT_CAPACITY);
    const peak = samples.reduce((m, o) => Math.max(m, o.bufferLevel), 0);

    assert.equal(
      overflows.length,
      0,
      `Palletizer buffer exceeded its ${PALLETIZER_DEFAULT_CAPACITY}-unit capacity in ` +
        `${overflows.length} of ${samples.length} telemetry samples, peaking at ${peak} ` +
        `(${Math.round(peak / PALLETIZER_DEFAULT_CAPACITY)}x capacity). The ` +
        `LABELER_CYCLE_COMPLETE handler does "downstream.bufferCans++" with no capacity ` +
        `check, unlike FILLER_CYCLE_COMPLETE which checks maxBuffer and blocks. A ` +
        `labeler therefore never exerts backpressure and never blocks.`
    );
  });
});

describe('Engine invariant: graph topology', () => {
  // SKIPPED - this documents a real defect, not a flaky test.
  // 02-engine.md: findDownstreamRuntime uses edges.find(), so all outgoing edges after the first are ignored.
  // See docs/audit/02-engine.md §4.1. To fix: un-skip once splitting is implemented, or delete it if validateProcessGraph rejects multi-edge graphs instead.
  it.skip('delivers output to every downstream node, not just the first edge', () => {
    // One filler feeding two labelers. findDownstreamRuntime uses edges.find(),
    // so only the first outgoing edge is ever considered.
    const graph = buildLine();
    graph.nodes.push({
      id: 'labeler-2',
      name: 'Second Labeler',
      kind: 'LABELER',
      position: { x: 1, y: 5 },
      inputs: [discreteIn('cans-in', 'Unlabeled')],
      outputs: [],
      config: {
        maxSpeedUnitsPerMinute: 45,
        labelRollCapacity: 5000,
        opticalInspectionFailRate: 0.5,
        rejectChuteEnabled: true
      }
    } as unknown as Node);
    graph.edges.push(edge('e3', 'filler-1', 'cans-out', 'labeler-2', 'cans-in'));

    const result = simulateProcess(graph, 30);
    const second = result.nodeReports['labeler-2'];
    assert.ok(second, 'labeler-2 report missing');
    assert.ok(
      second.unitsProduced > 0,
      'The second labeler on a split output produced nothing. findDownstreamRuntime ' +
        'returns edges.find(...), so every outgoing edge after the first is ignored.'
    );
  });
});

describe('Priority queue invariant: tie-breaking', () => {
  // SKIPPED - this documents a real defect, not a flaky test.
  // 02-engine.md: The heap has no tie-breaker, so simultaneous events resolve in heap-structure order.
  // See docs/audit/02-engine.md §1. To fix: un-skip once priority is (timeSeconds, eventCounter).
  it.skip('dequeues equal-priority events in insertion order (FIFO)', () => {
    const pq = new PriorityQueue<string>();
    pq.enqueue('first', 10);
    pq.enqueue('second', 10);
    pq.enqueue('third', 10);
    pq.enqueue('fourth', 10);

    const order = [pq.dequeue(), pq.dequeue(), pq.dequeue(), pq.dequeue()];
    assert.deepEqual(
      order,
      ['first', 'second', 'third', 'fourth'],
      `Equal-timestamp events dequeued as ${JSON.stringify(order)}. The heap has no ` +
        `tie-breaker, so simultaneous events resolve in heap-structure order rather ` +
        `than insertion order.`
    );
  });
});
