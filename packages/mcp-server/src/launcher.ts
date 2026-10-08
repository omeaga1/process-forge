// Entry point of the Claude Desktop extension (.mcpb). It starts the newest
// ProcessForge MCP server this computer has, then quietly checks the latest
// GitHub release for a newer one, so the extension keeps itself up to date
// without reinstalling.
//
// - The extension ships a server (server.mjs, described by server.json).
// - Every desktop release attaches mcp-server.mjs and mcp-server.json (its
//   version and sha256). A newer server is downloaded, its sha256 checked,
//   test-started (it must answer initialize and list its tools), and only
//   then kept, in ~/.process-forge/mcp. It is used from the next start.
// - Anything that goes wrong falls back to the server the extension shipped.
// - PROCESS_FORGE_MCP_AUTO_UPDATE=0 runs the shipped server and never checks.
//
// stdout belongs to the MCP protocol: this file only ever logs to stderr.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Bumped only if the launcher/server handshake changes; a release that needs a newer launcher is skipped. */
export const LAUNCHER_PROTOCOL = 1;
const RELEASE = process.env.PROCESS_FORGE_MCP_RELEASE_URL ?? 'https://github.com/omeaga1/process-forge/releases/latest/download/';
const CHECK_EVERY_MS = 6 * 3600 * 1000;

interface ServerInfo {
  version: string;
  sha256: string;
  launcher?: number;
  build?: string;
}

const log = (msg: string): void => {
  process.stderr.write(`[process-forge updater] ${msg}\n`);
};
const here = path.dirname(fileURLToPath(import.meta.url));
const home = process.env.PROCESS_FORGE_MCP_HOME ?? path.join(os.homedir(), '.process-forge', 'mcp');
const autoUpdate = process.env.PROCESS_FORGE_MCP_AUTO_UPDATE !== '0';

const readJson = <T>(file: string): T | undefined => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
};
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

/** -1, 0 or 1, comparing dotted versions numerically. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

const shipped: { file: string; info: ServerInfo | undefined } = {
  file: path.join(here, 'server.mjs'),
  info: readJson<ServerInfo>(path.join(here, 'server.json'))
};

/** The downloaded server, if it is intact and at least as new as the shipped one. */
function downloaded(): { file: string; info: ServerInfo } | undefined {
  const info = readJson<ServerInfo>(path.join(home, 'current.json'));
  if (!info || !shipped.info) return undefined;
  if (info.sha256 === shipped.info.sha256) return undefined;
  if (compareVersions(info.version, shipped.info.version) < 0) return undefined; // a newer extension was installed since
  const file = path.join(home, `server-${info.sha256.slice(0, 16)}.mjs`);
  try {
    if (sha256(fs.readFileSync(file)) !== info.sha256) return undefined;
  } catch {
    return undefined;
  }
  return { file, info };
}

/** Starts a server file in a child process and checks it answers and lists tools. */
function probe(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, PROCESS_FORGE_MCP_AUTO_UPDATE: '0' }
    });
    let buf = '';
    const done = (ok: boolean) => {
      clearTimeout(timer);
      child.kill();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), 20000);
    child.on('error', () => done(false));
    child.on('exit', () => done(false));
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1) {
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
          } else if (msg.id === 2) done(Array.isArray(msg.result?.tools) && msg.result.tools.length > 0);
        } catch {
          done(false);
        }
      }
    });
    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'process-forge-updater', version: '1' } }
      }) + '\n'
    );
  });
}

async function checkForUpdate(running: ServerInfo | undefined): Promise<void> {
  const stampFile = path.join(home, 'last-check.json');
  const last = readJson<{ at: number }>(stampFile)?.at ?? 0;
  if (Date.now() - last < CHECK_EVERY_MS) return;
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(stampFile, JSON.stringify({ at: Date.now() }));

  const res = await fetch(RELEASE + 'mcp-server.json', { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return;
  const remote = (await res.json()) as ServerInfo;
  if (!remote?.sha256 || !remote.version) return;
  if ((remote.launcher ?? 1) > LAUNCHER_PROTOCOL) return log(`release ${remote.build ?? remote.version} needs a newer extension; reinstall it from the release page`);
  if (remote.sha256 === running?.sha256) return;
  if (shipped.info && compareVersions(remote.version, shipped.info.version) < 0) return;

  const bin = await fetch(RELEASE + 'mcp-server.mjs', { signal: AbortSignal.timeout(60000) });
  if (!bin.ok) return;
  const buf = Buffer.from(await bin.arrayBuffer());
  if (sha256(buf) !== remote.sha256) return log('downloaded server failed its checksum; kept the current one');

  const file = path.join(home, `server-${remote.sha256.slice(0, 16)}.mjs`);
  fs.writeFileSync(file, buf);
  if (!(await probe(file))) {
    fs.rmSync(file, { force: true });
    return log(`server ${remote.build ?? remote.version} did not start cleanly; kept the current one`);
  }
  fs.writeFileSync(path.join(home, 'current.json'), JSON.stringify(remote, null, 2));
  for (const f of fs.readdirSync(home)) {
    if (/^server-[0-9a-f]+\.mjs$/.test(f) && path.join(home, f) !== file && path.join(home, f) !== runningFile) {
      fs.rmSync(path.join(home, f), { force: true });
    }
  }
  log(`downloaded ProcessForge MCP ${remote.build ?? remote.version}; it is used the next time Claude starts`);
}

let runningFile = shipped.file;
let runningInfo = shipped.info;
const latest = autoUpdate ? downloaded() : undefined;
if (latest) {
  try {
    runningFile = latest.file;
    runningInfo = latest.info;
    await import(pathToFileURL(latest.file).href);
  } catch (error) {
    log(`downloaded server failed to load (${(error as Error).message}); using the one the extension shipped`);
    runningFile = shipped.file;
    runningInfo = shipped.info;
    await import(pathToFileURL(shipped.file).href);
  }
} else {
  await import(pathToFileURL(shipped.file).href);
}

if (autoUpdate) {
  // After the server is up, so a slow network never delays Claude.
  setTimeout(() => {
    checkForUpdate(runningInfo).catch((error) => log(`update check skipped: ${(error as Error).message}`));
  }, 5000).unref();
}
