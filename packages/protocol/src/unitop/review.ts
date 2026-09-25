import { UnitOpContractSchema, validateUnitOpContract, type UnitOpContract } from './contract.js';
import { evaluateUnitOp, blockingViolations } from './evaluate.js';
import { checkUnitOpDrawing } from './drawing.js';

/**
 * The engine's verdict on a proposed unit operation.
 *
 * This is the half of the design loop that cannot be delegated to a model: a
 * model saying its design is sound proves nothing. The verdict is computed --
 * expressions are evaluated, constraints tested, the drawing checked -- and the
 * failures that come back are the actual reasons.
 *
 * The result is deliberately shaped to be fed straight back as the next turn's
 * context. `revisionGuidance` is written for a model to act on.
 */

export interface ValidateUnitOpParams {
  contract: unknown;
  /** Optional parameter overrides, for asking "would it work at this speed?". */
  parameterOverrides?: Record<string, number>;
}

export interface ValidateUnitOpResult {
  success: boolean;
  /** ACCEPTED | REJECTED. A contract is accepted only if every gate passes. */
  verdict: 'ACCEPTED' | 'REJECTED';
  gates: {
    /** Does it match the contract schema at all? */
    schema: { passed: boolean; errors: string[] };
    /** Do all expressions parse and all references resolve? */
    staticAnalysis: { passed: boolean; errors: string[] };
    /** Do the physics hold when evaluated? */
    physical: { passed: boolean; errors: string[]; warnings: string[] };
    /** Can it be drawn and piped: every port a nozzle on the drawing, every shape inside it? */
    drawing: { passed: boolean; errors: string[]; warnings: string[] };
  };
  /** Computed quantities, when evaluation got far enough to produce them. */
  derived?: Record<string, number>;
  behavior?: unknown;
  /** Written to be handed back to the authoring model verbatim. */
  revisionGuidance: string;
}

function reject(
  gates: ValidateUnitOpResult['gates'],
  guidance: string,
  extra: Partial<ValidateUnitOpResult> = {}
): ValidateUnitOpResult {
  return { success: true, verdict: 'REJECTED', gates, revisionGuidance: guidance, ...extra };
}

