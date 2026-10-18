// Entry point of the Claude Desktop extension (.mcpb). It starts the newest
// ProcessForge MCP server this computer has, then quietly checks the latest
// GitHub release for a newer one, so the extension keeps itself up to date
// without reinstalling.
//
// - The extension ships a server (server.mjs, described by server.json).
// - Every desktop release attaches mcp-server.mjs and mcp-server.json (its
//   version and sha256). A newer server is downloaded, its sha256 checked,
//   test-started where this runtime can start one (it must answer initialize
//   and list its tools), and only then kept, in ~/.process-forge/mcp. It is
//   used from the next start.
// - Claude Desktop's built-in Node cannot start a subprocess, so there the
//   sha256 and the release's metadata are the check, and the first start is
//   the test: a downloaded server that fails to load is put aside (bad.json),
//   the shipped one runs instead, and that release is not downloaded again.
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
// A check is one small request; hourly keeps a fresh release from waiting the better part of a day.
const CHECK_EVERY_MS = 3600 * 1000;

interface ServerInfo {
  version: string;
  sha256: string;
  launcher?: number;
  build?: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const home = process.env.PROCESS_FORGE_MCP_HOME ?? path.join(os.homedir(), '.process-forge', 'mcp');

/**
 * Every decision goes to stderr and to updater.log in the updater's folder.
 * Claude keeps an extension's stderr only in some hosts, and an updater that
 * quietly keeps an old server is exactly the failure that needs a record
 * (0.18 stayed in place for four releases in Oct 2026 and nothing said why).
 */
const log = (msg: string): void => {
  process.stderr.write(`[process-forge updater] ${msg}\n`);
  try {
    fs.mkdirSync(home, { recursive: true });
    const file = path.join(home, 'updater.log');
    // Kept short: the last few hundred lines are all anyone reads.
    if (fs.existsSync(file) && fs.statSync(file).size > 64 * 1024) fs.renameSync(file, `${file}.1`);
    fs.appendFileSync(file, `${new Date().toISOString()} [${process.pid}] ${msg}\n`);
  } catch {
    // The log is a convenience; the updater works without it.
  }
};

/**
 * The environment for a server this one starts. Claude can run extensions on
 * its own built-in runtime, where process.execPath is Claude's program, not
 * node: it runs as node only when told to.
 */
const childEnv = (extra: Record<string, string>): NodeJS.ProcessEnv => ({
  ...process.env,
  ...(/^node(\.exe)?$/i.test(path.basename(process.execPath)) ? {} : { ELECTRON_RUN_AS_NODE: '1' }),
  ...extra
});
/**
 * Whether this runtime can test-start a server in a child process. Claude's
 * built-in Node (process.execPath is Claude.exe) refuses to spawn node at all,
 * so on it the updater never tries. PROCESS_FORGE_MCP_TEST_START=0 forces that
 * path (tests), =1 forces the test start.
 */
const canTestStart = (): boolean => {
  const forced = process.env.PROCESS_FORGE_MCP_TEST_START;
  if (forced === '0' || forced === '1') return forced === '1';
  return /^node(\.exe)?$/i.test(path.basename(process.execPath));
};
const autoUpdate = process.env.PROCESS_FORGE_MCP_AUTO_UPDATE !== '0';

const readJson = <T>(file: string): T | undefined => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
};
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

/** Servers that failed to load here, by sha256: never downloaded or started again. */
const badFile = () => path.join(home, 'bad.json');
const badServers = (): string[] => readJson<string[]>(badFile()) ?? [];
function markBad(sha: string): void {
  try {
    fs.writeFileSync(badFile(), JSON.stringify([...new Set([...badServers(), sha])].slice(-20)));
    // Back to the shipped server until a newer release comes.
    fs.rmSync(path.join(home, 'current.json'), { force: true });
  } catch {
    // Worst case it is tried again next start, and falls back again.
  }
}

/**
 * The checks that need no subprocess: the release's description is complete and
 * the file it downloaded names the version it claims to
 * be (a mismatched upload fails here). The sha256 is checked by the caller.
 */
