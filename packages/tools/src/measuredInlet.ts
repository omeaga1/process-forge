import type { ProcessGraph, UnitOpDesignStream } from '@process-forge/protocol';
import { averageStreamStates, simulateProcess } from '@process-forge/simulation-core';

const LITERS_PER_GALLON = 3.785411784;

/**
 * What actually flows into a unit: every liquid pipe into it, averaged over a
 * short run of the line and taken together (flows added, temperature and
 * composition mass-weighted). The pipes' own design values are defaults until
 * a run fills them in (45 gal/min of "Process Fluid" at 20 °C), so a design
 * brief built on them sends the model the wrong stream. Undefined when nothing
 * liquid reaches the unit, or the line does not run.
 */
export function measuredInletOf(graph: ProcessGraph, nodeId: string, minutes = 20): UnitOpDesignStream | undefined {
  try {
    const result = simulateProcess(graph, minutes, { seed: 1 });
    const pipes = averageStreamStates(graph, result.telemetryLog).filter((p) => p.to.unitId === nodeId && p.phase === 'LIQUID' && (p.kgPerHour ?? 0) > 0);
    if (!pipes.length) return undefined;
    const kgh = pipes.reduce((s, p) => s + (p.kgPerHour ?? 0), 0);
    const gpm = pipes.reduce((s, p) => s + (p.gpm ?? 0), 0);
    if (!(kgh > 0) || !(gpm > 0)) return undefined;
    const temps = pipes.filter((p) => p.temperatureC !== undefined);
    const temperatureC = temps.length ? temps.reduce((s, p) => s + (p.kgPerHour ?? 0) * p.temperatureC!, 0) / temps.reduce((s, p) => s + (p.kgPerHour ?? 0), 0) : undefined;
    const composition: Record<string, number> = {};
    for (const p of pipes) for (const [c, x] of Object.entries(p.composition ?? {})) composition[c] = (composition[c] ?? 0) + ((p.kgPerHour ?? 0) * x) / kgh;
    const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
    return {
      ...(temperatureC !== undefined ? { temperatureC: round(temperatureC, 2) } : {}),
      volumetricFlowGpm: round(gpm, 2),
      massFlowKgPerS: round(kgh / 3600),
      densityGPerCm3: round(kgh / 60 / (gpm * LITERS_PER_GALLON)),
      ...(Object.keys(composition).length ? { composition: Object.fromEntries(Object.entries(composition).map(([c, x]) => [c, round(x)])) } : {})
    } as UnitOpDesignStream;
  } catch {
    return undefined;
  }
}
