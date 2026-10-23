import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The extension's updater (launcher.ts), run for real: the built launcher in
 * a folder of its own with a stand-in shipped server, against a local stand-in
 * for the GitHub release.
 */

const launcherJs = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'launcher.js');

// A server that answers initialize and tools/list, as the updater's probe needs.
const NEW_SERVER = `import readline from 'node:readline';
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === 1) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'new', version: '9.9.9' } } }) + '\\n');
  if (m.id === 2) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'x', inputSchema: { type: 'object' } }] } }) + '\\n');
});
`;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const remote = { version: '9.9.9', sha256: sha(NEW_SERVER), launcher: 1, build: 'v9.9.9' };

function stage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-launcher-'));
  const ext = path.join(dir, 'ext');
  const home = path.join(dir, 'home');
  fs.mkdirSync(ext);
  fs.copyFileSync(launcherJs, path.join(ext, 'index.mjs'));
  // The shipped server only has to stay up.
  fs.writeFileSync(path.join(ext, 'server.mjs'), 'process.stdin.resume();\n');
  fs.writeFileSync(path.join(ext, 'server.json'), JSON.stringify({ version: '0.1.0', sha256: sha('shipped') }));
  return { dir, ext, home };
}

/** A stand-in release. `hang` leaves the server download unanswered, like a connection Claude cut. */
async function release(opts: { hang?: boolean } = {}) {
  const asked: string[] = [];
  const server = http.createServer((req, res) => {
    asked.push(req.url ?? '');
    if (req.url?.endsWith('mcp-server.json')) res.end(JSON.stringify(remote));
    else if (req.url?.endsWith('mcp-server.mjs')) {
      if (!opts.hang) res.end(NEW_SERVER);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  return { url, asked, close: () => (server.closeAllConnections(), new Promise((r) => server.close(r))) };
}

function start(ext: string, home: string, url: string, env: Record<string, string> = {}): ChildProcess {
  return spawn(process.execPath, [path.join(ext, 'index.mjs')], {
    stdio: ['pipe', 'ignore', 'ignore'],
    env: { ...process.env, PROCESS_FORGE_MCP_HOME: home, PROCESS_FORGE_MCP_RELEASE_URL: url, PROCESS_FORGE_MCP_AUTO_UPDATE: '1', ...env }
  });
}

async function until(cond: () => boolean, ms: number) {
  for (let t = 0; t < ms && !cond(); t += 100) await new Promise((r) => setTimeout(r, 100));
  return cond();
}

describe('the extension updater', () => {
  it('does not count a check that was cut off, so the next start tries again', async () => {
    const { dir, ext, home } = stage();
    const rel = await release({ hang: true });
    const child = start(ext, home, rel.url);
    try {
      assert.ok(await until(() => rel.asked.some((u) => u.endsWith('mcp-server.mjs')), 15000), 'it starts downloading');
      child.kill();
      await new Promise((r) => child.once('exit', r));
      assert.ok(!fs.existsSync(path.join(home, 'last-check.json')), 'no stamp: the check did not finish');
      assert.ok(!fs.existsSync(path.join(home, 'current.json')));
    } finally {
      child.kill();
      await rel.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('downloads, test-starts and keeps a newer server, under its final name only once it works', async () => {
    const { dir, ext, home } = stage();
    const rel = await release();
    const child = start(ext, home, rel.url);
    try {
      assert.ok(await until(() => fs.existsSync(path.join(home, 'current.json')), 20000), 'kept the new server');
      assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'current.json'), 'utf8')).sha256, remote.sha256);
      assert.equal(fs.readFileSync(path.join(home, `server-${remote.sha256.slice(0, 16)}.mjs`), 'utf8'), NEW_SERVER);
      assert.ok(await until(() => fs.existsSync(path.join(home, 'last-check.json')), 2000), 'the check is counted');
      assert.deepEqual(fs.readdirSync(home).filter((f) => f.includes('.part')), [], 'no part file left');
    } finally {
      child.kill();
      await rel.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not download again what another session already fetched', async () => {
    const { dir, ext, home } = stage();
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'current.json'), JSON.stringify(remote));
    fs.writeFileSync(path.join(home, `server-${remote.sha256.slice(0, 16)}.mjs`), NEW_SERVER);
    const rel = await release({ hang: true });
    const child = start(ext, home, rel.url);
    try {
      assert.ok(await until(() => fs.existsSync(path.join(home, 'last-check.json')), 15000), 'checked');
      assert.ok(!rel.asked.some((u) => u.endsWith('mcp-server.mjs')), 'no second download');
    } finally {
      child.kill();
      await rel.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a newer server without a test start on a runtime that cannot spawn one (Claude's built-in Node)", async () => {
    const { dir, ext, home } = stage();
    const rel = await release();
    const child = start(ext, home, rel.url, { PROCESS_FORGE_MCP_TEST_START: '0' });
    try {
      assert.ok(await until(() => fs.existsSync(path.join(home, 'current.json')), 20000), 'kept the new server');
      assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'current.json'), 'utf8')).sha256, remote.sha256);
      // current.json is written before the download is logged.
      const log = () => fs.readFileSync(path.join(home, 'updater.log'), 'utf8');
      await until(() => /checksum verified; this runtime cannot test-start it/.test(log()), 5000);
      assert.match(log(), /checksum verified; this runtime cannot test-start it/);
    } finally {
      child.kill();
      await rel.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('puts aside a downloaded server that fails to load, runs the shipped one, and never fetches it again', async () => {
    const { dir, ext, home } = stage();
    const broken = 'this is not javascript 9.9.9 (((\n'.repeat(4);
    const bad = { ...remote, sha256: sha(broken) };
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'current.json'), JSON.stringify(bad));
    fs.writeFileSync(path.join(home, `server-${bad.sha256.slice(0, 16)}.mjs`), broken);
    const rel = await release();
    const child = start(ext, home, rel.url, { PROCESS_FORGE_MCP_TEST_START: '0' });
    try {
      assert.ok(await until(() => fs.existsSync(path.join(home, 'bad.json')), 15000), 'marked bad');
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, 'bad.json'), 'utf8')), [bad.sha256]);
      // bad.json is written before the shipped server starts and logs it.
      const log = () => fs.readFileSync(path.join(home, 'updater.log'), 'utf8');
      await until(() => /started 0\.1\.0 \(shipped/.test(log()), 15000);
      assert.match(log(), /started 0\.1\.0 \(shipped/);
    } finally {
      child.kill();
      await rel.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
