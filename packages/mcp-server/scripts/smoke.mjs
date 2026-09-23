// Starts the published entry point (bundle/cli.js) the way an MCP client
// does, over stdio, and checks that it completes the handshake and lists its
// tools. Catches a bundle that builds but cannot run (a missing external, a
// workspace import that was not inlined).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bundle/cli.js', import.meta.url));
const child = spawn(process.execPath, [cli], { stdio: ['pipe', 'pipe', 'inherit'] });

let buf = '';
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    pending.get(msg.id)?.(msg);
  }
});
const send = (id, method, params) =>
  new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

const timer = setTimeout(() => {
  console.error('smoke: no response within 15s');
  child.kill();
  process.exit(1);
}, 15000);

const init = await send(1, 'initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'smoke', version: '0' }
});
if (init.error) throw new Error('initialize failed: ' + JSON.stringify(init.error));
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const list = await send(2, 'tools/list', {});
const names = (list.result?.tools ?? []).map((t) => t.name);
clearTimeout(timer);
child.kill();
if (names.length === 0) {
  console.error('smoke: server listed no tools', list);
  process.exit(1);
}
console.log(`smoke: ${init.result.serverInfo.name} ${init.result.serverInfo.version}, ${names.length} tools: ${names.join(', ')}`);
