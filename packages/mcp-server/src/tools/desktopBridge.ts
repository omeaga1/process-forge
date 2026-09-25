import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeValidateUnitOp, type ValidateUnitOpResult } from '@process-forge/protocol';

/**
 * Talks to the running ProcessForge desktop app, so a unit op designed in the
 * MCP client lands on the engineer's open flowsheet without copy and paste.
 *
 * The desktop app writes its local port and a per-launch token to
 * `mcp-bridge.json` in its data directory (see apps/desktop/src-tauri/src/
 * mcp_bridge.rs). Only this user can read that file, and the app only listens
 * on 127.0.0.1, so only processes of this user on this machine can reach it.
 */

const APP_ID = 'com.processforge.studio';

/** Tauri's app_data_dir for this app, per OS. */
export function bridgeFilePath(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  const home = os.homedir();
  const base =
    platform === 'win32'
      ? env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
      : platform === 'darwin'
        ? path.join(home, 'Library', 'Application Support')
        : env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
  return path.join(base, APP_ID, 'mcp-bridge.json');
}

interface BridgeInfo {
  port: number;
  token: string;
}

type BridgeCall =
  | { ok: true; status: number; body: any }
  | { ok: false; reason: string };

const NOT_RUNNING =
  'The ProcessForge desktop app is not running on this computer (no bridge file). Open ProcessForge Desktop 0.1.18 or later and try again. Without it, give the engineer the contract JSON to paste into Design a unit op.';

function readBridge(): BridgeInfo | null {
  try {
    const info = JSON.parse(fs.readFileSync(bridgeFilePath(), 'utf8')) as Partial<BridgeInfo>;
    if (typeof info.port === 'number' && typeof info.token === 'string') return { port: info.port, token: info.token };
  } catch {
    // Missing or unreadable: the app is not running.
  }
  return null;
}

async function call(method: 'GET' | 'POST', route: string, body?: unknown): Promise<BridgeCall> {
  const info = readBridge();
  if (!info) return { ok: false, reason: NOT_RUNNING };
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}${route}`, {
      method,
      headers: { Authorization: `Bearer ${info.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000)
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Keep the text.
    }
    return { ok: true, status: res.status, body: parsed };
  } catch (e) {
    // A stale file from an app that crashed, or the app is closing.
    return { ok: false, reason: `${NOT_RUNNING} (${(e as Error).message})` };
  }
}

export async function executeGetOpenFlowsheet(): Promise<Record<string, unknown>> {
  const r = await call('GET', '/v1/flowsheet');
  if (!r.ok) return { success: false, error: r.reason };
  if (r.status !== 200) return { success: false, error: r.body?.error ?? `HTTP ${r.status}` };
  return { success: true, flowsheet: r.body };
}

export interface AddUnitOpParams {
  contract: unknown;
  /** Optional canvas position; by default the unit goes to the right of the flowsheet. */
  position?: { x: number; y: number };
}

/**
 * Validates first, here, so a rejected design comes back with the engine's
 * reasons without touching the app. The app validates again before adding it.
 */
export async function executeAddUnitOpToFlowsheet(params: AddUnitOpParams): Promise<Record<string, unknown>> {
  const verdict: ValidateUnitOpResult = executeValidateUnitOp({ contract: params.contract });
  if (verdict.verdict !== 'ACCEPTED') {
    return {
      success: false,
      added: false,
      verdict: verdict.verdict,
      gates: verdict.gates,
      revisionGuidance: verdict.revisionGuidance,
      nextStep: 'Fix the contract and call add_unit_op_to_flowsheet again (or validate_unit_op first).'
    };
  }
  const r = await call('POST', '/v1/unit-ops', { contract: params.contract, ...(params.position ? { position: params.position } : {}) });
  if (!r.ok) return { success: false, added: false, verdict: 'ACCEPTED', error: r.reason };
  if (r.status === 202) return { success: true, added: false, queued: true, message: r.body?.message };
  if (r.status !== 200) return { success: false, added: false, error: r.body?.error ?? `HTTP ${r.status}` };
  return { success: Boolean(r.body?.added), ...r.body, drawingWarnings: verdict.gates.drawing.warnings };
}

export interface AddStreamParams {
  /** The unit the stream leaves: its id, name, or tag (for example ST-200). */
  from: string;
  /** The unit the stream enters. */
  to: string;
  /** Optional outlet on `from`, by port id or name. By default the first free outlet that fits. */
  fromPort?: string;
  /** Optional inlet on `to`. */
  toPort?: string;
}

/**
 * Pipes one unit into another on the open flowsheet. The app checks the ends
 * fit (liquid to liquid, items to items, not a unit into itself, not a
 * duplicate) and says why when they do not.
 */
export async function executeAddStream(params: AddStreamParams): Promise<Record<string, unknown>> {
  if (typeof params?.from !== 'string' || typeof params?.to !== 'string') {
    return { success: false, added: false, error: 'Give "from" and "to": a unit id, name or tag each. get_open_flowsheet lists them.' };
  }
  const body = {
    from: params.from,
    to: params.to,
    ...(params.fromPort ? { fromPort: params.fromPort } : {}),
    ...(params.toPort ? { toPort: params.toPort } : {})
  };
  const r = await call('POST', '/v1/streams', body);
  if (!r.ok) return { success: false, added: false, error: r.reason };
  if (r.status === 202) return { success: true, added: false, queued: true, message: r.body?.message };
  if (r.status === 404) {
    return { success: false, added: false, error: 'This ProcessForge Desktop is too old for add_stream. Update it (0.1.29 or later).' };
  }
  if (r.status !== 200) return { success: false, added: false, error: r.body?.error ?? `HTTP ${r.status}` };
  return { success: Boolean(r.body?.added), ...r.body };
}
