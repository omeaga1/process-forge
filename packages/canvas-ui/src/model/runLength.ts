import { effectiveContract, type ProcessGraph } from '@process-forge/protocol';

/**
 * How long a run simulates. A packaging line shows its pattern in half an
 * hour; a batch line needs hours for its batches to repeat, so it starts on a
 * shift (AnyLogic's "run for": a stop time, not a fixed one).
 */
export const RUN_LENGTHS = [
  { minutes: 30, short: '30m', long: '30 minutes' },
  { minutes: 120, short: '2h', long: '2 hours' },
  { minutes: 480, short: '8h', long: 'a shift (8 hours)' },
  { minutes: 1440, short: '24h', long: 'a day (24 hours)' }
] as const;

/** A shift for a line with a batch unit; half an hour otherwise. */
export function defaultRunMinutes(graph: ProcessGraph): number {
  const batch = graph.nodes.some((n) => {
    if (n.kind === 'TERMINAL') return false;
    try {
      return effectiveContract(n, graph.edges)?.behavior.mode === 'BATCH';
    } catch {
      return false;
    }
  });
  return batch ? 480 : 30;
}

/**
 * Samples to advance per playback tick, so a run of any length replays in
 * about half a minute at 1× (the engine records one sample a simulated minute).
 */
export function playbackStep(samples: number): number {
  return Math.max(1, Math.round(samples / 30));
}
