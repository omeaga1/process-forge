import type { ProcessGraph } from '@process-forge/protocol';
import type { SimulationResult } from '@process-forge/simulation-core';

/**
 * What each stream on the line carries, from a simulation run: kg/h, °C and
 * what it is made of, read off the unit it leaves (its own outlet port where
 * the engine reports ports, the unit's mixed outflow where it does not, the
 * feed's own totals for a feed). Items streams carry items/min.
 *
 * The unit studio shows these on every connection, so a feed, an outlet or a
 * unit always says what actually moves through it, not just what it is
 * connected to.
 */
export interface StreamFigure {
  kgPerHour?: number;
  temperatureC?: number;
  /** Mass fractions, largest first. */
  composition?: [string, number][];
  phase?: 'LIQUID' | 'GAS' | 'SOLID';
  gallonsPerMinute?: number;
  acfm?: number;
  itemsPerMinute?: number;
}

const fractions = (componentsKg: Record<string, number> | undefined): [string, number][] | undefined => {
  if (!componentsKg) return undefined;
  const total = Object.values(componentsKg).reduce((a, v) => a + v, 0);
  if (!(total > 0)) return undefined;
  return Object.entries(componentsKg)
    .map(([c, kg]) => [c, kg / total] as [string, number])
    .filter(([, x]) => x > 1e-6)
    .sort((a, b) => b[1] - a[1]);
};

const sorted = (comp: Record<string, number> | undefined): [string, number][] | undefined =>
  comp && Object.keys(comp).length ? Object.entries(comp).filter(([, x]) => x > 1e-6).sort((a, b) => b[1] - a[1]) : undefined;

/** Figures for every stream on the line, by edge id. */
export function streamFigures(graph: ProcessGraph, result: SimulationResult): Map<string, StreamFigure> {
  const hours = result.simulatedTimeSeconds / 3600;
  const minutes = result.simulatedTimeSeconds / 60;
  const out = new Map<string, StreamFigure>();
  if (!(hours > 0)) return out;
  for (const e of graph.edges) {
    const items = e.stream.type !== 'CONTINUOUS_FLUID';
    const siblings = graph.edges.filter((x) => x.sourceNodeId === e.sourceNodeId && x.sourcePortId === e.sourcePortId);
    const share = 1 / Math.max(1, siblings.length);
    const report = result.nodeReports[e.sourceNodeId];
    if (items) {
      const itemEdges = graph.edges.filter((x) => x.sourceNodeId === e.sourceNodeId && x.stream.type !== 'CONTINUOUS_FLUID').length || 1;
      const feed = result.terminals.find((t) => t.nodeId === e.sourceNodeId);
      const made = feed ? feed.units : report?.unitsProduced ?? 0;
      out.set(e.id, { itemsPerMinute: made / minutes / itemEdges });
      continue;
    }
    const feed = result.terminals.find((t) => t.nodeId === e.sourceNodeId && t.role === 'feed');
    if (feed) {
      out.set(e.id, {
        kgPerHour: (feed.kg / hours) * share,
        ...(feed.temperatureC !== undefined ? { temperatureC: feed.temperatureC } : {}),
        ...(fractions(feed.componentsKg) ? { composition: fractions(feed.componentsKg)! } : {}),
        ...(feed.phase ? { phase: feed.phase } : {}),
        gallonsPerMinute: (feed.gallons / minutes) * share
      });
      continue;
    }
    const port = report?.designedUnit?.streams?.find((s) => s.port === e.sourcePortId);
    if (port) {
      out.set(e.id, {
        kgPerHour: port.kgPerHour * share,
        ...(port.temperatureC !== undefined ? { temperatureC: port.temperatureC } : {}),
        ...(fractions(port.componentsKg) ? { composition: fractions(port.componentsKg)! } : {}),
        ...(port.phase !== 'ITEMS' ? { phase: port.phase } : {}),
        ...(port.gallonsPerMinute !== undefined ? { gallonsPerMinute: port.gallonsPerMinute * share } : {}),
        ...(port.actualCubicFeetPerMinute !== undefined ? { acfm: port.actualCubicFeetPerMinute * share } : {})
      });
      continue;
    }
    const f = report?.fluid;
    if (f) {
      // One mixed outflow: split over the unit's liquid pipes out.
      const liquidOut = graph.edges.filter((x) => x.sourceNodeId === e.sourceNodeId && x.stream.type === 'CONTINUOUS_FLUID').length || 1;
      out.set(e.id, {
        kgPerHour: f.deliveredKg / hours / liquidOut,
        ...(f.averageOutletTemperatureC !== undefined ? { temperatureC: f.averageOutletTemperatureC } : {}),
        ...(sorted(f.averageOutletComposition) ? { composition: sorted(f.averageOutletComposition)! } : {}),
        gallonsPerMinute: f.deliveredGallons / minutes / liquidOut
      });
    }
  }
  return out;
}

/** What reached an outlet (or left a feed) over the run, per hour. */
export function terminalFigure(nodeId: string, result: SimulationResult): (StreamFigure & { totalKg?: number; totalUnits?: number }) | undefined {
  const t = result.terminals.find((x) => x.nodeId === nodeId);
  if (!t) return undefined;
  const hours = result.simulatedTimeSeconds / 3600;
  if (t.carries === 'items') return { itemsPerMinute: t.units / (hours * 60), totalUnits: t.units };
  return {
    kgPerHour: t.kg / hours,
    totalKg: t.kg,
    ...(t.temperatureC !== undefined ? { temperatureC: t.temperatureC } : {}),
    ...(fractions(t.componentsKg) ? { composition: fractions(t.componentsKg)! } : {}),
    ...(t.phase ? { phase: t.phase } : {}),
    gallonsPerMinute: t.gallons / (hours * 60)
  };
}
