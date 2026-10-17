import { parseUnit, resolvePanel, UnitOpContractSchema, type ResolvedPanelWidget, type UnitOpParameter } from '@process-forge/protocol';
import { generateOsakaJadeCssVariables, fontFamily } from '@process-forge/theme';

/**
 * A unit's panel at a glance, drawn inside the chat by clients that support
 * MCP Apps (SEP-1865, @modelcontextprotocol/ext-apps). explore_unit_op and
 * validate_unit_op name this view in their tool _meta; the host loads it
 * into a sandboxed iframe and posts it the tool result, whose _meta carries
 * the panel worked out in full (gauge scales and limits).
 * The text and structured content stay as they are, so a client without
 * MCP Apps reads the same answer it always did.
 *
 * The operating conditions (temperatures, pressures, flows, speeds) are
 * input fields, not figures: the engineer sets them, the view re-runs
 * validate_unit_op with those values through the host, and tells the model
 * which values the engineer chose so it designs with them.
 *
 * The view is one HTML page with nothing to fetch: inline SVG, the Osaka
 * Jade colours as CSS variables, and the few lines of the MCP Apps
 * handshake written out here rather than bundling the ext-apps App class
 * (330 kB) into every page.
 */

/** The wire constants of the MCP Apps extension (ext-apps RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY, LATEST_PROTOCOL_VERSION). */
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';
export const MCP_APP_LEGACY_URI_KEY = 'ui/resourceUri';
export const MCP_APP_PROTOCOL_VERSION = '2026-01-26';

export const UNIT_PANEL_URI = 'ui://process-forge/unit-panel.html';
/** The tool result _meta key the view reads the panel from. */
export const UNIT_PANEL_META_KEY = 'process-forge/unit-panel';
export const UNIT_PANEL_TOOLS = ['explore_unit_op', 'validate_unit_op'] as const;

/** A parameter the engineer can set from the panel. */
export interface UnitPanelInput {
  name: string;
  label: string;
  unit: string;
  /** At the point the panel was worked out for: the override if one was set, else the contract's value. */
  value: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  options?: { label: string; value: number }[];
  kind: 'temperature' | 'pressure' | 'flow' | 'speed' | 'power' | 'other';
}

/** What the view draws. */
export interface UnitPanelView {
  unit: string;
  tool: string;
  /** validate_unit_op's verdict. */
  verdict?: { word: string; tone: 'ok' | 'warning' | 'error' };
  widgets: ResolvedPanelWidget[];
  /** Operating conditions, shown first: temperatures, pressures, flows, speeds, duties. */
  inputs?: UnitPanelInput[];
  /** Every other setting that is not a constant, under "More settings". */
  settings?: UnitPanelInput[];
  /** The values the engineer has set, by parameter name. */
  overrides?: Record<string, number>;
  /** Why there is nothing to draw, when there is not. */
  empty?: string;
}

type Dim = readonly number[];
const sameDim = (a: Dim, b: Dim) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]!) < 1e-9);
/** Kinds of quantity that are operating conditions, in the order the panel shows them, by a unit of each. */
const OPERATING_KINDS: [UnitPanelInput['kind'], string[]][] = [
  ['temperature', ['K']],
  ['pressure', ['Pa']],
  ['flow', ['m3/s', 'kg/s', '1/s']],
  ['speed', ['m/s']],
  ['power', ['W']]
];

function kindOf(p: UnitOpParameter): UnitPanelInput['kind'] {
  const d = parseUnit(p.unit);
  if (d) {
    for (const [kind, units] of OPERATING_KINDS) if (units.some((u) => sameDim(d, parseUnit(u) ?? []))) return kind;
  }
  return 'other';
}

/**
 * The parameters the panel offers as inputs: the operating conditions
 * (by the kind of quantity, or the contract's own "Operating conditions"
 * group), then the rest. Constants (min = max) and advanced ones are left to
 * the spec sheet.
 */
