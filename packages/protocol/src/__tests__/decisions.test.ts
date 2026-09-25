/**
 * Fixtures for the routing seams.
 *
 * Plan 0001 §4 argues that the `includes()` ladders "can be tested but cannot be
 * improved: every fix is one more substring that breaks a neighbouring case".
 * This file is the counter-position -- once a seam is a declared question, a fix
 * is measurable and a regression is visible.
 *
 * The prompts marked FAILED IN THE LADDER are the ones plan 0001 §2 records as
 * producing the wrong result today.
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  heuristicProvider,
  scoreProvider,
  ROUTING_FIXTURES,
  ROUTING_QUESTIONS,
  isDrawingRequest,
  isCreationRequest,
  equipmentKind,
  templateFamily,
  isActionable,
  runnersUp,
  DEFAULT_CONFIDENCE_THRESHOLD
} from '../index.js';

const ask = (message: string) => heuristicProvider.ask({ message }, ROUTING_QUESTIONS);

describe('Decision provider: shape', () => {
  it('answers every question in one call', async () => {
    const a = await ask('add a pump');
    assert.deepEqual(Object.keys(a).sort(), Object.keys(ROUTING_QUESTIONS).sort());
  });

  it('returns a full distribution, not just a winner', async () => {
    const a = await ask('add a pump');
    const total = Object.values(a.equipmentKind.probabilities).reduce((s, p) => s + p, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `probabilities summed to ${total}`);
  });

  it('is deterministic', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(JSON.stringify(await ask('add a reactor')));
    assert.equal(seen.size, 1);
  });
});

describe('Seam 1: is this a request to draw?', () => {
  it('FAILED IN THE LADDER — naming a reactor is not asking for a drawing', async () => {
    // Twelve OR'd substrings included bare `reactor`, so this synthesised a CAD
    // drawing and offered a dressing swap nobody asked for.
    const a = await heuristicProvider.ask(
      { message: "the reactor feed pump is fine, don't change anything" },
      { q: isDrawingRequest }
    );
    assert.ok(a.q.value < 0.5, `expected not-a-drawing-request, got ${a.q.value}`);
    assert.ok(isActionable(a.q), 'and it should be confident about that');
  });

  it('still recognises an actual request', async () => {
    for (const m of ['draw the column', 'sketch a CSTR', 'redraw this with a dished bottom']) {
      const a = await heuristicProvider.ask({ message: m }, { q: isDrawingRequest });
      assert.ok(a.q.value > 0.5, `"${m}" should be a drawing request`);
    }
  });

  it('is unsure about a bare dressing noun, rather than guessing', async () => {
    const a = await heuristicProvider.ask({ message: 'what nozzle rating is that?' }, { q: isDrawingRequest });
    assert.ok(!isActionable(a.q), 'a bare dressing noun should not be actionable either way');
  });
});

describe('Seam 2: is this a request to create?', () => {
  it('FAILED IN THE LADDER — a question about adding is not a request to add', async () => {
    const a = await heuristicProvider.ask(
      { message: 'how do I add a surge tank?' },
      { q: isCreationRequest }
    );
    assert.ok(!isActionable(a.q), 'should not silently create a node from a question');
  });

  it('recognises an imperative', async () => {
    const a = await heuristicProvider.ask({ message: 'add a surge tank' }, { q: isCreationRequest });
    assert.ok(a.q.value > 0.5 && isActionable(a.q));
  });
});

describe('Seam 3: which equipment kind?', () => {
  it('FAILED IN THE LADDER — "add a reactor with a feed pump" became a PUMP', async () => {
    // The ladder tested `pump` before `reactor` and discarded the ambiguity.
    // It should now be a near-tie, and therefore a question for the engineer.
    const a = await heuristicProvider.ask(
      { message: 'add a reactor with a feed pump' },
      { q: equipmentKind }
    );
    assert.ok(
      !isActionable(a.q),
      `expected an unactionable tie, got ${a.q.value} at ${a.q.confidence.toFixed(2)}`
    );
    const offer = runnersUp(a.q);
    assert.ok(
      offer.includes('PUMP') && offer.includes('BATCH_REACTOR'),
      `should offer both candidates, got ${offer.join(', ')}`
    );
  });

  it('is decisive when only one kind is named', async () => {
    const cases: [string, string][] = [
      ['add a centrifugal pump', 'PUMP'],
      ['add a jacketed reactor', 'BATCH_REACTOR'],
      ['add a surge tank', 'SURGE_TANK'],
      ['add a heat exchanger', 'HEAT_EXCHANGER'],
      ['add a distillation column', 'DISTILLATION_COLUMN'],
      ['add an accumulation conveyor', 'CONVEYOR']
    ];
    for (const [message, expected] of cases) {
      const a = await heuristicProvider.ask({ message }, { q: equipmentKind });
      assert.equal(a.q.value, expected, `"${message}" -> ${a.q.value}`);
      assert.ok(isActionable(a.q), `"${message}" should be actionable`);
    }
  });

  it('says so when it has no idea, rather than picking the first branch', async () => {
    const a = await heuristicProvider.ask({ message: 'add a widget' }, { q: equipmentKind });
    assert.ok(!isActionable(a.q));
  });
});

describe('Seam 4: which drawing template?', () => {
  it('does not let a stray number choose the family', async () => {
    // The CAD engine reads a bare '10' for the tray count. The family question
    // is at least not confused by it.
    const a = await heuristicProvider.ask(
      { message: 'distillation column with a 10 inch nozzle' },
      { q: templateFamily }
    );
    assert.equal(a.q.value, 'column');
  });

  it('whole-word matching keeps "10 inch" from reading as a tray count', async () => {
    // keywordWeight is word-boundary aware; `.includes('10')` was not. This is
    // the defect that renders a ten-tray column from a nozzle size.
    const a = await heuristicProvider.ask({ message: 'add a 10 inch nozzle' }, { q: templateFamily });
    assert.ok(!isActionable(a.q), 'a nozzle size alone should not pick a family');
  });

  it('flags a genuinely ambiguous description instead of taking family one', async () => {
    const a = await heuristicProvider.ask(
      { message: 'absorption column feeding a cyclone separator' },
      { q: templateFamily }
    );
    assert.ok(!isActionable(a.q), 'two families named should not resolve silently');
    assert.deepEqual(runnersUp(a.q).sort(), ['column', 'cyclone']);
  });
});

describe('Evidence is presence, not keyword count', () => {
  it('a multi-word name does not outweigh a single-word one', async () => {
    // "surge tank" matches two keywords; "pump" matches one. Counting them made
    // this 2:1, which cleared the threshold and silently picked the tank.
    const a = await heuristicProvider.ask(
      { message: 'add a surge tank and a pump' },
      { q: equipmentKind }
    );
    assert.ok(!isActionable(a.q), `picked ${a.q.value} at ${a.q.confidence.toFixed(2)}`);
    assert.deepEqual(runnersUp(a.q).sort(), ['PUMP', 'SURGE_TANK']);
  });

  it('the template question is not swayed by synonyms piling up', async () => {
    const a = await heuristicProvider.ask(
      { message: 'distillation fractionation column feeding a cyclone' },
      { q: templateFamily }
    );
    assert.ok(!isActionable(a.q), 'three column synonyms against one cyclone is still two families');
  });

  it('matches whole words, so stems are not silently dead', async () => {
    const a = await heuristicProvider.ask({ message: 'a fractionator' }, { q: templateFamily });
    assert.equal(a.q.value, 'column');
    assert.ok(isActionable(a.q));
  });
});

describe('Thresholding', () => {
  it('the default sits above a two-way tie', () => {
    assert.ok(DEFAULT_CONFIDENCE_THRESHOLD > 0.5, 'a coin toss must not be actionable');
  });

  it('a boolean sitting on the fence is not actionable', () => {
    assert.equal(isActionable({ confidence: 0 }), false);
    assert.equal(isActionable({ confidence: 1 }), true);
  });
});

describe('Routing fixtures', () => {
  it('the keyword rules pass every non-hard case', async () => {
    const s = await scoreProvider(heuristicProvider);
    const failed = s.results.filter((r) => !r.passed && !r.fixture.hard);
    assert.deepEqual(
      failed.map((r) => `${r.fixture.question}: ${JSON.stringify(r.fixture.state)} -> ${r.got}`),
      []
    );
  });

  it('records the heuristic baseline on the hard cases', async () => {
    // Pinned so that improving the rules, or regressing them, is visible.
    // Change it deliberately, with the reason in the commit.
    const s = await scoreProvider(heuristicProvider);
    assert.equal(s.hardTotal, ROUTING_FIXTURES.filter((f) => f.hard).length);
    assert.equal(s.hardPassed, 1, `heuristic now passes ${s.hardPassed}/${s.hardTotal} hard cases`);
  });
});
