import type { NodeKind, ProcessNode, InternalsDressing } from '../nodes.js';
import { standardNozzles } from './nozzleLayout.js';
import { createTerminalNode } from '../terminals.js';

export interface CreateNodeOptions {
  name?: string;
  flowRateGpm?: number;
  position?: { x: number; y: number };
  configOverrides?: Record<string, unknown>;
}

function defaultInternals(overrides?: Partial<InternalsDressing>): InternalsDressing {
  return {
    agitatorType: 'none',
    hasJacket: false,
    jacketType: 'none',
    baffleCount: 0,
    packingType: 'none',
    hasDemister: false,
    hasSprayHeader: false,
    ...overrides
  };
}

/**
 * Creates a fully-configured ProcessNode adhering to the ProcessForge protocol schema
 * for any industrial NodeKind, with nozzles placed on its drawing and linked to
 * its ports (see nozzles/nozzleLayout.ts), so pipes attach where they should.
 */
export function createDefaultProcessNode(kind: NodeKind, options?: CreateNodeOptions): ProcessNode {
  // A bare TERMINAL is a product outlet; createTerminalNode makes the others.
  if (kind === 'TERMINAL') {
    return createTerminalNode('product', { ...(options?.name ? { name: options.name } : {}), ...(options?.position ? { position: options.position } : {}) });
  }
  const node = createBaseProcessNode(kind, options);
  const ports = new Set([...node.inputs, ...node.outputs].map((p) => p.id));
  const nozzles = standardNozzles(kind).filter((z) => !z.portId || ports.has(z.portId));
  return {
    ...node,
    dressing: {
      ...(node.dressing ?? { internals: defaultInternals() }),
      internals: node.dressing?.internals ?? defaultInternals(),
      nozzles
    }
  };
}

