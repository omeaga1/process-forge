import type { ExprScope } from './expression.js';
import { evaluateBoolean, evaluateNumber, ExpressionError } from './expression.js';
import type { UnitOpContract } from './contract.js';
import { LITERS_PER_GALLON } from '../thermal.js';

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
  /** Mass fractions by component. */
  composition?: Record<string, number>;
}

export interface UnitOpEvaluationInput {
  inlet?: StreamState;
  utility?: StreamState;
  /** Overrides for declared parameter values, by parameter name. */
  parameterOverrides?: Record<string, number>;
  /** A BATCH unit: the batch in hand as a phase starts. Defaults to a full vessel at designInlet temperature. */
  batch?: BatchState;
}

export interface BatchState {
  gallons: number;
  temperatureC: number;
  massKg: number;
  number: number;
  /** Mass fractions by component. */
  composition?: Record<string, number>;
}

export interface EvaluatedReaction {
  id: string;
  limiting: string;
  conversion: number;
  coefficients: Record<string, number>;
}

export interface EvaluatedBatchPhase {
  name: string;
  kind: 'FILL' | 'HOLD' | 'DRAIN';
  gallons?: number;
  rateGpm?: number;
  seconds?: number;
  temperatureC?: number;
  dutyKw?: number;
  port?: string;
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
    | { mode: 'CONTINUOUS_RATE'; throughputPerMinute: number; capacityGpm?: number; dutyKw?: number; residenceTimeSeconds?: number }
    | {
        mode: 'BATCH';
        batchGallons: number;
        phases: EvaluatedBatchPhase[];
        /** Phase times added up at this batch state; a FILL or DRAIN without a rate counts as instant. */
        cycleSecondsEstimate: number;
        /** batchGallons over the estimated cycle. */
        gallonsPerMinute: number;
      };
  /** Per outlet port, from contract.outlets: its share of the outflow, its temperature and its component recoveries, where declared. */
  outlets: Record<string, { share?: number; temperatureC?: number; recovery?: Record<string, number> }>;
  /** The contract's reactions, with conversions evaluated. */
  reactions: EvaluatedReaction[];
  /** Populated when an expression failed to evaluate; evaluation stops there. */
  error?: { path: string; message: string };
}

