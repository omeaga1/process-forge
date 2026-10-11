import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from '@modelcontextprotocol/ext-apps/server';
import { WAX_COOLING_BELT_CONTRACT } from '@process-forge/protocol';
import { OsakaJadeDarkPalette, OsakaJadeLightPalette } from '@process-forge/theme';

import { createProcessForgeMcpServer } from '../server.js';
import {
  MCP_APP_LEGACY_URI_KEY,
  MCP_APP_MIME_TYPE,
  MCP_APP_PROTOCOL_VERSION,
  UNIT_PANEL_META_KEY,
  UNIT_PANEL_URI,
  renderUnitPanel,
  unitPanelFor,
  unitPanelHtml,
  type UnitPanelView
} from '../apps/unitPanel.js';

// ext-apps 1.7's root typings re-export "./types" without an extension, which
// NodeNext cannot follow; the runtime exports are there, so type them here.
type Schema = { safeParse(v: unknown): { success: boolean } };
const {
  LATEST_PROTOCOL_VERSION,
  McpUiInitializeRequestSchema,
  McpUiInitializedNotificationSchema,
  McpUiResourceMetaSchema,
  McpUiSizeChangedNotificationSchema,
  McpUiToolMetaSchema
} = (await import('@modelcontextprotocol/ext-apps')) as unknown as Record<
  'McpUiInitializeRequestSchema' | 'McpUiInitializedNotificationSchema' | 'McpUiResourceMetaSchema' | 'McpUiSizeChangedNotificationSchema' | 'McpUiToolMetaSchema',
  Schema
> & { LATEST_PROTOCOL_VERSION: string };

async function connected() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createProcessForgeMcpServer();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

type Result = { content: { type: string; text: string }[]; structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown> };

/** The view's script, run against a stand-in host: what it posts, and what it has drawn. */
function bootView(opts: { prefersLight?: boolean } = {}) {
  const script = unitPanelHtml().match(/<script>([\s\S]*?)<\/script>/)![1]!;
  const posted: Record<string, unknown>[] = [];
  const listeners: ((e: { data: unknown; source?: unknown }) => void)[] = [];
  const panel = { innerHTML: '' };
  const parent = { postMessage: (m: unknown, origin: string) => (assert.equal(origin, '*'), posted.push(JSON.parse(JSON.stringify(m)) as Record<string, unknown>)) };
  const root = { dataset: {} as Record<string, string | undefined>, scrollHeight: 300 };
  const window = {
    parent,
    addEventListener: (type: string, l: (e: { data: unknown; source?: unknown }) => void) => type === 'message' && listeners.push(l),
    document: { documentElement: root, getElementById: (id: string) => (id === 'panel' ? panel : null) },
    matchMedia: () => ({ matches: Boolean(opts.prefersLight) })
  };
  vm.runInNewContext(script, { window, Intl, Math, Number, String, JSON });
  const hostSays = (data: unknown, source: unknown = parent) => listeners.forEach((l) => l({ data, source }));
  return { posted, panel, root, hostSays };
}

