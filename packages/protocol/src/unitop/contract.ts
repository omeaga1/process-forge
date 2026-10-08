import { z } from 'zod';
import { UnitOpDrawingSchema } from './drawing.js';
import { MaterialPhaseSchema, PHASE_ARCHETYPES, UnitOpPhaseChangeSchema } from './phases.js';
import { phaseIssues } from './phaseBalance.js';
import { parseExpression, referencedNames, ExpressionError } from './expression.js';
import {
  checkDimension,
  DIMENSIONLESS,
  ENGINE_NAME_DIMENSIONS,
  parseUnit,
  MASS,
  MASS_FLOW,
  POWER,
  SPECIFIC_ENERGY,
  TEMPERATURE,
  TIME,
  VOLUME,
  VOLUME_FLOW,
  type Dimension,
  type DimensionEnv,
  type Inferred
} from './dimensions.js';

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
  required: z.boolean().default(true),
  /**
   * The physical state of what flows through the port: LIQUID, GAS, SOLID
   * (bulk powder, granules, cake) or ITEMS. It decides the flow units and the
   * physics that apply (see phases.ts). Absent: LIQUID for a
   * CONTINUOUS_FLUID port, ITEMS for a DISCRETE_CONTAINER one.
   */
  phase: MaterialPhaseSchema.optional(),
  /**
   * Components carried in a different phase than the port's own: the dust in
   * a dirty-air duct ({ dust: 'SOLID' } on a GAS port), the moisture in a
   * damp powder ({ water: 'LIQUID' } on a SOLID port).
   */
  dispersed: z.record(MaterialPhaseSchema).optional(),
  /** The components this port carries. Absent: any. */
  carries: z.array(z.string().min(1)).optional(),
  /**
   * kg/m³ of what leaves by this port, for its volume: a SOLID port's bulk
   * density (600 when absent), a LIQUID port's density. A GAS port's density
   * comes from the ideal gas law at the temperature it leaves at.
   */
  densityKgPerM3: z.number().positive().optional()
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
  description: z.string().optional(),
  /** Whole numbers only: a count of nozzles, stations, passes or trays. */
  integer: z.boolean().optional(),
  /**
   * The values it can take when it is a choice, not a continuum: a bag
   * fabric's temperature rating, a pipe schedule, a motor size from a
   * catalogue. The value must be one of them.
   */
  options: z.array(z.object({ label: z.string().min(1), value: z.number() })).min(2).max(24).optional(),
  /**
   * How the engineer edits it. All optional: the panel picks a control from
   * the parameter itself (a choice, a count, a bounded value, an open one)
   * and groups by kind of quantity when no group is given.
   */
  ui: z
    .object({
      control: z.enum(['slider', 'number', 'stepper', 'select', 'toggle']).optional(),
      /** The section it is shown in: "Geometry", "Operating conditions", "Performance". */
      group: z.string().min(1).optional(),
      /** Increment for steppers and arrow keys, in the parameter's unit. */
      step: z.number().positive().optional(),
      /** Log for a range spanning decades (a particle size, a viscosity). */
      scale: z.enum(['linear', 'log']).optional(),
      /** Tucked under "Advanced": rarely changed (a correlation constant, a fouling factor). */
      advanced: z.boolean().optional()
    })
    .optional()
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

/** Items a cycle takes from one item inlet port. The cycle waits until every declared port has its count. */
export const UnitOpCycleInputSchema = z.object({
  port: z.string().min(1),
  perCycle: z.string().min(1)
});
export type UnitOpCycleInput = z.infer<typeof UnitOpCycleInputSchema>;

/**
 * Items a cycle sends out of one item outlet port. `scrap: true` counts them
 * against the unit's quality (rejects), whether or not the port is piped on
 * (to a waste outlet, a rework loop).
 */
export const UnitOpCycleOutputSchema = z.object({
  port: z.string().min(1),
  perCycle: z.string().min(1),
  scrap: z.boolean().optional()
});
export type UnitOpCycleOutput = z.infer<typeof UnitOpCycleOutputSchema>;

/**
 * One step of a batch. Every value is an expression, evaluated when the phase
 * starts, with batch.* holding the batch as it is then, so a heat-up time or
 * a decant volume can follow from the physics.
 *
 * FILL  -- takes liquid in until `gallons` have come in (default: up to
 *          batchGallons), at most `rateGpm`. With no liquid inlet pipe the unit
 *          charges itself at `rateGpm` (its raw materials are not modelled).
 * HOLD  -- holds for `seconds`; the contents end at `temperatureC` if given,
 *          and `dutyKw` is counted as energy over the phase.
 * DRAIN -- sends `gallons` out (default: everything), at most `rateGpm`, to
 *          outlet `port` if given, else to every outlet by outlets[] shares.
 */
export const UnitOpBatchPhaseSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['FILL', 'HOLD', 'DRAIN']),
  gallons: z.string().optional(),
  rateGpm: z.string().optional(),
  seconds: z.string().optional(),
  temperatureC: z.string().optional(),
  dutyKw: z.string().optional(),
  port: z.string().optional(),
  /** HOLD: run the contract's reactions on the batch over this phase. */
  react: z.boolean().optional()
});
export type UnitOpBatchPhase = z.infer<typeof UnitOpBatchPhaseSchema>;

