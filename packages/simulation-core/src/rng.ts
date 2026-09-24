/**
 * Seeded pseudo-random number generator for the simulation engine.
 *
 * The same seed gives the same result. A simulator whose results move between
 * runs cannot compare two designs, because any difference might be noise.
 *
 * mulberry32 is used here: 32-bit state, a handful of integer operations, no
 * dependency, and statistical quality far beyond what machine failure sampling
 * needs. The important properties are that it is deterministic, portable, and
 * has no hidden global state -- each engine run owns its own generator, so two
 * simulations running in the same process cannot perturb each other.
 */

export interface SeededRng {
  /** Uniform in [0, 1). */
  next(): number;
  /** The seed this generator was constructed with. */
  readonly seed: number;
}

/** The seed used when a caller does not supply one. */
export const DEFAULT_SIMULATION_SEED = 0x5eed;

/**
 * Creates a deterministic generator. The same seed always yields the same
 * sequence, on any platform, in any process.
 */
export function createRng(seed: number = DEFAULT_SIMULATION_SEED): SeededRng {
  // Normalise to a 32-bit unsigned integer so that fractional, negative, or
  // out-of-range seeds still behave deterministically rather than silently
  // degrading to NaN.
  let state = Math.trunc(seed) >>> 0;

  return {
    seed,
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  };
}

/**
 * Derives a stable seed from a string, so a graph can be reproducible by
 * identity without the caller having to invent a number. FNV-1a.
 */
export function seedFromString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