export function panelInputs(params: readonly UnitOpParameter[], overrides: Record<string, number> = {}): { inputs: UnitPanelInput[]; settings: UnitPanelInput[] } {
  const order = OPERATING_KINDS.map(([k]) => k as string);
  const all = params
    .filter((p) => !p.ui?.advanced && !(p.min !== undefined && p.max !== undefined && p.max - p.min <= 1e-3 * Math.max(1e-12, Math.abs(p.max))))
    .map((p): UnitPanelInput => ({
      name: p.name,
      label: p.label,
      unit: p.unit,
      value: Number.isFinite(overrides[p.name]) ? overrides[p.name]! : p.value,
      ...(p.min !== undefined ? { min: p.min } : {}),
      ...(p.max !== undefined ? { max: p.max } : {}),
      ...(p.ui?.step ? { step: p.ui.step } : {}),
      ...(p.integer ? { integer: true } : {}),
      ...(p.options ? { options: p.options } : {}),
      kind: kindOf(p)
    }));
  const operating = (i: UnitPanelInput) => {
    const group = params.find((p) => p.name === i.name)?.ui?.group;
    return group ? /operat|condition|process/i.test(group) || i.kind !== 'other' : i.kind !== 'other';
  };
  const inputs = all.filter(operating).sort((a, b) => (order.indexOf(a.kind) + 1 || 99) - (order.indexOf(b.kind) + 1 || 99));
  return { inputs, settings: all.filter((i) => !inputs.includes(i)) };
}

/** The tool's UI metadata, in the current form and the one older hosts read. */
export function unitPanelToolMeta(): Record<string, unknown> {
  return { ui: { resourceUri: UNIT_PANEL_URI }, [MCP_APP_LEGACY_URI_KEY]: UNIT_PANEL_URI };
}

type Json = Record<string, unknown>;

/**
 * The panel for a call of explore_unit_op or validate_unit_op, at the same
 * operating point the tool answered for; undefined for any other tool or a
 * contract that is not one.
 */
export function unitPanelFor(tool: string, args: Json, result: unknown): UnitPanelView | undefined {
  if (!(UNIT_PANEL_TOOLS as readonly string[]).includes(tool)) return undefined;
  const r = (result ?? {}) as Json;
  const verdict =
    tool === 'validate_unit_op' && typeof r.verdict === 'string'
      ? { word: r.verdict === 'ACCEPTED' ? 'Accepted' : 'Rejected', tone: r.verdict === 'ACCEPTED' ? ('ok' as const) : ('error' as const) }
      : undefined;
  const parsed = UnitOpContractSchema.safeParse(args.contract);
  if (!parsed.success) {
    const name = typeof (args.contract as Json | undefined)?.name === 'string' ? String((args.contract as Json).name) : 'Unit';
    return { unit: name, tool, ...(verdict ? { verdict } : {}), widgets: [], empty: 'The contract does not match the schema, so there is no panel to draw yet.' };
  }
  const overrides = tool === 'validate_unit_op' && args.parameterOverrides && typeof args.parameterOverrides === 'object' ? (args.parameterOverrides as Record<string, number>) : undefined;
  const { widgets } = resolvePanel(parsed.data, undefined, overrides ? { parameterOverrides: overrides } : {});
  return {
    unit: parsed.data.name,
    tool,
    ...(verdict ? { verdict } : {}),
    widgets,
    ...panelInputs(parsed.data.parameters, overrides),
    ...(overrides && Object.keys(overrides).length ? { overrides } : {}),
    ...(widgets.length ? {} : { empty: 'The design does not evaluate at this point, so its checks have nothing to gauge.' })
  };
}

/** How the inputs behave: live (the host runs the engine for the view), ask (the host takes a chat message), or neither (read only). */
export interface UnitPanelState {
  live: boolean;
  ask: boolean;
  busy?: boolean;
  /** One line under the inputs: re-checking, checked, or what is wrong with a value. */
  note?: string;
}

