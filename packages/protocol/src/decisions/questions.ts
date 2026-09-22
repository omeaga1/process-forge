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
    // Phrases, not bare verbs, where the bare verb is ambiguous: "make a pump"
    // is a request, "make the pump bigger" is not, and the old ladder treated
    // both as creation because it matched a bare 'make'.
    const imperative = keywordWeight(t, [
      'add',
      'create',
      'place',
      'insert',
      'put in',
      'give me',
      'make a',
      'make an',
      'put a',
      'want a',
      'need a'
    ]);
    const interrogative = /^(what|why|how|is|are|does|do|can|should|would|could|which)\b/.test(
      t.trim()
    ) || t.includes('?');
    if (imperative === 0) return 0.05;
    // "how do I add a pump?" is a question about adding, not a request to add.
    return interrogative ? 0.35 : 0.9;
  }
};

// ── 3. Which kind of unit operation? ─────────────────────────────────────────

/**
 * Every kind the node factory can instantiate, plus the two that fall through
 * to its generic branch. Covering the full set matters: the ladder this
 * replaces handled separators, fillers, labelers and palletizers, and a
 * narrower question would silently regress "add a labeler".
 */
export type EquipmentKindChoice =
  | 'PUMP'
  | 'BATCH_REACTOR'
  | 'SURGE_TANK'
  | 'HEAT_EXCHANGER'
  | 'SEPARATOR'
  | 'DISTILLATION_COLUMN'
  | 'ROTARY_FILLER'
  | 'CONVEYOR'
  | 'LABELER'
  | 'PALLETIZER'
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
    SEPARATOR: 'Phase separation in a drum: flash drum, knockout pot, decanter, separator.',
    DISTILLATION_COLUMN: 'Vapour-liquid separation: column, tower, fractionator, absorber.',
    ROTARY_FILLER: 'Container filling: rotary filler, can filler, bottle filler.',
    CONVEYOR: 'Discrete transport: conveyor, belt, accumulation table.',
    LABELER: 'Applying labels to containers: labeler, labeller, label applicator.',
    PALLETIZER: 'Stacking containers onto pallets: palletizer, palletiser, end-of-line stacker.',
    CUSTOM_UNIT_OP: 'Something outside the standard families, or too unclear to place.'
  },
  heuristic: (state: DecisionState) => {
    // PRESENCE, not keyword count. A kind is either named or it is not.
    //
    // Counting matches looks like evidence strength and is not: "surge tank" is
    // two keywords for one piece of equipment, so "add a surge tank and a pump"
    // weighed 2:1, cleared the threshold, and silently created the tank. That is
    // the ladder's bug in a subtler form -- whichever equipment has the longer
    // name wins. Found by the flow-rate fixture in kindClarification.test.ts.
    const named = (t: string, keywords: string[]) => (keywordWeight(t, keywords) > 0 ? 1 : 0);
    const weigh = (t: string) => ({
      PUMP: named(t, ['pump', 'pumps', 'pumping']),
      BATCH_REACTOR: named(t, ['reactor', 'cstr', 'polymeriser', 'polymerizer']),
      // 'drum' is deliberately NOT here: it belongs to SEPARATOR, and listing it
      // in both would turn every "flash drum" into a tie.
      SURGE_TANK: named(t, ['tank', 'surge', 'vessel']),
      HEAT_EXCHANGER: named(t, ['heat exchanger', 'exchanger', 'cooler', 'condenser', 'chiller']),
      SEPARATOR: named(t, ['separator', 'flash drum', 'knockout', 'knock-out', 'decanter']),
      DISTILLATION_COLUMN: named(t, ['column', 'tower', 'fractionator', 'absorber', 'distillation']),
      ROTARY_FILLER: named(t, ['filler', 'rotary filler', 'can filler', 'bottle filler']),
      CONVEYOR: named(t, ['conveyor', 'belt', 'accumulation']),
      LABELER: named(t, ['labeler', 'labeller', 'labeling', 'labelling']),
      PALLETIZER: named(t, ['palletizer', 'palletiser', 'pallet']),
      CUSTOM_UNIT_OP: 0
    });

    // The engineer's own words are the authority on what to add. The model's
    // reply is consulted only when those words carry no kind at all -- the case
    // where the engineer says something vague and the model answers "added a
    // centrifugal pump". Reading both at once would let the reply outvote the
    // request.
    const fromMessage = weigh(text(state, 'message'));
    const total = Object.values(fromMessage).reduce((s, w) => s + w, 0);
    return total > 0 ? fromMessage : weigh(text(state, 'response'));
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
 * Kinds that imply a drawing family. Callers pass either a node kind
 * (`BATCH_REACTOR`) or, from MCP, a free-form machine type ("scrubber"), so
 * this matches words in either. Only kinds with one obvious template are
 * listed; a SURGE_TANK or SEPARATOR could be drawn several ways, so they give
 * no hint and the description decides.
 */
const KIND_HINTS: [string[], TemplateFamily][] = [
  [['distillation', 'column', 'tower'], 'column'],
  [['reactor'], 'reactor'],
  [['exchanger'], 'exchanger'],
  [['pump'], 'pump'],
  [['scrubber', 'spray'], 'spray']
];

function familyForKind(kind: unknown): TemplateFamily | undefined {
  const k = String(kind ?? '').toLowerCase().replace(/_/g, ' ');
  if (!k) return undefined;
  return KIND_HINTS.find(([words]) => keywordWeight(k, words) > 0)?.[1];
}

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
    // Presence, not count -- see equipmentKind. The ambiguity fixture for this
    // question only passed before because both named families happened to have
    // two matching keywords each; "distillation fractionation column feeding a
    // cyclone" would have weighed 3:1 and silently rendered a column.
    const named = (keywords: string[]) => (keywordWeight(t, keywords) > 0 ? 1 : 0);
    // A MODIFIER hints at a family without naming one. "horizontal" alone means
    // a drum, but "horizontal heat exchanger" is an exchanger; "impeller" alone
    // suggests an agitator, but a pump has one too. Weighted so that a named
    // family always outvotes it (1 vs 0.25 = 0.8, actionable) while it still
    // decides when nothing is named.
    const hinted = (keywords: string[]) => (keywordWeight(t, keywords) > 0 ? 0.25 : 0);
    const either = (strong: string[], weak: string[] = []) => Math.max(named(strong), hinted(weak));

    const weights: Record<TemplateFamily, number> = {
      // Whole words: keywordWeight matches on word boundaries, so a stem like
      // 'fractionat' never matched "fractionation" or "fractionator".
      column: either(['distillation', 'fractionation', 'fractionator', 'column', 'tower', 'absorption', 'absorber', 'stripper']),
      reactor: either(
        ['reactor', 'cstr', 'agitator', 'agitated', 'ferment', 'fermenter', 'fermentor', 'fermentation', 'bioreactor'],
        ['impeller']
      ),
      // A condenser or reboiler is usually named as a PART of something else --
      // "column with an overhead reflux condenser" is a column. Alone, it is
      // still the only thing named and draws an exchanger.
      exchanger: either(['heat exchanger', 'exchanger', 'shell and tube', 'cooler', 'heater'], ['condenser', 'reboiler']),
      pump: either(['pump', 'volute', 'compressor']),
      // Not bare 'separator': a two-phase separator is a plain vertical vessel,
      // and the ladder only drew a cyclone for a gas-solid one.
      cyclone: either(['cyclone', 'gas-solid', 'gas solid']),
      spray: either(['spray', 'atomiser', 'atomizer', 'atomizing', 'atomising', 'scrubber']),
      // Not 'lpg': LPG is stored in bullets as often as spheres, and listing it
      // turned "horizontal bullet for LPG storage" into a tie.
      sphere: either(['sphere', 'spherical', 'horton']),
      drum: either(['drum', 'bullet', 'horizontal tank', 'saddle', 'saddles'], ['horizontal']),
      generic: 0
    };

    // The node's kind, when the caller has one, is a hint of the same strength
    // as a modifier: the engineer's description wins over it, but it decides
    // for a description that names nothing ("jacketed, 2 m3").
    const kindHint = familyForKind(state.kind);
    if (kindHint) weights[kindHint] = Math.max(weights[kindHint], 0.25);
    return weights;
  }
};

/** Every declared question, for a caller that wants to ask them together. */
export const ROUTING_QUESTIONS = {
  isDrawingRequest,
  isCreationRequest,
  equipmentKind,
  templateFamily
} as const;
