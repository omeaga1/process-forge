/**
 * The dispatcher asks when a creation request is ambiguous ("add a reactor
 * with a feed pump" names two kinds), and a question about adding equipment
 * is not treated as a request to add it. See plan 0001 sections 2.2 and 2.4.
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseUnitOpToolCall } from '../ai/aiDispatch.js';

describe('Ambiguous creation requests become a question', () => {
  it('FAILED IN THE LADDER — "add a reactor with a feed pump" asks instead of picking PUMP', async () => {
    const r = await parseUnitOpToolCall('', 'add a reactor with a feed pump');

    assert.equal(r.createdNode, undefined, 'must not guess a node when two kinds are named');
    assert.ok(r.clarification, 'should ask which one');
    const kinds = r.clarification.options.map((o) => o.kind).sort();
    assert.deepEqual(kinds, ['BATCH_REACTOR', 'PUMP']);
    assert.match(r.clarification.question, /a pump/);
    assert.match(r.clarification.question, /a batch reactor/);
  });

  it('carries the requested flow rate through to whichever option is chosen', async () => {
    const r = await parseUnitOpToolCall('', 'add a surge tank and a pump at 120 gpm');
    assert.ok(r.clarification);
    assert.equal(r.clarification.flowRateGpm, 120);
  });

  it('gives every option a real default name to create with', async () => {
    const r = await parseUnitOpToolCall('', 'add a reactor with a feed pump');
    for (const o of r.clarification!.options) {
      assert.ok(o.name.length > 0 && !o.name.includes('_'), `bad default name "${o.name}"`);
    }
  });
});

describe('Unambiguous requests still create directly', () => {
  const cases: [string, string][] = [
    ['add a centrifugal pump', 'PUMP'],
    ['add a jacketed reactor', 'BATCH_REACTOR'],
    ['add a surge tank', 'SURGE_TANK'],
    ['add a heat exchanger', 'HEAT_EXCHANGER'],
    ['add a flash drum separator', 'SEPARATOR'],
    ['add a rotary filler', 'ROTARY_FILLER'],
    ['add an accumulation conveyor', 'CONVEYOR'],
    // The ladder covered these four; a narrower question would have regressed them.
    ['add a labeler', 'LABELER'],
    ['add a palletizer', 'PALLETIZER']
  ];
  for (const [message, kind] of cases) {
    it(`"${message}" -> ${kind}`, async () => {
      const r = await parseUnitOpToolCall('', message);
      assert.equal(r.clarification, undefined, 'should not ask when only one kind is named');
      assert.ok(r.createdNode, 'should create');
      assert.equal(r.createdNode.kind, kind);
    });
  }
});

describe('Non-requests do nothing', () => {
  it('FAILED IN THE LADDER — a question about adding is not a request to add', async () => {
    const r = await parseUnitOpToolCall('', 'how do I add a surge tank?');
    assert.equal(r.createdNode, undefined);
    assert.equal(r.clarification, undefined);
  });

  it('"make the pump bigger" does not create a pump', async () => {
    // The ladder matched a bare 'make'.
    const r = await parseUnitOpToolCall('', 'make the pump bigger');
    assert.equal(r.createdNode, undefined);
  });

  it('no kind signal means no question either — asking to pick one of nine is useless', async () => {
    const r = await parseUnitOpToolCall('', 'add a widget');
    assert.equal(r.createdNode, undefined);
    assert.equal(
      r.clarification,
      undefined,
      'a uniform distribution is "no idea", not "which of these"'
    );
  });
});

describe("The model's reply is a fallback, not an override", () => {
  it('uses the reply when the engineer named no kind but the model confirmed an add', async () => {
    const r = await parseUnitOpToolCall(
      '### Flowsheet Update Summary\n**Unit Operation Added:** Centrifugal Pump (`P-003`)',
      'something to move this fluid, 80 gpm'
    );
    assert.ok(r.createdNode);
    assert.equal(r.createdNode.kind, 'PUMP');
  });

  it("does not let the reply outvote the engineer's own words", async () => {
    // The engineer asked for a reactor; the model's chatter mentions a pump.
    const r = await parseUnitOpToolCall(
      'Unit Operation Added. It will be fed by the existing transfer pump upstream.',
      'add a jacketed reactor'
    );
    assert.ok(r.createdNode);
    assert.equal(r.createdNode.kind, 'BATCH_REACTOR');
  });
});

describe('Explicit tool calls are unaffected', () => {
  it('a model that names the kind explicitly is taken at its word', async () => {
    const r = await parseUnitOpToolCall(
      'Done.\n```json:tool_call\n{"action":"ADD_UNIT_OP","kind":"PUMP","name":"P-9"}\n```',
      'add a reactor with a feed pump'
    );
    // The engineer's message is ambiguous, but the model resolved it and said
    // so in a structured call. That is exactly the resolution we want.
    assert.equal(r.clarification, undefined);
    assert.equal(r.createdNode?.kind, 'PUMP');
    assert.equal(r.createdNode?.name, 'P-9');
  });
});
