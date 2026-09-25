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
