import type { DecisionProvider, DecisionState } from './types.js';
import { hasSignal, isActionable } from './types.js';
import { ROUTING_QUESTIONS } from './questions.js';

/**
 * The routing fixtures (plan 0001 §7): engineer phrasings mapped to what the
 * right answer is. Any provider can be scored against them, which is the only
 * fair way to decide whether a model earns its place over the keyword rules.
 *
 * Expectations:
 *   a value   -- the provider must pick it, confidently enough to act on;
 *   'ask'     -- a genuine ambiguity: signal, but not actionable, so the app
 *                asks the engineer;
 *   'nothing' -- no option applies; acting would be wrong (choice: no signal;
 *                yes/no: confidently no).
 *
 * The `hard` cases are phrasings keyword matching cannot reasonably get:
 * paraphrase, politeness, negation. They are where a decision model would
 * have to win.
 */
export type RoutingKey = keyof typeof ROUTING_QUESTIONS;

export interface RoutingFixture {
  question: RoutingKey;
  state: DecisionState;
  expect: string | boolean | 'ask' | 'nothing';
  hard?: boolean;
  note?: string;
}

const m = (message: string) => ({ message });

export const ROUTING_FIXTURES: RoutingFixture[] = [
  // ── Is this a request to draw? ────────────────────────────────────────────
  { question: 'isDrawingRequest', state: m('draw the column'), expect: true },
  { question: 'isDrawingRequest', state: m('sketch a CSTR'), expect: true },
  { question: 'isDrawingRequest', state: m('redraw this with a dished bottom'), expect: true },
  { question: 'isDrawingRequest', state: m("the reactor feed pump is fine, don't change anything"), expect: false, note: 'plan §2.1' },
  { question: 'isDrawingRequest', state: m('what is the residence time in the reactor?'), expect: false },
  { question: 'isDrawingRequest', state: m('show me what the column looks like with 12 trays'), expect: true, hard: true },
  { question: 'isDrawingRequest', state: m('the symbol is wrong, it should have a cone bottom'), expect: true, hard: true },
  { question: 'isDrawingRequest', state: m("don't redraw anything, just give me the duty"), expect: false, hard: true },

  // ── Is this a request to create? ─────────────────────────────────────────
  { question: 'isCreationRequest', state: m('add a surge tank'), expect: true },
  { question: 'isCreationRequest', state: m('insert a centrifugal pump after the reactor'), expect: true },
  { question: 'isCreationRequest', state: m('how do I add a surge tank?'), expect: false, note: 'plan §2.2' },
  { question: 'isCreationRequest', state: m('make the pump bigger'), expect: false },
  { question: 'isCreationRequest', state: m('could you add a pump after the tank?'), expect: true, hard: true, note: 'polite request, phrased as a question' },
  { question: 'isCreationRequest', state: m("don't add a pump, the head is enough"), expect: false, hard: true, note: 'negation' },
  { question: 'isCreationRequest', state: m('we need somewhere to buffer the flow before the filler'), expect: true, hard: true },

  // ── Which equipment? ─────────────────────────────────────────────────────
  { question: 'equipmentKind', state: m('add a centrifugal pump'), expect: 'PUMP' },
  { question: 'equipmentKind', state: m('add a jacketed reactor'), expect: 'BATCH_REACTOR' },
  { question: 'equipmentKind', state: m('add a surge tank'), expect: 'SURGE_TANK' },
  { question: 'equipmentKind', state: m('add a heat exchanger'), expect: 'HEAT_EXCHANGER' },
  { question: 'equipmentKind', state: m('add an accumulation conveyor'), expect: 'CONVEYOR' },
  { question: 'equipmentKind', state: m('add a reactor with a feed pump'), expect: 'ask', note: 'plan §2.2' },
  { question: 'equipmentKind', state: m('add a surge tank and a pump'), expect: 'ask' },
  { question: 'equipmentKind', state: m('add a widget'), expect: 'nothing' },
  { question: 'equipmentKind', state: m('I need something to cool the product stream down to 40 C'), expect: 'HEAT_EXCHANGER', hard: true },
  { question: 'equipmentKind', state: m('add something to move the paint from the tank to the filler'), expect: 'PUMP', hard: true },
  { question: 'equipmentKind', state: m('put a flash drum after the heater'), expect: 'SEPARATOR', hard: true, note: '"heater" names an exchanger, but it is only a location' },

  // ── Which drawing template? ──────────────────────────────────────────────
  { question: 'templateFamily', state: m('distillation column with a 10 inch nozzle'), expect: 'column' },
  { question: 'templateFamily', state: m('jacketed CSTR with a Rushton turbine'), expect: 'reactor' },
  { question: 'templateFamily', state: m('horizontal shell and tube heat exchanger'), expect: 'exchanger' },
  { question: 'templateFamily', state: m('Distillation column with 8 sieve trays and overhead reflux condenser'), expect: 'column' },
  { question: 'templateFamily', state: m('horizontal bullet for LPG storage'), expect: 'drum' },
  { question: 'templateFamily', state: m('absorption column feeding a cyclone'), expect: 'ask' },
  { question: 'templateFamily', state: m('two-phase separator'), expect: 'nothing' },
  { question: 'templateFamily', state: m('a tall vessel with trays for splitting light and heavy ends'), expect: 'column', hard: true },
  { question: 'templateFamily', state: m('tank with a stirrer and a cooling jacket'), expect: 'reactor', hard: true },
  { question: 'templateFamily', state: m('a pressure ball on legs for propane'), expect: 'sphere', hard: true }
];

