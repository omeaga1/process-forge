import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toolResult } from '../server.js';

describe('a tool result with an image', () => {
  it('sends the image as an image, and keeps base64 out of the text', () => {
    const r = toolResult({ success: true, report: { quality: 90 }, image: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } });
    assert.equal(r.content.length, 2);
    assert.deepEqual(r.content[1], { type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' });
    assert.doesNotMatch(r.content[0]!.text as string, /iVBORw0KGgo/);
    assert.equal((r.structuredContent as Record<string, unknown>).image, undefined);
  });

  it('leaves a result without one as text', () => {
    assert.equal(toolResult({ success: true }).content.length, 1);
  });
});
