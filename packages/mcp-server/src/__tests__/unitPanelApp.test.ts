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
  panelInputs,
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

/**
 * The view's script, run against a stand-in host: what it posts (or hands to
 * `deliver`), what it has drawn, and a way to act as the engineer on it.
 */
function bootView(opts: { prefersLight?: boolean; deliver?: (m: Record<string, unknown>) => void } = {}) {
  const script = unitPanelHtml().match(/<script>([\s\S]*?)<\/script>/)![1]!;
  const posted: Record<string, unknown>[] = [];
  const listeners: ((e: { data: unknown; source?: unknown }) => void)[] = [];
  const onPanel: Record<string, ((e: unknown) => void)[]> = {};
  const panel = { innerHTML: '', addEventListener: (type: string, l: (e: unknown) => void) => (onPanel[type] ??= []).push(l) };
  // Copy across the realm, so what the view posts compares like any object here.
  const parent = {
    postMessage: (m: unknown, origin: string) => {
      assert.equal(origin, '*');
      const copy = JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
      posted.push(copy);
      opts.deliver?.(copy);
    }
  };
  const root = { dataset: {} as Record<string, string | undefined>, scrollHeight: 300 };
  const window = {
    parent,
    addEventListener: (type: string, l: (e: { data: unknown; source?: unknown }) => void) => type === 'message' && listeners.push(l),
    document: { documentElement: root, getElementById: (id: string) => (id === 'panel' ? panel : null) },
    matchMedia: () => ({ matches: Boolean(opts.prefersLight) })
  };
  vm.runInNewContext(script, { window });
  const hostSays = (data: unknown, source: unknown = parent) => listeners.forEach((l) => l({ data, source }));
  /** The engineer types a value into a field (or clicks a button). */
  const engineer = (type: 'change' | 'click', target: { dataset: Record<string, string>; value?: string }) => (onPanel[type] ?? []).forEach((l) => l({ target }));
  return { posted, panel, root, hostSays, engineer };
}

