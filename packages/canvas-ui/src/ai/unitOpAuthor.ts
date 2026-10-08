import {
  EXPRESSION_FUNCTIONS,
  RESERVED_SCOPE_NAMES,
  UNIT_OP_AUTHORING_RULES,
  WAX_COOLING_BELT_CONTRACT,
  EVAPORATOR_CONTRACT,
  DUST_COLLECTOR_CONTRACT,
  SPRAY_DRYER_CONTRACT,
  executeValidateUnitOp,
  phasePlanFor,
  type ValidateUnitOpResult
} from '@process-forge/protocol';
import { callLlmModel, type LlmChatMessage, type LlmCredentials } from './llmClient.js';

/**
 * The in-app unit-op author: the model writes a contract, the ENGINE judges it,
 * and the engine's reasons go back to the model until it passes or runs out of
 * rounds.
 *
 * This is the same loop the MCP tools run from an MCP client (design_unit_op
 * then validate_unit_op), with the same rules and the same verdicts -- both
 * come from @process-forge/protocol -- but driven from inside the app on the
 * engineer's OpenRouter sign-in. It exists because a Claude or ChatGPT
 * subscription cannot be used by a third-party app; OpenRouter, billed per
 * use, is how the app calls a model itself.
 *
 * The model proposes; the engine decides. Nothing the model says about its own
 * design is taken on trust: the only "accepted" is executeValidateUnitOp's.
 */

export type CallModel = typeof callLlmModel;

export interface AuthorRound {
  round: number;
  verdict: ValidateUnitOpResult['verdict'] | 'NOT_JSON';
  /** What the engine told Claude, for the engineer to read too. */
  feedback: string;
}

export interface AuthorResult {
  /** The last draft, accepted or not. Parsed JSON, or the raw text if unparseable. */
  draft: unknown;
  review?: ValidateUnitOpResult;
  accepted: boolean;
  rounds: AuthorRound[];
  model?: string;
}

/** Everything Claude needs, stated once, so it does not guess. */
export function unitOpAuthoringSystemPrompt(): string {
  const functions = Object.entries(EXPRESSION_FUNCTIONS)
    .map(([name, def]) => `${name}(${Array.isArray(def.arity) ? `${def.arity[0]}-${def.arity[1]} args` : `${def.arity} arg(s)`})`)
    .join(', ');
  return [
    'You design unit operations for ProcessForge, a process simulator. You write a',
    'UnitOpContract: a JSON description of a unit operation that the engine evaluates.',
    '',
    'Rules:',
    ...UNIT_OP_AUTHORING_RULES.map((r) => `- ${r}`),
    '',
    `Functions an expression may call (nothing else exists): if(condition, then, else), ${functions}.`,
    `Names the engine supplies at evaluation time: ${RESERVED_SCOPE_NAMES.join(', ') || '(none)'}.`,
    '',
    'A complete, valid contract to pattern-match against:',
    JSON.stringify(WAX_COOLING_BELT_CONTRACT),
    '',
    'One that reads its live inlet (designInlet) and splits and heats its outflow per outlet port:',
    JSON.stringify(EVAPORATOR_CONTRACT),
    '',
    'Reply with exactly one JSON object -- the contract -- and nothing else: no prose,',
    'no markdown fences. If the engine rejects it you will be told exactly why; fix',
    'those problems and reply with the whole corrected contract.'
  ].join('\n');
}

/**
 * The phase plan for the description, when it names equipment that handles a
 * gas or a solid or changes phase: the phase of each port, the phase changes,
 * the flow units and the governing relations, with a worked example of the kind.
 */
export function phaseContext(description: string): string {
  const plan = phasePlanFor(description);
  if (plan.decidedBy !== 'archetype' || !plan.archetype) return '';
  const example =
    plan.archetype.example === 'DUST_COLLECTOR_CONTRACT' ? DUST_COLLECTOR_CONTRACT : plan.archetype.example === 'SPRAY_DRYER_CONTRACT' ? SPRAY_DRYER_CONTRACT : undefined;
  return [
    '',
    '',
    'Phase plan (from the engine, for this kind of unit):',
    JSON.stringify({ archetype: plan.archetype, notes: plan.notes }),
    ...(example ? ['', 'A complete, valid contract of this kind:', JSON.stringify(example)] : [])
  ].join('\n');
}

/** Pulls one JSON object out of a reply, tolerating fences or a stray sentence. */
export function extractJsonObject(text: string): unknown {
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(unfenced.slice(start, end + 1));
    throw new Error('no JSON object in reply');
  }
}

export async function authorUnitOpContract(
  description: string,
  opts: {
    creds: LlmCredentials;
    /** Injectable for tests. */
    call?: CallModel;
    maxRounds?: number;
    onRound?: (round: AuthorRound) => void;
  }
): Promise<AuthorResult> {
  const call = opts.call ?? callLlmModel;
  const maxRounds = opts.maxRounds ?? 3;
  const system = unitOpAuthoringSystemPrompt();
  const messages: LlmChatMessage[] = [
    { role: 'user', content: `Design a unit operation from this description:\n\n${description}${phaseContext(description)}` }
  ];
  const rounds: AuthorRound[] = [];
  let draft: unknown;
  let review: ValidateUnitOpResult | undefined;
  let model: string | undefined;

  for (let round = 1; round <= maxRounds; round++) {
    const reply = await call(opts.creds, messages, system, { maxTokens: 8192 });
    model = reply.model;
    messages.push({ role: 'assistant', content: reply.text });

    let feedback: string;
    let verdict: AuthorRound['verdict'];
    try {
      draft = extractJsonObject(reply.text);
      review = executeValidateUnitOp({ contract: draft });
      verdict = review.verdict;
      feedback = review.revisionGuidance;
    } catch {
      draft = reply.text;
      review = undefined;
      verdict = 'NOT_JSON';
      feedback = 'That reply was not a JSON object. Reply with only the contract as one JSON object.';
    }

    const entry = { round, verdict, feedback };
    rounds.push(entry);
    opts.onRound?.(entry);
    if (verdict === 'ACCEPTED') return { draft, review, accepted: true, rounds, model };
    messages.push({ role: 'user', content: feedback });
  }

  // Out of rounds: hand back the last draft so the engineer sees exactly what
  // failed in the creator's own gates, rather than a vague error.
  return { draft, review, accepted: false, rounds, model };
}
