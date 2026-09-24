/**
 * The decision layer.
 *
 * The simulation core is not where this project is non-deterministic. A
 * UnitOpContract is data evaluated by a restricted evaluator; a contract-defined
 * node is exactly as reproducible as a hand-written one. The uncertainty lives
 * upstream, in the routing seams: four `String.prototype.includes` ladders that
 * decide what the engineer sees.
 *
 * Those ladders share a defect that no amount of care fixes. They are
 * first-match, so they cannot represent ambiguity. "add a reactor with a feed
 * pump" matches both `pump` and `reactor`; the ladder tests `pump` first, picks
 * it, and discards the fact that it was a coin toss. Every bug fix is one more
 * substring that breaks a neighbouring case.
 *
 * This layer replaces them with DECLARED QUESTIONS: a closed set of answers, and
 * a confidence number you can threshold on. Below the threshold the right move
 * is to ask the engineer which they meant, rather than silently rendering the
 * wrong vessel.
 *
 * BATCH-SHAPED ON PURPOSE
 *
 * `ask()` takes every question at once and returns every answer at once. That is
 * the shape of the real Jev API (see docs/plans/0001): one
 * request carries a keyed question map and returns a keyed answer map, with
 * questions evaluated in parallel. A per-question interface would issue N round
 * trips and re-send the state N times, forfeiting the only reason to reach for a
 * decision model. The heuristic provider satisfies the same signature offline.
 */

/** Whatever the caller knows: the message, the node, the surrounding graph. */
export type DecisionState = Record<string, unknown>;

/** A closed-set choice. `criteria` describes each option. */
export interface ChoiceQuestion<T extends string = string> {
  type: 'choice';
  instructions: string;
  criteria: Record<T, string>;
  /**
   * The offline implementation. Returns per-option weights, unnormalised;
   * the provider normalises them into a distribution. Returning an empty
   * object means "no opinion", which becomes a uniform distribution and a
   * correspondingly low confidence.
   */
  heuristic: (state: DecisionState) => Partial<Record<T, number>>;
}

/** A probability that a statement about the state is true. */
export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria: { true: string; false: string };
  /** Offline implementation. Returns 0-1. */
  heuristic: (state: DecisionState) => number;
}

/** A position on a described scale. */
export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  /** Ordered level descriptions, index 0 upward. */
  criteria: string[];
  /** Offline implementation. Returns a value on the same scale. */
  heuristic: (state: DecisionState) => number;
}

export type Question = ChoiceQuestion<string> | NoulQuestion | ScoreQuestion;
export type QuestionSet = Record<string, Question>;

export interface ChoiceAnswer<T extends string = string> {
  type: 'choice';
  /** Highest-weight option. */
  value: T;
  /** Probability mass on `value`, 0-1. */
  confidence: number;
  /** The full distribution. Retained so a caller can disclose the runner-up. */
  probabilities: Record<T, number>;
}

export interface NoulAnswer {
  type: 'noul';
  /** Probability the statement is true, 0-1. */
  value: number;
  confidence: number;
}

export interface ScoreAnswer {
  type: 'score';
  value: number;
  confidence: number;
}

export type Answer = ChoiceAnswer | NoulAnswer | ScoreAnswer;

/** Maps a question set to its answers, preserving each question's type. */
export type AnswersFor<Q extends QuestionSet> = {
  [K in keyof Q]: Q[K] extends ChoiceQuestion<infer T>
    ? ChoiceAnswer<T>
    : Q[K] extends NoulQuestion
      ? NoulAnswer
      : ScoreAnswer;
};

export interface DecisionProvider {
  readonly id: string;
  /** Answers every question about one state. */
  ask<Q extends QuestionSet>(state: DecisionState, questions: Q): Promise<AnswersFor<Q>>;
}

/**
 * Below this, a choice is not safe to act on silently.
 *
 * Tuned to sit above the two-way tie a first-match ladder cannot see: an evenly
 * split choice between two options scores 0.5, so the default catches exactly
 * the case that produced "add a reactor with a feed pump" -> PUMP.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

/** True when an answer is confident enough to act on without asking. */
export function isActionable(
  answer: { confidence: number },
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): boolean {
  return answer.confidence >= threshold;
}

/**
 * True when a choice carries real signal, as opposed to a distribution sitting
 * at (or near) uniform.
 *
 * This is what separates two different low-confidence outcomes that call for
 * different responses:
 *
 *   - Signal, but split -- "add a reactor with a feed pump" puts ~0.5 on each
 *     of two options. The right move is to ASK which one.
 *   - No signal -- "add a widget" spreads mass evenly across every option.
 *     Asking the engineer to pick one of nine equally weighted kinds is
 *     useless; the right move is to do nothing.
 *
 * A first-match ladder could express neither: it either picked a branch or
 * fell through. Provider-agnostic, so it applies equally to a model's output.
 */
export function hasSignal(answer: ChoiceAnswer, margin = 0.05): boolean {
  const n = Object.keys(answer.probabilities).length;
  if (n <= 1) return answer.confidence > 0;
  return answer.confidence > 1 / n + margin;
}

/** The options a caller should offer when a choice is too close to call. */
export function runnersUp<T extends string>(answer: ChoiceAnswer<T>, limit = 2): T[] {
  // Only options holding more than their uniform share are real candidates.
  // Without this, a no-signal answer would "offer" arbitrary options.
  const n = Object.keys(answer.probabilities).length;
  const floor = n > 0 ? 1 / n : 0;
  return (Object.entries(answer.probabilities) as [T, number][])
    .filter(([, p]) => p > floor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}