/** Live values where known, else the contract's design values. */
/** Mass fractions, normalised to sum to 1 (or empty). */
export function normalise(comp: Record<string, number> | undefined): Record<string, number> {
  const entries = Object.entries(comp ?? {}).filter(([, v]) => Number.isFinite(v) && v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  return total > 0 ? Object.fromEntries(entries.map(([k, v]) => [k, v / total])) : {};
}

/** x.<component> for every component the contract names: 0 when the stream has none of it. */
function fractionsScope(contract: UnitOpContract, comp: Record<string, number> | undefined): ExprScope {
  const x = normalise(comp);
  const out: ExprScope = {};
  for (const c of contract.components ?? []) out[c] = x[c] ?? 0;
  for (const [c, v] of Object.entries(x)) if (!(c in out)) out[c] = v;
  return out;
}

function streamScope(contract: UnitOpContract, design: StreamState | undefined, live: StreamState | undefined): ExprScope | undefined {
  if (!design && !live) return (contract.components ?? []).length ? { x: fractionsScope(contract, undefined) } : undefined;
  const out: ExprScope = {};
  for (const src of [design, live]) {
    for (const [k, v] of Object.entries(src ?? {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  out.x = fractionsScope(contract, live?.composition ?? design?.composition);
  return out;
}

/**
 * Runs reactions on a mass of mixed components, in order, and returns the new
 * mass fractions. A reaction consumes conversion x the limiting component;
 * the other coefficients scale from it. A co-reactant that runs out stops the
 * reaction there (the shortfall is reported in `short`).
 */
export function react(
  composition: Record<string, number>,
  reactions: EvaluatedReaction[]
): { composition: Record<string, number>; short: string[] } {
  const m: Record<string, number> = { ...normalise(composition) };
  const short: string[] = [];
  for (const r of reactions) {
    const lim = -(r.coefficients[r.limiting] ?? 0);
    if (!(lim > 0)) continue;
    let extent = (r.conversion * (m[r.limiting] ?? 0)) / lim;
    // Never consume more of anything than there is.
    for (const [c, k] of Object.entries(r.coefficients)) {
      if (k < 0) {
        const cap = (m[c] ?? 0) / -k;
        if (cap < extent - 1e-12) {
          extent = cap;
          if (!short.includes(r.id)) short.push(r.id);
        }
      }
    }
    for (const [c, k] of Object.entries(r.coefficients)) m[c] = Math.max(0, (m[c] ?? 0) + k * extent);
  }
  return { composition: normalise(m), short };
}

function buildScope(
  contract: UnitOpContract,
  parameters: Record<string, number>,
  derived: Record<string, number>,
  inlet: ExprScope | undefined,
  utility: ExprScope | undefined,
  batch?: BatchState
): ExprScope {
  const scope: ExprScope = { ...parameters, ...derived };
  if (inlet) scope.inlet = inlet;
  if (utility) scope.utility = utility;
  if (batch) {
    const { composition, ...rest } = batch;
    scope.batch = { ...rest, x: fractionsScope(contract, composition) };
  }
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

  const inlet = streamScope(contract, contract.designInlet, input.inlet);
  const utility = streamScope(contract, contract.designUtility, input.utility);
  // A BATCH unit's batch: as given, or a full vessel at the design inlet temperature.
  let batch: BatchState | undefined;
  let batchGallons = 0;
  if (contract.behavior.mode === 'BATCH') {
    try {
      batchGallons = evaluateNumber(contract.behavior.batchGallons, buildScope(contract, parameters, {}, inlet, utility));
    } catch (e) {
      return {
        contractId: contract.id,
        parameters,
        derived: {},
        constraints: [],
        physicallyValid: false,
        behavior: { mode: 'BATCH', batchGallons: 0, phases: [], cycleSecondsEstimate: 0, gallonsPerMinute: 0 },
        outlets: {},
        reactions: [],
        error: { path: 'behavior.batchGallons', message: e instanceof ExpressionError ? e.message : String(e) }
      };
    }
    const density = typeof inlet?.densityGPerCm3 === 'number' ? inlet.densityGPerCm3 : 1;
    batch = input.batch ?? {
      gallons: batchGallons,
      temperatureC: typeof inlet?.temperatureC === 'number' ? inlet.temperatureC : 20,
      massKg: batchGallons * LITERS_PER_GALLON * density,
      number: 1,
      ...(contract.designInlet?.composition ? { composition: contract.designInlet.composition } : {})
    };
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
        : contract.behavior.mode === 'BATCH'
          ? { mode: 'BATCH', batchGallons, phases: [], cycleSecondsEstimate: 0, gallonsPerMinute: 0 }
          : { mode: 'CONTINUOUS_RATE', throughputPerMinute: 0 },
    outlets: {},
    reactions: [],
    error: { path, message: e instanceof ExpressionError ? e.message : String(e) }
  });

  // Derived values resolve in declaration order; each sees the ones before it.
  for (const d of contract.derived) {
    try {
      derived[d.name] = evaluateNumber(d.expr, buildScope(contract, parameters, derived, inlet, utility, batch));
    } catch (e) {
      return fail(`derived.${d.name}`, e);
    }
  }

  const scope = buildScope(contract, parameters, derived, inlet, utility, batch);

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
    } else if (contract.behavior.mode === 'BATCH') {
      const phases: EvaluatedBatchPhase[] = [];
      let seconds = 0;
      for (const [i, ph] of contract.behavior.phases.entries()) {
        const num = (key: 'gallons' | 'rateGpm' | 'seconds' | 'temperatureC' | 'dutyKw') => {
          const expr = ph[key];
          if (!expr) return undefined;
          const v = evaluateNumber(expr, scope);
          if (key !== 'temperatureC' && v < 0) throw new Error(`phases[${i}].${key} must not be negative, got ${v}`);
          return v;
        };
        const e: EvaluatedBatchPhase = { name: ph.name, kind: ph.kind };
        for (const key of ['gallons', 'rateGpm', 'seconds', 'temperatureC', 'dutyKw'] as const) {
          const v = num(key);
          if (v !== undefined) e[key] = v;
        }
        if (ph.port) e.port = ph.port;
        phases.push(e);
        if (ph.kind === 'HOLD') seconds += e.seconds ?? 0;
        else if (e.rateGpm && e.rateGpm > 0) seconds += ((e.gallons ?? batchGallons) / e.rateGpm) * 60;
      }
      if (batchGallons <= 0) return fail('behavior.batchGallons', new Error(`batchGallons must be positive, got ${batchGallons}`));
      behavior = {
        mode: 'BATCH',
        batchGallons,
        phases,
        cycleSecondsEstimate: seconds,
        gallonsPerMinute: seconds > 0 ? (batchGallons / seconds) * 60 : Infinity
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
      let recovery: Record<string, number> | undefined;
      if (o.recovery) {
        recovery = {};
        for (const [c, expr] of Object.entries(o.recovery)) {
          const r = evaluateNumber(expr, scope);
          if (r < 0 || r > 1) return fail(`outlets.${o.port}.recovery.${c}`, new Error(`a recovery must be between 0 and 1, got ${r}`));
          recovery[c] = r;
        }
      }
      outlets[o.port] = {
        ...(share !== undefined ? { share } : {}),
        ...(o.temperatureC ? { temperatureC: evaluateNumber(o.temperatureC, scope) } : {}),
        ...(recovery ? { recovery } : {})
      };
    } catch (e) {
      return fail(`outlets.${o.port}`, e);
    }
  }
  const total = Object.values(outlets).reduce((sum, o) => sum + (o.share ?? 0), 0);
  if (total > 1 + 1e-9) {
    return fail('outlets', new Error(`the outlet shares add up to ${Math.round(total * 1000) / 1000}, more than all of the flow`));
  }
  for (const c of contract.components ?? []) {
    const sum = Object.values(outlets).reduce((a, o) => a + (o.recovery?.[c] ?? 0), 0);
    if (sum > 1 + 1e-9) return fail('outlets', new Error(`the recoveries of ${c} add up to ${Math.round(sum * 1000) / 1000}, more than all of it`));
  }

  const reactions: EvaluatedReaction[] = [];
  for (const [i, r] of (contract.reactions ?? []).entries()) {
    try {
      const conversion = evaluateNumber(r.conversion, scope);
      if (conversion < 0 || conversion > 1) return fail(`reactions[${i}].conversion`, new Error(`a conversion must be between 0 and 1, got ${conversion}`));
      reactions.push({ id: r.id, limiting: r.limiting, conversion, coefficients: r.coefficients });
    } catch (e) {
      return fail(`reactions[${i}].conversion`, e);
    }
  }

  return {
    contractId: contract.id,
    parameters,
    derived,
    constraints,
    physicallyValid: constraints.every((c) => c.satisfied || c.severity === 'WARNING'),
    behavior,
    outlets,
    reactions
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
