#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runServer, SERVER_VERSION } from './server.js';

/**
 * Which server Claude is running, for ProcessForge Desktop's "What's new":
 * it shows when Claude is still on an older server than the one downloaded.
 * Not when the updater test-starts a download (it sets AUTO_UPDATE=0 for
 * that), so a test never passes for the server Claude is running.
 */
function recordRunning(): void {
  if (process.env.PROCESS_FORGE_MCP_AUTO_UPDATE === '0') return;
  try {
    const home = process.env.PROCESS_FORGE_MCP_HOME ?? path.join(os.homedir(), '.process-forge', 'mcp');
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'running.json'), JSON.stringify({ version: SERVER_VERSION, pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
  } catch {
    // Only a status line in the app: never a reason not to start.
  }
}

runServer()
  .then(recordRunning)
  .catch((error) => {
    console.error('Fatal error starting ProcessForge MCP server:', error);
    process.exit(1);
  });
