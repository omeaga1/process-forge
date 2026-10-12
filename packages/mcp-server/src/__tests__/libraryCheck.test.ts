import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { callTool } from '../server.js';

/**
 * Before designing a unit, the brief checks the ProcessForge library for
 * units others have published that are like it, so the engineer can start
 * from one. Run against a stand-in for the library API.
 */

const LISTING = {
  id: 'pub-freeze-1',
  name: 'Coffee freeze concentrator',
  author_name: 'Alice',
  description: 'Scraped-surface freezer and wash column for coffee extract.',
  version: '1.2.0',
  engine_checked: 1,
  similarity: 0.67,
  matched: ['freeze', 'concentrator', 'coffee']
};

type Result = { structuredContent: Record<string, any> };

describe('design_unit_op checks the ProcessForge library first', () => {
  const asked: string[] = [];
  let server: http.Server;
  const saved = process.env.PROCESS_FORGE_COMMUNITY_API_URL;

  before(async () => {
    server = http.createServer((req, res) => {
      asked.push(req.url ?? '');
      const similar = new URL(req.url ?? '/', 'http://x').searchParams.get('similar') ?? '';
      res.setHeader('Content-Type', 'application/json');
      const hit = /freeze/.test(similar);
      res.end(JSON.stringify({ success: true, count: hit ? 2 : 0, unitops: hit ? [LISTING, { ...LISTING, id: 'weak', name: 'Weak match', similarity: 0.1 }] : [] }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    process.env.PROCESS_FORGE_COMMUNITY_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  after(() => {
    server.close();
    if (saved === undefined) delete process.env.PROCESS_FORGE_COMMUNITY_API_URL;
    else process.env.PROCESS_FORGE_COMMUNITY_API_URL = saved;
  });

  it('offers units like it, by name and author, before anything is designed', async () => {
    const r = (await callTool('design_unit_op', { description: 'freeze concentrator for cold brew coffee' })) as Result;
    const lib = r.structuredContent.fromTheLibrary;
    assert.ok(asked.some((u) => u.includes('similar=freeze')), 'it asked the library with the description');
    assert.equal(lib.checked, true);
    assert.deepEqual(lib.matches.map((m: any) => [m.id, m.author, m.engineChecked]), [['pub-freeze-1', 'Alice', true]], 'weak matches are left out');
    assert.match(lib.instruction, /add_community_unit_op/);
    assert.match(r.structuredContent.nextStep, /^First, offer the engineer the units in fromTheLibrary/);
  });

  it('says nobody has published one yet, and to offer publishing it', async () => {
    const r = (await callTool('design_unit_op', { description: 'a peristaltic dosing skid for enzymes' })) as Result;
    assert.deepEqual(r.structuredContent.fromTheLibrary.matches, []);
    assert.match(r.structuredContent.fromTheLibrary.instruction, /publish_unit_op/);
    assert.doesNotMatch(r.structuredContent.nextStep, /fromTheLibrary/);
  });

  it('goes ahead with the design when the library cannot be reached', async () => {
    process.env.PROCESS_FORGE_COMMUNITY_API_URL = 'http://127.0.0.1:9/api';
    const r = (await callTool('design_unit_op', { description: 'freeze concentrator' })) as Result;
    assert.equal(r.structuredContent.success, true);
    assert.equal(r.structuredContent.fromTheLibrary.checked, false);
  });

  it('search_community_unit_ops takes a description too', async () => {
    process.env.PROCESS_FORGE_COMMUNITY_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const r = (await callTool('search_community_unit_ops', { similarTo: 'freeze concentrator' })) as Result;
    assert.equal(r.structuredContent.units[0].similarity, 0.67);
    assert.deepEqual(r.structuredContent.units[0].sharedWords, ['freeze', 'concentrator', 'coffee']);
  });
});