export function executeValidateUnitOp(params: ValidateUnitOpParams): ValidateUnitOpResult {
  const gates: ValidateUnitOpResult['gates'] = {
    schema: { passed: false, errors: [] },
    staticAnalysis: { passed: false, errors: [] },
    physical: { passed: false, errors: [], warnings: [] },
    drawing: { passed: false, errors: [], warnings: [] }
  };

  // Gate 1 -- shape.
  const parsed = UnitOpContractSchema.safeParse(params.contract);
  if (!parsed.success) {
    gates.schema.errors = parsed.error.issues.map(
      (i) => `${i.path.join('.') || '(root)'}: ${i.message}`
    );
    return reject(
      gates,
      [
        'The contract does not match the UnitOpContract schema. Fix these before anything else:',
        ...gates.schema.errors.map((e) => `  - ${e}`),
        '',
        'Call design_unit_op again if you need the worked example.'
      ].join('\n')
    );
  }
  gates.schema.passed = true;
  const contract: UnitOpContract = parsed.data;

  // Gate 2 -- static coherence: every expression parses, every name resolves.
  const issues = validateUnitOpContract(contract);
  if (issues.length > 0) {
    gates.staticAnalysis.errors = issues.map((i) => `${i.path}: ${i.message}`);
    return reject(
      gates,
      [
        `"${contract.name}" is structurally incoherent. ${issues.length} problem(s):`,
        ...gates.staticAnalysis.errors.map((e) => `  - ${e}`),
        '',
        'Remember: derived values resolve in declaration order, so a value may only',
        'reference parameters, engine-supplied names, or derived values declared',
        'BEFORE it. Reorder your derived list as a calculation sequence.'
      ].join('\n')
    );
  }
  gates.staticAnalysis.passed = true;

  // Gate 4 -- the drawing. Checked here so its problems come back in the same
  // round as any physics problems; it decides the verdict after physics.
  if (contract.drawing) {
    const d = checkUnitOpDrawing(contract.drawing, contract.ports);
    gates.drawing = { passed: d.errors.length === 0, errors: d.errors, warnings: d.warnings };
  } else {
    gates.drawing = {
      passed: true,
      errors: [],
      warnings: ['No drawing: the unit will appear as a generic vessel with its connections spaced along the edges. Add contract.drawing.']
    };
  }

  // Gate 3 -- physics.
  const evaluation = evaluateUnitOp(contract, {
    ...(params.parameterOverrides ? { parameterOverrides: params.parameterOverrides } : {})
  });

  if (evaluation.error) {
    gates.physical.errors = [`${evaluation.error.path}: ${evaluation.error.message}`];
    return reject(
      gates,
      [
        `"${contract.name}" failed to evaluate at ${evaluation.error.path}.`,
        `  ${evaluation.error.message}`,
        '',
        'This is usually a division by zero or a value that went non-finite. Guard',
        'the divisor with max(x, <small>) or add a constraint that rules out the',
        'degenerate case.'
      ].join('\n'),
      { derived: evaluation.derived }
    );
  }

  const blocking = blockingViolations(evaluation);
  const warnings = evaluation.constraints.filter((c) => !c.satisfied && c.severity === 'WARNING');

  gates.physical.warnings = warnings.map((w) => `${w.id}: ${w.message}${w.hint ? ` (${w.hint})` : ''}`);

  if (blocking.length > 0) {
    gates.physical.errors = blocking.map((c) => `${c.id}: ${c.message}${c.hint ? ` (${c.hint})` : ''}`);
    return reject(
      gates,
      [
        `"${contract.name}" is not physically valid. ${blocking.length} constraint(s) violated:`,
        ...blocking.map((c) => `  - ${c.message}${c.hint ? `\n      Try: ${c.hint}` : ''}`),
        '',
        'These are the contract\'s own constraints, evaluated against its own',
        'parameter values. Either the parameters are wrong, or a constraint is',
        'stated more tightly than the physics requires. Change the design, not the',
        'constraint, unless the constraint is genuinely mis-stated.'
      ].join('\n'),
      { derived: evaluation.derived, behavior: evaluation.behavior }
    );
  }

  gates.physical.passed = true;

  if (!gates.drawing.passed) {
    return reject(
      gates,
      [
        `"${contract.name}" works physically but cannot be drawn and piped. ${gates.drawing.errors.length} problem(s):`,
        ...gates.drawing.errors.map((e) => `  - ${e}`),
        '',
        'Shape coordinates are in viewBox units; nozzle x and y are percent of the',
        'viewBox (0-100). Every port needs exactly one nozzle, on the wall of the',
        'equipment, facing the way its pipe leaves.'
      ].join('\n'),
      { derived: evaluation.derived, behavior: evaluation.behavior }
    );
  }

  const guidance = [
    `"${contract.name}" is accepted. All expressions resolved and every ERROR constraint holds.`,
    warnings.length > 0
      ? `\n${warnings.length} warning(s) worth reviewing with the engineer:\n` +
        warnings.map((w) => `  - ${w.message}${w.hint ? ` (${w.hint})` : ''}`).join('\n')
      : '',
    gates.drawing.warnings.length > 0 ? `\nDrawing:\n` + gates.drawing.warnings.map((w) => `  - ${w}`).join('\n') : '',
    '',
    'Attach it to a node as config.contract (or send it to the desktop app with',
    'add_unit_op_to_flowsheet). The engine re-evaluates it when the simulation',
    'is built and refuses the run if anything has changed.'
  ]
    .filter(Boolean)
    .join('\n');

  return {
    success: true,
    verdict: 'ACCEPTED',
    gates,
    derived: evaluation.derived,
    behavior: evaluation.behavior,
    revisionGuidance: guidance
  };
}

/**
 * Hard rules a unit-op contract must satisfy, stated so an authoring model does
 * not guess. Shared by the MCP design_unit_op tool and the in-app author.
 */