/**
 * How the node advances the simulation.
 *
 * DISCRETE_CYCLE -- the node processes `unitsPerCycle` items every
 *   `cycleSeconds`, both expressions. This is the packaging-line shape: the
 *   built-in filler, conveyor, labeler and palletizer run on it.
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
    /**
     * Fraction 0..1 of units scrapped per cycle. By default deterministic:
     * floor(items x fraction) a cycle. With scrapRandom, it is each item's
     * chance of being a reject, drawn from the run's seeded random stream (an
     * inspection camera, a fill-weight check).
     */
    scrapFraction: z.string().optional(),
    scrapRandom: z.boolean().optional(),
    /** Items its inlet queue holds before the units feeding it block (default 100). */
    queueCapacity: z.string().optional(),
    /**
     * A cycle waits until unitsPerCycle items are queued, rather than taking
     * what is there: a palletizer builds a whole layer, a case packer a whole case.
     */
    fullCyclesOnly: z.boolean().optional(),
    /**
     * It only works on items it is sent: with no item pipe in, it waits
     * instead of starting cycles on its own (a conveyor, a labeler). Without
     * it, a cycle unit with no item pipe in is a source (a printer, a press).
     */
    itemsRequired: z.boolean().optional(),
    /**
     * Gallons of liquid each cycle draws from the unit's liquid inlet (a
     * filler, a moulding press, a dosing station). The cycle waits until the
     * liquid is there, so an upstream tank or pump can starve it.
     */
    liquidPerCycleGallons: z.string().optional(),
    /**
     * Assembly and conversion: what each cycle takes, per item inlet port (12
     * bottles for a case; a bottle and a cap). Without it a cycle takes up to
     * unitsPerCycle items from any inlet.
     */
    inputs: z.array(UnitOpCycleInputSchema).optional(),
    /**
     * What each cycle makes, per item outlet port (1 case; good and rejects).
     * The counts must add up to unitsPerCycle. Without it, unitsPerCycle items
     * go to every outlet in turn.
     */
    outputs: z.array(UnitOpCycleOutputSchema).optional()
  }),
  z.object({
    mode: z.literal('CONTINUOUS_RATE'),
    /** The unit's rate, in whatever unit the contract states (kg/min, gal/min, ...). Reported; the engine does not limit flow by it. */
    throughputPerMinute: z.string().min(1),
    /** The most liquid it passes, gal/min. The engine limits the flow through it to this, live. */
    capacityGpm: z.string().optional(),
    /**
     * The most it passes as a mass flow, kg/h: how a gas or solids unit states
     * its capacity (a fan's or a feeder's rating), where gal/min means nothing.
     * The engine limits the flow through it to this, live, by what arrives.
     */
    capacityKgPerHour: z.string().optional(),
    dutyKw: z.string().optional(),
    residenceTimeSeconds: z.string().optional()
  }),
  z.object({
    /**
     * A vessel that holds a batch of liquid and runs it through its phases in
     * order, then starts again: a reactor, crystalliser, fermenter, decanter,
     * CIP tank. batchGallons is the working volume; it may read parameters
     * and inlet.* but not batch.* (the batch does not exist yet).
     */
    mode: z.literal('BATCH'),
    batchGallons: z.string().min(1),
    phases: z.array(UnitOpBatchPhaseSchema).min(1)
  }),
  z.object({
    /**
     * A vessel that holds liquid between units: a storage, surge or day tank.
     * It takes what arrives while it has room and sends what it holds, up to
     * maxOutflowGpm. Full, it backs up whatever feeds it; empty, it starves
     * whatever it feeds.
     */
    mode: z.literal('STORAGE'),
    capacityGallons: z.string().min(1),
    initialGallons: z.string().optional(),
    maxOutflowGpm: z.string().optional()
  })
]);
export type UnitOpBehavior = z.infer<typeof UnitOpBehaviorSchema>;

/**
 * Conditions to check a design at: the values `inlet.*` (and `utility.*`)
 * take when there is no live stream, i.e. when validating, and before the
 * first liquid arrives in a run. During a run the engine supplies the live
 * values; any it cannot measure fall back to these.
 */
export const UnitOpDesignStreamSchema = z.object({
  temperatureC: z.number().optional(),
  massFlowKgPerS: z.number().nonnegative().optional(),
  volumetricFlowGpm: z.number().nonnegative().optional(),
  piecesPerMinute: z.number().nonnegative().optional(),
  /** A batch unit's inlet port: kg it has charged into the batch in hand (port.<id>.chargedKg). */
  chargedKg: z.number().nonnegative().optional(),
  densityGPerCm3: z.number().positive().optional(),
  specificHeatKjPerKgK: z.number().positive().optional(),
  latentHeatKjPerKg: z.number().nonnegative().optional(),
  /** Mass fractions by component, for designs that read inlet.x.<component>. */
  composition: z.record(z.number().nonnegative()).optional()
});
export type UnitOpDesignStream = z.infer<typeof UnitOpDesignStreamSchema>;

