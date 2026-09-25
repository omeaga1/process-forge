import type { ProcessNode } from './nodes.js';
import type { ProcessEdge } from './streams.js';

/**
 * The few thermal facts the simulation and the static analysis share, so that
 * the two cannot disagree about how long a batch takes to heat.
 */

/** Liquid entering the line, and a reactor's own charge, is at 20 °C unless a pipe says otherwise. */
export const AMBIENT_C = 20;
/** Water, when a fluid does not state its specific heat (kJ/kg·K). */
export const DEFAULT_SPECIFIC_HEAT = 4.186;
export const LITERS_PER_GALLON = 3.785411784;

type FluidLike = { temperatureCelsius?: unknown; densityGPerCm3?: unknown; specificHeatKjPerKgK?: unknown };
const finite = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const positive = (v: unknown): number | undefined => {
  const n = finite(v);
  return n !== undefined && n > 0 ? n : undefined;
};

export function fluidOf(x: unknown): FluidLike | undefined {
  return (x as { fluid?: FluidLike } | undefined)?.fluid;
}

/** The temperature a pipe's stream is drawn at, from the first pipe that says. */
export function pipeTemperature(edges: readonly ProcessEdge[] | undefined): number | undefined {
  for (const e of edges ?? []) {
    const t = finite(fluidOf(e.stream)?.temperatureCelsius);
    if (t !== undefined) return t;
  }
  return undefined;
}

/** Density (kg/L) and specific heat (kJ/kg·K): the unit's own fluid first, then its pipes'. */
export function fluidProperties(node: ProcessNode, pipes: readonly ProcessEdge[] = []): { density: number; cp: number } {
  const sources = [fluidOf(node.config), ...pipes.map((e) => fluidOf(e.stream))];
  const pick = (key: 'densityGPerCm3' | 'specificHeatKjPerKgK') => {
    for (const f of sources) {
      const v = positive(f?.[key]);
      if (v !== undefined) return v;
    }
    return undefined;
  };
  return { density: pick('densityGPerCm3') ?? 1, cp: pick('specificHeatKjPerKgK') ?? DEFAULT_SPECIFIC_HEAT };
}

/** kJ to change `gallons` of a liquid by `deltaC`. */
export function heatKj(gallons: number, deltaC: number, props: { density: number; cp: number }): number {
  return gallons * LITERS_PER_GALLON * props.density * props.cp * Math.abs(deltaC);
}

/** A reactor's reaction temperature, when its fluid names one. */
export function reactionTemperature(node: ProcessNode): number | undefined {
  return finite(fluidOf(node.config)?.temperatureCelsius);
}

/** A reactor's jacket duty in kW, or undefined when none is set (batches reach temperature at once). */
export function jacketDutyKw(node: ProcessNode): number | undefined {
  return positive((node.config as { jacketDutyKw?: unknown }).jacketDutyKw);
}

/**
 * Seconds a reactor's jacket takes to bring a full batch from `chargeC` to its
 * reaction temperature: mass x cp x dT / duty. Zero with no jacket duty or no
 * reaction temperature.
 */
export function reactorHeatUpSeconds(node: ProcessNode, chargeC = AMBIENT_C, pipes: readonly ProcessEdge[] = []): number {
  const react = reactionTemperature(node);
  const jacket = jacketDutyKw(node);
  if (react === undefined || jacket === undefined) return 0;
  const batch = positive((node.config as { batchVolumeGallons?: unknown }).batchVolumeGallons) ?? 800;
  return heatKj(batch, react - chargeC, fluidProperties(node, pipes)) / jacket;
}
