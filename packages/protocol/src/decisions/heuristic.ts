import type {
  AnswersFor,
  ChoiceAnswer,
  ChoiceQuestion,
  DecisionProvider,
  DecisionState,
  NoulQuestion,
  Question,
  QuestionSet,
  ScoreQuestion
} from './types.js';

/**
 * The offline provider. This is the code the project already had, wrapped so it
 * can be measured -- and so it can say "I don't know".
 *
 * WHAT WRAPPING BUYS, WITH NO MODEL INVOLVED
 *
 * The existing ladders are first-match, so they cannot express ambiguity. Each
 * question here returns per-option WEIGHTS instead, which are normalised into a
 * distribution. When two options both match, the result is a near-tie with a
 * confidence around 0.5 -- below the default threshold, which is the signal to
 * ask the engineer rather than guess.
 *
 * That alone fixes the failure that motivated the plan. "add a reactor with a
 * feed pump" no longer silently becomes a PUMP; it becomes a question.
 *
 * This provider requires no network, no key, and no dependency, so offline and
 * air-gapped deployments keep working unchanged. It is the default.
 */

/** Normalises weights into a distribution. Empty or all-zero becomes uniform. */
function normalise<T extends string>(
  weights: Partial<Record<T, number>>,
  options: T[]
): Record<T, number> {
  const out = {} as Record<T, number>;
  let total = 0;
  for (const opt of options) {
    const w = Math.max(0, weights[opt] ?? 0);
    out[opt] = w;
    total += w;
  }
  if (total === 0) {
    // No opinion. A uniform distribution is honest: it yields low confidence
    // for anything with more than one option, which is what we want.
    const uniform = options.length > 0 ? 1 / options.length : 0;
    for (const opt of options) out[opt] = uniform;
    return out;
  }
  for (const opt of options) out[opt] = out[opt] / total;
  return out;
}

function answerChoice(q: ChoiceQuestion<string>, state: DecisionState): ChoiceAnswer<string> {
  const options = Object.keys(q.criteria);
  const probabilities = normalise(q.heuristic(state), options);
  let value = options[0] ?? '';
  let best = -1;
  for (const opt of options) {
    const p = probabilities[opt] ?? 0;
    if (p > best) {
      best = p;
      value = opt;
    }
  }
  return { type: 'choice', value, confidence: best < 0 ? 0 : best, probabilities };
}

/**
 * Confidence for a boolean is distance from the coin flip. A heuristic that
 * returns 0.5 is saying it does not know, and should read as unactionable.
 */
function answerNoul(q: NoulQuestion, state: DecisionState) {
  const value = Math.min(1, Math.max(0, q.heuristic(state)));
  return { type: 'noul' as const, value, confidence: Math.abs(value - 0.5) * 2 };
}

function answerScore(q: ScoreQuestion, state: DecisionState) {
  const levels = Math.max(1, q.criteria.length - 1);
  const value = Math.min(levels, Math.max(0, q.heuristic(state)));
  // A score landing squarely on a described level is more trustworthy than one
  // sitting between two of them.
  const distanceFromLevel = Math.abs(value - Math.round(value));
  return { type: 'score' as const, value, confidence: 1 - distanceFromLevel * 2 };
}

export class HeuristicDecisionProvider implements DecisionProvider {
  readonly id = 'heuristic';

  async ask<Q extends QuestionSet>(state: DecisionState, questions: Q): Promise<AnswersFor<Q>> {
    const answers = {} as Record<string, unknown>;
    for (const [key, q] of Object.entries(questions) as [string, Question][]) {
      if (q.type === 'choice') answers[key] = answerChoice(q, state);
      else if (q.type === 'noul') answers[key] = answerNoul(q, state);
      else answers[key] = answerScore(q, state);
    }
    return answers as AnswersFor<Q>;
  }
}

export const heuristicProvider = new HeuristicDecisionProvider();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for writing heuristics. These exist so that a question's offline
// implementation reads as a declaration rather than as another ladder.
// ─────────────────────────────────────────────────────────────────────────────

/** The lowercased text a question is reasoning about. */
export function text(state: DecisionState, key = 'message'): string {
  const v = state[key];
  return typeof v === 'string' ? v.toLowerCase() : '';
}

/**
 * Weight for a set of keywords. Whole-word matching by default, which is the
 * difference between "a 10 inch nozzle" and a ten-tray column: the old code
 * tested `.includes('10')` against the raw string.
 */
export function keywordWeight(haystack: string, keywords: string[], weight = 1): number {
  let hits = 0;
  for (const k of keywords) {
    const pattern = /^[a-z0-9 ]+$/.test(k)
      ? new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
      : new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (pattern.test(haystack)) hits++;
  }
  return hits * weight;
}
