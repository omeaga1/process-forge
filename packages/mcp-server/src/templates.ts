import type { ProcessGraph } from '@process-forge/protocol';

export const SHERWIN_WILLIAMS_PAINT_LINE: ProcessGraph = {
  id: 'sherwin-williams-twin-01',
  name: 'Architectural Paint Canning & Packaging Line',
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
      assignedSubAgentId: 'subagent-reactor-101'
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
      assignedSubAgentId: 'subagent-surge-200'
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
        maxSpeedUnitsPerMinute: 35, // Deliberate plant bottleneck
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

export const BEVERAGE_BOTTLING_LINE: ProcessGraph = {
  id: 'beverage-bottling-02',
  name: 'High-Speed Beverage Bottling & Carbonation Line',
  version: '1.0.0',
  metadata: {
    facility: 'Atlanta Bottling Center',
    productLine: 'Sparkling Mineral Water',
    containerType: '1-Liter Bottle'
  },
  nodes: [
    {
      id: 'water-prep-01',
      name: 'Carbonation & Water Chiller',
      kind: 'SURGE_TANK',
      position: { x: 50, y: 150 },
      inputs: [],
      outputs: [
        {
          id: 'out-carbonated-water',
          name: 'Chilled Carbonated Stream',
          type: 'FLUID_OUTPUT',
          flowDimension: 'CONTINUOUS_VOLUME'
        }
      ],
      config: {
        capacityGallons: 1500,
        initialLevelGallons: 1200,
        maxDischargeRateGpm: 80
      },
      assignedSubAgentId: 'subagent-water-prep-01'
    },
    {
      id: 'rotary-filler-02',
      name: '40-Valve Isobaric Rotary Filler',
      kind: 'ROTARY_FILLER',
      position: { x: 420, y: 150 },
      inputs: [
        {
          id: 'in-fluid',
          name: 'Carbonated Water Infeed',
          type: 'FLUID_INPUT',
          flowDimension: 'CONTINUOUS_VOLUME'
        }
      ],
      outputs: [
        {
          id: 'out-bottles',
          name: 'Filled Bottles',
          type: 'DISCRETE_OUTPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      config: {
        nozzleCount: 40,
        containerVolumeGallons: 0.264,
        fillTimePerCycleSeconds: 4.2,
        indexTimePerCycleSeconds: 0.8,
        bufferQueueCapacity: 120,
        rejectRatePercentage: 0.2
      },
      assignedSubAgentId: 'subagent-rotary-filler-02'
    },
    {
      id: 'capper-03',
      name: 'High-Speed Rotary Crown Capper',
      kind: 'ROTARY_FILLER',
      position: { x: 800, y: 150 },
      inputs: [
        {
          id: 'in-bottles',
          name: 'Uncapped Bottles',
          type: 'DISCRETE_INPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      outputs: [
        {
          id: 'out-capped',
          name: 'Capped Bottles',
          type: 'DISCRETE_OUTPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      config: {
        nozzleCount: 16,
        containerVolumeGallons: 0.264,
        fillTimePerCycleSeconds: 2.0,
        indexTimePerCycleSeconds: 0.5,
        rejectRatePercentage: 0.1
      },
      assignedSubAgentId: 'subagent-capper-03'
    },
    {
      id: 'labeler-04',
      name: 'Hot-Melt Wrap-Around Labeler',
      kind: 'LABELER',
      position: { x: 1180, y: 150 },
      inputs: [
        {
          id: 'in-bottles',
          name: 'Capped Bottles',
          type: 'DISCRETE_INPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      outputs: [
        {
          id: 'out-labeled',
          name: 'Labeled Bottles',
          type: 'DISCRETE_OUTPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      config: {
        maxSpeedUnitsPerMinute: 120,
        labelRollCapacity: 10000,
        opticalInspectionFailRate: 0.15,
        rejectChuteEnabled: true
      },
      assignedSubAgentId: 'subagent-labeler-04'
    }
  ],
  edges: [
    {
      id: 'e-water-filler',
      sourceNodeId: 'water-prep-01',
      sourcePortId: 'out-carbonated-water',
      targetNodeId: 'rotary-filler-02',
      targetPortId: 'in-fluid',
      stream: {
        type: 'CONTINUOUS_FLUID',
        designFlowRateGpm: 60,
        operatingPressurePsi: 45,
        pipeDiameterInches: 2.5,
        fluid: {
          name: 'Chilled Carbonated Spring Water',
          densityGPerCm3: 1.0,
          viscosityCentipoise: 1.0,
          temperatureCelsius: 4
        }
      }
    },
    {
      id: 'e-filler-capper',
      sourceNodeId: 'rotary-filler-02',
      sourcePortId: 'out-bottles',
      targetNodeId: 'capper-03',
      targetPortId: 'in-bottles',
      stream: {
        type: 'DISCRETE_CONTAINER_STREAM',
        targetPiecesPerMinute: 140,
        containerVolumeGallons: 0.264,
        containerType: 'BOTTLE_1_LITER'
      }
    },
    {
      id: 'e-capper-labeler',
      sourceNodeId: 'capper-03',
      sourcePortId: 'out-capped',
      targetNodeId: 'labeler-04',
      targetPortId: 'in-bottles',
      stream: {
        type: 'DISCRETE_CONTAINER_STREAM',
        targetPiecesPerMinute: 135,
        containerVolumeGallons: 0.264,
        containerType: 'BOTTLE_1_LITER'
      }
    }
  ]
};

export const AVAILABLE_TEMPLATES: Record<string, ProcessGraph> = {
  'sherwin-williams-paint-line': SHERWIN_WILLIAMS_PAINT_LINE,
  'beverage-bottling-line': BEVERAGE_BOTTLING_LINE
};
