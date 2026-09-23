import type {
  AnswersFor,
  ChoiceAnswer,
  DecisionProvider,
  DecisionState,
  NoulAnswer,
  Question,
  QuestionSet,
  ScoreAnswer
} from './types.js';
import { heuristicProvider } from './heuristic.js';

/**
 * TypeSafe's Jev, behind the same interface as the heuristic provider.
 *
 * API (docs.typesafe.ai/api, checked 2026-09-22):
 *   POST https://api.typesafe.ai/v1/systemone
 *   Authorization: Bearer <key>
 *   { model, state, questions: { [key]: { type, instructions, criteria } } }
 * -> { model, answers: { [key]: ... }, usage }
 *
 * The question shapes already match ours field for field -- choice criteria as
 * an option -> description map, score criteria as an ordered array of levels,
 * noul criteria as { true, false } -- so the request is our QuestionSet with
 * the offline `heuristic` functions left out.
 *
 * Plan 0001 appendix A recorded Jev as a Cloudflare Workers AI model
 * (`typesafe/jev`). That was wrong: neither the account's catalog nor
 * Cloudflare's public one lists it. It is TypeSafe's own endpoint.
 *
 * NOT WIRED INTO THE APP. Where the key lives is an open decision (plan §8.2:
 * ADR-0005 forbids asking engineers to paste keys). This provider takes a
 * transport, so any answer to that -- a key in the desktop keychain, or the
 * cloud Worker holding it and proxying for signed-in users -- plugs in
 * without changing it.
 */

export interface JevRequest {
  model: string;
  state: DecisionState | string;
  questions: Record<string, { type: string; instructions: string; criteria?: unknown }>;
}

export interface JevResponse {
  model: string;
  answers: Record<
    string,
    | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
    | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> }
    | { type: 'noul'; noul: number }
  >;
  usage?: { input_tokens: number; output_tokens: number };
}

export type JevTransport = (request: JevRequest, signal: AbortSignal) => Promise<JevResponse>;

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

/** Calls TypeSafe directly with a key. For a server, or a desktop keychain. */
export function httpTransport(apiKey: string, endpoint = JEV_ENDPOINT): JevTransport {
  return async (request, signal) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(request)
    });
    if (!res.ok) throw new Error(`Jev returned HTTP ${res.status}`);
    return (await res.json()) as JevResponse;
  };
}

/** The wire form of a question: everything but the offline heuristic. */
function wireQuestions(questions: QuestionSet): JevRequest['questions'] {
  const out: JevRequest['questions'] = {};
  for (const [key, q] of Object.entries(questions) as [string, Question][]) {
    out[key] = { type: q.type, instructions: q.instructions, criteria: q.criteria };
  }
  return out;
}

export interface JevProviderOptions {
  transport: JevTransport;
  model?: string;
  /** Jev reports 70-500 ms; past this the heuristic answers instead. */
  timeoutMs?: number;
  /** Answers when Jev is unreachable, slow, or returns something unusable. */
  fallback?: DecisionProvider;
  /** Session memo size. Identical state + questions are not re-asked. */
  cacheSize?: number;
  /** Called when Jev could not answer, with why. */
  onFallback?: (reason: string) => void;
}

export class JevDecisionProvider implements DecisionProvider {
  readonly id = 'jev';
  private readonly cache = new Map<string, unknown>();

  constructor(private readonly opts: JevProviderOptions) {}

  async ask<Q extends QuestionSet>(state: DecisionState, questions: Q): Promise<AnswersFor<Q>> {
    const fallback = this.opts.fallback ?? heuristicProvider;
    const wire = wireQuestions(questions);
    const key = JSON.stringify([state, wire]);
    const cached = this.cache.get(key);
    if (cached) return cached as AnswersFor<Q>;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 1500);
    let response: JevResponse;
    try {
      response = await this.opts.transport({ model: this.opts.model ?? 'jev-latest', state, questions: wire }, controller.signal);
    } catch (e) {
      this.opts.onFallback?.(controller.signal.aborted ? 'timeout' : String((e as Error)?.message ?? e));
      return fallback.ask(state, questions);
    } finally {
      clearTimeout(timer);
    }

    const answers = {} as Record<string, unknown>;
    for (const [k, q] of Object.entries(questions) as [string, Question][]) {
      const a = translate(q, response.answers?.[k]);
      if (!a) {
        // One malformed answer is not a reason to trust the others less, but
        // it is a reason not to act on garbage: answer this batch offline.
        this.opts.onFallback?.(`unusable answer for "${k}"`);
        return fallback.ask(state, questions);
      }
      answers[k] = a;
    }

    this.cache.set(key, answers);
    if (this.cache.size > (this.opts.cacheSize ?? 256)) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
    return answers as AnswersFor<Q>;
  }
}

/** Maps a Jev answer onto ours; undefined when it does not fit the question. */
function translate(q: Question, a: JevResponse['answers'][string] | undefined): ChoiceAnswer | NoulAnswer | ScoreAnswer | undefined {
  if (!a || a.type !== q.type) return undefined;
  if (a.type === 'choice' && q.type === 'choice') {
    if (!(a.choice in q.criteria)) return undefined;
    return { type: 'choice', value: a.choice, confidence: a.confidence, probabilities: a.probabilities };
  }
  if (a.type === 'noul') {
    if (typeof a.noul !== 'number') return undefined;
    // Same definition as the heuristic provider: distance from the coin flip.
    return { type: 'noul', value: a.noul, confidence: Math.abs(a.noul - 0.5) * 2 };
  }
  if (a.type === 'score') {
    if (typeof a.score !== 'number') return undefined;
    return { type: 'score', value: a.score, confidence: a.confidence };
  }
  return undefined;
}
