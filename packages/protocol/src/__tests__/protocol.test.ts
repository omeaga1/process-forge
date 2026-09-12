import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  UnitConverters,
  validateProcessGraph,
  type ProcessGraph,
  GenerativeInspectorWidgetSchema
} from '../index.js';

describe('Protocol Unit Converters', () => {
  it('converts gpm to liters per minute accurately', () => {
    const lpm = UnitConverters.gallonsPerMinToLitersPerMin(10);
    assert.equal(Math.round(lpm * 100) / 100, 37.85);
  });

  it('calculates discrete units per minute from fluid rate and container volume', () => {
    // 50 gallons/min feeding 1-gallon cans = 50 cans/min
    const cansPerMin = UnitConverters.volumetricRateToDiscreteUnitsPerMin(50, 1.0);
    assert.equal(cansPerMin, 50);

    // 50 gallons/min feeding 5-gallon pails = 10 pails/min
    const pailsPerMin = UnitConverters.volumetricRateToDiscreteUnitsPerMin(50, 5.0);
    assert.equal(pailsPerMin, 10);
  });

  it('calculates required machine cycle seconds', () => {
    // 40 cans/min target with a 10-nozzle machine -> 4 cycles/min -> 15 seconds per cycle
    const cycleSec = UnitConverters.calculateRequiredCycleSeconds(40, 10);
    assert.equal(cycleSec, 15);
  });
});

