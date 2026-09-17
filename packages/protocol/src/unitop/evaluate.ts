import type { ExprScope } from './expression.js';
import { evaluateBoolean, evaluateNumber, ExpressionError } from './expression.js';
import type { UnitOpContract } from './contract.js';

/**
 * Stream state the engine hands a unit op at evaluation time.
 *
 * Note the thermal fields. Before contracts existed, a stream carried flow
 * rate, pressure, pipe diameter and container type -- no temperature or energy
 * anywhere on the graph. That made an entire class of unit operation
 * inexpressible: you cannot ask "how much duty do I need to cool this" if the
 * graph has nowhere to say how hot the material is.
 */
export interface StreamState {
  temperatureC?: number;
  massFlowKgPerS?: number;
  volumetricFlowGpm?: number;
  piecesPerMinute?: number;
  densityGPerCm3?: number;
  specificHeatKjPerKgK?: number;
  latentHeatKjPerKg?: number;
}

export interface UnitOpEvaluationInput {
  inlet?: StreamState;
  utility?: StreamState;
  /** Overrides for declared parameter values, by parameter name. */
  parameterOverrides?: Record<string, number>;
}

export interface ConstraintResult {
  id: string;
  satisfied: boolean;
  severity: 'ERROR' | 'WARNING';
  message: string;
  hint?: string;
}

export interface UnitOpEvaluation {
  contractId: string;
  /** Every parameter value actually used, after overrides. */
  parameters: Record<string, number>;
  /** Every derived quantity, in declaration order. */
  derived: Record<string, number>;
  /** One entry per declared constraint. */
  constraints: ConstraintResult[];
  /**
   * True when no ERROR-severity constraint is violated. This is the engine's
   * verdict on physical coherence -- computed, not asserted by whoever authored
   * the contract.
   */
  physicallyValid: boolean;
  behavior:
    | { mode: 'DISCRETE_CYCLE'; cycleSeconds: number; unitsPerCycle: number; scrapFraction: number; unitsPerMinute: number }
    | { mode: 'CONTINUOUS_RATE'; throughputPerMinute: number; dutyKw?: number; residenceTimeSeconds?: number };
  /** Populated when an expression failed to evaluate; evaluation stops there. */
  error?: { path: string; message: string };
}

function buildScope(
  parameters: Record<string, number>,
  derived: Record<string, number>,
  input: UnitOpEvaluationInput
): ExprScope {
  const scope: ExprScope = { ...parameters, ...derived };
  if (input.inlet) scope.inlet = { ...input.inlet } as ExprScope;
  if (input.utility) scope.utility = { ...input.utility } as ExprScope;
  return scope;
}

/**
 * Evaluates a contract against inlet conditions. Pure: no clock, no RNG, no
 * I/O. The same contract and the same input always produce the same result,
 * which is what lets a generated unit op participate in a reproducible run.
 *
 * This is deliberately usable without the engine, so the verify step of an
 * agent loop can be unit-tested without a model in the picture.
 */
export function evaluateUnitOp(
  contract: UnitOpContract,
  input: UnitOpEvaluationInput = {}
): UnitOpEvaluation {
  const parameters: Record<string, number> = {};
  for (const p of contract.parameters) {
    parameters[p.name] = input.parameterOverrides?.[p.name] ?? p.value;
  }

  const derived: Record<string, number> = {};
  const fail = (path: string, e: unknown): UnitOpEvaluation => ({
    contractId: contract.id,
    parameters,
    derived,
    constraints: [],
    physicallyValid: false,
    behavior:
      contract.behavior.mode === 'DISCRETE_CYCLE'
        ? { mode: 'DISCRETE_CYCLE', cycleSeconds: 0, unitsPerCycle: 0, scrapFraction: 0, unitsPerMinute: 0 }
        : { mode: 'CONTINUOUS_RATE', throughputPerMinute: 0 },
    error: { path, message: e instanceof ExpressionError ? e.message : String(e) }
  });

  // Derived values resolve in declaration order; each sees the ones before it.
  for (const d of contract.derived) {
    try {
      derived[d.name] = evaluateNumber(d.expr, buildScope(parameters, derived, input));
    } catch (e) {
      return fail(`derived.${d.name}`, e);
    }
  }

  const scope = buildScope(parameters, derived, input);

  const constraints: ConstraintResult[] = [];
  for (const c of contract.constraints) {
    try {
      constraints.push({
        id: c.id,
        satisfied: evaluateBoolean(c.expr, scope),
        severity: c.severity,
        message: c.message,
        ...(c.hint ? { hint: c.hint } : {})
      });
    } catch (e) {
      return fail(`constraints.${c.id}`, e);
    }
  }

  let behavior: UnitOpEvaluation['behavior'];
  try {
    if (contract.behavior.mode === 'DISCRETE_CYCLE') {
      const cycleSeconds = evaluateNumber(contract.behavior.cycleSeconds, scope);
      const unitsPerCycle = evaluateNumber(contract.behavior.unitsPerCycle, scope);
      const scrapFraction = contract.behavior.scrapFraction
        ? evaluateNumber(contract.behavior.scrapFraction, scope)
        : 0;

      if (cycleSeconds <= 0) {
        return fail('behavior.cycleSeconds', new Error(`cycleSeconds must be positive, got ${cycleSeconds}`));
      }
      behavior = {
        mode: 'DISCRETE_CYCLE',
        cycleSeconds,
        unitsPerCycle,
        scrapFraction,
        unitsPerMinute: (unitsPerCycle / cycleSeconds) * 60
      };
    } else {
      const throughputPerMinute = evaluateNumber(contract.behavior.throughputPerMinute, scope);
      behavior = {
        mode: 'CONTINUOUS_RATE',
        throughputPerMinute,
        ...(contract.behavior.dutyKw ? { dutyKw: evaluateNumber(contract.behavior.dutyKw, scope) } : {}),
        ...(contract.behavior.residenceTimeSeconds
          ? { residenceTimeSeconds: evaluateNumber(contract.behavior.residenceTimeSeconds, scope) }
          : {})
      };
    }
  } catch (e) {
    return fail('behavior', e);
  }

  return {
    contractId: contract.id,
    parameters,
    derived,
    constraints,
    physicallyValid: constraints.every((c) => c.satisfied || c.severity === 'WARNING'),
    behavior
  };
}

/** The ERROR-severity failures, which are what should block a simulation. */
export function blockingViolations(evaluation: UnitOpEvaluation): ConstraintResult[] {
  return evaluation.constraints.filter((c) => !c.satisfied && c.severity === 'ERROR');
}

/**
 * A short human-readable account of why a unit op was rejected. This is what
 * gets fed back to a sub-agent as the next turn's context, so it is written to
 * be actionable rather than decorative.
 */
export function explainRejection(evaluation: UnitOpEvaluation): string {
  if (evaluation.error) {
    return `${evaluation.contractId}: ${evaluation.error.path} failed to evaluate - ${evaluation.error.message}`;
  }
  const blocking = blockingViolations(evaluation);
  if (blocking.length === 0) return `${evaluation.contractId}: physically valid.`;
  return [
    `${evaluation.contractId}: ${blocking.length} physical constraint(s) violated.`,
    ...blocking.map((c) => `  - ${c.message}${c.hint ? ` (${c.hint})` : ''}`)
  ].join('\n');
}
