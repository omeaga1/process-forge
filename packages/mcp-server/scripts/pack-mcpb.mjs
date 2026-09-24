// Builds process-forge.mcpb: a Claude Desktop extension that installs the
// ProcessForge MCP server with one click (no config file, no terminal, no
// Node.js install; Claude Desktop runs it with its own Node).
//
// The server and every dependency are bundled into one file, so the bundle
// needs no node_modules. The manifest's tool list is read from the built
// server itself, so it cannot drift from what the server offers. The result
// is checked with Anthropic's own validator (@anthropic-ai/mcpb).
//
// Run after `pnpm run build` (the engine packages resolve through dist/).
import { build } from 'esbuild';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const stage = path.join(pkgDir, 'build', 'mcpb');
const outFile = path.join(pkgDir, 'build', 'process-forge.mcpb');

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, 'server'), { recursive: true });

// 1. One file, nothing external.
await build({
  entryPoints: [path.join(pkgDir, 'src', 'cli.ts')],
  outfile: path.join(stage, 'server', 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  legalComments: 'none',
  // Some dependencies still call require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __pfCreateRequire } from 'node:module'; const require = __pfCreateRequire(import.meta.url);" },
  logLevel: 'warning'
});

// 2. Ask the built server what it offers.
async function listTools() {
  const child = spawn(process.execPath, [path.join(stage, 'server', 'index.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  const pending = new Map();
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) {
        const msg = JSON.parse(line);
        pending.get(msg.id)?.(msg);
      }
    }
  });
  const send = (id, method, params) =>
    new Promise((resolve) => {
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  const timer = setTimeout(() => {
    child.kill();
    throw new Error('the bundled server did not answer within 15 s');
  }, 15000);
  await send(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'pack-mcpb', version: '0' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const res = await send(2, 'tools/list', {});
  clearTimeout(timer);
  child.kill();
  return res.result.tools;
}
const tools = await listTools();
if (tools.length === 0) throw new Error('the bundled server lists no tools');

// First sentence of each description is enough for the install screen.
const brief = (d) => (d.match(/^.*?[.!?](\s|$)/)?.[0] ?? d).trim();

// 3. Icon and manifest.
fs.copyFileSync(path.resolve(pkgDir, '..', '..', 'apps', 'web', 'public', 'logo.png'), path.join(stage, 'icon.png'));
const manifest = {
  manifest_version: '0.3',
  name: 'process-forge',
  display_name: 'ProcessForge',
  version: pkg.version,
  description: 'Design custom unit operations for process flowsheets, checked by the ProcessForge engine, and add them to ProcessForge Desktop.',
  long_description:
    'Describe equipment in plain words and Claude designs it as a ProcessForge unit operation: its parameters, the equations that connect them, the limits that must hold, and a drawing with a nozzle for every connection. The ProcessForge engine checks every design and returns exactly what fails. With ProcessForge Desktop open, Claude can read your open flowsheet and add the unit to it. Also simulates lines and finds bottlenecks. Runs on this computer; needs no API key.',
  author: { name: 'omeaga1', url: 'https://github.com/omeaga1' },
  homepage: 'https://process-forge.pages.dev',
  repository: { type: 'git', url: 'https://github.com/omeaga1/process-forge' },
  support: 'https://github.com/omeaga1/process-forge/issues',
  license: 'Apache-2.0',
  icon: 'icon.png',
  keywords: ['process engineering', 'chemical engineering', 'flowsheet', 'simulation', 'unit operations', 'manufacturing'],
  server: {
    type: 'node',
    entry_point: 'server/index.mjs',
    mcp_config: { command: 'node', args: ['${__dirname}/server/index.mjs'] }
  },
  tools: tools.map((t) => ({ name: t.name, description: brief(t.description ?? '') })),
  compatibility: { platforms: ['win32', 'darwin', 'linux'], runtimes: { node: '>=18.0.0' } }
};
fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// 4. Validate and pack with Anthropic's tool.
const mcpb = path.join(pkgDir, 'node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js');
execFileSync(process.execPath, [mcpb, 'validate', path.join(stage, 'manifest.json')], { stdio: 'inherit' });
fs.rmSync(outFile, { force: true });
execFileSync(process.execPath, [mcpb, 'pack', stage, outFile], { stdio: 'inherit' });
console.log(`\n${path.relative(process.cwd(), outFile)}: ${tools.length} tools, version ${pkg.version}`);
