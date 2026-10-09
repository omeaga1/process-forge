import type { UnitOpContract } from './contract.js';
import type { UnitOpEvaluationInput } from './evaluate.js';
import { solveForTarget } from './explore.js';

/**
 * A design spec: keep `result` (a derived value, or an engine figure such as
 * "engine.unitsPerMinute") at `target`, in its own unit, by varying the
 * parameter `vary`. Kept on the unit as config.designSpecs and re-solved
 * whenever anything else about the unit changes, as a simulator's design
 * spec (or controller) is.
 */
export interface DesignSpec {
  result: string;
  target: number;
  vary: string;
}

/** A unit's design specs, from its config; anything malformed is dropped. */
export function designSpecsOf(config: Record<string, unknown>): DesignSpec[] {
  const raw = config.designSpecs;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (h): h is DesignSpec =>
      !!h && typeof h === 'object' && typeof (h as DesignSpec).result === 'string' && typeof (h as DesignSpec).vary === 'string' && Number.isFinite((h as DesignSpec).target)
  );
}

/**
 * The values the held parameters take for the contract as it now stands,
 * solved one spec after another (each sees the ones before). A spec whose
 * target is out of reach takes the closest value in range; one that cannot
 * be evaluated is left where it is.
 */
export function resolveDesignSpecs(contract: UnitOpContract, specs: readonly DesignSpec[], input: UnitOpEvaluationInput = {}): Record<string, number> {
  const out: Record<string, number> = {};
  let trial = contract;
  for (const h of specs) {
    const solved = solveForTarget(trial, h.result, h.target, h.vary, input);
    if (!solved) continue;
    out[h.vary] = solved.value;
    trial = { ...trial, parameters: trial.parameters.map((p) => (p.name === h.vary ? { ...p, value: solved.value } : p)) };
  }
  return out;
}