/**
 * What leaves by one outlet port. Both are expressions, evaluated live.
 *
 * share -- the fraction 0..1 of the unit's outflow that leaves by this port.
 *   Outlets without a share split what the others leave. If every outlet has
 *   a share and they sum to less than 1, the rest leaves the line (steam out
 *   of a vent, water driven off a dryer) and is reported as a loss.
 * temperatureC -- the temperature it leaves at. Without it, it leaves at the
 *   inlet temperature.
 */
export const UnitOpOutletStreamSchema = z.object({
  port: z.string().min(1),
  share: z.string().optional(),
  temperatureC: z.string().optional(),
  /**
   * Separation by component: for each named component, the fraction 0..1 of
   * its mass (after any reactions) that leaves by this port. The port's flow
   * and composition follow from it. Components a port does not name are split
   * evenly among the ports that do not name them; what no port takes is lost.
   * An outlet gives a share or recoveries, not both.
   */
  recovery: z.record(z.string().min(1)).optional()
});
export type UnitOpOutletStream = z.infer<typeof UnitOpOutletStreamSchema>;

/**
 * A reaction on a mass basis. `coefficients` are kg of each component per kg
 * of the reaction, negative for what it consumes and positive for what it
 * makes, and must add up to zero (mass is conserved). `conversion` is the
 * fraction 0..1 of the `limiting` component that reacts. Continuous units
 * react what flows through them; BATCH units react in HOLD phases marked
 * react: true.
 */
export const UnitOpReactionSchema = z.object({
  id: z.string().min(1),
  limiting: z.string().min(1),
  conversion: z.string().min(1),
  coefficients: z.record(z.number())
});
export type UnitOpReaction = z.infer<typeof UnitOpReactionSchema>;

/**
 * Breakdowns. The unit runs for an exponentially distributed time with mean
 * mtbfMinutes, stops (FAILED) for an exponentially distributed repair with
 * mean mttrMinutes, and picks up where it left off. Any mode: a cycle unit's
 * cycle pauses, a liquid unit passes nothing and a batch's clock stops.
 * Drawn from a random stream of its own, so turning breakdowns on for one
 * unit does not change any other draw in the run.
 */
export const UnitOpReliabilitySchema = z.object({
  mtbfMinutes: z.string().min(1),
  mttrMinutes: z.string().min(1)
});
export type UnitOpReliability = z.infer<typeof UnitOpReliabilitySchema>;

/**
 * Random variation. cycleTimeCv is the coefficient of variation (standard
 * deviation over mean) of a DISCRETE_CYCLE unit's cycle time: each cycle is
 * drawn from a lognormal with mean cycleSeconds and that spread. 0, or
 * absent, keeps every cycle exactly cycleSeconds.
 */
export const UnitOpVariabilitySchema = z.object({
  cycleTimeCv: z.string().optional()
});
export type UnitOpVariability = z.infer<typeof UnitOpVariabilitySchema>;

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
  /**
   * The kind of equipment this is, by archetype id (design_unit_op's
   * phasePlan.archetype.id: 'pump', 'spray-dryer', 'two-stream-exchanger'...).
   * Stated, it holds the contract to that equipment's physics: its port
   * phases, phase changes, behavior mode and the quantities and checks a
   * complete design of it has (physicsAlignment.ts). 'custom' says it is none
   * of them. Absent, the engine infers it from the name and description and
   * only warns.
   */
  archetype: z.string().min(1).optional(),
  ports: z.array(UnitOpPortSchema).min(1),
  parameters: z.array(UnitOpParameterSchema).default([]),
  derived: z.array(UnitOpDerivedSchema).default([]),
  constraints: z.array(UnitOpConstraintSchema).default([]),
  behavior: UnitOpBehaviorSchema,
  /** The inlet conditions to check the design at; see UnitOpDesignStreamSchema. */
  designInlet: UnitOpDesignStreamSchema.optional(),
  /** The utility stream's design conditions, for designs that read utility.*. */
  designUtility: UnitOpDesignStreamSchema.optional(),
  /**
   * Design conditions per inlet port, for designs that read one inlet on its
   * own as port.<id>.* (the hot air into a dryer, the liquor into a
   * scrubber), where inlet.* is everything arriving, mixed. During a run the
   * engine supplies what reaches each port.
   */
  designPorts: z.record(UnitOpDesignStreamSchema).optional(),
  /** Per-outlet share and temperature, for continuous units. */
  outlets: z.array(UnitOpOutletStreamSchema).optional(),
  /**
   * The components this design names, so inlet.x.<name>, batch.x.<name>,
   * reactions and recoveries can be checked. Other components in a stream
   * pass through untouched.
   */
  components: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Component names must be valid identifiers')).optional(),
  reactions: z.array(UnitOpReactionSchema).optional(),
  /**
   * Components that change phase in the unit: water evaporating in a dryer,
   * solids drying out of solution, vapour condensing. A component may only
   * leave in a phase it arrived in unless a change here takes it there.
   */
  phaseChanges: z.array(UnitOpPhaseChangeSchema).optional(),
  /**
   * Streams that pass through without mixing: what enters `inlet` leaves only
   * by `outlet` (the hot and cold sides of a heat exchanger, the shell and the
   * tubes). A CONTINUOUS_RATE unit only; when given, every continuous inlet
   * is in a channel. Each outlet's temperature comes from outlets[].
   */
  channels: z.array(z.object({ inlet: z.string().min(1), outlet: z.string().min(1) })).optional(),
  reliability: UnitOpReliabilitySchema.optional(),
  variability: UnitOpVariabilitySchema.optional(),
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
  /** A units (dimension) problem, rather than a structural one. */
  unit?: true;
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
 * What a BATCH unit's expressions can read about the batch in hand: its
 * volume, temperature, mass, specific heat and density as the phase starts,
 * and which batch it is (1, 2, ...). At validation they describe a full vessel
 * of designInlet liquid.
 */
