import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { WAX_COOLING_BELT_CONTRACT, UNIT_OP_AUTHORING_RULES } from '@process-forge/protocol';
import {
  authorUnitOpContract,
  extractJsonObject,
  unitOpAuthoringSystemPrompt,
  type CallModel
} from '../ai/unitOpAuthor.js';
import type { LlmChatMessage, LlmCredentials } from '../ai/llmClient.js';

const creds: LlmCredentials = { provider: 'claude', modelId: 'claude-opus-5-5', claudeApiKey: 'sk-test' };

/** A stand-in for Claude that replies from a script and records what it saw. */
function scripted(replies: string[]) {
  const seen: LlmChatMessage[][] = [];
  const call: CallModel = async (_creds, messages, _system, options) => {
    seen.push(messages.map((m) => ({ ...m })));
    assert.ok((options?.maxTokens ?? 0) >= 8192, 'a contract needs more than a chat reply\'s token budget');
    return { text: replies[seen.length - 1] ?? replies[replies.length - 1]!, model: 'claude-opus-5-5', latencyMs: 1 };
  };
  return { call, seen };
}

const valid = JSON.stringify(WAX_COOLING_BELT_CONTRACT);
// The reference belt run too slowly: the layer is too thick to conduct its heat
// out in the time it spends on the belt, so an ERROR constraint fails.
const tooSlow = JSON.stringify({
  ...WAX_COOLING_BELT_CONTRACT,
  parameters: WAX_COOLING_BELT_CONTRACT.parameters.map((p) =>
    p.name === 'beltSpeedMPerMin' ? { ...p, value: 2.5 } : p
  )
});

describe('In-app unit-op author', () => {
  it('accepts a valid contract in one round', async () => {
    const { call } = scripted([valid]);
    const r = await authorUnitOpContract('a wax cooling belt', { creds, call });
    assert.equal(r.accepted, true);
    assert.equal(r.rounds.length, 1);
    assert.equal(r.review?.verdict, 'ACCEPTED');
  });

  it('sends the engine\'s own reasons back to Claude, and accepts the fix', async () => {
    const { call, seen } = scripted([tooSlow, valid]);
    const notes: string[] = [];
    const r = await authorUnitOpContract('a wax cooling belt', { creds, call, onRound: (x) => notes.push(x.verdict) });
    assert.equal(r.accepted, true);
    assert.deepEqual(notes, ['REJECTED', 'ACCEPTED']);
    // Round two's conversation ends with the engine's verdict, verbatim.
    const lastUser = seen[1]!.at(-1)!;
    assert.equal(lastUser.role, 'user');
    assert.match(lastUser.content, /not physically valid/);
  });

  it('does not take Claude\'s word for it: an invalid draft is never "accepted"', async () => {
    const { call } = scripted([tooSlow]);
    const r = await authorUnitOpContract('x', { creds, call, maxRounds: 2 });
    assert.equal(r.accepted, false);
    assert.equal(r.rounds.length, 2);
    assert.equal(r.review?.verdict, 'REJECTED');
    assert.ok(r.draft, 'the last draft comes back so the engineer can see what fails');
  });

  it('asks again when the reply is not JSON at all', async () => {
    const { call } = scripted(['Sure! Here is a great design for you.', valid]);
    const r = await authorUnitOpContract('x', { creds, call });
    assert.equal(r.rounds[0]!.verdict, 'NOT_JSON');
    assert.equal(r.accepted, true);
  });

  it('reads a contract wrapped in a code fence or a stray sentence', () => {
    assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(extractJsonObject('Here it is: {"a":1} hope that helps'), { a: 1 });
    assert.throws(() => extractJsonObject('no json here'));
  });

  it('gives Claude the same rules the MCP tool does', () => {
    const prompt = unitOpAuthoringSystemPrompt();
    for (const rule of UNIT_OP_AUTHORING_RULES) assert.ok(prompt.includes(rule));
    assert.ok(prompt.includes(WAX_COOLING_BELT_CONTRACT.id), 'includes the worked example');
  });
});
