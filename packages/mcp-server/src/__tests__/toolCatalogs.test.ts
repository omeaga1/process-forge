import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOOLS } from '../server.js';

/**
 * Every place that lists the server's tools by hand lists all of them: the
 * README's table and the website's tool catalog. A tool shipped without them
 * is a tool nobody finds.
 */
const repo = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));

describe('the tool lists people read', () => {
  const names = TOOLS.map((t) => t.name);

  it('the README has a row for every tool', () => {
    const readme = readFileSync(repo('packages/mcp-server/README.md'), 'utf8');
    const missing = names.filter((n) => !readme.includes(`| \`${n}\` |`));
    assert.deepEqual(missing, []);
  });

  it('the website lists every tool, and no tool the server does not have', () => {
    const ui = readFileSync(repo('apps/web/src/landing/ui.tsx'), 'utf8');
    const block = ui.slice(ui.indexOf('export const MCP_TOOLS'), ui.indexOf('export const MCP_TOOL_COUNT'));
    const listed = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).filter((n) => n.includes('_'));
    assert.deepEqual(names.filter((n) => !listed.includes(n)), [], 'tools missing from the website');
    assert.deepEqual(listed.filter((n) => !names.includes(n)), [], 'the website lists tools the server does not have');
  });
});
