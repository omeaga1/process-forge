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

export const BEVERAGE_BOTTLING_LINE: ProcessGraph = {
  id: 'beverage-bottling-twin-01',
  name: 'High-Speed Beverage Bottling & Carbonation Line',
  version: '1.0.0',
  metadata: {
    facility: 'Apex Beverage Bottling Facility',
    productLine: 'Sparkling Mineral Water 500ml',
    containerType: '500ml PET Bottle'
  },
  nodes: [
    {
      id: 'carbonator-100',
      name: 'Carbo-Cooler Blending Matrix',
      kind: 'BATCH_REACTOR',
      position: { x: 50, y: 150 },
      inputs: [],
      outputs: [
        {
          id: 'out-carbonated',
          name: 'Carbonated Beverage Flow',
          type: 'FLUID_OUTPUT',
          flowDimension: 'CONTINUOUS_VOLUME'
        }
      ],
      config: {
        batchVolumeGallons: 2000,
        fillDurationMinutes: 15,
        reactionDurationMinutes: 30,
        dischargeRateGpm: 80,
        fluid: {
          name: 'Chilled Carbonated Water (3.8 vol CO2)',
          densityGPerCm3: 1.01,
          viscosityCentipoise: 1.1,
          temperatureCelsius: 4
        }
      },
      assignedSubAgentId: 'subagent-carbonator-100',
      dressing: {
        nozzles: [
          { id: 'N1', name: 'Treated Water Inlet', role: 'inlet', x: 20, y: 15, position: 'top', sizeInches: 4, ratingPsi: 150 },
          { id: 'N2', name: 'CO2 Gas Injection Header', role: 'utility', x: 50, y: 10, position: 'top', sizeInches: 2, ratingPsi: 300 },
          { id: 'N3', name: 'Syrup Dosing Inlet', role: 'inlet', x: 80, y: 20, position: 'top', sizeInches: 2, ratingPsi: 150 },
          { id: 'N4', name: 'Product Outfeed', role: 'outlet', x: 50, y: 95, position: 'bottom', sizeInches: 3, ratingPsi: 150 }
        ],
        internals: {
          agitatorType: 'propeller',
          agitatorRpm: 240,
          hasJacket: true,
          jacketType: 'glycol',
          jacketPressurePsi: 90,
          baffleCount: 4,
          packingType: 'structured',
          hasDemister: true,
          hasSprayHeader: true
        },
        notes: 'Deaeration and isobaric carbonation system with glycol-chilled falling film plate'
      }
    },
    {
      id: 'filler-capper-200',
      name: 'Isobaric Rotary Filler & Capper',
      kind: 'ROTARY_FILLER',
      position: { x: 400, y: 150 },
      inputs: [
        {
          id: 'in-fluid',
          name: 'Beverage Supply',
          type: 'FLUID_INPUT',
          flowDimension: 'CONTINUOUS_VOLUME'
        }
      ],
      outputs: [
        {
          id: 'out-bottles',
          name: 'Capped Bottles',
          type: 'DISCRETE_OUTPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      config: {
        fillHeadCount: 48,
        containerVolumeGallons: 0.264,
        fillSpeedUnitsPerMinute: 300,
        fillToleranceMl: 1.5,
        nozzleType: 'ELECTROPNEUMATIC_COUNTERPRESSURE',
        rejectRatePercent: 0.2
      },
      assignedSubAgentId: 'subagent-filler-200',
      dressing: {
        nozzles: [
          { id: 'N1', name: 'Isobaric Fluid Manifold', role: 'inlet', x: 10, y: 50, position: 'left', sizeInches: 3, ratingPsi: 150 },
          { id: 'N2', name: 'Counterpressure Return Vent', role: 'vent', x: 50, y: 10, position: 'top', sizeInches: 2, ratingPsi: 150 },
          { id: 'N3', name: 'CIP Sanitation Infeed', role: 'utility', x: 90, y: 30, position: 'right', sizeInches: 2, ratingPsi: 150 }
        ],
        internals: {
          agitatorType: 'none',
          agitatorRpm: 0,
          hasJacket: false,
          jacketType: 'none',
          jacketPressurePsi: 0,
          baffleCount: 0,
          packingType: 'none',
          hasDemister: false,
          hasSprayHeader: true
        },
        notes: 'Monobloc 48-valve isobaric filler with pick-and-place rotary crown/screw capper'
      }
    },
    {
      id: 'accumulation-300',
      name: 'Dynamic Spiral Accumulation Table',
      kind: 'CONVEYOR',
      position: { x: 750, y: 150 },
      inputs: [
        {
          id: 'in-bottles',
          name: 'Filled Bottles Infeed',
          type: 'DISCRETE_INPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      outputs: [
        {
          id: 'out-bottles',
          name: 'Buffered Bottles Outfeed',
          type: 'DISCRETE_OUTPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      config: {
        lengthMeters: 24,
        speedMetersPerMinute: 35,
        maxBufferCapacityUnits: 180,
        sensorCheckIntervalMs: 100,
        jamProbabilityPercent: 0.05
      },
      assignedSubAgentId: 'subagent-accumulation-300',
      dressing: {
        nozzles: [],
        internals: {
          agitatorType: 'none',
          agitatorRpm: 0,
          hasJacket: false,
          jacketType: 'none',
          jacketPressurePsi: 0,
          baffleCount: 0,
          packingType: 'none',
          hasDemister: false,
          hasSprayHeader: false
        },
        notes: 'Low-backpressure dynamic bi-directional accumulation table'
      }
    },
    {
      id: 'labeler-400',
      name: 'Rotary Roll-Fed Sleeve Labeler',
      kind: 'LABELER',
      position: { x: 1100, y: 150 },
      inputs: [
        {
          id: 'in-bottles',
          name: 'Unlabeled Bottles',
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
        applicationRateUnitsPerMinute: 280,
        labelRollCapacityUnits: 5000,
        glueTemperatureCelsius: 140,
        opticalVisionCheckEnabled: true,
        misalignmentToleranceMm: 0.8
      },
      assignedSubAgentId: 'subagent-labeler-400',
      dressing: {
        nozzles: [],
        internals: {
          agitatorType: 'none',
          agitatorRpm: 0,
          hasJacket: false,
          jacketType: 'none',
          jacketPressurePsi: 0,
          baffleCount: 0,
          packingType: 'none',
          hasDemister: false,
          hasSprayHeader: false
        },
        notes: 'Rotary carousel hot-melt OPP wrap-around labeling unit with high-speed Cognex vision verification'
      }
    }
  ],
  edges: [
    {
      id: 'e-carb-filler',
      sourceNodeId: 'carbonator-100',
      sourcePortId: 'out-carbonated',
      targetNodeId: 'filler-capper-200',
      targetPortId: 'in-fluid',
      stream: {
        type: 'CONTINUOUS_FLUID',
        designFlowRateGpm: 80,
        operatingPressurePsi: 65,
        pipeDiameterInches: 3.0,
        fluid: {
          name: 'Chilled Carbonated Water',
          densityGPerCm3: 1.01,
          viscosityCentipoise: 1.1,
          temperatureCelsius: 4
        }
      }
    },
    {
      id: 'e-filler-accum',
      sourceNodeId: 'filler-capper-200',
      sourcePortId: 'out-bottles',
      targetNodeId: 'accumulation-300',
      targetPortId: 'in-bottles',
      stream: {
        type: 'DISCRETE_CONTAINER_STREAM',
        targetPiecesPerMinute: 300,
        containerVolumeGallons: 0.264,
        containerType: 'BOTTLE_1_LITER'
      }
    },
    {
      id: 'e-accum-labeler',
      sourceNodeId: 'accumulation-300',
      sourcePortId: 'out-bottles',
      targetNodeId: 'labeler-400',
      targetPortId: 'in-bottles',
      stream: {
        type: 'DISCRETE_CONTAINER_STREAM',
        targetPiecesPerMinute: 280,
        containerVolumeGallons: 0.264,
        containerType: 'BOTTLE_1_LITER'
      }
    }
  ]
};

export const BLANK_LINE: ProcessGraph = {
  id: 'blank-canvas-01',
  name: 'Custom Process Flow',
  version: '1.0.0',
  metadata: {
    facility: 'Custom Facility',
    productLine: 'New Process Line',
    containerType: 'Custom'
  },
  nodes: [],
  edges: []
};

