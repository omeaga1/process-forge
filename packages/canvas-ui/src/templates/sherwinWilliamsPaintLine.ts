import type { ProcessGraph } from '@process-forge/protocol';

export const SHERWIN_WILLIAMS_PAINT_LINE: ProcessGraph = {
  id: 'sherwin-williams-twin-01',
  name: 'Sherwin-Williams Architectural Paint Canning & Packaging Line',
  version: '1.0.0',
  metadata: {
    facility: 'Cleveland Coatings Plant',
    productLine: 'Interior Latex Semi-Gloss',
    containerType: '1-Gallon Steel Can'
  },
  nodes: [
    {
      id: 'reactor-101',
      name: 'Batch Reactor B-101 (Dispersion & Letdown)',
      kind: 'BATCH_REACTOR',
      position: { x: 50, y: 150 },
      inputs: [],
      outputs: [
        {
          id: 'out-fluid',
          name: 'Latex Discharge',
          type: 'FLUID_OUTPUT',
          flowDimension: 'CONTINUOUS_VOLUME'
        }
      ],
      config: {
        batchVolumeGallons: 1000,
        fillDurationMinutes: 20,
        reactionDurationMinutes: 45,
        dischargeRateGpm: 50,
        fluid: {
          name: 'Semi-Gloss Acrylic Latex',
          densityGPerCm3: 1.25,
          viscosityCentipoise: 1600,
          temperatureCelsius: 23
        }
      },
      assignedSubAgentId: 'subagent-reactor-101',
      dressing: {
        nozzles: [
          { id: 'N1', name: 'Raw Resin Charge', role: 'inlet', x: 20, y: 15, position: 'top', sizeInches: 4, ratingPsi: 150 },
          { id: 'N2', name: 'Vapor Vent / Scrubber Line', role: 'vent', x: 50, y: 10, position: 'top', sizeInches: 3, ratingPsi: 150 },
          { id: 'N3', name: 'Pigment Slurry Feed', role: 'inlet', x: 80, y: 20, position: 'top', sizeInches: 3, ratingPsi: 150 },
          { id: 'N4', name: 'Latex Bottom Discharge', role: 'outlet', x: 50, y: 95, position: 'bottom', sizeInches: 3, ratingPsi: 150 },
          { id: 'N5', name: 'Steam Jacket Infeed', role: 'utility', x: 10, y: 65, position: 'left', sizeInches: 2, ratingPsi: 150 }
        ],
        internals: {
          agitatorType: 'rushton',
          agitatorRpm: 120,
          hasJacket: true,
          jacketType: 'steam',
          jacketPressurePsi: 150,
          baffleCount: 4,
          packingType: 'none',
          hasDemister: false,
          hasSprayHeader: true
        },
        notes: 'High-shear dispersion cowl with Rushton flat-blade turbine and heating jacket'
      }
    },
    {
      id: 'surge-tank-200',
      name: 'Surge Buffer Tank ST-200',
      kind: 'SURGE_TANK',
      position: { x: 380, y: 150 },
      inputs: [
        {
          id: 'in-fluid',
          name: 'Infeed',
          type: 'FLUID_INPUT',
          flowDimension: 'CONTINUOUS_VOLUME'
        }
      ],
      outputs: [
        {
          id: 'out-fluid',
          name: 'Pump Discharge',
          type: 'FLUID_OUTPUT',
          flowDimension: 'CONTINUOUS_VOLUME'
        }
      ],
      config: {
        capacityGallons: 800,
        initialLevelGallons: 400,
        maxDischargeRateGpm: 45,
        lowLevelAlarmPercentage: 15,
        highLevelAlarmPercentage: 85
      },
      assignedSubAgentId: 'subagent-surge-200',
      dressing: {
        nozzles: [
          { id: 'N1', name: 'Latex Transfer Infeed', role: 'inlet', x: 30, y: 15, position: 'top', sizeInches: 3, ratingPsi: 150 },
          { id: 'N2', name: 'Nitrogen Purge Vent', role: 'vent', x: 60, y: 10, position: 'top', sizeInches: 2, ratingPsi: 150 },
          { id: 'N3', name: 'Transfer Pump Suction', role: 'outlet', x: 50, y: 95, position: 'bottom', sizeInches: 3, ratingPsi: 150 },
          { id: 'N4', name: 'Level Transmitter Tap', role: 'tap', x: 85, y: 50, position: 'right', sizeInches: 1, ratingPsi: 150 }
        ],
        internals: {
          agitatorType: 'none',
          hasJacket: false,
          jacketType: 'none',
          baffleCount: 0,
          packingType: 'none',
          hasDemister: true,
          hasSprayHeader: false
        },
        notes: 'Atmospheric surge vessel with radar level transmitter and demister pad'
      }
    },
    {
      id: 'rotary-filler-300',
      name: '10-Nozzle Rotary Piston Filler RF-300',
      kind: 'ROTARY_FILLER',
      position: { x: 720, y: 150 },
      inputs: [
        {
          id: 'in-fluid',
          name: 'Paint Infeed',
          type: 'FLUID_INPUT',
          flowDimension: 'CONTINUOUS_VOLUME'
        }
      ],
      outputs: [
        {
          id: 'out-cans',
          name: 'Filled Cans',
          type: 'DISCRETE_OUTPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      config: {
        nozzleCount: 10,
        containerVolumeGallons: 1.0,
        fillTimePerCycleSeconds: 10.5,
        indexTimePerCycleSeconds: 1.8,
        bufferQueueCapacity: 60,
        rejectRatePercentage: 0.8,
        meanTimeBetweenFailuresMinutes: 600,
        meanTimeToRepairMinutes: 12
      },
      assignedSubAgentId: 'subagent-filler-300'
    },
    {
      id: 'conveyor-400',
      name: 'Accumulation Conveyor CV-400',
      kind: 'CONVEYOR',
      position: { x: 1060, y: 150 },
      inputs: [
        {
          id: 'in-cans',
          name: 'Infeed',
          type: 'DISCRETE_INPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      outputs: [
        {
          id: 'out-cans',
          name: 'Discharge',
          type: 'DISCRETE_OUTPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      config: {
        lengthMeters: 12.0,
        speedMetersPerSecond: 0.4,
        itemSpacingMeters: 0.25,
        maxItemCapacity: 48
      },
      assignedSubAgentId: 'subagent-conveyor-400'
    },
    {
      id: 'labeler-500',
      name: 'High-Speed Rotary Labeler LB-500',
      kind: 'LABELER',
      position: { x: 1400, y: 150 },
      inputs: [
        {
          id: 'in-cans',
          name: 'Unlabeled Cans',
          type: 'DISCRETE_INPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      outputs: [
        {
          id: 'out-labeled',
          name: 'Labeled Cans',
          type: 'DISCRETE_OUTPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      config: {
        maxSpeedUnitsPerMinute: 35, // Deliberate plant bottleneck!
        labelRollCapacity: 4000,
        opticalInspectionFailRate: 0.3,
        rejectChuteEnabled: true
      },
      assignedSubAgentId: 'subagent-labeler-500'
    },
    {
      id: 'palletizer-600',
      name: 'Robotic End-of-Line Palletizer PL-600',
      kind: 'PALLETIZER',
      position: { x: 1740, y: 150 },
      inputs: [
        {
          id: 'in-cans',
          name: 'Labeled Cans',
          type: 'DISCRETE_INPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      outputs: [],
      config: {
        containersPerLayer: 20,
        layersPerSkid: 4,
        cycleSecondsPerLayer: 28,
        skidChangeoverSeconds: 25
      },
      assignedSubAgentId: 'subagent-palletizer-600'
    }
  ],
  edges: [
    {
      id: 'e-reactor-surge',
      sourceNodeId: 'reactor-101',
      sourcePortId: 'out-fluid',
      targetNodeId: 'surge-tank-200',
      targetPortId: 'in-fluid',
      stream: {
        type: 'CONTINUOUS_FLUID',
        designFlowRateGpm: 50,
        operatingPressurePsi: 35,
        pipeDiameterInches: 2.5,
        fluid: {
          name: 'Semi-Gloss Acrylic Latex',
          densityGPerCm3: 1.25,
          viscosityCentipoise: 1600,
          temperatureCelsius: 23
        }
      }
    },
    {
      id: 'e-surge-filler',
      sourceNodeId: 'surge-tank-200',
      sourcePortId: 'out-fluid',
      targetNodeId: 'rotary-filler-300',
      targetPortId: 'in-fluid',
      stream: {
        type: 'CONTINUOUS_FLUID',
        designFlowRateGpm: 45,
        operatingPressurePsi: 30,
        pipeDiameterInches: 2.0,
        fluid: {
          name: 'Semi-Gloss Acrylic Latex',
          densityGPerCm3: 1.25,
          viscosityCentipoise: 1600,
          temperatureCelsius: 23
        }
      }
    },
    {
      id: 'e-filler-conveyor',
      sourceNodeId: 'rotary-filler-300',
      sourcePortId: 'out-cans',
      targetNodeId: 'conveyor-400',
      targetPortId: 'in-cans',
      stream: {
        type: 'DISCRETE_CONTAINER_STREAM',
        targetPiecesPerMinute: 48,
        containerVolumeGallons: 1.0,
        containerType: 'CAN_1_GAL'
      }
    },
    {
      id: 'e-conveyor-labeler',
      sourceNodeId: 'conveyor-400',
      sourcePortId: 'out-cans',
      targetNodeId: 'labeler-500',
      targetPortId: 'in-cans',
      stream: {
        type: 'DISCRETE_CONTAINER_STREAM',
        targetPiecesPerMinute: 45,
        containerVolumeGallons: 1.0,
        containerType: 'CAN_1_GAL'
      }
    },
    {
      id: 'e-labeler-palletizer',
      sourceNodeId: 'labeler-500',
      sourcePortId: 'out-labeled',
      targetNodeId: 'palletizer-600',
      targetPortId: 'in-cans',
      stream: {
        type: 'DISCRETE_CONTAINER_STREAM',
        targetPiecesPerMinute: 35,
        containerVolumeGallons: 1.0,
        containerType: 'CAN_1_GAL'
      }
    }
  ]
};