/**
 * The panel as HTML. Runs in the view, so it must stand alone: no imports,
 * no helpers from outside its body (it is inlined with toString()).
 */
export function renderUnitPanel(view: UnitPanelView | undefined, state: UnitPanelState = { live: false, ask: false }): string {
  const esc = (s: unknown) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  const num = (v: number) => {
    if (!Number.isFinite(v)) return String(v);
    const a = Math.abs(v);
    if (a !== 0 && (a < 0.001 || a >= 1e7)) return v.toExponential(2);
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: a < 1 ? 4 : a < 10 ? 3 : a < 100 ? 2 : a < 10000 ? 1 : 0 }).format(v);
  };
  const unitText = (u: string) => (u && u !== '-' ? u : '');
  const STATUS: Record<string, string> = { ok: 'Passes', tight: 'Close to limit', warning: 'Warning', error: 'Fails' };
  const r1 = (v: number) => Math.round(v * 10) / 10;

  if (!view) return '<p class="pf-empty">Waiting for the engine…</p>';

  const gauge = (w: Extract<ResolvedPanelWidget, { kind: 'gauge' }>) => {
    const W = 240;
    const span = w.max - w.min || 1;
    const x = (v: number) => r1(Math.min(W, Math.max(0, ((v - w.min) / span) * W)));
    const safe =
      w.limit === undefined ? '' : w.keep === 'above' ? `<rect class="pf-safe" x="${x(w.limit)}" y="6" width="${r1(W - x(w.limit))}" height="8" rx="4"/>` : `<rect class="pf-safe" x="0" y="6" width="${x(w.limit)}" height="8" rx="4"/>`;
    const limit = w.limit === undefined ? '' : `<rect class="pf-limit" x="${r1(x(w.limit) - 1)}" y="2" width="2" height="16" rx="1"/>`;
    return `<div class="pf-card" role="meter" aria-valuenow="${w.value}" aria-valuemin="${w.min}" aria-valuemax="${w.max}" aria-label="${esc(`${w.label}: ${w.caption}. ${STATUS[w.status]}.`)}">
  <div class="pf-head"><span class="pf-label">${esc(w.label)}</span><span class="pf-status" data-status="${esc(w.status)}">${STATUS[w.status] ?? esc(w.status)}</span></div>
  <svg class="pf-gauge" viewBox="0 0 ${W} 20" preserveAspectRatio="none" aria-hidden="true"><rect class="pf-track" x="0" y="6" width="${W}" height="8" rx="4"/>${safe}<rect class="pf-fill" data-status="${esc(w.status)}" x="0" y="6" width="${x(w.value)}" height="8" rx="4"/>${limit}</svg>
  <div class="pf-caption">${esc(w.caption)}</div>${w.message ? `\n  <div class="pf-message">${esc(w.message)}</div>` : ''}
</div>`;
  };

  const widget = (w: ResolvedPanelWidget): string => {
    switch (w.kind) {
      case 'figure':
        return `<div class="pf-card"><div class="pf-label">${esc(w.label)}</div><div class="pf-figure">${num(w.value)}<span class="pf-unit">${esc(unitText(w.unit))}</span></div></div>`;
      case 'gauge':
        return gauge(w);
      case 'note':
        return `<div class="pf-note" data-tone="${esc(w.tone)}">${esc(w.text)}</div>`;
      default:
        return '';
    }
  };

  const editable = state.live || state.ask;
  const shown = (v: number) => String(Number(v.toPrecision(10)));
  const field = (i: UnitPanelInput) => {
    const set = view.overrides?.[i.name] !== undefined;
    const attrs = `data-name="${esc(i.name)}" aria-label="${esc(`${i.label}${unitText(i.unit) ? ` (${i.unit})` : ''}`)}"${editable && !state.busy ? '' : ' disabled'}`;
    const control = i.options
      ? `<select ${attrs}>${i.options.map((o) => `<option value="${o.value}"${o.value === i.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
      : `<input type="number" inputmode="decimal" ${attrs} value="${shown(i.value)}"${i.min !== undefined ? ` min="${i.min}"` : ''}${i.max !== undefined ? ` max="${i.max}"` : ''} step="${i.step ?? (i.integer ? 1 : 'any')}">`;
    const range = i.min !== undefined && i.max !== undefined && !i.options ? `<span class="pf-range">${num(i.min)} to ${num(i.max)}</span>` : '';
    return `<label class="pf-field"${set ? ' data-set=""' : ''}><span class="pf-field-label">${esc(i.label)}${set ? ' <span class="pf-yours">yours</span>' : ''}</span><span class="pf-input">${control}<span class="pf-unit">${esc(unitText(i.unit))}</span></span>${range}</label>`;
  };
  const inputs = view.inputs ?? [];
  const settings = view.settings ?? [];
  const hint =
    state.note ??
    (state.live
      ? 'Set the conditions; the engine re-checks the design at your values.'
      : state.ask
        ? 'Set the conditions, then ask Claude to re-check at your values.'
        : 'This client cannot re-run the engine from the panel; give Claude these values in the chat.');
  const ops =
    inputs.length || settings.length
      ? `<section class="pf-ops" aria-label="Operating conditions"${state.busy ? ' aria-busy="true"' : ''}>
  <div class="pf-label">Operating conditions</div>
  ${inputs.length ? `<div class="pf-fields">${inputs.map(field).join('')}</div>` : ''}
  ${settings.length ? `<details class="pf-more"${inputs.length ? '' : ' open'}><summary>More settings (${settings.length})</summary><div class="pf-fields">${settings.map(field).join('')}</div></details>` : ''}
  <div class="pf-run" role="status">${esc(hint)}</div>${state.ask ? `\n  <button type="button" class="pf-ask" data-action="ask">Ask Claude to re-check with these values</button>` : ''}
</section>`
      : '';
  const verdict = view.verdict ? `<span class="pf-verdict" data-tone="${esc(view.verdict.tone)}">${esc(view.verdict.word)}</span>` : '';
  const body = view.widgets.length ? `<div class="pf-grid">${view.widgets.map(widget).join('\n')}</div>` : `<p class="pf-empty">${esc(view.empty ?? 'Nothing to show for this unit.')}</p>`;
  return `<header class="pf-title"><span><span class="pf-kicker">At a glance</span> ${esc(view.unit)}</span>${verdict}</header>\n${ops}\n${body}`;
}