/** What an expression can read about one inlet port's own stream: port.<id>.<field>. */
export const PORT_STREAM_FIELDS = ['temperatureC', 'massFlowKgPerS', 'volumetricFlowGpm', 'densityGPerCm3', 'specificHeatKjPerKgK', 'latentHeatKjPerKg'] as const;
/** A BATCH unit's port also reads what it has charged into the batch in hand, kg. */
export const BATCH_PORT_FIELDS = ['chargedKg'] as const;

/** port.<id>.<field> and port.<id>.x.<component> for every continuous inlet port whose id is a plain name. */
export function portScopeNames(contract: Pick<UnitOpContract, 'ports' | 'components' | 'behavior'>): string[] {
  const out: string[] = [];
  // A continuous unit is evaluated live at each port, a batch unit at each phase from what each port charged;
  // a cycle or storage unit reads the mix (inlet.*).
  const batch = contract.behavior.mode === 'BATCH';
  if (contract.behavior.mode !== 'CONTINUOUS_RATE' && !batch) return out;
  for (const p of contract.ports) {
    if (p.direction !== 'INLET' || p.flowDimension !== 'CONTINUOUS_FLUID' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.id)) continue;
    for (const f of PORT_STREAM_FIELDS) out.push(`port.${p.id}.${f}`);
    if (batch) for (const f of BATCH_PORT_FIELDS) out.push(`port.${p.id}.${f}`);
    for (const c of contract.components ?? []) out.push(`port.${p.id}.x.${c}`);
  }
  return out;
}

