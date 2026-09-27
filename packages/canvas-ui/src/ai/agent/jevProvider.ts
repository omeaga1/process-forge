import {
  heuristicProvider,
  type AnswersFor,
  type ChoiceAnswer,
  type DecisionProvider,
  type DecisionState,
  type NoulAnswer,
  type Question,
  type QuestionSet,
  type ScoreAnswer
} from '@process-forge/protocol';
import { OPENROUTER_CHAT_URL, openRouterHeaders } from '../llmClient.js';

/**
 * TypeSafe's Jev, a decision model, through the engineer's OpenRouter sign-in:
 * typed questions in (choice, noul, score), calibrated probabilities out. It
 * answers the design questions (protocol/decisions/designQuestions.ts) that
 * decide what a complete design of a unit has to carry.
 *
 * OpenRouter takes the questions in response_format { type: 'questions' } and
 * the state as the user message; the answers come back as JSON in the
 * assistant message. Input costs about $0.042 per million tokens and output is
 * free, so a check is a fraction of a cent, billed to the engineer's OpenRouter
 * account. Anything unusable -- an error, a timeout, an answer that does not fit
 * its question -- falls back to the offline heuristics for that batch.
 */

export const JEV_MODEL = 'typesafe/jev-router';
const ENABLED_KEY = 'pf_jev_design_checks';

/** On unless the engineer turned it off. */
export function isJevEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setJevEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice lasts for this session.
  }
}

/** A provider that says who answered the last batch: Jev, or the offline fallback (and why). */
export interface SourcedDecisionProvider extends DecisionProvider {
  lastSource: { by: 'jev' | 'offline'; reason?: string };
}

export type JevFetch = (body: unknown, signal: AbortSignal) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export class JevOpenRouterProvider implements SourcedDecisionProvider {
  readonly id = 'jev';
  lastSource: SourcedDecisionProvider['lastSource'] = { by: 'jev' };
  private readonly cache = new Map<string, unknown>();

  constructor(
    private readonly apiKey: string,
    private readonly opts: { timeoutMs?: number; fetcher?: JevFetch } = {}
  ) {}

  async ask<Q extends QuestionSet>(state: DecisionState, questions: Q): Promise<AnswersFor<Q>> {
    const wire = Object.fromEntries(
      (Object.entries(questions) as [string, Question][]).map(([k, q]) => [k, { type: q.type, instructions: q.instructions, criteria: q.criteria }])
    );
    const content = typeof state.message === 'string' ? state.message : JSON.stringify(state);
    const key = JSON.stringify([content, Object.keys(wire)]);
    const cached = this.cache.get(key);
    if (cached) {
      this.lastSource = { by: 'jev' };
      return cached as AnswersFor<Q>;
    }
    const offline = async (reason: string) => {
      this.lastSource = { by: 'offline', reason };
      return heuristicProvider.ask(state, questions);
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 10000);
    let data: any;
    try {
      const body = { model: JEV_MODEL, messages: [{ role: 'user', content }], response_format: { type: 'questions', questions: wire } };
      const fetcher: JevFetch =
        this.opts.fetcher ??
        ((b, signal) => fetch(OPENROUTER_CHAT_URL, { method: 'POST', headers: openRouterHeaders(this.apiKey), body: JSON.stringify(b), signal }));
      const res = await fetcher(body, controller.signal);
      if (!res.ok) return offline(`Jev returned HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      return offline(controller.signal.aborted ? 'Jev timed out' : `Jev could not be reached (${(e as Error)?.message ?? e})`);
    } finally {
      clearTimeout(timer);
    }

    let raw: Record<string, unknown>;
    try {
      const c = data?.choices?.[0]?.message?.content;
      raw = typeof c === 'string' ? JSON.parse(c) : (c ?? {});
    } catch {
      return offline('Jev sent back something that is not JSON');
    }
    const answers: Record<string, unknown> = {};
    for (const [k, q] of Object.entries(questions) as [string, Question][]) {
      const a = translate(q, raw[k]);
      if (!a) return offline(`Jev's answer to "${k}" did not fit the question`);
      answers[k] = a;
    }
    this.cache.set(key, answers);
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value as string);
    this.lastSource = { by: 'jev' };
    return answers as AnswersFor<Q>;
  }
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * One of Jev's answers in our terms; undefined when it does not fit. Accepts the
 * documented shapes ({ choice, confidence, probabilities }, { noul }, { score })
 * and the bare value, since the OpenRouter integration is marked experimental.
 */
export function translate(q: Question, a: unknown): ChoiceAnswer | NoulAnswer | ScoreAnswer | undefined {
  const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
  if (q.type === 'choice') {
    const probs = o.probabilities && typeof o.probabilities === 'object' ? (o.probabilities as Record<string, number>) : undefined;
    const value = typeof a === 'string' ? a : typeof o.choice === 'string' ? o.choice : typeof o.value === 'string' ? o.value : undefined;
    if (!value || !(value in q.criteria)) return undefined;
    const confidence = num(o.confidence) ?? num(probs?.[value]);
    if (confidence === undefined) return undefined;
    const probabilities = probs ?? Object.fromEntries(Object.keys(q.criteria).map((k) => [k, k === value ? confidence : (1 - confidence) / Math.max(1, Object.keys(q.criteria).length - 1)]));
    return { type: 'choice', value, confidence, probabilities };
  }
  if (q.type === 'noul') {
    const p = num(a) ?? num(o.noul) ?? num(o.probability) ?? num(o.value);
    if (p === undefined || p < 0 || p > 1) return undefined;
    return { type: 'noul', value: p, confidence: Math.abs(p - 0.5) * 2 };
  }
  const s = num(a) ?? num(o.score) ?? num(o.value);
  if (s === undefined) return undefined;
  return { type: 'score', value: s, confidence: num(o.confidence) ?? 0.5 };
}

/** The offline provider, with the same lastSource shape. */
export function offlineDecider(reason = 'Jev is off'): SourcedDecisionProvider {
  return {
    id: 'heuristic',
    lastSource: { by: 'offline', reason },
    ask: (state, questions) => heuristicProvider.ask(state, questions)
  };
}