/** What a control on the panel sends with a change or a click. */
export interface ViewEvent {
  target: { dataset?: Record<string, string | undefined>; value?: string } | null;
}

/** The host's side of the conversation, as the view sees it: a window it posts to and hears from. */
export interface ViewWindow {
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: 'message', listener: (e: { data: unknown; source?: unknown }) => void): void;
  document: {
    documentElement: { dataset: Record<string, string | undefined>; scrollHeight: number };
    getElementById(id: string): { innerHTML: string; addEventListener?(type: 'change' | 'click', listener: (e: ViewEvent) => void): void } | null;
  };
  matchMedia?: (q: string) => { matches: boolean };
  ResizeObserver?: new (cb: () => void) => { observe(el: unknown): void };
}

/**
 * The MCP Apps handshake: ui/initialize, then ui/notifications/initialized;
 * every tool result redraws the panel and reports the new height. When the
 * engineer changes an operating condition, the view asks the host to run
 * validate_unit_op with it (tools/call), redraws from the answer, and puts
 * the engineer's values in the model's context (ui/update-model-context).
 * A host that cannot run tools but takes messages gets a button that asks
 * the model to re-check instead. Runs in the view, so like renderUnitPanel
 * it stands alone.
 */
export function bootUnitPanel(
  win: ViewWindow,
  render: (view: UnitPanelView | undefined, state: UnitPanelState) => string,
  metaKey: string,
  protocolVersion: string
): void {
  type Msg = { jsonrpc?: string; id?: number | string; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message?: string } };
  const doc = win.document;
  const root = doc.documentElement;
  let nextId = 1;
  const pending: Record<number, (m: Msg) => void> = {};
  const send = (msg: Record<string, unknown>) => win.parent.postMessage({ jsonrpc: '2.0', ...msg }, '*');
  const request = (method: string, params: unknown, then: (m: Msg) => void) => {
    const id = nextId++;
    pending[id] = then;
    send({ id, method, params });
  };

  let caps: Record<string, unknown> = {};
  let contract: unknown;
  let overrides: Record<string, number> = {};
  let view: UnitPanelView | undefined;
  let busy = false;
  let note: string | undefined;

  let lastHeight = -1;
  const reportSize = () => {
    const height = Math.ceil(root.scrollHeight);
    if (height === lastHeight) return;
    lastHeight = height;
    send({ method: 'ui/notifications/size-changed', params: { height } });
  };
  const setTheme = (theme: unknown) => {
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  };
  const live = () => Boolean(caps.serverTools) && contract !== undefined;
  const ask = () => !caps.serverTools && Boolean(caps.message) && contract !== undefined;
  const panel = doc.getElementById('panel');
  const draw = () => {
    if (panel) panel.innerHTML = render(view, { live: live(), ask: ask(), busy, ...(note ? { note } : {}) });
    reportSize();
  };
  const viewOf = (result: Record<string, unknown> | undefined): UnitPanelView => {
    const meta = result?._meta as Record<string, unknown> | undefined;
    const v = meta?.[metaKey] as UnitPanelView | undefined;
    return v ?? { unit: 'Unit', tool: '', widgets: [], empty: 'This result carries no panel; the text answer has the details.' };
  };
  const all = () => [...(view?.inputs ?? []), ...(view?.settings ?? [])];
  const describe = () =>
    Object.keys(overrides)
      .map((name) => {
        const i = all().find((x) => x.name === name);
        return `${i ? i.label : name} = ${overrides[name]}${i && i.unit && i.unit !== '-' ? ` ${i.unit}` : ''}`;
      })
      .join(', ');

  /** Run the engine at the engineer's values, through the host. */
  const recheck = () => {
    busy = true;
    note = 'Re-checking with the engine…';
    draw();
    request('tools/call', { name: 'validate_unit_op', arguments: { contract, parameterOverrides: overrides } }, (m) => {
      busy = false;
      if (m.error || !m.result || m.result.isError) {
        note = `The engine could not re-check it: ${m.error?.message ?? 'the tool call failed'}.`;
        draw();
        return;
      }
      view = viewOf(m.result);
      const verdict = (m.result.structuredContent as Record<string, unknown> | undefined)?.verdict;
      note = `Checked by the engine at your values${typeof verdict === 'string' ? `: ${verdict.toLowerCase()}` : ''}.`;
      draw();
      if (caps.updateModelContext) {
        request(
          'ui/update-model-context',
          {
            content: [
              {
                type: 'text',
                text: `On the ${view.unit} panel the engineer set ${describe()}. At these values the engine's verdict is ${String(verdict ?? 'unknown')}. Use the engineer's values for these parameters, not assumed ones.`
              }
            ],
            structuredContent: { unit: view.unit, parameterOverrides: overrides, verdict: verdict ?? null }
          },
          () => undefined
        );
      }
    });
  };

  panel?.addEventListener?.('change', (e) => {
    const name = e.target?.dataset?.name;
    if (!name || busy) return;
    const raw = String(e.target?.value ?? '').trim();
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) {
      note = 'Enter a number.';
      draw();
      return;
    }
    overrides = { ...overrides, [name]: value };
    // Keep what was typed on screen until the engine answers.
    if (view) {
      const set = (list: UnitPanelInput[] | undefined) => list?.map((i) => (i.name === name ? { ...i, value } : i));
      view = { ...view, inputs: set(view.inputs), settings: set(view.settings), overrides };
    }
    if (live()) recheck();
    else {
      note = `Not checked yet: ${describe()}.`;
      draw();
    }
  });
  panel?.addEventListener?.('click', (e) => {
    if (e.target?.dataset?.action !== 'ask' || !Object.keys(overrides).length) return;
    request('ui/message', { role: 'user', content: [{ type: 'text', text: `Re-check ${view?.unit ?? 'the unit'} with validate_unit_op at these values I set: ${describe()}.` }] }, () => {
      note = 'Sent to Claude.';
      draw();
    });
  });

  setTheme(win.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  win.addEventListener('message', (e) => {
    if (e.source !== undefined && e.source !== null && e.source !== win.parent) return;
    const m = e.data as Msg | null;
    if (!m || m.jsonrpc !== '2.0') return;
    if (m.method === undefined && m.id !== undefined) {
      const then = pending[m.id as number];
      delete pending[m.id as number];
      if (then) then(m);
      return;
    }
    if (m.method === 'ui/notifications/tool-input') {
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
      contract = args.contract;
      overrides = { ...((args.parameterOverrides as Record<string, number> | undefined) ?? {}) };
      if (view) draw();
    } else if (m.method === 'ui/notifications/tool-result') {
      view = viewOf(m.params);
      draw();
    } else if (m.method === 'ui/notifications/host-context-changed') setTheme(m.params?.theme);
    // Requests the host may send: answer so it is not left waiting.
    else if (m.id !== undefined && (m.method === 'ui/resource-teardown' || m.method === 'ping')) send({ id: m.id, result: {} });
  });
  request('ui/initialize', { appInfo: { name: 'ProcessForge unit panel', version: '1' }, appCapabilities: {}, protocolVersion }, (m) => {
    const result = m.result ?? {};
    caps = (result.hostCapabilities as Record<string, unknown> | undefined) ?? {};
    setTheme((result.hostContext as Record<string, unknown> | undefined)?.theme);
    send({ method: 'ui/notifications/initialized', params: {} });
    draw();
  });
  if (win.ResizeObserver) new win.ResizeObserver(reportSize).observe(root);
  draw();
}

