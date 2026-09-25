/**
 * add_unit_op_to_flowsheet and get_open_flowsheet, against a stand-in for the
 * desktop app's bridge (same file, same endpoints, same token check).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { WAX_COOLING_BELT_CONTRACT } from '@process-forge/protocol';
import { bridgeFilePath, executeAddUnitOpToFlowsheet, executeFlowsheetEdit, executeGetOpenFlowsheet, executeRequestPublish } from '../tools/desktopBridge.js';

describe('Where the desktop app writes its bridge file', () => {
  it('is Tauri’s app data directory for com.processforge.studio', () => {
    assert.equal(
      bridgeFilePath({ APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'win32'),
      path.join('C:\\Users\\a\\AppData\\Roaming', 'com.processforge.studio', 'mcp-bridge.json')
    );
    assert.equal(
      bridgeFilePath({ XDG_DATA_HOME: '/home/a/.data' }, 'linux'),
      path.join('/home/a/.data', 'com.processforge.studio', 'mcp-bridge.json')
    );
    assert.ok(bridgeFilePath({}, 'darwin').endsWith(path.join('Library', 'Application Support', 'com.processforge.studio', 'mcp-bridge.json')));
  });
});

describe('Talking to the desktop app', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-bridge-'));
  const saved = { APPDATA: process.env.APPDATA, XDG_DATA_HOME: process.env.XDG_DATA_HOME, HOME: process.env.HOME };
  const received: { auth?: string; body: any }[] = [];
  let server: http.Server;
  /** False: behave like a desktop app from before the edit route. */
  let editsSupported = true;

  const point = () => {
    // Point every platform's lookup at the temp dir.
    process.env.APPDATA = dir;
    process.env.XDG_DATA_HOME = dir;
  };

  before(async () => {
    point();
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ auth: req.headers.authorization, body: body ? JSON.parse(body) : undefined });
        if (req.headers.authorization !== 'Bearer t0ken') {
          res.writeHead(401).end(JSON.stringify({ error: 'missing or wrong bridge token' }));
          return;
        }
        if (req.method === 'GET' && req.url === '/v1/flowsheet') {
          res.writeHead(200).end(JSON.stringify({ projectName: 'Salt plant', graph: { nodes: [], edges: [] } }));
          return;
        }
        if (req.method === 'POST' && req.url === '/v1/unit-ops') {
          res.writeHead(200).end(JSON.stringify({ added: true, nodeId: 'unitop-1', name: JSON.parse(body).contract.name }));
          return;
        }
        if (req.method === 'POST' && req.url === '/v1/publish' && editsSupported) {
          res.writeHead(200).end(JSON.stringify({ requested: true, published: false, message: 'The publish dialog is open.' }));
          return;
        }
        if (req.method === 'POST' && req.url === '/v1/edits' && editsSupported) {
          res.writeHead(200).end(JSON.stringify({ changed: true, message: `Did ${JSON.parse(body).op}.` }));
          return;
        }
        res.writeHead(404).end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  });

  after(() => {
    server.close();
    Object.assign(process.env, saved);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const writeBridge = (token: string) => {
    const file = bridgeFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ protocol: 1, port: (server.address() as { port: number }).port, token }));
  };

  it('says plainly when the desktop app is not running', async () => {
    point();
    fs.rmSync(bridgeFilePath(), { force: true });
    const r = await executeAddUnitOpToFlowsheet({ contract: WAX_COOLING_BELT_CONTRACT });
    assert.equal(r.success, false);
    assert.match(String(r.error), /not running/);
  });

  it('does not send a rejected contract, and returns the reasons instead', async () => {
    point();
    writeBridge('t0ken');
    const before = received.length;
    const bad = JSON.parse(JSON.stringify(WAX_COOLING_BELT_CONTRACT));
    bad.drawing.nozzles = [];
    const r = await executeAddUnitOpToFlowsheet({ contract: bad });
    assert.equal(r.verdict, 'REJECTED');
    assert.equal(r.added, false);
    assert.equal(received.length, before, 'nothing reached the app');
  });

  it('sends an accepted contract with the token and reports what the app did', async () => {
    point();
    writeBridge('t0ken');
    const r = await executeAddUnitOpToFlowsheet({ contract: WAX_COOLING_BELT_CONTRACT });
    assert.equal(r.success, true);
    assert.equal(r.nodeId, 'unitop-1');
    const last = received.at(-1)!;
    assert.equal(last.auth, 'Bearer t0ken');
    assert.equal(last.body.contract.id, WAX_COOLING_BELT_CONTRACT.id);
  });

  it('reads the open flowsheet', async () => {
    point();
    writeBridge('t0ken');
    const r = await executeGetOpenFlowsheet();
    assert.equal(r.success, true);
    assert.equal((r.flowsheet as { projectName: string }).projectName, 'Salt plant');
  });

  it('sends an edit and reports what the app did', async () => {
    point();
    writeBridge('t0ken');
    editsSupported = true;
    const r = await executeFlowsheetEdit({ op: 'update-unit', unit: 'P-102', parameters: { designFlowRateGpm: 80 } });
    assert.equal(r.success, true);
    assert.equal(r.message, 'Did update-unit.');
    assert.deepEqual(received.at(-1)!.body, { op: 'update-unit', unit: 'P-102', parameters: { designFlowRateGpm: 80 } });
  });

  it('says to update an app too old to take edits', async () => {
    point();
    writeBridge('t0ken');
    editsSupported = false;
    const r = await executeFlowsheetEdit({ op: 'remove-unit', unit: 'P-102' });
    editsSupported = true;
    assert.equal(r.success, false);
    assert.match(String(r.error), /0\.1\.33 or later/);
  });

  it('asks the app to open its publish dialog, and publishes nothing itself', async () => {
    point();
    writeBridge('t0ken');
    editsSupported = true;
    const r = await executeRequestPublish({ unit: 'E-301', description: 'An evaporator', tags: ['evaporator'] });
    assert.equal(r.success, true);
    assert.equal(r.published, false);
    assert.deepEqual(received.at(-1)!.body, { unit: 'E-301', description: 'An evaporator', tags: ['evaporator'] });
    editsSupported = false;
    const old = await executeRequestPublish({ unit: 'E-301' });
    editsSupported = true;
    assert.match(String(old.error), /0\.1\.39 or later/);
    assert.equal((await executeRequestPublish({ unit: '' })).success, false);
  });

  it('reports a wrong token from a stale file instead of pretending it worked', async () => {
    point();
    writeBridge('old-token');
    const r = await executeGetOpenFlowsheet();
    assert.equal(r.success, false);
    assert.match(String(r.error), /token/);
  });
});
