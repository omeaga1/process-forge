import type { ChoiceQuestion, DecisionState, NoulQuestion } from './types.js';
import { text, keywordWeight } from './heuristic.js';

/**
 * The four routing seams from plan 0001 §2, declared as questions.
 *
 * Each one used to be a `String.prototype.includes` ladder buried in a
 * dispatcher. Declaring them here does three things the ladder could not:
 *
 *   1. The answer set is closed and visible.
 *   2. Ambiguity survives. Two matching options produce a near-tie instead of
 *      whichever the author happened to test first.
 *   3. They can be given fixtures, so a fix can be shown not to break a
 *      neighbouring case -- which is the thing §4 of the plan says the ladder
 *      makes impossible.
 *
 * `criteria` strings are written for a decision model to read. The `heuristic`
 * is the offline answer. Keeping both at the same declaration site is what stops
 * the two implementations drifting apart.
 */

// ── 1. Is this a request to draw something? ──────────────────────────────────

/**
 * Was: twelve OR'd substrings including bare `reactor`, `tank` and `column`, so
 * "the reactor feed pump is fine, don't change anything" synthesised a drawing
 * and offered an unrequested dressing swap.
 *
 * Mentioning equipment is not asking for a drawing. Only the verbs are evidence;
 * equipment nouns are neutral, and an explicit refusal is evidence against.
 */
export const isDrawingRequest: NoulQuestion = {
  type: 'noul',
  instructions:
    'Is the engineer asking for equipment geometry to be drawn or redrawn? Naming a piece of equipment while discussing it is not a request to draw it.',
  criteria: {
    true: 'Asks to draw, sketch, render, redraw or change the appearance or geometry of equipment.',
    false:
      'Discusses, questions, or comments on equipment without asking for geometry. Includes statements that explicitly decline a change.'
  },
  heuristic: (state: DecisionState) => {
    const t = text(state);
    const asks = keywordWeight(t, ['draw', 'sketch', 'render', 'redraw', 'cad', 'geometry', 'draft']);
    const dressing = keywordWeight(t, ['nozzle', 'jacket', 'baffle', 'internals', 'dressing']);
    const declines = keywordWeight(t, [
      "don't change",
      'dont change',
      'do not change',
      'leave it',
      'is fine',
      'no change',
      'nothing'
    ]);
    if (declines > 0) return 0.05;
    if (asks > 0) return 0.95;
    // Dressing nouns alone are weak evidence -- they appear in questions as
    // often as in requests.
    return dressing > 0 ? 0.45 : 0.05;
  }
};

// ── 2. Is this a request to create a node? ───────────────────────────────────

/**
 * Was: a bare `add` or `make` appearing anywhere in the message, including
 * inside a question that was not a request.
 */
export const isCreationRequest: NoulQuestion = {
  type: 'noul',
  instructions: 'Is the engineer asking for a new unit operation to be placed on the flowsheet?',
  criteria: {
    true: 'Requests that a new piece of equipment be added, created, placed or inserted.',
    false:
      'Asks a question about equipment, or discusses one that already exists, without requesting a new one.'
  },
  heuristic: (state: DecisionState) => {
    const t = text(state);
    const imperative = keywordWeight(t, ['add', 'create', 'place', 'insert', 'put in', 'give me']);
    const interrogative = /^(what|why|how|is|are|does|do|can|should|would|could|which)\b/.test(
      t.trim()
    ) || t.includes('?');
    if (imperative === 0) return 0.05;
    // "how do I add a pump?" is a question about adding, not a request to add.
    return interrogative ? 0.35 : 0.9;
  }
};

// ── 3. Which kind of unit operation? ─────────────────────────────────────────

export type EquipmentKindChoice =
  | 'PUMP'
  | 'BATCH_REACTOR'
  | 'SURGE_TANK'
  | 'HEAT_EXCHANGER'
  | 'DISTILLATION_COLUMN'
  | 'CONVEYOR'
  | 'CUSTOM_UNIT_OP';

/**
 * Was: a first-match ladder testing `pump` before `reactor`, so "add a reactor
 * with a feed pump" produced a PUMP and discarded the ambiguity entirely.
 *
 * Now both score, the result is a near-tie, and the confidence falls below the
 * threshold -- which is the signal to ask rather than guess.
 */
