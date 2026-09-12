import { z } from 'zod';
import { FluidPropertiesSchema } from './units.js';

export const FlowTypeSchema = z.enum(['CONTINUOUS_FLUID', 'DISCRETE_CONTAINER_STREAM']);
export type FlowType = z.infer<typeof FlowTypeSchema>;

export const ContinuousFluidStreamSchema = z.object({
  type: z.literal('CONTINUOUS_FLUID'),
  designFlowRateGpm: z.number().positive(),
  operatingPressurePsi: z.number().positive().default(30),
  pipeDiameterInches: z.number().positive().default(2.0),
  fluid: FluidPropertiesSchema
});
export type ContinuousFluidStream = z.infer<typeof ContinuousFluidStreamSchema>;

export const DiscreteContainerStreamSchema = z.object({
  type: z.literal('DISCRETE_CONTAINER_STREAM'),
  targetPiecesPerMinute: z.number().positive(),
  containerVolumeGallons: z.number().positive(),
  containerType: z.enum(['CAN_1_GAL', 'CAN_5_GAL', 'DRUM_55_GAL', 'BOTTLE_1_LITER'])
});
export type DiscreteContainerStream = z.infer<typeof DiscreteContainerStreamSchema>;

export const ProcessEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  sourcePortId: z.string().min(1),
  targetNodeId: z.string().min(1),
  targetPortId: z.string().min(1),
  stream: z.union([ContinuousFluidStreamSchema, DiscreteContainerStreamSchema])
});
export type ProcessEdge = z.infer<typeof ProcessEdgeSchema>;