export const BATCH_SCOPE_NAMES = ['batch.gallons', 'batch.temperatureC', 'batch.massKg', 'batch.number', 'batch.cpKjPerKgK', 'batch.densityGPerCm3'] as const;

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
  if (contract.archetype && contract.archetype !== 'custom' && !PHASE_ARCHETYPES.some((a) => a.id === contract.archetype)) {
    issues.push({ path: 'archetype', message: `"${contract.archetype}" is not an archetype. Use one of ${PHASE_ARCHETYPES.map((a) => a.id).join(', ')}, or 'custom' for equipment that is none of them.` });
  }
  const known = new Set<string>(RESERVED_SCOPE_NAMES);
  if (contract.behavior.mode === 'BATCH') for (const n of BATCH_SCOPE_NAMES) known.add(n);
  const components = contract.components ?? [];
  for (const c of components) {
    known.add(`inlet.x.${c}`);
    if (contract.behavior.mode === 'BATCH') known.add(`batch.x.${c}`);
  }
  for (const name of portScopeNames(contract)) known.add(name);
  for (const id of Object.keys(contract.designPorts ?? {})) {
    if (!contract.ports.some((p) => p.id === id && p.direction === 'INLET' && p.flowDimension === 'CONTINUOUS_FLUID')) {
      issues.push({ path: `designPorts.${id}`, message: `names "${id}", which is not a continuous INLET port. Inlets: ${contract.ports.filter((p) => p.direction === 'INLET').map((p) => p.id).join(', ') || 'none'}` });
    }
  }

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
    if (p.integer && !Number.isInteger(p.value)) {
      issues.push({ path: `parameters.${p.name}`, message: `is a whole number (integer: true), but its value is ${p.value}` });
    }
    if (p.options) {
      if (!p.options.some((o) => o.value === p.value)) {
        issues.push({ path: `parameters.${p.name}`, message: `value ${p.value} is not one of its options (${p.options.map((o) => `${o.label} = ${o.value}`).join(', ')})` });
      }
      const out = p.options.filter((o) => (p.min !== undefined && o.value < p.min) || (p.max !== undefined && o.value > p.max));
      if (out.length) issues.push({ path: `parameters.${p.name}.options`, message: `${out.map((o) => o.label).join(', ')} lie outside min/max` });
    }
    // An efficiency over 100 % makes energy; a temperature below absolute zero does not exist.
    if (/(^|_)(eff|efficiency)$|Efficiency$|Eff$/.test(p.name) || /\befficiency\b/i.test(p.label)) {
      const cap = p.unit.trim() === '%' ? 100 : ['-', '', 'fraction', 'ratio'].includes(p.unit.trim()) ? 1 : undefined;
      if (cap !== undefined && (p.value > cap || p.value <= 0)) {
        issues.push({ path: `parameters.${p.name}`, message: `an efficiency of ${p.value} ${p.unit} is not physical: it must be above 0 and at most ${cap} ${p.unit}` });
      }
    }
    const absZero = p.unit.trim() === 'K' ? 0 : ['°C', 'degC', 'C'].includes(p.unit.trim()) ? -273.15 : ['°F', 'degF', 'F'].includes(p.unit.trim()) ? -459.67 : undefined;
    if (absZero !== undefined && p.value < absZero) {
      issues.push({ path: `parameters.${p.name}`, message: `${p.value} ${p.unit} is below absolute zero` });
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
    const portList = (dir: 'INLET' | 'OUTLET') =>
      contract.ports.filter((p) => p.direction === dir && p.flowDimension === 'DISCRETE_CONTAINER').map((p) => p.id);
    for (const [key, dir] of [['inputs', 'INLET'], ['outputs', 'OUTLET']] as const) {
      const list = (b[key] ?? []) as { port: string; perCycle: string }[];
      const allowed = portList(dir);
      const seenPorts = new Set<string>();
      list.forEach((x, i) => {
        const path = `behavior.${key}[${i}]`;
        if (!allowed.includes(x.port)) {
          issues.push({ path, message: `names port "${x.port}", which is not an item ${dir} port. Item ${dir === 'INLET' ? 'inlets' : 'outlets'}: ${allowed.join(', ') || 'none'}` });
        }
        if (seenPorts.has(x.port)) issues.push({ path, message: `port "${x.port}" is listed twice` });
        seenPorts.add(x.port);
        checkExpr(x.perCycle, `${path}.perCycle`);
      });
    }
    if (b.outputs?.length && b.scrapFraction) {
      issues.push({ path: 'behavior.scrapFraction', message: 'with outputs[], send rejects to their own port and mark it scrap: true, instead of scrapFraction' });
    }
    if (b.liquidPerCycleGallons) {
      checkExpr(b.liquidPerCycleGallons, 'behavior.liquidPerCycleGallons');
      if (!contract.ports.some((p) => p.direction === 'INLET' && p.flowDimension === 'CONTINUOUS_FLUID')) {
        issues.push({ path: 'behavior.liquidPerCycleGallons', message: 'draws liquid, but the unit has no CONTINUOUS_FLUID inlet port to draw it from' });
      }
    }
  } else if (b.mode === 'BATCH') {
    checkExpr(b.batchGallons, 'behavior.batchGallons');
    try {
      if (referencedNames(b.batchGallons).some((r) => r.startsWith('batch.'))) {
        issues.push({ path: 'behavior.batchGallons', message: 'the working volume cannot read batch.*: the batch does not exist until it is filled' });
      }
    } catch {
      // Reported by checkExpr.
    }
    const liquidOutlets = contract.ports.filter((p) => p.direction === 'OUTLET' && p.flowDimension === 'CONTINUOUS_FLUID').map((p) => p.id);
    b.phases.forEach((ph, i) => {
      const path = `behavior.phases[${i}]`;
      for (const key of ['gallons', 'rateGpm', 'seconds', 'temperatureC', 'dutyKw'] as const) {
        if (ph[key]) checkExpr(ph[key]!, `${path}.${key}`);
      }
      if (ph.kind === 'HOLD' && !ph.seconds) issues.push({ path, message: `HOLD phase "${ph.name}" needs seconds` });
      if (ph.kind !== 'HOLD' && (ph.seconds || ph.temperatureC || ph.dutyKw)) {
        issues.push({ path, message: `seconds, temperatureC and dutyKw belong on a HOLD phase, not ${ph.kind} "${ph.name}"` });
      }
      if (ph.port && (ph.kind !== 'DRAIN' || !liquidOutlets.includes(ph.port))) {
        issues.push({ path, message: `port "${ph.port}" must be a liquid OUTLET port on a DRAIN phase. Liquid outlets: ${liquidOutlets.join(', ') || 'none'}` });
      }
    });
    if (!b.phases.some((ph) => ph.kind === 'FILL')) issues.push({ path: 'behavior.phases', message: 'a batch needs a FILL phase' });
    if (!b.phases.some((ph) => ph.kind === 'DRAIN')) issues.push({ path: 'behavior.phases', message: 'a batch needs a DRAIN phase, or it fills once and stops' });
  } else if (b.mode === 'STORAGE') {
    checkExpr(b.capacityGallons, 'behavior.capacityGallons');
    if (b.initialGallons) checkExpr(b.initialGallons, 'behavior.initialGallons');
    if (b.maxOutflowGpm) checkExpr(b.maxOutflowGpm, 'behavior.maxOutflowGpm');
  } else {
    checkExpr(b.throughputPerMinute, 'behavior.throughputPerMinute');
    if (b.capacityGpm) checkExpr(b.capacityGpm, 'behavior.capacityGpm');
    if (b.capacityKgPerHour) checkExpr(b.capacityKgPerHour, 'behavior.capacityKgPerHour');
    if (b.dutyKw) checkExpr(b.dutyKw, 'behavior.dutyKw');
    if (b.residenceTimeSeconds) checkExpr(b.residenceTimeSeconds, 'behavior.residenceTimeSeconds');
  }
  if (b.mode === 'DISCRETE_CYCLE' && b.queueCapacity) checkExpr(b.queueCapacity, 'behavior.queueCapacity');
  if (b.mode === 'DISCRETE_CYCLE' && b.scrapRandom && !b.scrapFraction) {
    issues.push({ path: 'behavior.scrapRandom', message: 'scrapRandom draws each item against scrapFraction, so give scrapFraction too' });
  }
  if (contract.reliability) {
    checkExpr(contract.reliability.mtbfMinutes, 'reliability.mtbfMinutes');
    checkExpr(contract.reliability.mttrMinutes, 'reliability.mttrMinutes');
  }
  if (contract.variability?.cycleTimeCv) {
    checkExpr(contract.variability.cycleTimeCv, 'variability.cycleTimeCv');
    if (b.mode !== 'DISCRETE_CYCLE') issues.push({ path: 'variability.cycleTimeCv', message: 'cycle-time variation applies to DISCRETE_CYCLE units only' });
  }

  const inlets = contract.ports.filter((p) => p.direction === 'INLET');
  const outlets = contract.ports.filter((p) => p.direction === 'OUTLET');
  if (inlets.length === 0 && outlets.length === 0) {
    issues.push({ path: 'ports', message: 'A unit op needs at least one inlet or outlet' });
  }

  const seen = new Set<string>();
  for (const [i, o] of (contract.outlets ?? []).entries()) {
    const path = `outlets[${i}]`;
    if (!outlets.some((p) => p.id === o.port)) {
      issues.push({ path, message: `names port "${o.port}", which is not an OUTLET port. Outlets: ${outlets.map((p) => p.id).join(', ') || 'none'}` });
    }
    if (seen.has(o.port)) issues.push({ path, message: `port "${o.port}" is listed twice` });
    seen.add(o.port);
    if (o.share) checkExpr(o.share, `${path}.share`);
    if (o.temperatureC) checkExpr(o.temperatureC, `${path}.temperatureC`);
  }

  const namedComponent = (c: string, path: string) => {
    if (!components.includes(c)) issues.push({ path, message: `names component "${c}", which is not in components (${components.join(', ') || 'none declared'})` });
  };
  for (const [i, r] of (contract.reactions ?? []).entries()) {
    const path = `reactions[${i}]`;
    checkExpr(r.conversion, `${path}.conversion`);
    for (const c of Object.keys(r.coefficients)) namedComponent(c, `${path}.coefficients`);
    namedComponent(r.limiting, `${path}.limiting`);
    const sum = Object.values(r.coefficients).reduce((a, v) => a + v, 0);
    if (Math.abs(sum) > 1e-6) {
      issues.push({ path, message: `the coefficients add up to ${Math.round(sum * 1e6) / 1e6}, not 0: a reaction must conserve mass (kg in = kg out)` });
    }
    if (!((r.coefficients[r.limiting] ?? 0) < 0)) {
      issues.push({ path, message: `the limiting component "${r.limiting}" must be consumed (a negative coefficient)` });
    }
  }
  const outletPlan = contract.outlets ?? [];
  for (const [i, o] of outletPlan.entries()) {
    if (!o.recovery) continue;
    if (o.share) issues.push({ path: `outlets[${i}]`, message: 'give an outlet a share or recoveries, not both' });
    for (const [c, expr] of Object.entries(o.recovery)) {
      namedComponent(c, `outlets[${i}].recovery`);
      checkExpr(expr, `outlets[${i}].recovery.${c}`);
    }
  }
  if (outletPlan.some((o) => o.recovery) && outletPlan.some((o) => o.share)) {
    issues.push({ path: 'outlets', message: 'split by component recoveries on every outlet, or by shares, not a mix of the two' });
  }
  (contract.phaseChanges ?? []).forEach((pc, i) => {
    if (pc.latentHeatKjPerKg) checkExpr(pc.latentHeatKjPerKg, `phaseChanges[${i}].latentHeatKjPerKg`);
  });
  issues.push(...phaseIssues(contract));
  issues.push(...channelIssues(contract));
  if (b.mode === 'BATCH' && b.phases.some((ph) => ph.react) && !(contract.reactions ?? []).length) {
    issues.push({ path: 'behavior.phases', message: 'a phase has react: true but the contract declares no reactions' });
  }

  // Every inlet.* or utility.* a design reads needs a value to check it at.
  const allExprs = contractExpressions(contract).map((e) => e.expr);
  const streamRefs = new Set<string>();
  for (const e of allExprs) {
    try {
      for (const ref of referencedNames(e)) if (ref.startsWith('inlet.') || ref.startsWith('utility.') || ref.startsWith('port.')) streamRefs.add(ref);
    } catch {
      // Reported by checkExpr.
    }
  }
  for (const ref of streamRefs) {
    if (ref.startsWith('port.')) {
      const [, id, field, component] = ref.split('.') as [string, string, string, string | undefined];
      const design = contract.designPorts?.[id] as Record<string, unknown> | undefined;
      if (field === 'x') {
        if (!design?.composition) issues.push({ path: `designPorts.${id}`, message: `the design reads ${ref}, so give designPorts.${id}.composition (mass fractions${component ? `, including ${component}` : ''}).` });
      } else if (design?.[field] === undefined) {
        issues.push({ path: `designPorts.${id}`, message: `the design reads ${ref}, so give designPorts.${id}.${field}: the value to check it at. During a run the engine supplies what reaches port ${id}.` });
      }
      continue;
    }
    const [group, field, component] = ref.split('.') as ['inlet' | 'utility', keyof UnitOpDesignStream, string | undefined];
    const design = group === 'inlet' ? contract.designInlet : contract.designUtility;
    if (field === ('x' as keyof UnitOpDesignStream)) {
      // A component's fraction: absent from the design composition means 0, which is a fine design value.
      if (!design?.composition) {
        issues.push({ path: group === 'inlet' ? 'designInlet' : 'designUtility', message: `the design reads ${ref}, so give ${group === 'inlet' ? 'designInlet' : 'designUtility'}.composition (mass fractions${component ? `, including ${component}` : ''}).` });
      }
      continue;
    }
    if (design?.[field] === undefined) {
      issues.push({
        path: group === 'inlet' ? 'designInlet' : 'designUtility',
        message: `the design reads ${ref}, so give ${group === 'inlet' ? 'designInlet' : 'designUtility'}.${field}: the value to check it at. During a run the engine supplies the live value.`
      });
    }
  }

  issues.push(...dimensionIssues(contract));
  return issues;
}

