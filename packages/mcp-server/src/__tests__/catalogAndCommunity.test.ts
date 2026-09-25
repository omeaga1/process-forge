import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createDefaultProcessNode, ProcessNodeSchema } from '@process-forge/protocol';
import { bridgeFilePath } from '../tools/desktopBridge.js';
import { executeListStandardUnitOps, executeAddStandardUnitOp } from '../tools/standardUnitOps.js';
import { executeSearchCommunityUnitOps, executeAddCommunityUnitOp } from '../tools/communityLibrary.js';

describe('list_standard_unit_ops: the equipment that ships with ProcessForge', () => {
  it('lists every standard unit, and the four feed and outlet arrows, with ports and settings', () => {
    const r = executeListStandardUnitOps() as { units: any[] };
    const ids = r.units.map((u) => u.unit);
    for (const id of ['pump', 'surge-tank', 'batch-reactor', 'rotary-filler', 'labeler', 'palletizer', 'feed', 'product', 'byproduct', 'waste']) {
      assert.ok(ids.includes(id), `lists ${id}`);
    }
    const pump = r.units.find((u) => u.unit === 'pump');
    assert.equal(pump.parameters.designFlowRateGpm, 100);
    assert.deepEqual(pump.inlets.map((p: any) => p.carries), ['liquid']);
    const feed = r.units.find((u) => u.unit === 'feed');
    assert.equal(feed.inlets.length, 0);
    assert.equal(feed.outlets.length, 1);
    assert.match(feed.note, /supplyRate/);
  });

  it('filters by words', () => {
    const r = executeListStandardUnitOps({ query: 'waste' }) as { units: any[] };
    assert.deepEqual(r.units.map((u) => u.unit), ['waste']);
  });
});

describe('Placing standard and community units on the open flowsheet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-catalog-'));
  const saved = { APPDATA: process.env.APPDATA, XDG_DATA_HOME: process.env.XDG_DATA_HOME, API: process.env.PROCESS_FORGE_COMMUNITY_API_URL };
  const received: { url: string; body: any }[] = [];
  let server: http.Server;
  const listing = createDefaultProcessNode('ROTARY_FILLER', { name: 'Serac 10-Nozzle Filler' });

  before(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const parsed = body ? JSON.parse(body) : undefined;
        received.push({ url: req.url ?? '', body: parsed });
        if (req.url === '/v1/nodes') {
          const node = parsed.node;
          const ok = ProcessNodeSchema.safeParse(node).success;
          res.writeHead(200).end(JSON.stringify(ok ? { added: true, nodeId: node.id, name: node.name } : { added: false, error: 'bad node' }));
          return;
        }
        if (req.url === '/v1/streams') {
          res.writeHead(200).end(JSON.stringify({ added: true, from: { id: parsed.from }, to: { id: parsed.to }, carries: 'liquid' }));
          return;
        }
        if (req.url?.startsWith('/api/unitops?')) {
          res.writeHead(200).end(
            JSON.stringify({
              success: true,
              unitops: [{ id: 'plugin-serac', name: 'Serac 10-Nozzle Filler', author_name: 'OEM-Serac', category: 'PACKAGING', description: 'Filler', tags: 'filler,liquid', download_count: 3 }]
            })
          );
          return;
        }
        if (req.url === '/api/unitops/plugin-serac') {
          res.writeHead(200).end(JSON.stringify({ success: true, unitop: { id: 'plugin-serac', name: 'Serac 10-Nozzle Filler', author_name: 'OEM-Serac', bundle: listing } }));
          return;
        }
        res.writeHead(404).end(JSON.stringify({ error: 'unknown endpoint' }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    process.env.APPDATA = dir;
    process.env.XDG_DATA_HOME = dir;
    const port = (server.address() as { port: number }).port;
    process.env.PROCESS_FORGE_COMMUNITY_API_URL = `http://127.0.0.1:${port}/api`;
    const file = bridgeFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ protocol: 1, port, token: 't' }));
  });

  after(() => {
    server.close();
    process.env.APPDATA = saved.APPDATA;
    process.env.XDG_DATA_HOME = saved.XDG_DATA_HOME;
    if (saved.API === undefined) delete process.env.PROCESS_FORGE_COMMUNITY_API_URL;
    else process.env.PROCESS_FORGE_COMMUNITY_API_URL = saved.API;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('adds a feed arrow and pipes it into a unit in one call', async () => {
    const r = await executeAddStandardUnitOp({ unit: 'feed', material: 'Latex base', supplyRate: 30, connectTo: 'reactor-101' });
    assert.equal(r.success, true);
    const sent = received.find((x) => x.url === '/v1/nodes')!.body.node;
    assert.equal(sent.kind, 'TERMINAL');
    assert.equal(sent.config.role, 'feed');
    assert.equal(sent.config.material, 'Latex base');
    assert.equal(sent.config.supplyRate, 30);
    const stream = received.find((x) => x.url === '/v1/streams')!.body;
    assert.deepEqual([stream.from, stream.to], [sent.id, 'reactor-101']);
  });

  it('adds a standard pump with a changed setting, and reports settings it does not have', async () => {
    const r = await executeAddStandardUnitOp({ unit: 'Centrifugal Pump', parameters: { designFlowRateGpm: 80, wingspan: 3 } });
    assert.equal(r.success, true);
    const sent = received.filter((x) => x.url === '/v1/nodes').at(-1)!.body.node;
    assert.equal(sent.kind, 'PUMP');
    assert.equal(sent.config.designFlowRateGpm, 80);
    assert.deepEqual(r.ignoredParameters, ['wingspan']);
  });

  it('names the catalog when the unit is unknown', async () => {
    const r = await executeAddStandardUnitOp({ unit: 'flux capacitor' });
    assert.equal(r.success, false);
    assert.match(String(r.error), /pump, /);
  });

  it('searches the community library and places a listing as its author published it', async () => {
    const found = (await executeSearchCommunityUnitOps({ query: 'filler' })) as { units: any[]; note: string };
    assert.equal(found.units[0].id, 'plugin-serac');
    assert.match(found.note, /does not review or certify/);

    const r = await executeAddCommunityUnitOp({ id: 'plugin-serac', connectFrom: 'ST-200' });
    assert.equal(r.success, true);
    const sent = received.filter((x) => x.url === '/v1/nodes').at(-1)!.body;
    assert.equal(sent.source, 'community');
    assert.equal(sent.node.kind, 'ROTARY_FILLER');
    assert.notEqual(sent.node.id, listing.id, 'a fresh id, so a listing can be placed twice');
  });

  it('refuses a category the library does not have', async () => {
    const r = await executeSearchCommunityUnitOps({ category: 'rockets' });
    assert.equal(r.success, false);
  });
});