describe('Process Graph Validation & Bottleneck Engine', () => {
  it('detects mismatched flow dimensions on direct fluid-to-discrete connection', () => {
    const invalidGraph: ProcessGraph = {
      id: 'g-invalid-01',
      name: 'Mismatched Line',
      version: '1.0.0',
      metadata: {},
      nodes: [
        {
          id: 'tank-1',
          name: 'Storage Tank',
          kind: 'SURGE_TANK',
          position: { x: 0, y: 0 },
          inputs: [],
          outputs: [
            {
              id: 'out-1',
              name: 'Discharge',
              type: 'FLUID_OUTPUT',
              flowDimension: 'CONTINUOUS_VOLUME'
            }
          ],
          config: {
            capacityGallons: 1000,
            initialLevelGallons: 500,
            maxDischargeRateGpm: 40,
            lowLevelAlarmPercentage: 10,
            highLevelAlarmPercentage: 90
          }
        },
        {
          id: 'labeler-1',
          name: 'Labeling Station',
          kind: 'LABELER',
          position: { x: 200, y: 0 },
          inputs: [
            {
              id: 'in-1',
              name: 'Infeed',
              type: 'DISCRETE_INPUT',
              flowDimension: 'DISCRETE_CONTAINER'
            }
          ],
          outputs: [],
          config: {
            maxSpeedUnitsPerMinute: 60,
            labelRollCapacity: 5000,
            opticalInspectionFailRate: 0.1,
            rejectChuteEnabled: true
          }
        }
      ],
      edges: [
        {
          id: 'edge-invalid-direct',
          sourceNodeId: 'tank-1',
          sourcePortId: 'out-1',
          targetNodeId: 'labeler-1',
          targetPortId: 'in-1',
          stream: {
            type: 'CONTINUOUS_FLUID',
            designFlowRateGpm: 40,
            operatingPressurePsi: 30,
            pipeDiameterInches: 2.0,
            fluid: {
              name: 'Latex Paint',
              densityGPerCm3: 1.2,
              viscosityCentipoise: 1500,
              temperatureCelsius: 22
            }
          }
        }
      ]
    };

    const result = validateProcessGraph(invalidGraph);
    assert.equal(result.valid, false);
    assert.equal(result.diagnostics.length > 0, true);
    const mismatchDiag = result.diagnostics.find((d) => d.code === 'FLOW_DIMENSION_MISMATCH');
    assert.ok(mismatchDiag, 'Expected FLOW_DIMENSION_MISMATCH diagnostic');
  });

  it('accurately identifies line bottleneck in multi-machine paint canning line', () => {
    // 10-nozzle filler: fill=10s, index=2s -> 12s/cycle -> 5 cycles/min * 10 nozzles = 50 cans/min
    // Labeler: max speed = 35 cans/min (The Bottleneck!)
    // Palletizer: 20 containers per layer, 30 sec per layer -> 40 cans/min
    const lineGraph: ProcessGraph = {
      id: 'paint-line-1',
      name: 'Sherwin-Williams Packaging Line Mock',
      version: '1.0.0',
      metadata: {},
      nodes: [
        {
          id: 'filler-1',
          name: '10-Nozzle Rotary Filler',
          kind: 'ROTARY_FILLER',
          position: { x: 100, y: 100 },
          inputs: [
            {
              id: 'fluid-in',
              name: 'Paint Infeed',
              type: 'FLUID_INPUT',
              flowDimension: 'CONTINUOUS_VOLUME'
            }
          ],
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
            indexTimePerCycleSeconds: 2,
            bufferQueueCapacity: 50,
            rejectRatePercentage: 0.5,
            meanTimeBetweenFailuresMinutes: 480,
            meanTimeToRepairMinutes: 15
          }
        },
        {
          id: 'labeler-1',
          name: 'Pressure Sensitive Labeler',
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
            maxSpeedUnitsPerMinute: 35, // Bottleneck constraint!
            labelRollCapacity: 3000,
            opticalInspectionFailRate: 0.2,
            rejectChuteEnabled: true
          }
        },
        {
          id: 'palletizer-1',
          name: 'End-of-Line Palletizer',
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
            cycleSecondsPerLayer: 30, // 40 cans/min
            skidChangeoverSeconds: 30
          }
        }
      ],
      edges: [
        {
          id: 'e-filler-labeler',
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
          id: 'e-labeler-palletizer',
          sourceNodeId: 'labeler-1',
          sourcePortId: 'labeled-out',
          targetNodeId: 'palletizer-1',
          targetPortId: 'cans-in',
          stream: {
            type: 'DISCRETE_CONTAINER_STREAM',
            targetPiecesPerMinute: 35,
            containerVolumeGallons: 1.0,
            containerType: 'CAN_1_GAL'
          }
        }
      ]
    };

    const result = validateProcessGraph(lineGraph);
    assert.equal(result.valid, true);
    assert.equal(result.bottlenecks.bottleneckNodeId, 'labeler-1');
    assert.equal(result.bottlenecks.maximumSystemThroughputUnitsPerMin, 35);
    assert.equal(result.bottlenecks.utilizationByNode['labeler-1'], 100);
    // Filler running at 35/50 = 70% capacity
    assert.equal(Math.round(result.bottlenecks.utilizationByNode['filler-1']!), 70);
  });
});

describe('Generative UI Schema Validation', () => {
  it('validates CopilotKit dynamic inspector payload', () => {
    const validInspector = {
      widgetType: 'ROTARY_FILLER_INSPECTOR' as const,
      nodeId: 'filler-101',
      title: '10-Nozzle Rotary Can Filler Inspector',
      interactiveControls: [
        {
          fieldKey: 'nozzleCount',
          label: 'Active Nozzles',
          type: 'SLIDER' as const,
          min: 1,
          max: 24,
          step: 1,
          currentValue: 10
        },
        {
          fieldKey: 'fillTimePerCycleSeconds',
          label: 'Fill Dwell Time (s)',
          type: 'NUMBER_INPUT' as const,
          min: 1,
          max: 60,
          step: 0.5,
          currentValue: 10.5
        }
      ],
      physicalValidationBadges: [
        {
          label: 'Mass Balance Continuity',
          status: 'PASS' as const,
          detail: '45 gpm fluid feed matches 45 cans/min output volume'
        }
      ]
    };

    const parsed = GenerativeInspectorWidgetSchema.safeParse(validInspector);
    assert.equal(parsed.success, true);
  });
});
