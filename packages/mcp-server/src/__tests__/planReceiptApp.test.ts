import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from '@modelcontextprotocol/ext-apps/server';
import { JUICE_CONCENTRATION_LINE, type PlanChange } from '@process-forge/protocol';
import { planChanges, planReceipt } from '@process-forge/tools';

import { createProcessForgeMcpServer } from '../server.js';
import { PLAN_RECEIPT_URI, planReceiptHtml, renderPlanReceipt } from '../apps/planReceipt.js';

async function connected() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createProcessForgeMcpServer();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const changes: PlanChange[] = [
  { op: 'add-unit', unit: 'surge-tank', name: 'Concentrate Tank T-501', parameters: { capacityGallons: 2000, initialLevelGallons: 0 } },
  { op: 'remove-stream', from: 'P-401', to: 'P-600' },
  { op: 'add-stream', from: 'P-401', to: 'T-501' },
  { op: 'add-stream', from: 'T-501', to: 'P-600' }
];

describe('MCP Apps: the run receipt in the chat', () => {
  it('names the view on plan_changes and apply_changes only', async () => {
    const client = await connected();
    const { tools } = await client.listTools();
    const withReceipt = tools.filter((t) => (t._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri === PLAN_RECEIPT_URI).map((t) => t.name).sort();
    assert.deepEqual(withReceipt, ['apply_changes', 'plan_changes']);
    for (const name of withReceipt) assert.equal(tools.find((t) => t.name === name)!._meta![RESOURCE_URI_META_KEY], PLAN_RECEIPT_URI);
  });

  it('serves one self-contained page whose script parses', async () => {
    const client = await connected();
    const { resources } = await client.listResources();
    assert.equal(resources.find((r) => r.uri === PLAN_RECEIPT_URI)?.mimeType, RESOURCE_MIME_TYPE);
    const read = await client.readResource({ uri: PLAN_RECEIPT_URI });
    const html = (read.contents[0] as { text: string }).text;
    assert.match(html, /^<!doctype html>/);
    assert.doesNotMatch(html, /\s(src|href)=/i, 'nothing to fetch');
    assert.doesNotThrow(() => new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)![1]!));
  });

  it('draws a plan as not applied yet, with its diff and runs', () => {
    const html = renderPlanReceipt(planChanges(JUICE_CONCENTRATION_LINE, { changes }) as Record<string, unknown>);
    assert.match(html, /Not applied yet/);
    assert.match(html, /Concentrate Tank T-501/);
    assert.match(html, /Run of the line, 60 min/);
    assert.match(html, /Nothing has changed yet/);
  });

  it('draws a receipt as applied and read back, with where to go back to', () => {
    const receipt = { ...planReceipt(JUICE_CONCENTRATION_LINE, changes, { restorePoint: { id: 'v1', label: 'Before plan <x>' } })!, readBack: { verified: true } };
    const html = renderPlanReceipt({ success: true, applied: true, receipt });
    assert.match(html, /Applied · read back/);
    assert.match(html, /Before plan &lt;x&gt;/, 'escaped');
    assert.match(html, /History in ProcessForge/);
  });

  it('says what is missing when the read-back fails, and why a refused plan changed nothing', () => {
    const receipt = { ...planReceipt(JUICE_CONCENTRATION_LINE, changes)!, readBack: { verified: false, missingUnits: ['Concentrate Tank T-501'] } };
    assert.match(renderPlanReceipt({ applied: true, receipt }), /Applied · check it[\s\S]*missing: Concentrate Tank T-501/);
    assert.match(renderPlanReceipt({ success: false, applied: false, error: 'This plan is not for the flowsheet as it is now' }), /Nothing changed[\s\S]*not for the flowsheet/);
  });

  it('runs the handshake and draws the result the host posts', () => {
    const script = planReceiptHtml().match(/<script>([\s\S]*?)<\/script>/)![1]!;
    const posted: Record<string, any>[] = [];
    const listeners: ((e: { data: unknown; source?: unknown }) => void)[] = [];
    const main = { innerHTML: '' };
    const parent = { postMessage: (m: unknown) => posted.push(JSON.parse(JSON.stringify(m))) };
    const window = {
      parent,
      addEventListener: (type: string, l: (e: { data: unknown; source?: unknown }) => void) => type === 'message' && listeners.push(l),
      document: { documentElement: { dataset: {}, scrollHeight: 200 }, getElementById: (id: string) => (id === 'receipt' ? main : null) },
      matchMedia: () => ({ matches: false })
    };
    vm.runInNewContext(script, { window });
    assert.equal(posted[0]!.method, 'ui/initialize');
    const say = (data: unknown) => listeners.forEach((l) => l({ data, source: parent }));
    say({ jsonrpc: '2.0', id: 1, result: { hostContext: { theme: 'light' } } });
    assert.ok(posted.some((m) => m.method === 'ui/notifications/initialized'));
    say({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: planChanges(JUICE_CONCENTRATION_LINE, { changes }) } });
    assert.match(main.innerHTML, /Concentrate Tank T-501/);
  });
});
