import { z } from 'zod';
import { UnitOpDrawingSchema } from './drawing.js';
import { parseExpression, referencedNames, ExpressionError } from './expression.js';

/**
 * A UnitOpContract is the execution target for a generated unit operation.
 *
 * The problem it solves: before this existed, the engine dispatched on a fixed
 * `switch (node.kind)` over four hardcoded machine types. A sub-agent asked to
 * design a new unit operation had nowhere to put the result -- it could produce
 * drawings (the CAD template library covers 13 kinds) but nothing executable.
 * A compiler with no target language emits constants, which is exactly what
 * `query_unit_subagent` did.
 *
 * A contract is DATA, not code. It declares:
 *   - ports:       what flows in and out
 *   - parameters:  the knobs, with units and physical bounds
 *   - derived:     quantities computed from parameters and inlet stream state
 *   - constraints: the assertions that make "does this make physical sense" a
 *                  check the ENGINE performs, rather than a claim the model
 *                  makes about its own output
 *   - behavior:    how the node advances the simulation
 *
 * Every expression is evaluated by the restricted evaluator in expression.ts.
 * The engine remains the only thing doing arithmetic, so a contract-defined
 * node is exactly as deterministic and auditable as a hand-written one.
 */

export const UnitOpPortSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  direction: z.enum(['INLET', 'OUTLET']),
  /**
   * MATERIAL carries mass. UTILITY is a service stream (cooling water, steam,
   * compressed air) whose duty matters but which does not join the product
   * mass balance. ENERGY is a pure duty term with no stream attached.
   */
  role: z.enum(['MATERIAL', 'UTILITY', 'ENERGY']).default('MATERIAL'),
  flowDimension: z.enum(['CONTINUOUS_FLUID', 'DISCRETE_CONTAINER']),
  required: z.boolean().default(true)
});
export type UnitOpPort = z.infer<typeof UnitOpPortSchema>;

/**
 * A declared knob. `unit` is documentation and UI affordance; the expression
 * language is unit-agnostic and works on the declared numeric values, so a
 * contract must be internally consistent about units. `min`/`max` are the
 * physically meaningful domain, not UI slider bounds -- a value outside them
 * is rejected before any expression runs.
 */
export const UnitOpParameterSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Parameter names must be valid identifiers'),
  label: z.string().min(1),
  unit: z.string().min(1),
  value: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  description: z.string().optional()
});
export type UnitOpParameter = z.infer<typeof UnitOpParameterSchema>;

/** A quantity computed from parameters, inlet state, and earlier derived values. */
export const UnitOpDerivedSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  unit: z.string().min(1),
  expr: z.string().min(1),
  description: z.string().optional()
});
export type UnitOpDerived = z.infer<typeof UnitOpDerivedSchema>;

/**
 * A physical-sense check. `expr` must evaluate to a boolean; when it is false
 * the contract is reporting that the configuration is not physically coherent.
 *
 * ERROR   -- the unit op cannot operate as specified. Simulation should refuse.
 * WARNING -- operable but outside good practice.
 */
export const UnitOpConstraintSchema = z.object({
  id: z.string().min(1),
  expr: z.string().min(1),
  severity: z.enum(['ERROR', 'WARNING']).default('ERROR'),
  message: z.string().min(1),
  /** Optional remediation hint surfaced to the engineer and to the orchestrator. */
  hint: z.string().optional()
});
export type UnitOpConstraint = z.infer<typeof UnitOpConstraintSchema>;

/**
 * How the node advances the simulation.
 *
 * DISCRETE_CYCLE -- the node processes `unitsPerCycle` items every
 *   `cycleSeconds`, both expressions. This is the packaging-line shape and is
 *   what the existing hardcoded handlers do.
 *
 * CONTINUOUS_RATE -- the node transforms a continuous stream at a steady rate.
 *   `throughputPerMinute` sets material flow; `dutyKw` reports the energy term.
 *   Steady state only: this evaluates relations, it does not integrate. Unit
 *   ops whose behavior genuinely requires integration over time are out of
 *   scope for this contract version, and `residenceTimeSeconds` exists so that
 *   a contract can express a time-dependent requirement as a constraint rather
 *   than pretending to integrate.
 */
export const UnitOpBehaviorSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('DISCRETE_CYCLE'),
    cycleSeconds: z.string().min(1),
    unitsPerCycle: z.string().min(1),
    /** Fraction 0..1 of units scrapped per cycle. Deterministic by design. */
    scrapFraction: z.string().optional()
  }),
  z.object({
    mode: z.literal('CONTINUOUS_RATE'),
    throughputPerMinute: z.string().min(1),
    dutyKw: z.string().optional(),
    residenceTimeSeconds: z.string().optional()
  })
]);
export type UnitOpBehavior = z.infer<typeof UnitOpBehaviorSchema>;

/** Records who authored what, so generated values are never mistaken for engineered ones. */
export const UnitOpProvenanceSchema = z.object({
  authoredBy: z.enum(['ENGINEER', 'SUB_AGENT', 'TEMPLATE']),
  /** Model identifier when authoredBy is SUB_AGENT. Absent otherwise. */
  modelId: z.string().optional(),
  createdAt: z.string().optional(),
  /** Parameter names the engineer set or confirmed by hand. */
  engineerConfirmed: z.array(z.string()).default([]),
  notes: z.string().optional()
});
export type UnitOpProvenance = z.infer<typeof UnitOpProvenanceSchema>;

