import { z } from 'zod';

export const VolumetricFlowUnitSchema = z.enum(['GALLONS_PER_MIN', 'LITERS_PER_MIN', 'CUBIC_METERS_PER_HOUR']);
export type VolumetricFlowUnit = z.infer<typeof VolumetricFlowUnitSchema>;

export const MassFlowUnitSchema = z.enum(['KG_PER_HOUR', 'LBS_PER_MIN', 'METRIC_TONS_PER_DAY']);
export type MassFlowUnit = z.infer<typeof MassFlowUnitSchema>;

export const DiscreteRateUnitSchema = z.enum(['UNITS_PER_MINUTE', 'UNITS_PER_HOUR']);
export type DiscreteRateUnit = z.infer<typeof DiscreteRateUnitSchema>;

export const FluidPropertiesSchema = z.object({
  name: z.string().min(1),
  densityGPerCm3: z.number().positive(),
  viscosityCentipoise: z.number().positive(),
  temperatureCelsius: z.number(),
  /**
   * Thermal properties. Optional because most existing graphs are isothermal
   * packaging lines that never needed them, but required for any unit op whose
   * behavior is an energy balance -- a cooling belt, a heat exchanger, a
   * jacketed reactor. Without these the graph has nowhere to carry energy and
   * a duty calculation has no inputs.
   */
  specificHeatKjPerKgK: z.number().positive().optional(),
  latentHeatOfFusionKjPerKg: z.number().nonnegative().optional(),
  meltingPointCelsius: z.number().optional(),
  /**
   * Mass fractions of named components, e.g. { water: 0.88, sucrose: 0.12 }.
   * The simulation carries them through every unit, mixes them, and lets
   * designed units react and separate them. Fractions are normalised to sum
   * to 1 where they are read.
   */
  composition: z.record(z.number().nonnegative()).optional()
});
export type FluidProperties = z.infer<typeof FluidPropertiesSchema>;

/**
 * Standard unit conversion functions for physical flow calculations.
 */
export const UnitConverters = {
  gallonsPerMinToLitersPerMin(gpm: number): number {
    return gpm * 3.785411784;
  },
  litersPerMinToGallonsPerMin(lpm: number): number {
    return lpm / 3.785411784;
  },
  /**
   * Calculates discrete container throughput from fluid feed rate and container volume.
   * e.g., 40 gallons/min feeding 1-gallon cans yields 40 cans/min.
   */
  volumetricRateToDiscreteUnitsPerMin(flowGpm: number, containerVolumeGallons: number): number {
    if (containerVolumeGallons <= 0) {
      throw new Error('Container volume must be strictly positive');
    }
    return flowGpm / containerVolumeGallons;
  },
  /**
   * Calculates required machine cycle time in seconds based on nozzle count and desired discrete throughput.
   * Example: 40 cans/min with a 10-nozzle filler requires 1 cycle every 15 seconds (10 cans / 15 sec = 40 cans/min).
   */
  calculateRequiredCycleSeconds(unitsPerMinute: number, nozzleCount: number): number {
    if (unitsPerMinute <= 0 || nozzleCount <= 0) {
      throw new Error('Units per minute and nozzle count must be strictly positive');
    }
    const cyclesPerMinute = unitsPerMinute / nozzleCount;
    return 60 / cyclesPerMinute;
  }
};