describe('MCP Apps: the unit panel in the chat', () => {
  it('speaks the extension\'s wire format (checked against @modelcontextprotocol/ext-apps)', () => {
    assert.equal(MCP_APP_MIME_TYPE, RESOURCE_MIME_TYPE);
    assert.equal(MCP_APP_LEGACY_URI_KEY, RESOURCE_URI_META_KEY);
    assert.equal(MCP_APP_PROTOCOL_VERSION, LATEST_PROTOCOL_VERSION);
    assert.match(UNIT_PANEL_URI, /^ui:\/\//);
  });

  it('names the view on explore_unit_op and validate_unit_op only', async () => {
    const client = await connected();
    const { tools } = await client.listTools();
    const withUi = tools.filter((t) => t._meta).map((t) => t.name).sort();
    assert.deepEqual(withUi, ['explore_unit_op', 'validate_unit_op']);
    for (const name of withUi) {
      const meta = tools.find((t) => t.name === name)!._meta!;
      assert.ok(McpUiToolMetaSchema.safeParse(meta.ui).success, `${name}: _meta.ui is valid`);
      assert.equal((meta.ui as { resourceUri: string }).resourceUri, UNIT_PANEL_URI);
      assert.equal(meta[RESOURCE_URI_META_KEY], UNIT_PANEL_URI, `${name}: older hosts find it too`);
    }
  });

  it('serves the view as one self-contained page in Osaka Jade', async () => {
    const client = await connected();
    const { resources } = await client.listResources();
    const listed = resources.find((r) => r.uri === UNIT_PANEL_URI);
    assert.equal(listed?.mimeType, RESOURCE_MIME_TYPE);
    const read = await client.readResource({ uri: UNIT_PANEL_URI });
    const item = read.contents[0] as { mimeType: string; text: string; _meta?: { ui?: unknown } };
    assert.equal(item.mimeType, RESOURCE_MIME_TYPE);
    assert.ok(McpUiResourceMetaSchema.safeParse(item._meta?.ui).success);
    const html = item.text;
    assert.match(html, /^<!doctype html>/);
    assert.doesNotMatch(html, /\s(src|href)=/i, 'nothing to fetch');
    assert.doesNotMatch(html, /react/i);
    for (const colour of [OsakaJadeDarkPalette.jade[500], OsakaJadeDarkPalette.status.failed, OsakaJadeLightPalette.background.base]) assert.ok(html.includes(colour), `has ${colour}`);
    // The inlined functions survive toString() as script the browser can parse.
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
    assert.doesNotThrow(() => new vm.Script(script));
  });

  it('attaches the panel in full to explore_unit_op, and leaves the text answer as it was', async () => {
    const client = await connected();
    const r = (await client.callTool({ name: 'explore_unit_op', arguments: { contract: WAX_COOLING_BELT_CONTRACT, parameters: ['beltSpeedMPerMin'] } })) as Result;
    // Clients without MCP Apps: the same JSON as text and structured content, with the compact atAGlance.
    assert.deepEqual(JSON.parse(r.content[0]!.text), r.structuredContent);
    assert.ok(Array.isArray(r.structuredContent!.atAGlance));
    assert.ok(!('_meta' in r.structuredContent!), 'the panel is not in what the model reads');
    const view = r._meta![UNIT_PANEL_META_KEY] as UnitPanelView;
    assert.equal(view.unit, WAX_COOLING_BELT_CONTRACT.name);
    assert.equal(view.widgets.length, (r.structuredContent!.atAGlance as unknown[]).length, 'the same widgets atAGlance lists');
    const gauge = view.widgets.find((w) => w.kind === 'gauge');
    assert.ok(gauge && gauge.kind === 'gauge' && Number.isFinite(gauge.min) && gauge.max > gauge.min, 'a gauge carries its scale');
  });

  it('attaches it to validate_unit_op at the operating point asked about, with the verdict', async () => {
    const client = await connected();
    const at = (overrides?: Record<string, number>) =>
      client.callTool({ name: 'validate_unit_op', arguments: { contract: WAX_COOLING_BELT_CONTRACT, ...(overrides ? { parameterOverrides: overrides } : {}) } }) as Promise<Result>;
    const now = await at();
    const view = now._meta![UNIT_PANEL_META_KEY] as UnitPanelView;
    assert.equal(now.structuredContent!.verdict, 'ACCEPTED');
    assert.deepEqual(view.verdict, { word: 'Accepted', tone: 'ok' });
    assert.ok(view.widgets.length > 0);
    const fast = (await at({ beltSpeedMPerMin: 40 }))._meta![UNIT_PANEL_META_KEY] as UnitPanelView;
    const caption = (v: UnitPanelView) => v.widgets.flatMap((w) => (w.kind === 'gauge' ? [w.caption] : [])).join('|');
    assert.notEqual(caption(fast), caption(view), 'the gauges move with the override');

    const broken = (await client.callTool({ name: 'validate_unit_op', arguments: { contract: { name: 'Half a unit' } } })) as Result;
    const empty = broken._meta![UNIT_PANEL_META_KEY] as UnitPanelView;
    assert.equal(empty.verdict?.tone, 'error');
    assert.deepEqual(empty.widgets, []);
    assert.match(empty.empty!, /schema/);
  });

  it('leaves every other tool result alone', async () => {
    const client = await connected();
    const r = (await client.callTool({ name: 'diagnose_bottlenecks', arguments: { templateName: 'paint-canning-line' } })) as Result;
    assert.equal(r._meta, undefined);
    assert.equal(unitPanelFor('diagnose_bottlenecks', {}, {}), undefined);
  });

  it('draws gauges, figures, trends and notes as inline SVG, escaping what the contract says', () => {
    const view = unitPanelFor('explore_unit_op', { contract: WAX_COOLING_BELT_CONTRACT }, {})!;
    const html = renderUnitPanel({
      ...view,
      widgets: [...view.widgets, { kind: 'note', text: '<img src=x onerror=alert(1)>', tone: 'caution' }, { kind: 'figure', name: 'x', label: 'Rate', unit: 'kg/h', value: 1234.5 }]
    });
    assert.match(html, /class="pf-gauge"/);
    assert.match(html, /class="pf-trend"/);
    assert.match(html, /role="meter"/);
    assert.match(html, /1,234\.5<span class="pf-unit">kg\/h/);
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!html.includes('<img'));
    assert.match(renderUnitPanel({ unit: 'U', tool: 'validate_unit_op', widgets: [], empty: 'Nothing yet' }), /pf-empty">Nothing yet/);
  });

  it('runs the MCP Apps handshake and redraws on each tool result', async () => {
    const { posted, panel, root, hostSays } = bootView({ prefersLight: true });
    assert.equal(root.dataset.theme, 'light', 'follows the system until the host says');
    const init = posted.find((m) => m.method === 'ui/initialize')!;
    assert.ok(McpUiInitializeRequestSchema.safeParse(init).success, 'ui/initialize is well formed');
    assert.ok(!posted.some((m) => m.method === 'ui/notifications/initialized'), 'waits for the host');

    hostSays({ jsonrpc: '2.0', id: init.id, result: { protocolVersion: LATEST_PROTOCOL_VERSION, hostInfo: { name: 'h', version: '1' }, hostCapabilities: {}, hostContext: { theme: 'dark' } } });
    const initialized = posted.find((m) => m.method === 'ui/notifications/initialized');
    assert.ok(initialized && McpUiInitializedNotificationSchema.safeParse(initialized).success);
    assert.equal(root.dataset.theme, 'dark');

    const client = await connected();
    const result = await client.callTool({ name: 'validate_unit_op', arguments: { contract: WAX_COOLING_BELT_CONTRACT } });
    root.scrollHeight = 520;
    hostSays({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result });
    assert.match(panel.innerHTML, /Accepted/);
    assert.match(panel.innerHTML, /<svg class="pf-gauge"/);
    const size = posted.filter((m) => m.method === 'ui/notifications/size-changed').at(-1)!;
    assert.ok(McpUiSizeChangedNotificationSchema.safeParse(size).success);
    assert.deepEqual(size.params, { height: 520 });

    hostSays({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme: 'light' } });
    assert.equal(root.dataset.theme, 'light');
    hostSays({ jsonrpc: '2.0', id: 9, method: 'ui/resource-teardown', params: {} });
    assert.deepEqual(posted.at(-1), { jsonrpc: '2.0', id: 9, result: {} });

    // Another frame posting at the view is not the host.
    hostSays({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [] } }, {});
    assert.match(panel.innerHTML, /Accepted/);
    // A host that drops _meta: say so rather than draw nothing.
    hostSays({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [{ type: 'text', text: '{}' }] } });
    assert.match(panel.innerHTML, /text answer has the details/);
  });
});