/** Channels: real ports, each in one channel, every continuous inlet covered, no splitting a channel's outlet. */
function channelIssues(contract: UnitOpContract): ContractValidationIssue[] {
  const channels = contract.channels;
  if (!channels?.length) return [];
  const issues: ContractValidationIssue[] = [];
  const port = (id: string, dir: 'INLET' | 'OUTLET') => contract.ports.find((p) => p.id === id && p.direction === dir && p.flowDimension === 'CONTINUOUS_FLUID');
  if (contract.behavior.mode !== 'CONTINUOUS_RATE') issues.push({ path: 'channels', message: 'channels are for a CONTINUOUS_RATE unit (streams passing through side by side)' });
  const used = new Set<string>();
  channels.forEach((c, i) => {
    const path = `channels[${i}]`;
    if (!port(c.inlet, 'INLET')) issues.push({ path, message: `inlet "${c.inlet}" is not a continuous INLET port` });
    if (!port(c.outlet, 'OUTLET')) issues.push({ path, message: `outlet "${c.outlet}" is not a continuous OUTLET port` });
    for (const id of [c.inlet, c.outlet]) {
      if (used.has(id)) issues.push({ path, message: `port "${id}" is in more than one channel` });
      used.add(id);
    }
    const plan = (contract.outlets ?? []).find((o) => o.port === c.outlet);
    if (plan?.share || plan?.recovery) issues.push({ path, message: `outlet "${c.outlet}" carries its channel whole: give it a temperatureC, not a share or recoveries` });
  });
  for (const p of contract.ports) {
    if (p.direction === 'INLET' && p.flowDimension === 'CONTINUOUS_FLUID' && !channels.some((c) => c.inlet === p.id)) {
      issues.push({ path: 'channels', message: `inlet "${p.id}" is in no channel: with channels, every continuous inlet passes through one` });
    }
  }
  return issues;
}