export const UNIT_OP_AUTHORING_RULES: readonly string[] = [
  'A contract is DATA. Emit JSON. Do not emit JavaScript, and do not expect any code you write to run.',
  'Every expression is evaluated by a restricted evaluator: arithmetic, comparison, && || !, parentheses, and the whitelisted functions below. Nothing else exists. For piecewise physics use if(condition, a, b), which evaluates only the branch it takes (so if(flow > 0, duty / flow, 0) is safe), and interp(x, x1, y1, x2, y2, ...) for a lookup table (x ascending, clamped at the ends).',
  'Every name an expression references must be a parameter you declared, a derived value declared EARLIER in the list, or one of the engine-supplied names. Unknown names are a validation error, not a zero.',
  'Derived values resolve in declaration order. Forward references are rejected, so order your derived list as a calculation sequence.',
  'Declare min/max on every parameter as the PHYSICALLY meaningful domain, not a UI range. A value outside its own bounds is a validation error.',
  'Put the physics that must hold in `constraints`, not in prose. severity ERROR means the unit op cannot operate as specified and the engine will refuse to simulate it; WARNING means operable but outside good practice.',
  'Write each constraint `message` so an engineer can act on it, and add a `hint` naming the knob to turn. These strings are fed back to you verbatim when a design is rejected.',
  'Prefer a constraint that is INDEPENDENT of the quantity it guards. A check that reduces algebraically to another check adds no information.',
  'Read what flows in through inlet.temperatureC, inlet.volumetricFlowGpm, inlet.massFlowKgPerS, inlet.densityGPerCm3 and inlet.specificHeatKjPerKgK (and utility.* for a service stream). During a run the engine evaluates a CONTINUOUS_RATE unit every second at the stream that actually reaches it, so its capacity, duty and outlets follow the real feed. Give designInlet with a value for every inlet.* you read: validation checks the design there, and the run uses it until liquid arrives.',
  'CONTINUOUS_RATE: capacityGpm is the most liquid it passes (gal/min) and the engine limits the flow to it; throughputPerMinute is your own figure, in the unit you state, and is reported but not enforced; dutyKw is reported as energy used. It evaluates algebraic relations each second rather than integrating: if a unit op genuinely needs a time-resolved profile, say so plainly rather than approximating it.',
  'Split and heat the outflow with `outlets`: one entry per outlet port, { port, share, temperatureC }, both expressions. share is the fraction 0..1 of the outflow leaving by that port; ports without a share split what the others leave; if every port has a share and they sum below 1, the rest is lost (steam off a vent, water off a dryer) and reported as lostGallons. Without temperatureC a port leaves at the inlet temperature. Shares above 1 in total are rejected.',
  'DISCRETE_CYCLE is for equipment that makes or processes whole items on a cycle (a printer, a press, a packer). cycleSeconds and unitsPerCycle are expressions: compute the cycle from the physics (see cycleExample) rather than typing a number, so changing a parameter changes the cycle.',
  'In the line simulation a DISCRETE_CYCLE unit with no inbound item pipe starts each cycle on its own; with one, each cycle takes up to unitsPerCycle items from its queue and waits when it is empty. A cycle unit fed by a liquid pipe (a filler, a moulding press, a dosing station) must say how much each cycle draws: liquidPerCycleGallons, an expression. It then waits for that liquid each cycle, so a slow pump or an empty tank starves it. scrapFraction removes floor(items x fraction) per cycle, so it scraps nothing when that is below one item.',
  'For a unit that takes and makes different items (a case packer, a capper, a kitter, an inspection station), declare behavior.inputs and behavior.outputs. inputs: [{ port, perCycle }] per item inlet port; a cycle waits until every port has its whole count (12 bottles AND a carton blank). outputs: [{ port, perCycle, scrap? }] per item outlet port; the counts must add up to unitsPerCycle; scrap: true counts that port against quality (rejects), and the items still go down its pipe (to waste or rework). Every count is a whole number: for a reject rate of 1 in 50, make one cycle a run of 50 (see assemblyExample). Do not combine outputs with scrapFraction.',
  'Test the design where it matters: validate_unit_op checks it at designInlet; a simulation reports, per designed unit, every constraint broken at the conditions it actually saw and for how long (designedUnit.brokenConstraints). An ERROR constraint that fails at designInlet stops the run from starting.',
  'Set provenance.authoredBy to SUB_AGENT and list in engineerConfirmed only the parameters the engineer actually stated. Do not claim confirmation for values you chose.',
  'Draw the unit in `drawing`: a viewBox { width, height } (20-400 each; wide equipment is wide, tall equipment is tall) and `shapes` in viewBox units. Shapes are rect, circle, ellipse, line, polyline, polygon, or path (plain SVG path data: M L H V C S Q T A Z and numbers only). Every shape must lie inside the viewBox.',
  'Use layer "body" for the equipment outline, "detail" for internals (trays, flights, impellers, coils; drawn thinner), and "fill" for a tinted area such as a liquid level or a bed. Set dashed: true for jackets, sprays, and hidden lines. Draw what makes this unit recognisable to an engineer, not a generic box.',
  'Give every port exactly one entry in drawing.nozzles: { portId, x, y, side }, where x and y are PERCENT of the viewBox (0-100) and side is the direction the pipe leaves (left, right, top, bottom). Put each nozzle on the wall of the body where that stream really enters or leaves, facing outward. Pipes on the flowsheet attach exactly there.'
];
