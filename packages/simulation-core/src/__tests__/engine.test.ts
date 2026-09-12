import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { ProcessGraph } from '@process-forge/protocol';
import { PriorityQueue } from '../priority-queue.js';
import { simulateProcess } from '../engine.js';

describe('Simulation Priority Queue', () => {
  it('dequeues elements in strict ascending timestamp order', () => {
    const pq = new PriorityQueue<string>();
    pq.enqueue('evt-3', 30.5);
    pq.enqueue('evt-1', 10.0);
    pq.enqueue('evt-2', 20.0);
    pq.enqueue('evt-0', 5.2);

    assert.equal(pq.dequeue(), 'evt-0');
    assert.equal(pq.dequeue(), 'evt-1');
    assert.equal(pq.dequeue(), 'evt-2');
    assert.equal(pq.dequeue(), 'evt-3');
    assert.equal(pq.isEmpty(), true);
  });
});

describe('Simulation Engine - Paint Packaging Line', () => {
  const lineGraph: ProcessGraph = {
    id: 'paint-line-sim-01',
    name: 'Paint Filling and Labeling Simulation Line',
    version: '1.0.0',
    metadata: {},
    nodes: [
      {
        id: 'filler-1',
        name: '10-Nozzle Rotary Filler',
        kind: 'ROTARY_FILLER',
        position: { x: 100, y: 100 },
        inputs: [],
        outputs: [
          {
            id: 'cans-out',
            name: 'Filled Cans',
            type: 'DISCRETE_OUTPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        config: {
          nozzleCount: 10,
          containerVolumeGallons: 1.0,
          fillTimePerCycleSeconds: 10,
          indexTimePerCycleSeconds: 2, // 12s cycle = 50 cans/min max
          bufferQueueCapacity: 40,
          rejectRatePercentage: 1.0
        }
      },
      {
        id: 'labeler-1',
        name: 'High-Speed Labeler',
        kind: 'LABELER',
        position: { x: 300, y: 100 },
        inputs: [
          {
            id: 'cans-in',
            name: 'Unlabeled Cans',
            type: 'DISCRETE_INPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        outputs: [
          {
            id: 'labeled-out',
            name: 'Labeled Cans',
            type: 'DISCRETE_OUTPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        config: {
          maxSpeedUnitsPerMinute: 45, // Slightly lower than 50 -> acts as throttle
          labelRollCapacity: 5000,
          opticalInspectionFailRate: 0.5,
          rejectChuteEnabled: true
        }
      },
      {
        id: 'palletizer-1',
        name: 'Automatic Palletizer',
        kind: 'PALLETIZER',
        position: { x: 500, y: 100 },
        inputs: [
          {
            id: 'cans-in',
            name: 'Packaged Cans',
            type: 'DISCRETE_INPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        outputs: [],
        config: {
          containersPerLayer: 20,
          layersPerSkid: 4,
          cycleSecondsPerLayer: 25 // 48 cans/min max
        }
      }
    ],
    edges: [
      {
        id: 'e1',
        sourceNodeId: 'filler-1',
        sourcePortId: 'cans-out',
        targetNodeId: 'labeler-1',
        targetPortId: 'cans-in',
        stream: {
          type: 'DISCRETE_CONTAINER_STREAM',
          targetPiecesPerMinute: 50,
          containerVolumeGallons: 1.0,
          containerType: 'CAN_1_GAL'
        }
      },
      {
        id: 'e2',
        sourceNodeId: 'labeler-1',
        sourcePortId: 'labeled-out',
        targetNodeId: 'palletizer-1',
        targetPortId: 'cans-in',
        stream: {
          type: 'DISCRETE_CONTAINER_STREAM',
          targetPiecesPerMinute: 45,
          containerVolumeGallons: 1.0,
          containerType: 'CAN_1_GAL'
        }
      }
    ]
  };

  it('executes a 30-minute simulation with high performance and realistic bottleneck dynamics', () => {
    const result = simulateProcess(lineGraph, 30); // 30 minutes of simulated factory time

    assert.equal(result.durationMinutes, 30);
    assert.equal(result.simulatedTimeSeconds, 1800);
    assert.ok(
      result.wallClockExecutionTimeMs < 1000,
      `Expected execution in < 1s, took ${result.wallClockExecutionTimeMs}ms`
    );

    // Units were produced and packaged
    assert.ok(result.totalUnitsPackaged > 500, `Packaged: ${result.totalUnitsPackaged}`);
    assert.ok(result.totalUnitsScrapped >= 0, `Scrapped: ${result.totalUnitsScrapped}`);

    // Verification of OEE Reports
    const fillerReport = result.nodeReports['filler-1'];
    const labelerReport = result.nodeReports['labeler-1'];
    const palletizerReport = result.nodeReports['palletizer-1'];

    assert.ok(fillerReport, 'Filler report missing');
    assert.ok(labelerReport, 'Labeler report missing');
    assert.ok(palletizerReport, 'Palletizer report missing');

    // Labeler is the line bottleneck (45 cpm vs 50 cpm filler)
    // Therefore filler should experience blocked time
    assert.ok(fillerReport.blockedTimeSeconds > 0, 'Filler should experience buffer backpressure');

    // Quality percentage should be between 95% and 100%
    assert.ok(fillerReport.qualityPercentage >= 95);
    assert.ok(labelerReport.qualityPercentage >= 95);
  });
});
