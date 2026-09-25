import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateProcessGraph } from '@process-forge/protocol';
import { buildDemoLine, findConstraint, runDemo, DEMO_DEFAULTS } from '../landing/demoLine.js';

describe('Landing page: the live line example', () => {
  it('builds a valid line for every setting the sliders allow', () => {
    for (const reactors of [1, 4]) {
      const g = buildDemoLine({ ...DEMO_DEFAULTS, reactors });
      assert.equal(validateProcessGraph(g).valid, true);
      assert.equal(g.nodes.filter((n) => n.kind === 'BATCH_REACTOR').length, reactors);
    }
  });

  it('one reactor limits the line; with four, the labeler does', () => {
    const one = runDemo(DEMO_DEFAULTS);
    assert.equal(findConstraint(DEMO_DEFAULTS, one).stage, 'reactors');
    const four = { ...DEMO_DEFAULTS, reactors: 4 };
    const run = runDemo(four);
    assert.ok(run.rate > one.rate * 2.5, `four reactors: ${run.rate} vs ${one.rate}`);
    assert.equal(findConstraint(four, run).stage, 'labeler');
  });
});

describe('Landing page: playing the shift back', () => {
  it('has a frame for every minute, and the product count only goes up to the total', () => {
    const run = runDemo(DEMO_DEFAULTS);
    assert.equal(run.frames.length, 480);
    const made = run.frames.map((f) => f['out']?.made ?? 0);
    for (let i = 1; i < made.length; i++) assert.ok(made[i]! >= made[i - 1]!, 'never goes down');
    assert.ok(made.at(-1)! <= run.total && made.at(-1)! > run.total * 0.95, `ends near the total: ${made.at(-1)} of ${run.total}`);
    assert.ok(run.frames.some((f) => f['r1']?.phase === 'REACTING'), 'the reactor is seen reacting');
    assert.ok(run.frames.some((f) => (f['tank']?.level ?? 0) > 0.05), 'the tank is seen filling');
  });
});
