import {
  UnitOpContractSchema,
  validateUnitOpContract,
  evaluateUnitOp,
  blockingViolations,
  type UnitOpContract
} from '@process-forge/protocol';

/**
 * The engine's verdict on a proposed unit operation.
 *
 * This is the half of the design loop that cannot be delegated to a model. A
 * sub-agent asserting that its design is sound is worth nothing -- that is
 * precisely the failure the audit found, where a `status: 'PASS'` badge was a
 * string literal rather than the outcome of a check. Here the verdict is
 * computed: expressions are evaluated, constraints are tested, and the failures
 * that come back are the actual reasons.
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
  /** ACCEPTED | REJECTED. A contract is accepted only if all three gates pass. */
  verdict: 'ACCEPTED' | 'REJECTED';
  gates: {
    /** Does it match the contract schema at all? */
    schema: { passed: boolean; errors: string[] };
    /** Do all expressions parse and all references resolve? */
    staticAnalysis: { passed: boolean; errors: string[] };
    /** Do the physics hold when evaluated? */
    physical: { passed: boolean; errors: string[]; warnings: string[] };
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
    physical: { passed: false, errors: [], warnings: [] }
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

  const guidance = [
    `"${contract.name}" is accepted. All expressions resolved and every ERROR constraint holds.`,
    warnings.length > 0
      ? `\n${warnings.length} warning(s) worth reviewing with the engineer:\n` +
        warnings.map((w) => `  - ${w.message}${w.hint ? ` (${w.hint})` : ''}`).join('\n')
      : '',
    '',
    'Attach it to a node as config.contract. The engine will re-evaluate it at',
    'construction and refuse the run if anything has changed.'
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
