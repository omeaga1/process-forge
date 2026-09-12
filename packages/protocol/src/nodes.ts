import { z } from 'zod';
import { FluidPropertiesSchema } from './units.js';

export const NodePortSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['FLUID_INPUT', 'FLUID_OUTPUT', 'DISCRETE_INPUT', 'DISCRETE_OUTPUT']),
  flowDimension: z.enum(['CONTINUOUS_VOLUME', 'CONTINUOUS_MASS', 'DISCRETE_CONTAINER'])
});
export type NodePort = z.infer<typeof NodePortSchema>;

export const BatchReactorConfigSchema = z.object({
  batchVolumeGallons: z.number().positive(),
  fillDurationMinutes: z.number().positive(),
  reactionDurationMinutes: z.number().positive(),
  dischargeRateGpm: z.number().positive(),
  fluid: FluidPropertiesSchema
});
export type BatchReactorConfig = z.infer<typeof BatchReactorConfigSchema>;

export const SurgeTankConfigSchema = z.object({
  capacityGallons: z.number().positive(),
  initialLevelGallons: z.number().min(0),
  maxDischargeRateGpm: z.number().positive(),
  lowLevelAlarmPercentage: z.number().min(0).max(100).default(10),
  highLevelAlarmPercentage: z.number().min(0).max(100).default(90)
});
export type SurgeTankConfig = z.infer<typeof SurgeTankConfigSchema>;

export const RotaryFillerConfigSchema = z.object({
  nozzleCount: z.number().int().min(1).max(64),
  containerVolumeGallons: z.number().positive(),
  fillTimePerCycleSeconds: z.number().positive(),
  indexTimePerCycleSeconds: z.number().positive(),
  bufferQueueCapacity: z.number().int().positive(),
  rejectRatePercentage: z.number().min(0).max(100).default(0.5),
  meanTimeBetweenFailuresMinutes: z.number().positive().default(480),
  meanTimeToRepairMinutes: z.number().positive().default(15)
});
export type RotaryFillerConfig = z.infer<typeof RotaryFillerConfigSchema>;

export const ConveyorConfigSchema = z.object({
  lengthMeters: z.number().positive(),
  speedMetersPerSecond: z.number().positive(),
  itemSpacingMeters: z.number().positive(),
  maxItemCapacity: z.number().int().positive()
});
export type ConveyorConfig = z.infer<typeof ConveyorConfigSchema>;

export const LabelerConfigSchema = z.object({
  maxSpeedUnitsPerMinute: z.number().positive(),
  labelRollCapacity: z.number().int().positive(),
  opticalInspectionFailRate: z.number().min(0).max(100).default(0.2),
  rejectChuteEnabled: z.boolean().default(true)
});
export type LabelerConfig = z.infer<typeof LabelerConfigSchema>;

export const PalletizerConfigSchema = z.object({
  containersPerLayer: z.number().int().positive(),
  layersPerSkid: z.number().int().positive(),
  cycleSecondsPerLayer: z.number().positive(),
  skidChangeoverSeconds: z.number().positive().default(30)
});
export type PalletizerConfig = z.infer<typeof PalletizerConfigSchema>;

export const NodeKindSchema = z.enum([
  'BATCH_REACTOR',
  'SURGE_TANK',
  'ROTARY_FILLER',
  'CONVEYOR',
  'LABELER',
  'PALLETIZER',
  'CUSTOM_UNIT_OP'
]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const ProcessNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: NodeKindSchema,
  position: z.object({ x: z.number(), y: z.number() }),
  inputs: z.array(NodePortSchema),
  outputs: z.array(NodePortSchema),
  config: z.union([
    BatchReactorConfigSchema,
    SurgeTankConfigSchema,
    RotaryFillerConfigSchema,
    ConveyorConfigSchema,
    LabelerConfigSchema,
    PalletizerConfigSchema,
    z.record(z.unknown())
  ]),
  assignedSubAgentId: z.string().optional()
});
export type ProcessNode = z.infer<typeof ProcessNodeSchema>;
