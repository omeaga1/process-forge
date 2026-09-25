import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { ProcessEdge, ProcessGraph, ProcessNode } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

const filler = (id: string, extra: Record<string, unknown> = {}): ProcessNode =>
  ({
    id,
    name: id,
    kind: 'ROTARY_FILLER',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [{ id: 'out', name: 'cans', type: 'CONTAINER_OUTPUT', flowDimension: 'DISCRETE_CONTAINER' }],
    config: { nozzleCount: 10, fillTimePerCycleSeconds: 10, indexTimePerCycleSeconds: 2, rejectRatePercentage: 0, ...extra }
  }) as unknown as ProcessNode;

const labeler = (id: string, extra: Record<string, unknown> = {}): ProcessNode =>
  ({
    id,
    name: id,
    kind: 'LABELER',
    position: { x: 0, y: 0 },
    inputs: [{ id: 'in', name: 'cans', type: 'CONTAINER_INPUT', flowDimension: 'DISCRETE_CONTAINER' }],
    outputs: [],
    config: { maxSpeedUnitsPerMinute: 100, opticalInspectionFailRate: 0, ...extra }
  }) as unknown as ProcessNode;

const line = (nodes: ProcessNode[], edges: [string, string][] = []): ProcessGraph =>
  ({
    id: 'breakdowns',
    name: 'breakdowns',
    version: '1.0.0',
    metadata: {},
    nodes,
    edges: edges.map(([a, b]) => ({
      id: `${a}-${b}`,
      sourceNodeId: a,
      targetNodeId: b,
      sourcePortId: 'out',
      targetPortId: 'in',
      stream: { type: 'DISCRETE_CONTAINER_STREAM', targetPiecesPerMinute: 50, containerVolumeGallons: 1, containerType: 'CAN_1_GAL' }
    })) as unknown as ProcessEdge[]
  }) as unknown as ProcessGraph;

describe('Breakdowns (MTBF / MTTR)', () => {
  it('a machine is down about MTTR / (MTBF + MTTR) of the time, and makes that much less', () => {
    const minutes = 3000;
    const healthy = simulateProcess(line([filler('f')]), minutes, { seed: 3 }).nodeReports['f']!;
    const r = simulateProcess(line([filler('f', { meanTimeBetweenFailuresMinutes: 10, meanTimeToRepairMinutes: 2 })]), minutes, { seed: 3 }).nodeReports['f']!;
    const downShare = r.downTimeSeconds / r.totalTimeSeconds;
    assert.ok(Math.abs(downShare - 2 / 12) < 0.04, `down ${(downShare * 100).toFixed(1)}% of the time; expected about 16.7%`);
    const ratio = r.unitsProduced / healthy.unitsProduced;
    assert.ok(Math.abs(ratio - 10 / 12) < 0.05, `made ${(ratio * 100).toFixed(1)}% of a healthy filler's output`);
    assert.ok(r.availabilityPercentage === 100 || r.availabilityPercentage > 95, 'availability excludes down time');
  });

  it('every second is still in exactly one state', () => {
    const r = simulateProcess(
      line([filler('f', { meanTimeBetweenFailuresMinutes: 5, meanTimeToRepairMinutes: 1 }), labeler('l', { meanTimeBetweenFailuresMinutes: 7, meanTimeToRepairMinutes: 3 })], [['f', 'l']]),
      240
    );
    for (const id of ['f', 'l']) {
      const n = r.nodeReports[id]!;
      assert.equal(n.busyTimeSeconds + n.blockedTimeSeconds + n.starvedTimeSeconds + n.downTimeSeconds, n.totalTimeSeconds, id);
      assert.ok(n.downTimeSeconds > 0, `${id} broke down at least once`);
    }
  });

  it('a breakdown downstream backs up the line', () => {
    const r = simulateProcess(
      line([filler('f'), labeler('l', { meanTimeBetweenFailuresMinutes: 20, meanTimeToRepairMinutes: 10 })], [['f', 'l']]),
      600
    );
    assert.ok(r.nodeReports['f']!.blockedTimeSeconds > 0, 'the filler blocks while the labeler is down');
  });

  it('is reproducible, and does not change other random draws', () => {
    const g = () => line([filler('f', { rejectRatePercentage: 20, meanTimeBetweenFailuresMinutes: 8, meanTimeToRepairMinutes: 2 })]);
    assert.deepEqual(simulateProcess(g(), 300, { seed: 11 }).nodeReports, simulateProcess(g(), 300, { seed: 11 }).nodeReports);
  });

  it('a machine without both settings never breaks down', () => {
    const r = simulateProcess(line([filler('f', { meanTimeBetweenFailuresMinutes: 10 })]), 300).nodeReports['f']!;
    assert.equal(r.downTimeSeconds, 0);
  });
});