function createBaseProcessNode(kind: NodeKind, options?: CreateNodeOptions): ProcessNode {
  const timestamp = Date.now();
  const posX = options?.position?.x ?? 400 + Math.floor(Math.random() * 80) - 40;
  const posY = options?.position?.y ?? 250 + Math.floor(Math.random() * 80) - 40;
  const flowGpm = options?.flowRateGpm ?? 100;

  switch (kind) {
    case 'PUMP':
      return {
        id: `pump-${timestamp}`,
        name: options?.name || `Centrifugal Pump P-${Math.floor(100 + Math.random() * 900)}`,
        kind: 'PUMP',
        position: { x: posX, y: posY },
        inputs: [
          {
            id: 'in-fluid',
            name: 'Suction Infeed',
            type: 'FLUID_INPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        outputs: [
          {
            id: 'out-fluid',
            name: 'Discharge Outflow',
            type: 'FLUID_OUTPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        config: {
          designFlowRateGpm: flowGpm,
          totalDynamicHeadFeet: 85,
          motorHorsepower: Math.max(1, Math.round(((flowGpm * 85) / (3960 * 0.7)) * 10) / 10),
          pumpEfficiencyPercent: 70,
          suctionDiameterInches: flowGpm > 150 ? 4.0 : 3.0,
          dischargeDiameterInches: flowGpm > 150 ? 3.0 : 2.0,
          fluid: {
            name: 'Process Fluid (Water)',
            densityGPerCm3: 1.0,
            viscosityCentipoise: 1.0,
            temperatureCelsius: 20
          },
          ...(options?.configOverrides || {})
        },
        assignedSubAgentId: `subagent-pump-${timestamp}`,
        dressing: {
          nozzles: [
            { id: 'N1', name: 'Suction Flange', role: 'inlet', x: 15, y: 55, position: 'left', sizeInches: 3, ratingPsi: 150 },
            { id: 'N2', name: 'Discharge Flange', role: 'outlet', x: 85, y: 30, position: 'top', sizeInches: 2, ratingPsi: 150 }
          ],
          internals: defaultInternals(),
          notes: 'Standard end-suction centrifugal pump designed for continuous industrial fluid transfer'
        }
      };

    case 'SURGE_TANK':
      return {
        id: `surge-tank-${timestamp}`,
        name: options?.name || `Surge Buffer Tank T-${Math.floor(100 + Math.random() * 900)}`,
        kind: 'SURGE_TANK',
        position: { x: posX, y: posY },
        inputs: [
          {
            id: 'in-fluid',
            name: 'Fluid Infeed',
            type: 'FLUID_INPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        outputs: [
          {
            id: 'out-fluid',
            name: 'Pump Suction Outflow',
            type: 'FLUID_OUTPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        config: {
          capacityGallons: 1000,
          initialLevelGallons: 500,
          maxDischargeRateGpm: flowGpm,
          lowLevelAlarmPercentage: 15,
          highLevelAlarmPercentage: 85,
          ...(options?.configOverrides || {})
        },
        assignedSubAgentId: `subagent-tank-${timestamp}`,
        dressing: {
          nozzles: [
            { id: 'N1', name: 'Top Infeed Nozzle', role: 'inlet', x: 30, y: 15, position: 'top', sizeInches: 3, ratingPsi: 150 },
            { id: 'N2', name: 'Atmospheric Vent', role: 'vent', x: 60, y: 10, position: 'top', sizeInches: 2, ratingPsi: 150 },
            { id: 'N3', name: 'Bottom Sump Drain', role: 'outlet', x: 50, y: 95, position: 'bottom', sizeInches: 3, ratingPsi: 150 }
          ],
          internals: defaultInternals()
        }
      };

    case 'BATCH_REACTOR':
      return {
        id: `reactor-${timestamp}`,
        name: options?.name || `Batch Reactor R-${Math.floor(100 + Math.random() * 900)}`,
        kind: 'BATCH_REACTOR',
        position: { x: posX, y: posY },
        inputs: [
          {
            id: 'in-fluid',
            name: 'Charge Feed',
            type: 'FLUID_INPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        outputs: [
          {
            id: 'out-fluid',
            name: 'Reacted Discharge',
            type: 'FLUID_OUTPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        config: {
          batchVolumeGallons: 800,
          fillDurationMinutes: 15,
          reactionDurationMinutes: 30,
          dischargeRateGpm: flowGpm,
          fluid: {
            name: 'Reaction Mixture',
            densityGPerCm3: 1.1,
            viscosityCentipoise: 45,
            temperatureCelsius: 65
          },
          ...(options?.configOverrides || {})
        },
        assignedSubAgentId: `subagent-reactor-${timestamp}`,
        dressing: {
          nozzles: [
            { id: 'N1', name: 'Raw Material Feed', role: 'inlet', x: 25, y: 15, position: 'top', sizeInches: 3, ratingPsi: 150 },
            { id: 'N2', name: 'Reflux Vent', role: 'vent', x: 75, y: 15, position: 'top', sizeInches: 2, ratingPsi: 150 },
            { id: 'N3', name: 'Bottom Valve Outflow', role: 'outlet', x: 50, y: 95, position: 'bottom', sizeInches: 3, ratingPsi: 150 }
          ],
          internals: defaultInternals({
            agitatorType: 'pitched_blade',
            agitatorRpm: 150,
            hasJacket: true,
            jacketType: 'steam',
            baffleCount: 4
          })
        }
      };

    case 'HEAT_EXCHANGER':
      return {
        id: `heat-exchanger-${timestamp}`,
        name: options?.name || `Shell & Tube Exchanger E-${Math.floor(100 + Math.random() * 900)}`,
        kind: 'HEAT_EXCHANGER',
        position: { x: posX, y: posY },
        inputs: [
          {
            id: 'in-process',
            name: 'Process Fluid In',
            type: 'FLUID_INPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        outputs: [
          {
            id: 'out-process',
            name: 'Conditioned Fluid Out',
            type: 'FLUID_OUTPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        config: {
          dutyKw: 250,
          heatTransferAreaSqM: 18.5,
          shellSideFlowGpm: flowGpm,
          tubeSideFlowGpm: 80,
          targetTemperatureCelsius: 35,
          ...(options?.configOverrides || {})
        },
        assignedSubAgentId: `subagent-exchanger-${timestamp}`,
        dressing: {
          nozzles: [
            { id: 'N1', name: 'Shell Inlet', role: 'inlet', x: 20, y: 25, position: 'left', sizeInches: 3, ratingPsi: 150 },
            { id: 'N2', name: 'Shell Outlet', role: 'outlet', x: 80, y: 85, position: 'right', sizeInches: 3, ratingPsi: 150 }
          ],
          internals: defaultInternals({
            baffleCount: 6
          })
        }
      };

    case 'SEPARATOR':
      return {
        id: `separator-${timestamp}`,
        name: options?.name || `Flash Separation Drum V-${Math.floor(100 + Math.random() * 900)}`,
        kind: 'SEPARATOR',
        position: { x: posX, y: posY },
        inputs: [
          {
            id: 'in-mixed',
            name: 'Two-Phase Inlet',
            type: 'FLUID_INPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        outputs: [
          {
            id: 'out-vapor',
            name: 'Vapor Overhead',
            type: 'FLUID_OUTPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          },
          {
            id: 'out-liquid',
            name: 'Liquid Bottoms',
            type: 'FLUID_OUTPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        config: {
          operatingPressurePsi: 25,
          operatingTempCelsius: 85,
          liquidLevelPercentage: 55,
          vaporSplitRatio: 0.25,
          ...(options?.configOverrides || {})
        },
        assignedSubAgentId: `subagent-sep-${timestamp}`,
        dressing: {
          nozzles: [
            { id: 'N1', name: 'Side Feed Nozzle', role: 'inlet', x: 20, y: 50, position: 'left', sizeInches: 3, ratingPsi: 150 },
            { id: 'N2', name: 'Top Vapor Outlet', role: 'outlet', x: 50, y: 15, position: 'top', sizeInches: 3, ratingPsi: 150 },
            { id: 'N3', name: 'Bottom Liquid Outflow', role: 'outlet', x: 50, y: 95, position: 'bottom', sizeInches: 3, ratingPsi: 150 }
          ],
          internals: defaultInternals({
            hasDemister: true
          })
        }
      };

    case 'ROTARY_FILLER':
      return {
        id: `filler-${timestamp}`,
        name: options?.name || `Rotary Container Filler F-${Math.floor(100 + Math.random() * 900)}`,
        kind: 'ROTARY_FILLER',
        position: { x: posX, y: posY },
        inputs: [
          {
            id: 'in-fluid',
            name: 'Liquid Supply',
            type: 'FLUID_INPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        outputs: [
          {
            id: 'out-cans',
            name: 'Filled Containers',
            type: 'DISCRETE_OUTPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        config: {
          nozzleCount: 8,
          containerVolumeGallons: 1.0,
          fillTimePerCycleSeconds: 8.5,
          indexTimePerCycleSeconds: 1.5,
          bufferQueueCapacity: 50,
          rejectRatePercentage: 0.5,
          meanTimeBetweenFailuresMinutes: 480,
          meanTimeToRepairMinutes: 15,
          ...(options?.configOverrides || {})
        },
        assignedSubAgentId: `subagent-filler-${timestamp}`
      };

    case 'CONVEYOR':
      return {
        id: `conveyor-${timestamp}`,
        name: options?.name || `Accumulation Belt Conveyor CV-${Math.floor(100 + Math.random() * 900)}`,
        kind: 'CONVEYOR',
        position: { x: posX, y: posY },
        inputs: [
          {
            id: 'in-containers',
            name: 'Infeed Conveyor',
            type: 'DISCRETE_INPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        outputs: [
          {
            id: 'out-containers',
            name: 'Discharge Transfer',
            type: 'DISCRETE_OUTPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        config: {
          lengthMeters: 12.0,
          speedMetersPerSecond: 0.45,
          itemSpacingMeters: 0.35,
          maxItemCapacity: 60,
          ...(options?.configOverrides || {})
        },
        assignedSubAgentId: `subagent-conveyor-${timestamp}`
      };

    case 'LABELER':
      return {
        id: `labeler-${timestamp}`,
        name: options?.name || `High-Speed Rotary Labeler L-${Math.floor(100 + Math.random() * 900)}`,
        kind: 'LABELER',
        position: { x: posX, y: posY },
        inputs: [
          {
            id: 'in-containers',
            name: 'Can Infeed',
            type: 'DISCRETE_INPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        outputs: [
          {
            id: 'out-containers',
            name: 'Labeled Cans',
            type: 'DISCRETE_OUTPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        config: {
          maxSpeedUnitsPerMinute: 60,
          labelRollCapacity: 3500,
          opticalInspectionFailRate: 0.2,
          rejectChuteEnabled: true,
          ...(options?.configOverrides || {})
        },
        assignedSubAgentId: `subagent-labeler-${timestamp}`
      };

    case 'PALLETIZER':
      return {
        id: `palletizer-${timestamp}`,
        name: options?.name || `Automated Palletizer Cell PZ-${Math.floor(100 + Math.random() * 900)}`,
        kind: 'PALLETIZER',
        position: { x: posX, y: posY },
        inputs: [
          {
            id: 'in-containers',
            name: 'Packaged Products Infeed',
            type: 'DISCRETE_INPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        outputs: [
          {
            id: 'out-pallets',
            name: 'Loaded Skids',
            type: 'DISCRETE_OUTPUT',
            flowDimension: 'DISCRETE_CONTAINER'
          }
        ],
        config: {
          containersPerLayer: 24,
          layersPerSkid: 4,
          cycleSecondsPerLayer: 28,
          skidChangeoverSeconds: 25,
          ...(options?.configOverrides || {})
        },
        assignedSubAgentId: `subagent-palletizer-${timestamp}`
      };

    default:
      return {
        id: `unitop-${timestamp}`,
        name: options?.name || `Custom Unit Operation U-${Math.floor(100 + Math.random() * 900)}`,
        kind: 'CUSTOM_UNIT_OP',
        position: { x: posX, y: posY },
        inputs: [
          {
            id: 'in-fluid',
            name: 'Process Infeed',
            type: 'FLUID_INPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        outputs: [
          {
            id: 'out-fluid',
            name: 'Process Discharge',
            type: 'FLUID_OUTPUT',
            flowDimension: 'CONTINUOUS_VOLUME'
          }
        ],
        config: {
          designThroughput: flowGpm,
          operatingPressurePsi: 35,
          ...(options?.configOverrides || {})
        },
        assignedSubAgentId: `subagent-custom-${timestamp}`
      };
  }
}
