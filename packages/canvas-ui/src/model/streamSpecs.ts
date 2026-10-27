import { terminalRole, type ProcessGraph } from '@process-forge/protocol';

export type StreamFigure = 'kgPerHour' | 'gpm' | 'itemsPerMin' | 'temperatureC' | 'mix';

/** Within this share of a feed's stated supply, the flow is the supply: the engineer's figure, not the solver's. */
const AT_SUPPLY = 0.005;

const near = (v: number | undefined, target: number) => v !== undefined && target > 0 && Math.abs(v - target) <= target * AT_SUPPLY;

/**
 * Which of a stream's figures the engineer set, rather than the engine worked
 * out, as a simulator's stream report tells inputs from results. Only a stream
 * leaving a feed carries inputs: its temperature (the feed's, or its pipe's),
 * its mix when the feed states one, and its flow when the line takes all the
 * feed supplies. Everything downstream is calculated.
 */
export function specifiedFigures(
  graph: ProcessGraph,
  edgeId: string,
  figures: { kgPerHour?: number; gpm?: number; itemsPerMin?: number; temperatureC?: number }
): Set<StreamFigure> {
  const out = new Set<StreamFigure>();
  const edge = graph.edges.find((e) => e.id === edgeId);
  const feed = edge && graph.nodes.find((n) => n.id === edge.sourceNodeId);
  if (!edge || !feed || terminalRole(feed) !== 'feed') return out;
  const c = feed.config as { composition?: Record<string, number>; supplyRate?: number; supplyKgPerHour?: number };
  // Its temperature is the feed's, or, when the feed states none, its pipe's: the engineer's figure either way.
  if (figures.temperatureC !== undefined) out.add('temperatureC');
  if (c.composition && Object.keys(c.composition).length) out.add('mix');
  if (c.supplyKgPerHour && near(figures.kgPerHour, c.supplyKgPerHour)) out.add('kgPerHour');
  else if (c.supplyRate) {
    if (edge.stream.type === 'CONTINUOUS_FLUID' ? near(figures.gpm, c.supplyRate) : near(figures.itemsPerMin, c.supplyRate)) {
      out.add(edge.stream.type === 'CONTINUOUS_FLUID' ? 'gpm' : 'itemsPerMin');
    }
  }
  return out;
}
