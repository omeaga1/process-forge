import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  JevDecisionProvider,
  heuristicProvider,
  scoreProvider,
  ROUTING_FIXTURES,
  ROUTING_QUESTIONS,
  equipmentKind,
  isCreationRequest,
  type JevRequest,
  type JevResponse,
  type JevTransport
} from '../index.js';

/** A transport that answers from a table, as recorded Jev responses would. */
function recorded(answer: (req: JevRequest) => JevResponse['answers']): { transport: JevTransport; calls: JevRequest[] } {
  const calls: JevRequest[] = [];
  return {
    calls,
    transport: async (req) => {
      calls.push(req);
      return { model: 'jev-1.13.0', answers: answer(req) };
    }
  };
}

describe('Jev provider: wire format', () => {
  it('sends every question in one request, without the offline heuristics', async () => {
    const t = recorded(() => ({
      create: { type: 'noul', noul: 0.9 },
      kind: { type: 'choice', choice: 'PUMP', confidence: 0.9, probabilities: { PUMP: 0.9 } }
    }));
    await new JevDecisionProvider({ transport: t.transport }).ask(
      { message: 'add a pump' },
      { create: isCreationRequest, kind: equipmentKind }
    );
    assert.equal(t.calls.length, 1, 'batched: one round trip for two questions');
    const req = t.calls[0]!;
    assert.equal(req.model, 'jev-latest');
    assert.deepEqual(Object.keys(req.questions).sort(), ['create', 'kind']);
    assert.ok(!JSON.stringify(req).includes('heuristic'));
    assert.equal(req.questions.kind!.type, 'choice');
    assert.ok('PUMP' in (req.questions.kind!.criteria as object));
  });

  it('maps answers onto the shared shape', async () => {
    const t = recorded(() => ({
      create: { type: 'noul', noul: 0.9 },
      kind: { type: 'choice', choice: 'BATCH_REACTOR', confidence: 0.8, probabilities: { BATCH_REACTOR: 0.8, PUMP: 0.2 } }
    }));
    const a = await new JevDecisionProvider({ transport: t.transport }).ask(
      { message: 'x' },
      { create: isCreationRequest, kind: equipmentKind }
    );
    assert.equal(a.kind.value, 'BATCH_REACTOR');
    assert.equal(a.kind.confidence, 0.8);
    assert.equal(a.create.value, 0.9);
    // Same confidence definition as the heuristic: distance from 0.5.
    assert.ok(Math.abs(a.create.confidence - 0.8) < 1e-9);
  });
});

describe('Jev provider: never worse than offline', () => {
  const question = { kind: equipmentKind };
  const state = { message: 'add a surge tank' };

  it('falls back to the heuristic when Jev errors', async () => {
    const reasons: string[] = [];
    const p = new JevDecisionProvider({
      transport: async () => {
        throw new Error('HTTP 529');
      },
      onFallback: (r) => reasons.push(r)
    });
    assert.deepEqual(await p.ask(state, question), await heuristicProvider.ask(state, question));
    assert.match(reasons[0]!, /529/);
  });

  it('falls back when Jev is slower than the timeout', async () => {
    const reasons: string[] = [];
    const p = new JevDecisionProvider({
      timeoutMs: 20,
      transport: (_req, signal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
      onFallback: (r) => reasons.push(r)
    });
    const a = await p.ask(state, question);
    assert.equal(a.kind.value, 'SURGE_TANK');
    assert.deepEqual(reasons, ['timeout']);
  });

  it('refuses an answer naming an option that does not exist', async () => {
    const t = recorded(() => ({ kind: { type: 'choice', choice: 'FLUX_CAPACITOR', confidence: 1, probabilities: {} } }));
    const reasons: string[] = [];
    const a = await new JevDecisionProvider({ transport: t.transport, onFallback: (r) => reasons.push(r) }).ask(state, question);
    assert.equal(a.kind.value, 'SURGE_TANK');
    assert.match(reasons[0]!, /unusable/);
  });

  it('does not re-ask an identical question', async () => {
    const t = recorded(() => ({ kind: { type: 'choice', choice: 'PUMP', confidence: 0.9, probabilities: { PUMP: 0.9 } } }));
    const p = new JevDecisionProvider({ transport: t.transport });
    await p.ask({ message: 'add a pump' }, question);
    await p.ask({ message: 'add a pump' }, question);
    assert.equal(t.calls.length, 1);
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

  it('records the heuristic baseline on the hard cases a model would have to beat', async () => {
    // Pinned so that improving the rules, or regressing them, is visible.
    // Change it deliberately, with the reason in the commit.
    const s = await scoreProvider(heuristicProvider);
    assert.equal(s.hardTotal, ROUTING_FIXTURES.filter((f) => f.hard).length);
    assert.equal(s.hardPassed, 1, `heuristic now passes ${s.hardPassed}/${s.hardTotal} hard cases`);
  });

  it('can score any provider, including one that is always right', async () => {
    // A transport that answers every fixture with its expected value: proves
    // the harness measures the provider, not itself.
    // Keyed by question AND message: the same phrasing is asked more than one
    // question ("add a surge tank" is both a creation request and a kind).
    const byKey = new Map(
      ROUTING_FIXTURES.map((f) => [`${ROUTING_QUESTIONS[f.question].instructions}|${String(f.state.message)}`, f])
    );
    const oracle: JevTransport = async (req) => {
      const q = req.questions.q!;
      const f = byKey.get(`${q.instructions}|${String((req.state as { message: string }).message)}`)!;
      const options = Object.keys((q.criteria as object) ?? {});
      if (q.type === 'noul') return { model: 'oracle', answers: { q: { type: 'noul', noul: f.expect === true ? 0.97 : 0.03 } } };
      const pick = f.expect === 'ask' ? options.slice(0, 2) : f.expect === 'nothing' ? options : [String(f.expect)];
      const probabilities = Object.fromEntries(options.map((o) => [o, pick.includes(o) ? 1 / pick.length : 0]));
      return {
        model: 'oracle',
        answers: { q: { type: 'choice', choice: pick[0]!, confidence: 1 / pick.length, probabilities } }
      };
    };
    const s = await scoreProvider(new JevDecisionProvider({ transport: oracle }));
    assert.equal(s.passed, s.total);
  });
});