/**
 * Units on everything an expression reads: what each one's declared unit
 * reduces to, so the checker can follow an expression's dimension.
 */
function dimensionEnv(contract: UnitOpContract): DimensionEnv {
  const declared = new Map<string, Inferred>();
  for (const v of [...contract.parameters, ...contract.derived]) {
    const dim = parseUnit(v.unit);
    declared.set(v.name, dim ? { kind: 'dim', dim } : { kind: 'unknown' });
  }
  return (name) => {
    const engine = ENGINE_NAME_DIMENSIONS[name];
    if (engine) return { kind: 'dim', dim: engine };
    if (/^(inlet|utility|batch)\.x\./.test(name) || /^port\.[^.]+\.x\./.test(name)) return { kind: 'dim', dim: DIMENSIONLESS };
    const portField = /^port\.[^.]+\.([A-Za-z]+)$/.exec(name);
    if (portField?.[1] === 'chargedKg') return { kind: 'dim', dim: MASS };
    if (portField && ENGINE_NAME_DIMENSIONS[`inlet.${portField[1]}`]) return { kind: 'dim', dim: ENGINE_NAME_DIMENSIONS[`inlet.${portField[1]}`]! };
    return declared.get(name) ?? { kind: 'unknown' };
  };
}

/** One expression a contract holds: where it is, and what it must work out to (null: any number, or a constraint). */
export interface ContractExpression {
  path: string;
  expr: string;
  expected: Dimension | null;
  what: string;
}