async function until(cond: () => boolean, what: string) {
  for (let i = 0; i < 300 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(cond(), what);
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

  it('draws gauges, figures and notes as inline SVG, escaping what the contract says', () => {
    const view = unitPanelFor('explore_unit_op', { contract: WAX_COOLING_BELT_CONTRACT }, {})!;
    const html = renderUnitPanel({
      ...view,
      widgets: [...view.widgets, { kind: 'note', text: '<img src=x onerror=alert(1)>', tone: 'caution' }, { kind: 'figure', name: 'x', label: 'Rate', unit: 'kg/h', value: 1234.5 }]
    });
    assert.match(html, /class="pf-gauge"/);
    assert.ok(!html.includes('pf-trend'));
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

  it('offers the operating conditions as inputs: temperatures first, then flows and speeds; geometry under more settings', () => {
    const { inputs, settings } = panelInputs(WAX_COOLING_BELT_CONTRACT.parameters);
    const names = inputs.map((i) => i.name);
    assert.ok(names.includes('waxInletTempC') && names.includes('waxMassFlowKgPerS') && names.includes('beltSpeedMPerMin'), names.join());
    assert.equal(inputs[0]!.kind, 'temperature');
    const kinds = inputs.map((i) => i.kind);
    assert.ok(kinds.lastIndexOf('temperature') < kinds.indexOf('flow') && kinds.indexOf('flow') < kinds.indexOf('speed'), kinds.join());
    assert.ok(settings.some((i) => i.name === 'beltLengthM'), 'a length is a design setting, not an operating condition');
    assert.ok(!inputs.some((i) => i.name === 'beltLengthM'));
    const pressure = panelInputs([
      { name: 'p', label: 'Pressure', unit: 'psi', value: 30 },
      { name: 'n', label: 'Nozzles', unit: '-', value: 4, min: 4, max: 4 }
    ]);
    assert.deepEqual(pressure.inputs.map((i) => [i.name, i.kind]), [['p', 'pressure']], 'a pressure is an input; a constant is not offered');
    assert.deepEqual(pressure.settings, []);
  });

  it('shows the values the engineer set, marked as theirs', () => {
    const view = unitPanelFor('validate_unit_op', { contract: WAX_COOLING_BELT_CONTRACT, parameterOverrides: { waxInletTempC: 110 } }, { verdict: 'ACCEPTED' })!;
    assert.equal(view.inputs!.find((i) => i.name === 'waxInletTempC')!.value, 110);
    assert.deepEqual(view.overrides, { waxInletTempC: 110 });
    const live = renderUnitPanel(view, { live: true, ask: false });
    assert.match(live, /<input type="number" inputmode="decimal" data-name="waxInletTempC" aria-label="Wax inlet temperature \(degC\)" value="110"/);
    assert.match(live, /Wax inlet temperature <span class="pf-yours">yours<\/span>/);
    assert.match(live, /<details class="pf-more"><summary>More settings/);
    assert.doesNotMatch(live, / disabled/);
    assert.match(renderUnitPanel(view, { live: false, ask: false }), /data-name="waxInletTempC"[^>]* disabled/, 'read only where the host cannot run the engine');
    assert.match(renderUnitPanel(view, { live: false, ask: true }), /data-action="ask"/);
  });

  it("re-runs the engine at the engineer's values through a real MCP Apps host (ext-apps AppBridge)", async () => {
    type Context = { structuredContent?: Record<string, unknown>; content?: { text: string }[] };
    const { AppBridge } = (await import('@modelcontextprotocol/ext-apps/app-bridge')) as unknown as {
      AppBridge: new (client: Client, hostInfo: object, caps: object, opts: object) => {
        connect(t: object): Promise<void>;
        sendToolInput(p: object): Promise<void>;
        sendToolResult(p: object): Promise<void>;
        onupdatemodelcontext: (p: Context) => Promise<object>;
      };
    };
    const client = await connected();
    const bridge = new AppBridge(client, { name: 'test host', version: '1' }, { serverTools: {}, updateModelContext: { text: {} } }, { hostContext: { theme: 'dark' } });
    const context: Context[] = [];
    bridge.onupdatemodelcontext = async (p) => (context.push(p), {});
    // The bridge's side of the iframe: what it sends reaches the view, what the view posts reaches it.
    let toView: (m: unknown) => void = () => undefined;
    const transport: { start(): Promise<void>; send(m: unknown): Promise<void>; close(): Promise<void>; onmessage?: (m: unknown) => void } = {
      start: async () => undefined,
      send: async (m) => toView(JSON.parse(JSON.stringify(m))),
      close: async () => undefined
    };
    await bridge.connect(transport);
    const view = bootView({ deliver: (m) => queueMicrotask(() => transport.onmessage?.(m)) });
    toView = (m) => view.hostSays(m);
    await until(() => view.posted.some((m) => m.method === 'ui/notifications/initialized'), 'the view finishes the handshake with the real host');

    const args = { contract: WAX_COOLING_BELT_CONTRACT };
    await bridge.sendToolInput({ arguments: args });
    await bridge.sendToolResult(await client.callTool({ name: 'validate_unit_op', arguments: args }));
    await until(() => view.panel.innerHTML.includes('data-name="waxInletTempC"'), 'the panel draws its inputs');
    assert.match(view.panel.innerHTML, /the engine re-checks the design at your values/);
    const captions = () => (view.panel.innerHTML.match(/class="pf-caption">([^<]*)/g) ?? []).join('|');
    const before = captions();

    view.engineer('change', { dataset: { name: 'beltSpeedMPerMin' }, value: '40' });
    assert.match(view.panel.innerHTML, /Re-checking with the engine/);
    await until(() => /Checked by the engine at your values/.test(view.panel.innerHTML), 'the engine answers through the host');
    assert.match(view.panel.innerHTML, /data-name="beltSpeedMPerMin"[^>]* value="40"/);
    assert.match(view.panel.innerHTML, /Belt speed <span class="pf-yours">yours/);
    assert.notEqual(captions(), before, 'the gauges moved');
    await until(() => context.length > 0, 'the model is told');
    assert.deepEqual(context[0]!.structuredContent!.parameterOverrides, { beltSpeedMPerMin: 40 });
    assert.match(context[0]!.content![0]!.text, /the engineer set Belt speed = 40 m\/min/);

    // A second value keeps the first.
    view.engineer('change', { dataset: { name: 'waxInletTempC' }, value: '105' });
    await until(() => context.length > 1, 'told again');
    assert.deepEqual(context[1]!.structuredContent!.parameterOverrides, { beltSpeedMPerMin: 40, waxInletTempC: 105 });
    view.engineer('change', { dataset: { name: 'waxInletTempC' }, value: 'hot' });
    assert.match(view.panel.innerHTML, /Enter a number/);
  });

  it('asks Claude to re-check when the host takes messages but cannot run tools', () => {
    const { posted, panel, hostSays, engineer } = bootView();
    const init = posted.find((m) => m.method === 'ui/initialize')!;
    hostSays({ jsonrpc: '2.0', id: init.id, result: { protocolVersion: LATEST_PROTOCOL_VERSION, hostInfo: { name: 'h', version: '1' }, hostCapabilities: { message: { text: {} } }, hostContext: {} } });
    const r = { _meta: { [UNIT_PANEL_META_KEY]: unitPanelFor('validate_unit_op', { contract: WAX_COOLING_BELT_CONTRACT }, { verdict: 'ACCEPTED' }) }, content: [] };
    hostSays({ jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { arguments: { contract: WAX_COOLING_BELT_CONTRACT } } });
    hostSays({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: r });
    engineer('change', { dataset: { name: 'waxInletTempC' }, value: '120' });
    assert.ok(!posted.some((m) => m.method === 'tools/call'), 'no tool call the host cannot make');
    assert.match(panel.innerHTML, /Not checked yet: Wax inlet temperature = 120 degC/);
    engineer('click', { dataset: { action: 'ask' } });
    const msg = posted.find((m) => m.method === 'ui/message') as { params: { role: string; content: { text: string }[] } } | undefined;
    assert.equal(msg?.params.role, 'user');
    assert.match(msg!.params.content[0]!.text, /Wax inlet temperature = 120 degC/);
  });
});