const STYLES = `
${generateOsakaJadeCssVariables('both')}
html, body { margin: 0; background: var(--pf-bg-base); color: var(--pf-text-primary); font-family: ${fontFamily.sans}; }
body { padding: 12px; overflow-wrap: anywhere; }
.pf-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; font-size: 14px; font-weight: 600; }
.pf-kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--pf-text-accent); margin-right: 6px; }
.pf-verdict { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap; }
.pf-verdict[data-tone="ok"] { color: var(--pf-jade-400); }
.pf-verdict[data-tone="warning"] { color: var(--pf-status-blocked); }
.pf-verdict[data-tone="error"] { color: var(--pf-status-failed); }
.pf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr)); gap: 8px; }
.pf-card { box-sizing: border-box; min-width: 0; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--pf-border-subtle); background: var(--pf-bg-surface); }
.pf-wide, .pf-note { grid-column: 1 / -1; }
.pf-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.pf-label { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--pf-text-muted); }
.pf-figure { margin-top: 4px; font: 600 20px/1.1 ${fontFamily.mono}; font-variant-numeric: tabular-nums; }
.pf-unit { margin-left: 5px; font: 400 12px/1 ${fontFamily.mono}; color: var(--pf-text-muted); }
.pf-status { font-size: 11px; font-weight: 600; white-space: nowrap; }
.pf-status[data-status="ok"] { color: var(--pf-jade-500); }
.pf-status[data-status="tight"], .pf-status[data-status="warning"] { color: var(--pf-status-blocked); }
.pf-status[data-status="error"] { color: var(--pf-status-failed); }
.pf-gauge { display: block; width: 100%; height: 20px; margin: 6px 0 4px; overflow: visible; }
.pf-track { fill: var(--pf-bg-surface-hover); }
.pf-safe { fill: var(--pf-jade-500); fill-opacity: 0.16; }
.pf-fill { fill: var(--pf-jade-500); }
.pf-fill[data-status="tight"], .pf-fill[data-status="warning"] { fill: var(--pf-status-blocked); }
.pf-fill[data-status="error"] { fill: var(--pf-status-failed); }
.pf-limit { fill: var(--pf-text-primary); }
.pf-caption { font-size: 12px; line-height: 1.4; color: var(--pf-text-secondary); font-variant-numeric: tabular-nums; }
.pf-message { margin-top: 4px; font-size: 12px; line-height: 1.4; color: var(--pf-status-failed); }
.pf-note { padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.45; color: var(--pf-text-secondary);
  background: color-mix(in srgb, var(--pf-jade-500) 6%, transparent); border: 1px solid color-mix(in srgb, var(--pf-jade-500) 22%, transparent); }
.pf-note[data-tone="caution"] { background: color-mix(in srgb, var(--pf-status-blocked) 8%, transparent); border-color: color-mix(in srgb, var(--pf-status-blocked) 35%, transparent); }
.pf-empty { margin: 0; font-size: 13px; color: var(--pf-text-muted); }
.pf-ops { margin-bottom: 10px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--pf-border-default); background: var(--pf-bg-surface-elevated); }
.pf-ops[aria-busy="true"] { opacity: 0.75; }
.pf-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr)); gap: 8px 12px; margin-top: 8px; }
.pf-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pf-field-label { font-size: 12px; color: var(--pf-text-secondary); }
.pf-yours { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--pf-text-gold); }
.pf-input { display: flex; align-items: center; gap: 6px; }
.pf-input input, .pf-input select { box-sizing: border-box; width: 100%; min-width: 0; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--pf-border-strong);
  background: var(--pf-bg-surface); color: var(--pf-text-primary); font: 500 13px/1.3 ${fontFamily.mono}; font-variant-numeric: tabular-nums; }
.pf-field[data-set] input, .pf-field[data-set] select { border-color: var(--pf-text-gold); }
.pf-input input:focus-visible, .pf-input select:focus-visible { outline: 2px solid var(--pf-jade-400); outline-offset: 1px; }
.pf-input input:disabled, .pf-input select:disabled { opacity: 0.7; }
.pf-input .pf-unit { margin-left: 0; white-space: nowrap; }
.pf-range { font-size: 11px; color: var(--pf-text-muted); font-variant-numeric: tabular-nums; }
.pf-more { margin-top: 8px; }
.pf-more summary { cursor: pointer; font-size: 12px; color: var(--pf-text-accent); }
.pf-run { margin-top: 8px; font-size: 12px; color: var(--pf-text-muted); }
.pf-ask { margin-top: 8px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--pf-jade-500); background: var(--pf-jade-muted); color: var(--pf-text-primary); font: 600 12px/1 ${fontFamily.sans}; cursor: pointer; }
.pf-ask:focus-visible { outline: 2px solid var(--pf-jade-400); outline-offset: 1px; }
`;

/** The view: one self-contained page. */
export function unitPanelHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unit at a glance</title>
<style>${STYLES}</style>
</head>
<body>
<main id="panel" aria-live="polite"></main>
<script>
(${bootUnitPanel.toString()})(window, ${renderUnitPanel.toString()}, ${JSON.stringify(UNIT_PANEL_META_KEY)}, ${JSON.stringify(MCP_APP_PROTOCOL_VERSION)});
</script>
</body>
</html>
`;
}