export interface FixtureResult {
  fixture: RoutingFixture;
  passed: boolean;
  got: string;
}

export interface FixtureScore {
  provider: string;
  passed: number;
  total: number;
  hardPassed: number;
  hardTotal: number;
  results: FixtureResult[];
}

function judge(f: RoutingFixture, a: { type: string; value: unknown; confidence: number; probabilities?: Record<string, number> }): FixtureResult {
  if (a.type === 'noul') {
    const yes = (a.value as number) > 0.5;
    const acts = isActionable(a);
    const got = `${(a.value as number).toFixed(2)}${acts ? '' : ' (unsure)'}`;
    // The app acts on a yes/no only when it is a confident yes. So "true"
    // means it must act, and "false" means it must not -- an unsure answer is
    // as correct as a confident no, since both leave the flowsheet alone.
    const wouldAct = acts && yes;
    const passed = f.expect === 'ask' ? !acts : f.expect === true ? wouldAct : f.expect === false ? !wouldAct : false;
    return { fixture: f, passed, got };
  }
  const choice = a as { type: 'choice'; value: string; confidence: number; probabilities: Record<string, number> };
  const signal = hasSignal(choice);
  const acts = isActionable(choice);
  const got = !signal ? 'nothing' : acts ? choice.value : `ask (${choice.value} ${choice.confidence.toFixed(2)})`;
  let passed: boolean;
  if (f.expect === 'nothing') passed = !signal;
  else if (f.expect === 'ask') passed = signal && !acts;
  else passed = acts && choice.value === f.expect;
  return { fixture: f, passed, got };
}

/** Scores a provider against every fixture, one question per call. */
export async function scoreProvider(provider: DecisionProvider, fixtures = ROUTING_FIXTURES): Promise<FixtureScore> {
  const results: FixtureResult[] = [];
  for (const f of fixtures) {
    const answers = await provider.ask(f.state, { q: ROUTING_QUESTIONS[f.question] });
    results.push(judge(f, answers.q as never));
  }
  const hard = results.filter((r) => r.fixture.hard);
  return {
    provider: provider.id,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    hardPassed: hard.filter((r) => r.passed).length,
    hardTotal: hard.length,
    results
  };
}