export const UnitOpContractSchema = z.object({
  contractVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  ports: z.array(UnitOpPortSchema).min(1),
  parameters: z.array(UnitOpParameterSchema).default([]),
  derived: z.array(UnitOpDerivedSchema).default([]),
  constraints: z.array(UnitOpConstraintSchema).default([]),
  behavior: UnitOpBehaviorSchema,
  provenance: UnitOpProvenanceSchema,
  /**
   * How the unit is drawn on the flowsheet, with a nozzle for every port.
   * Optional so older contracts still load; without it the unit is drawn as a
   * generic vessel with its connections spaced along the edges.
   */
  drawing: UnitOpDrawingSchema.optional()
});
export type UnitOpContract = z.infer<typeof UnitOpContractSchema>;

// --------------------------------------------------------------- validation

export interface ContractValidationIssue {
  path: string;
  message: string;
}

/**
 * Names an expression may reference, beyond the contract's own parameters and
 * derived values. These are supplied by the engine at evaluation time.
 */
export const RESERVED_SCOPE_NAMES = [
  'inlet.temperatureC',
  'inlet.massFlowKgPerS',
  'inlet.volumetricFlowGpm',
  'inlet.piecesPerMinute',
  'inlet.densityGPerCm3',
  'inlet.specificHeatKjPerKgK',
  'inlet.latentHeatKjPerKg',
  'utility.temperatureC',
  'utility.massFlowKgPerS',
  'utility.specificHeatKjPerKgK'
] as const;

/**
 * Static checks that a contract is coherent BEFORE it is ever simulated:
 * every expression parses, every reference resolves to something declared,
 * derived values only reference earlier ones (no cycles by construction), and
 * parameter values sit inside their declared physical bounds.
 *
 * This is the check that a generated unit op has to survive. It is the
 * structural half of "does this make physical sense"; the constraints are the
 * physical half, and they are evaluated at run time by evaluateUnitOp().
 */
export function validateUnitOpContract(contract: UnitOpContract): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];
  const known = new Set<string>(RESERVED_SCOPE_NAMES);

  for (const p of contract.parameters) {
    if (known.has(p.name)) {
      issues.push({ path: `parameters.${p.name}`, message: `Duplicate name "${p.name}"` });
    }
    known.add(p.name);

    if (p.min !== undefined && p.max !== undefined && p.min > p.max) {
      issues.push({ path: `parameters.${p.name}`, message: `min (${p.min}) exceeds max (${p.max})` });
    }
    if (p.min !== undefined && p.value < p.min) {
      issues.push({
        path: `parameters.${p.name}`,
        message: `value ${p.value} ${p.unit} is below the declared minimum ${p.min}`
      });
    }
    if (p.max !== undefined && p.value > p.max) {
      issues.push({
        path: `parameters.${p.name}`,
        message: `value ${p.value} ${p.unit} is above the declared maximum ${p.max}`
      });
    }
  }

  const checkExpr = (expr: string, path: string): void => {
    try {
      parseExpression(expr);
      for (const ref of referencedNames(expr)) {
        if (!known.has(ref)) {
          issues.push({
            path,
            message:
              `references "${ref}", which is not a declared parameter, an earlier derived value, ` +
              `or an engine-supplied name`
          });
        }
      }
    } catch (e) {
      issues.push({
        path,
        message: e instanceof ExpressionError ? e.message : String(e)
      });
    }
  };

  // Derived values resolve in declaration order, so a later one may use an
  // earlier one but not vice versa. That makes cycles impossible by shape.
  for (const d of contract.derived) {
    checkExpr(d.expr, `derived.${d.name}`);
    if (known.has(d.name)) {
      issues.push({ path: `derived.${d.name}`, message: `Duplicate name "${d.name}"` });
    }
    known.add(d.name);
  }

  for (const c of contract.constraints) {
    checkExpr(c.expr, `constraints.${c.id}`);
  }

  const b = contract.behavior;
  if (b.mode === 'DISCRETE_CYCLE') {
    checkExpr(b.cycleSeconds, 'behavior.cycleSeconds');
    checkExpr(b.unitsPerCycle, 'behavior.unitsPerCycle');
    if (b.scrapFraction) checkExpr(b.scrapFraction, 'behavior.scrapFraction');
  } else {
    checkExpr(b.throughputPerMinute, 'behavior.throughputPerMinute');
    if (b.dutyKw) checkExpr(b.dutyKw, 'behavior.dutyKw');
    if (b.residenceTimeSeconds) checkExpr(b.residenceTimeSeconds, 'behavior.residenceTimeSeconds');
  }

  const inlets = contract.ports.filter((p) => p.direction === 'INLET');
  const outlets = contract.ports.filter((p) => p.direction === 'OUTLET');
  if (inlets.length === 0 && outlets.length === 0) {
    issues.push({ path: 'ports', message: 'A unit op needs at least one inlet or outlet' });
  }

  return issues;
}
