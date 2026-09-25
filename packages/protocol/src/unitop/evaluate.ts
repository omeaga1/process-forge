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
    | {
        mode: 'DISCRETE_CYCLE';
        cycleSeconds: number;
        unitsPerCycle: number;
        scrapFraction: number;
        unitsPerMinute: number;
        liquidPerCycleGallons?: number;
        /** Whole items per cycle, per item inlet port. */
        inputs?: { port: string; perCycle: number }[];
        /** Whole items per cycle, per item outlet port; they add up to unitsPerCycle. */
        outputs?: { port: string; perCycle: number; scrap: boolean }[];
      }
    | { mode: 'CONTINUOUS_RATE'; throughputPerMinute: number; capacityGpm?: number; dutyKw?: number; residenceTimeSeconds?: number };
  /** Per outlet port, from contract.outlets: its share of the outflow and its temperature, where declared. */
  outlets: Record<string, { share?: number; temperatureC?: number }>;
  /** Populated when an expression failed to evaluate; evaluation stops there. */
  error?: { path: string; message: string };
}

/** Live values where known, else the contract's design values. */
function streamScope(design: StreamState | undefined, live: StreamState | undefined): ExprScope | undefined {
  if (!design && !live) return undefined;
  const out: ExprScope = {};
  for (const src of [design, live]) {
    for (const [k, v] of Object.entries(src ?? {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function buildScope(
  parameters: Record<string, number>,
  derived: Record<string, number>,
  inlet: ExprScope | undefined,
  utility: ExprScope | undefined
): ExprScope {
  const scope: ExprScope = { ...parameters, ...derived };
  if (inlet) scope.inlet = inlet;
  if (utility) scope.utility = utility;
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

  const inlet = streamScope(contract.designInlet, input.inlet);
  const utility = streamScope(contract.designUtility, input.utility);
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
    outlets: {},
    error: { path, message: e instanceof ExpressionError ? e.message : String(e) }
  });

  // Derived values resolve in declaration order; each sees the ones before it.
  for (const d of contract.derived) {
    try {
      derived[d.name] = evaluateNumber(d.expr, buildScope(parameters, derived, inlet, utility));
    } catch (e) {
      return fail(`derived.${d.name}`, e);
    }
  }

  const scope = buildScope(parameters, derived, inlet, utility);

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
      const liquid = contract.behavior.liquidPerCycleGallons
        ? evaluateNumber(contract.behavior.liquidPerCycleGallons, scope)
        : undefined;
      if (liquid !== undefined && liquid < 0) {
        return fail('behavior.liquidPerCycleGallons', new Error(`liquidPerCycleGallons must not be negative, got ${liquid}`));
      }
      // Items are whole: a count must be a whole number, and not negative.
      const count = (expr: string, path: string) => {
        const v = evaluateNumber(expr, scope);
        if (v < 0 || Math.abs(v - Math.round(v)) > 1e-9) throw new Error(`${path} must be a whole number of items, got ${v}`);
        return Math.round(v);
      };
      const inputs = contract.behavior.inputs?.map((x, i) => ({ port: x.port, perCycle: count(x.perCycle, `inputs[${i}].perCycle`) }));
      const outputs = contract.behavior.outputs?.map((x, i) => ({
        port: x.port,
        perCycle: count(x.perCycle, `outputs[${i}].perCycle`),
        scrap: Boolean(x.scrap)
      }));
      if (outputs?.length) {
        const made = outputs.reduce((sum, o) => sum + o.perCycle, 0);
        if (Math.abs(made - unitsPerCycle) > 1e-9) {
          return fail('behavior.outputs', new Error(`the outputs make ${made} items a cycle, but unitsPerCycle is ${unitsPerCycle}; they must agree`));
        }
      }
      behavior = {
        mode: 'DISCRETE_CYCLE',
        cycleSeconds,
        unitsPerCycle,
        scrapFraction,
        unitsPerMinute: (unitsPerCycle / cycleSeconds) * 60,
        ...(liquid !== undefined ? { liquidPerCycleGallons: liquid } : {}),
        ...(inputs?.length ? { inputs } : {}),
        ...(outputs?.length ? { outputs } : {})
      };
    } else {
      const throughputPerMinute = evaluateNumber(contract.behavior.throughputPerMinute, scope);
      behavior = {
        mode: 'CONTINUOUS_RATE',
        throughputPerMinute,
        ...(contract.behavior.capacityGpm ? { capacityGpm: evaluateNumber(contract.behavior.capacityGpm, scope) } : {}),
        ...(contract.behavior.dutyKw ? { dutyKw: evaluateNumber(contract.behavior.dutyKw, scope) } : {}),
        ...(contract.behavior.residenceTimeSeconds
          ? { residenceTimeSeconds: evaluateNumber(contract.behavior.residenceTimeSeconds, scope) }
          : {})
      };
    }
  } catch (e) {
    return fail('behavior', e);
  }

  const outlets: UnitOpEvaluation['outlets'] = {};
  for (const o of contract.outlets ?? []) {
    try {
      const share = o.share ? evaluateNumber(o.share, scope) : undefined;
      if (share !== undefined && (share < 0 || share > 1)) {
        return fail(`outlets.${o.port}.share`, new Error(`a share must be between 0 and 1, got ${share}`));
      }
      outlets[o.port] = {
        ...(share !== undefined ? { share } : {}),
        ...(o.temperatureC ? { temperatureC: evaluateNumber(o.temperatureC, scope) } : {})
      };
    } catch (e) {
      return fail(`outlets.${o.port}`, e);
    }
  }
  const total = Object.values(outlets).reduce((sum, o) => sum + (o.share ?? 0), 0);
  if (total > 1 + 1e-9) {
    return fail('outlets', new Error(`the outlet shares add up to ${Math.round(total * 1000) / 1000}, more than all of the flow`));
  }

  return {
    contractId: contract.id,
    parameters,
    derived,
    constraints,
    physicallyValid: constraints.every((c) => c.satisfied || c.severity === 'WARNING'),
    behavior,
    outlets
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
