import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DESIGN_QUESTIONS, EVAPORATOR_CONTRACT, createStandardUnitOp, findStandardUnitOp, type ProcessGraph } from '@process-forge/protocol';
import { JevOpenRouterProvider, JEV_MODEL, type JevFetch } from '../ai/agent/jevProvider.js';
import { runAgent } from '../ai/agent/agentLoop.js';

/** What Jev might answer for an evaporator: everything as the documented shapes. */
const evaporatorAnswers = {
  mode: { choice: 'CONTINUOUS_RATE', confidence: 0.93, probabilities: { CONTINUOUS_RATE: 0.93, BATCH: 0.05, DISCRETE_CYCLE: 0.02 } },
  energyBalance: { noul: 0.97 },
  phaseChange: { noul: 0.95 },
  changesComposition: { noul: 0.9 },
  reaction: { noul: 0.04 },
  splitsStream: { noul: 0.92 },
  usesUtility: { noul: 0.88 },
  solidLeaves: { noul: 0.1 },
  gasLeaves: { noul: 0.96 },
  handlesItems: { noul: 0.02 }
};

function fakeOpenRouter(reply: (body: any) => { status?: number; content?: unknown }) {
  const calls: any[] = [];
  const fetcher: JevFetch = async (body) => {
    calls.push(body);
    const r = reply(body);
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => ({ choices: [{ message: { content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content) } }] }) };
  };
  return { calls, fetcher };
}

describe('Jev through OpenRouter', () => {
  it('sends the design questions as response_format questions, and reads calibrated answers back', async () => {
    const { calls, fetcher } = fakeOpenRouter(() => ({ content: evaporatorAnswers }));
    const jev = new JevOpenRouterProvider('sk-test', { fetcher });
    const a = await jev.ask({ message: 'Single-effect evaporator' }, DESIGN_QUESTIONS);
    assert.strictEqual(jev.lastSource.by, 'jev');
    assert.strictEqual(calls[0].model, JEV_MODEL);
    assert.strictEqual(calls[0].response_format.type, 'questions');
    assert.deepStrictEqual(Object.keys(calls[0].response_format.questions).sort(), Object.keys(DESIGN_QUESTIONS).sort());
    assert.strictEqual(calls[0].response_format.questions.energyBalance.heuristic, undefined, 'the offline rules are not sent');
    assert.strictEqual(a.mode.value, 'CONTINUOUS_RATE');
    assert.strictEqual(a.energyBalance.value, 0.97);
    await jev.ask({ message: 'Single-effect evaporator' }, DESIGN_QUESTIONS);
    assert.strictEqual(calls.length, 1, 'the same description is asked once');
  });

  it('falls back to the offline rules, and says why, when Jev fails or answers off the question', async () => {
    const broke = new JevOpenRouterProvider('sk', { fetcher: fakeOpenRouter(() => ({ status: 402 })).fetcher });
    await broke.ask({ message: 'dryer' }, DESIGN_QUESTIONS);
    assert.deepStrictEqual(broke.lastSource, { by: 'offline', reason: 'Jev returned HTTP 402' });

    const odd = new JevOpenRouterProvider('sk', { fetcher: fakeOpenRouter(() => ({ content: { ...evaporatorAnswers, mode: { choice: 'SOMETIMES', confidence: 0.9 } } })).fetcher });
    const a = await odd.ask({ message: 'dryer' }, DESIGN_QUESTIONS);
    assert.strictEqual(odd.lastSource.by, 'offline');
    assert.match(String(odd.lastSource.reason), /mode/);
    assert.ok(['CONTINUOUS_RATE', 'BATCH', 'DISCRETE_CYCLE'].includes(a.mode.value), 'still answered, offline');

    const text = new JevOpenRouterProvider('sk', { fetcher: fakeOpenRouter(() => ({ content: 'I think it is continuous.' })).fetcher });
    await text.ask({ message: 'dryer' }, DESIGN_QUESTIONS);
    assert.match(String(text.lastSource.reason), /not JSON/);
  });

  it("puts Jev's checklist in the design brief and its completeness warnings on the engine's verdict", async () => {
    const jev = new JevOpenRouterProvider('sk', { fetcher: fakeOpenRouter(() => ({ content: evaporatorAnswers })).fetcher });
    const graph = { id: 'g', name: 'L', version: '1', metadata: {}, nodes: [{ ...createStandardUnitOp(findStandardUnitOp('feed')!), id: 'juice', name: 'Juice' }], edges: [] } as unknown as ProcessGraph;
    const host = { getGraph: () => graph, commit: () => {} };
    // No duty and no stated phases: consistent as far as the engine can check
    // (stating the evaporation without a heat source is itself rejected).
    const noHeat = {
      ...EVAPORATOR_CONTRACT,
      ports: EVAPORATOR_CONTRACT.ports.map(({ phase: _p, dispersed: _d, ...p }) => p),
      phaseChanges: undefined,
      behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm' },
      outlets: [{ port: 'vapour', share: 'vapourShare' }, { port: 'concentrate' }]
    };
    const seen: any[] = [];
    let step = 0;
    await runAgent({
      creds: { provider: 'openrouter', modelId: 'm' },
      history: [{ role: 'user', content: 'design an evaporator' }],
      host,
      decider: jev,
      onEvent: () => {},
      approve: async () => true,
      complete: async (m) => {
        if (step > 0) seen.push(JSON.parse((m.at(-1) as { content: string }).content));
        step++;
        if (step === 1) return { content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'design_unit_op', arguments: JSON.stringify({ description: 'single-effect evaporator on steam' }) } }] };
        if (step === 2) return { content: null, tool_calls: [{ id: '2', type: 'function', function: { name: 'validate_unit_op', arguments: JSON.stringify({ contract: noHeat }) } }] };
        return { content: 'done' };
      }
    });
    const [brief, verdict] = seen;
    assert.strictEqual(brief.designChecklist.decidedBy, 'Jev (decision model)');
    assert.ok(brief.designChecklist.include.some((c: string) => c.startsWith('An energy balance')));
    assert.strictEqual(verdict.verdict, 'ACCEPTED', 'consistent, so the engine accepts it');
    assert.ok(verdict.completeness.warnings.some((w: { id: string }) => w.id === 'energy-duty'), 'but Jev says it is missing its energy balance');
  });
});