/** Every expression in a contract, with the dimension its field needs. */
export function contractExpressions(contract: UnitOpContract): ContractExpression[] {
  const out: ContractExpression[] = [];
  const add = (expr: string | undefined, expected: Dimension | null, path: string, what: string) => {
    if (expr) out.push({ path, expr, expected, what });
  };
  for (const d of contract.derived) add(d.expr, parseUnit(d.unit), `derived.${d.name}`, `"${d.name}" is declared in ${d.unit}, so it`);
  for (const c of contract.constraints) add(c.expr, null, `constraints.${c.id}`, 'a constraint');

  const b = contract.behavior;
  if (b.mode === 'DISCRETE_CYCLE') {
    add(b.cycleSeconds, TIME, 'behavior.cycleSeconds', 'cycleSeconds');
    add(b.unitsPerCycle, DIMENSIONLESS, 'behavior.unitsPerCycle', 'unitsPerCycle (a count)');
    add(b.scrapFraction, DIMENSIONLESS, 'behavior.scrapFraction', 'scrapFraction');
    add(b.queueCapacity, DIMENSIONLESS, 'behavior.queueCapacity', 'queueCapacity (a count)');
    add(b.liquidPerCycleGallons, VOLUME, 'behavior.liquidPerCycleGallons', 'liquidPerCycleGallons');
    (b.inputs ?? []).forEach((x, i) => add(x.perCycle, DIMENSIONLESS, `behavior.inputs[${i}].perCycle`, 'perCycle (a count)'));
    (b.outputs ?? []).forEach((x, i) => add(x.perCycle, DIMENSIONLESS, `behavior.outputs[${i}].perCycle`, 'perCycle (a count)'));
  } else if (b.mode === 'BATCH') {
    add(b.batchGallons, VOLUME, 'behavior.batchGallons', 'batchGallons');
    b.phases.forEach((ph, i) => {
      const path = `behavior.phases[${i}]`;
      add(ph.gallons, VOLUME, `${path}.gallons`, 'gallons');
      add(ph.rateGpm, VOLUME_FLOW, `${path}.rateGpm`, 'rateGpm');
      add(ph.seconds, TIME, `${path}.seconds`, 'seconds');
      add(ph.temperatureC, TEMPERATURE, `${path}.temperatureC`, 'temperatureC');
      add(ph.dutyKw, POWER, `${path}.dutyKw`, 'dutyKw');
    });
  } else if (b.mode === 'STORAGE') {
    add(b.capacityGallons, VOLUME, 'behavior.capacityGallons', 'capacityGallons');
    add(b.initialGallons, VOLUME, 'behavior.initialGallons', 'initialGallons');
    add(b.maxOutflowGpm, VOLUME_FLOW, 'behavior.maxOutflowGpm', 'maxOutflowGpm');
  } else {
    add(b.throughputPerMinute, null, 'behavior.throughputPerMinute', 'throughputPerMinute');
    add(b.capacityGpm, VOLUME_FLOW, 'behavior.capacityGpm', 'capacityGpm');
    add(b.capacityKgPerHour, MASS_FLOW, 'behavior.capacityKgPerHour', 'capacityKgPerHour');
    add(b.dutyKw, POWER, 'behavior.dutyKw', 'dutyKw');
    add(b.residenceTimeSeconds, TIME, 'behavior.residenceTimeSeconds', 'residenceTimeSeconds');
  }
  (contract.outlets ?? []).forEach((o, i) => {
    add(o.share, DIMENSIONLESS, `outlets[${i}].share`, 'a share');
    add(o.temperatureC, TEMPERATURE, `outlets[${i}].temperatureC`, 'an outlet temperature');
    for (const [c, expr] of Object.entries(o.recovery ?? {})) add(expr, DIMENSIONLESS, `outlets[${i}].recovery.${c}`, 'a recovery');
  });
  (contract.reactions ?? []).forEach((r, i) => add(r.conversion, DIMENSIONLESS, `reactions[${i}].conversion`, 'a conversion'));
  (contract.phaseChanges ?? []).forEach((pc, i) =>
    add(pc.latentHeatKjPerKg, SPECIFIC_ENERGY, `phaseChanges[${i}].latentHeatKjPerKg`, 'a latent heat (kJ/kg)')
  );
  if (contract.reliability) {
    add(contract.reliability.mtbfMinutes, TIME, 'reliability.mtbfMinutes', 'mtbfMinutes');
    add(contract.reliability.mttrMinutes, TIME, 'reliability.mttrMinutes', 'mttrMinutes');
  }
  add(contract.variability?.cycleTimeCv, DIMENSIONLESS, 'variability.cycleTimeCv', 'cycleTimeCv');
  return out;
}

/**
 * Dimensional checks: every expression adds and compares like with like, and
 * gives what its field needs (a time for cycleSeconds, a power for dutyKw, the
 * declared unit for a derived value). See dimensions.ts.
 */
export function dimensionIssues(contract: UnitOpContract): ContractValidationIssue[] {
  const env = dimensionEnv(contract);
  return contractExpressions(contract).flatMap(({ expr, expected, path, what }) =>
    checkDimension(expr, expected, env, what).map((message) => ({ path, message, unit: true as const }))
  );
}

/**
 * Units the checker does not recognise. Not errors -- the value is simply not
 * checked -- but worth fixing, because an unchecked unit is where a units
 * mistake hides.
 */
export function unitWarnings(contract: UnitOpContract): ContractValidationIssue[] {
  return [
    ...contract.parameters.map((p) => ({ v: p, path: `parameters.${p.name}` })),
    ...contract.derived.map((d) => ({ v: d, path: `derived.${d.name}` }))
  ]
    .filter(({ v }) => parseUnit(v.unit) === null)
    .map(({ v, path }) => ({
      path,
      message: `unit "${v.unit}" is not one the checker knows, so "${v.name}" is not unit-checked. Use a standard symbol (kg, m, s, min, gal, L, °C, K, kW, kJ, psi, bar, %, -, items...) combined with / and -, e.g. kJ/kg-K or gal/min.`
    }));
}
