import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  getAssistantRoute,
  setAssistantRoute,
  claudeDesktopUnitOpPrompt,
  claudeDesktopFlowsheetPrompt
} from '../ai/assistantRoute.js';
import { saveLlmCredentials } from '../ai/aiModelManager.js';

const g = globalThis as unknown as { window?: any; localStorage?: any };

function storage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k)
  };
}

beforeEach(() => {
  const ls = storage();
  g.localStorage = ls;
  g.window = { localStorage: ls, dispatchEvent: () => true };
});
afterEach(() => {
  delete g.window;
  delete g.localStorage;
});

describe('Assistant route', () => {
  it('is "none" with no key and no choice', () => {
    assert.equal(getAssistantRoute(), 'none');
  });

  it('is "api-key" once a usable key exists, without being chosen', () => {
    saveLlmCredentials({ provider: 'claude', modelId: 'claude-opus-5-5', claudeApiKey: 'sk-test' });
    assert.equal(getAssistantRoute(), 'api-key');
  });

  it('never claims "api-key" without a key, even if it was chosen', () => {
    setAssistantRoute('api-key');
    assert.equal(getAssistantRoute(), 'none');
  });

  it('keeps Claude Desktop when chosen, key or not', () => {
    saveLlmCredentials({ provider: 'claude', modelId: 'claude-opus-5-5', claudeApiKey: 'sk-test' });
    setAssistantRoute('claude-desktop');
    assert.equal(getAssistantRoute(), 'claude-desktop');
  });
});

describe('Claude Desktop hand-offs', () => {
  it('the design brief names the real MCP tools, and asks for pasteable JSON', () => {
    const p = claudeDesktopUnitOpPrompt('a UV curing tunnel');
    assert.match(p, /a UV curing tunnel/);
    assert.match(p, /design_unit_op/);
    assert.match(p, /validate_unit_op/);
    assert.match(p, /ACCEPTED/);
  });

  it('the flowsheet hand-off carries the graph and names tools that exist', () => {
    const graph = { id: 'g', name: 'Line', version: '1', metadata: {}, nodes: [], edges: [] } as never;
    const p = claudeDesktopFlowsheetPrompt(graph, 'why is it starved?');
    assert.match(p, /why is it starved\?/);
    assert.match(p, /simulate_process_line/);
    assert.ok(p.includes('"name":"Line"'));
  });
});