export function looksLikeServer(buf: Buffer, info: { version: string }): boolean {
  if (buf.length < 64) return false;
  return buf.toString('utf8').includes(info.version);
}

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
  if (badServers().includes(info.sha256)) return undefined;
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
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv({ PROCESS_FORGE_MCP_AUTO_UPDATE: '0' })
    });
    let buf = '';
    // What it said on its way down, for the log when it fails.
    let errText = '';
    child.stderr.on('data', (d) => {
      errText = (errText + d).slice(-600);
    });
    let settled = false;
    const done = (ok: boolean, why = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (!ok) log(`test start of ${path.basename(file)} failed (${why}) with ${process.execPath}${errText.trim() ? `: ${errText.trim().split('\n').slice(-3).join(' | ')}` : ''}`);
      resolve(ok);
    };
    const timer = setTimeout(() => done(false, 'no answer in 20 s'), 20000);
    child.on('error', (e) => done(false, e.message));
    child.on('exit', (code) => done(false, `exited with ${code}`));
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
          } else if (msg.id === 2) done(Array.isArray(msg.result?.tools) && msg.result.tools.length > 0, 'listed no tools');
        } catch {
          done(false, 'wrote something that is not MCP');
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

  const res = await fetch(RELEASE + 'mcp-server.json', { signal: AbortSignal.timeout(15000) });
  // Not there yet (a release still uploading its files, or offline): try again next start, not in an hour.
  if (!res.ok) return;
  const remote = (await res.json()) as ServerInfo;
  if (!remote?.sha256 || !remote.version) return;
  // The check counts only once it has an answer. A check cut off part way
  // (Claude closing or restarting the server mid-download, which it does
  // often) leaves no stamp, so the next start tries again, not an hour later.
  const checked = () => fs.writeFileSync(stampFile, JSON.stringify({ at: Date.now() }));
  if ((remote.launcher ?? 1) > LAUNCHER_PROTOCOL) {
    checked();
    return log(`release ${remote.build ?? remote.version} needs a newer extension; reinstall it from the release page`);
  }
  if (remote.sha256 === running?.sha256) return checked();
  if (badServers().includes(remote.sha256)) return checked();
  if (shipped.info && compareVersions(remote.version, shipped.info.version) < 0) return checked();
  const file = path.join(home, `server-${remote.sha256.slice(0, 16)}.mjs`);
  // Another Claude session's server may have fetched it already.
  if (readJson<ServerInfo>(path.join(home, 'current.json'))?.sha256 === remote.sha256 && fs.existsSync(file)) return checked();

  const bin = await fetch(RELEASE + 'mcp-server.mjs', { signal: AbortSignal.timeout(60000) });
  if (!bin.ok) return;
  const buf = Buffer.from(await bin.arrayBuffer());
  if (sha256(buf) !== remote.sha256) return log('downloaded server failed its checksum; kept the current one');

  // Written under a name of its own (still .mjs, so Node runs it as a module)
  // and renamed into place once it starts cleanly, so several Claude sessions
  // updating at once never start a file another is still writing.
  const partial = file.replace(/\.mjs$/, `.${process.pid}.part.mjs`);
  if (!looksLikeServer(buf, remote)) {
    checked();
    return log(`server ${remote.build ?? remote.version} is not the file its release describes; kept the current one`);
  }
  fs.writeFileSync(partial, buf);
  const testStart = canTestStart();
  if (testStart && !(await probe(partial))) {
    fs.rmSync(partial, { force: true });
    checked();
    return log(`server ${remote.build ?? remote.version} did not start cleanly; kept the current one`);
  }
  fs.renameSync(partial, file);
  fs.writeFileSync(path.join(home, 'current.json'), JSON.stringify(remote, null, 2));
  checked();
  const stale = Date.now() - CHECK_EVERY_MS;
  for (const f of fs.readdirSync(home)) {
    const full = path.join(home, f);
    const oldServer = /^server-[0-9a-f]+\.mjs$/.test(f) && full !== file && full !== runningFile;
    // Left by a check that was cut off, once nobody can still be writing it.
    const leftover = /\.part\.mjs$/.test(f) && fs.statSync(full).mtimeMs < stale;
    if (oldServer || leftover) fs.rmSync(full, { force: true });
  }
  log(`downloaded ProcessForge MCP ${remote.build ?? remote.version} (${testStart ? 'test-started' : 'checksum verified; this runtime cannot test-start it'}); it is used the next time Claude starts`);
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
    log(`downloaded server ${latest.info.build ?? latest.info.version} failed to load (${(error as Error).message}); put it aside and using the one the extension shipped`);
    markBad(latest.info.sha256);
    runningFile = shipped.file;
    runningInfo = shipped.info;
    await import(pathToFileURL(shipped.file).href);
  }
} else {
  await import(pathToFileURL(shipped.file).href);
}

if (autoUpdate) {
  log(`started ${runningInfo?.build ?? runningInfo?.version ?? 'the shipped server'} (${runningFile === shipped.file ? 'shipped with the extension' : 'downloaded'}) on ${process.execPath} ${process.version}`);
  // After the server is up, so a slow network never delays Claude.
  setTimeout(() => {
    checkForUpdate(runningInfo).catch((error) => log(`update check skipped: ${(error as Error).message}`));
  }, 5000).unref();
}