export const equipmentKind: ChoiceQuestion<EquipmentKindChoice> = {
  type: 'choice',
  instructions:
    'Which single unit operation is the engineer asking to add? If more than one is named, the one being added is usually the grammatical object of the request, not a piece of context.',
  criteria: {
    PUMP: 'A pump moving fluid: centrifugal, positive displacement, transfer, feed.',
    BATCH_REACTOR: 'A vessel where reaction occurs: reactor, CSTR, polymeriser, jacketed vessel.',
    SURGE_TANK: 'Intermediate storage or buffering: surge tank, day tank, hold vessel.',
    HEAT_EXCHANGER: 'Heat transfer between streams: exchanger, cooler, condenser, chiller.',
    DISTILLATION_COLUMN: 'Vapour-liquid separation: column, tower, fractionator, absorber.',
    CONVEYOR: 'Discrete transport: conveyor, belt, accumulation table.',
    CUSTOM_UNIT_OP: 'Something outside the standard families, or too unclear to place.'
  },
  heuristic: (state: DecisionState) => {
    const t = text(state);
    return {
      PUMP: keywordWeight(t, ['pump', 'pumps']),
      BATCH_REACTOR: keywordWeight(t, ['reactor', 'cstr', 'polymeriser', 'polymerizer']),
      SURGE_TANK: keywordWeight(t, ['tank', 'surge', 'vessel', 'drum']),
      HEAT_EXCHANGER: keywordWeight(t, ['heat exchanger', 'exchanger', 'cooler', 'condenser', 'chiller']),
      DISTILLATION_COLUMN: keywordWeight(t, ['column', 'tower', 'fractionator', 'absorber', 'distillation']),
      CONVEYOR: keywordWeight(t, ['conveyor', 'belt', 'accumulation']),
      CUSTOM_UNIT_OP: 0
    };
  }
};

// ── 4. Which drawing template? ───────────────────────────────────────────────

export type TemplateFamily =
  | 'column'
  | 'reactor'
  | 'exchanger'
  | 'pump'
  | 'cyclone'
  | 'spray'
  | 'sphere'
  | 'drum'
  | 'generic';

/**
 * Was: eight families, first substring match wins, `column` in family one.
 *
 * The tray-count defect lives alongside this: `p.includes('10')` reads a bare
 * "10" out of the prompt, so "distillation column with a 10 inch nozzle" renders
 * ten trays. That is a separate fix in the CAD engine, but it is the same root
 * cause -- an unbounded substring test standing in for a bounded question.
 */
export const templateFamily: ChoiceQuestion<TemplateFamily> = {
  type: 'choice',
  instructions: 'Which equipment family should the ISA-5.1 drawing be taken from?',
  criteria: {
    column: 'Vertical separation column: distillation, fractionation, absorption, stripping.',
    reactor: 'Agitated reaction vessel, typically with a motor and impeller.',
    exchanger: 'Shell-and-tube or plate heat exchanger.',
    pump: 'Centrifugal or positive-displacement pump.',
    cyclone: 'Cyclone or centrifugal separator with a conical body.',
    spray: 'Spray chamber, atomiser or two-fluid nozzle assembly.',
    sphere: 'Spherical pressure storage vessel on legs.',
    drum: 'Horizontal cylindrical drum or bullet tank on saddles.',
    generic: 'No family clearly fits; a plain vertical vessel is the safe default.'
  },
  heuristic: (state: DecisionState) => {
    const t = text(state);
    return {
      column: keywordWeight(t, ['distillation', 'fractionat', 'column', 'tower', 'absorption', 'stripper']),
      reactor: keywordWeight(t, ['reactor', 'cstr', 'agitator', 'impeller']),
      exchanger: keywordWeight(t, ['heat exchanger', 'exchanger', 'shell and tube', 'condenser']),
      pump: keywordWeight(t, ['pump', 'volute', 'impeller pump']),
      cyclone: keywordWeight(t, ['cyclone', 'separator']),
      spray: keywordWeight(t, ['spray', 'atomiser', 'atomizer']),
      sphere: keywordWeight(t, ['sphere', 'spherical', 'lpg']),
      drum: keywordWeight(t, ['drum', 'bullet', 'horizontal tank', 'saddle']),
      generic: 0
    };
  }
};

/** Every declared question, for a caller that wants to ask them together. */
export const ROUTING_QUESTIONS = {
  isDrawingRequest,
  isCreationRequest,
  equipmentKind,
  templateFamily
} as const;
