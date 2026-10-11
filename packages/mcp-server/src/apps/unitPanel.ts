import { resolvePanel, UnitOpContractSchema, type ResolvedPanelWidget } from '@process-forge/protocol';
import { generateOsakaJadeCssVariables, fontFamily } from '@process-forge/theme';

/**
 * A unit's panel at a glance, drawn inside the chat by clients that support
 * MCP Apps (SEP-1865, @modelcontextprotocol/ext-apps). explore_unit_op and
 * validate_unit_op name this view in their tool _meta; the host loads it
 * into a sandboxed iframe and posts it the tool result, whose _meta carries
 * the panel worked out in full (gauge scales and limits, every trend point).
 * The text and structured content stay as they are, so a client without
 * MCP Apps reads the same answer it always did.
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

/** What the view draws. */
export interface UnitPanelView {
  unit: string;
  tool: string;
  /** validate_unit_op's verdict. */
  verdict?: { word: string; tone: 'ok' | 'warning' | 'error' };
  widgets: ResolvedPanelWidget[];
  /** Why there is nothing to draw, when there is not. */
  empty?: string;
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
    ...(widgets.length ? {} : { empty: 'The design does not evaluate at this point, so its checks have nothing to gauge.' })
  };
}

/**
 * The panel as HTML. Runs in the view, so it must stand alone: no imports,
 * no helpers from outside its body (it is inlined with toString()).
 */
export function renderUnitPanel(view: UnitPanelView | undefined): string {
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

  const trend = (w: Extract<ResolvedPanelWidget, { kind: 'trend' }>) => {
    const W = 600;
    const H = 112;
    const P = { l: 44, r: 4, t: 8, b: 16 };
    const xs = w.points.map((p) => p.x);
    const ys = [...w.points.map((p) => p.y), w.at.y];
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    let y0 = Math.min(...ys);
    let y1 = Math.max(...ys);
    if (y1 - y0 < 1e-12) {
      y0 -= 1;
      y1 += 1;
    }
    const logX = w.over.log && x0 > 0;
    const logY = y0 > 0 && y1 / y0 >= 20;
    const fx = (v: number) => r1(P.l + (logX ? Math.log(v / x0) / Math.log(x1 / x0) : (v - x0) / (x1 - x0 || 1)) * (W - P.l - P.r));
    const fy = (v: number) => r1(P.t + (1 - (logY ? Math.log(Math.max(v, y0) / y0) / Math.log(y1 / y0) : (v - y0) / (y1 - y0))) * (H - P.t - P.b));
    // One segment per pair of samples, coloured by the verdict where it starts.
    const segs = w.points
      .slice(0, -1)
      .map((p, i) => {
        const q = w.points[i + 1]!;
        return `<line class="pf-seg" data-status="${esc(p.status)}" x1="${fx(p.x)}" y1="${fy(p.y)}" x2="${fx(q.x)}" y2="${fy(q.y)}"/>`;
      })
      .join('');
    const u = unitText(w.unit);
    const ou = unitText(w.over.unit);
    const summary = `${w.label}: ${num(w.points[0]!.y)} to ${num(w.points[w.points.length - 1]!.y)} ${u} as ${w.over.label.toLowerCase()} goes from ${num(x0)} to ${num(x1)} ${ou}.`;
    return `<div class="pf-card pf-wide">
  <div class="pf-head"><span class="pf-label">${esc(w.label)}</span><span class="pf-caption">now ${num(w.at.y)} ${esc(u)} at ${num(w.at.x)} ${esc(ou)}</span></div>
  <svg class="pf-trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}">
    <line class="pf-axis" x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}"/><line class="pf-axis" x1="${P.l}" x2="${P.l}" y1="${P.t}" y2="${H - P.b}"/>
    <text class="pf-tick" x="${P.l - 6}" y="${P.t + 8}" text-anchor="end">${num(y1)}</text><text class="pf-tick" x="${P.l - 6}" y="${H - P.b}" text-anchor="end">${num(y0)}</text>${logY ? `<text class="pf-tick" x="${P.l - 6}" y="${(P.t + H - P.b) / 2 + 4}" text-anchor="end">log</text>` : ''}
    ${segs}
    <line class="pf-at" x1="${fx(w.at.x)}" x2="${fx(w.at.x)}" y1="${P.t - 4}" y2="${H - P.b}"/><circle class="pf-dot" cx="${fx(w.at.x)}" cy="${fy(w.at.y)}" r="4"/>
    <text class="pf-tick" x="${P.l}" y="${H - 2}">${num(x0)}</text><text class="pf-tick" x="${W - P.r}" y="${H - 2}" text-anchor="end">${num(x1)} ${esc(ou)}</text>
  </svg>
</div>`;
  };

  const widget = (w: ResolvedPanelWidget): string => {
    switch (w.kind) {
      case 'figure':
        return `<div class="pf-card"><div class="pf-label">${esc(w.label)}</div><div class="pf-figure">${num(w.value)}<span class="pf-unit">${esc(unitText(w.unit))}</span></div></div>`;
      case 'gauge':
        return gauge(w);
      case 'trend':
        return w.points.length >= 2 ? trend(w) : '';
      case 'note':
        return `<div class="pf-note" data-tone="${esc(w.tone)}">${esc(w.text)}</div>`;
      default:
        return '';
    }
  };

  const verdict = view.verdict ? `<span class="pf-verdict" data-tone="${esc(view.verdict.tone)}">${esc(view.verdict.word)}</span>` : '';
  const body = view.widgets.length ? `<div class="pf-grid">${view.widgets.map(widget).join('\n')}</div>` : `<p class="pf-empty">${esc(view.empty ?? 'Nothing to show for this unit.')}</p>`;
  return `<header class="pf-title"><span><span class="pf-kicker">At a glance</span> ${esc(view.unit)}</span>${verdict}</header>\n${body}`;
}

/** The host's side of the conversation, as the view sees it: a window it posts to and hears from. */
export interface ViewWindow {
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: 'message', listener: (e: { data: unknown; source?: unknown }) => void): void;
  document: { documentElement: { dataset: Record<string, string | undefined>; scrollHeight: number }; getElementById(id: string): { innerHTML: string } | null };
  matchMedia?: (q: string) => { matches: boolean };
  ResizeObserver?: new (cb: () => void) => { observe(el: unknown): void };
}

/**
 * The MCP Apps handshake: ui/initialize, then ui/notifications/initialized;
 * every tool result redraws the panel and reports the new height. Runs in
 * the view, so like renderUnitPanel it stands alone.
 */
export function bootUnitPanel(win: ViewWindow, render: (view: UnitPanelView | undefined) => string, metaKey: string, protocolVersion: string): void {
  const doc = win.document;
  const root = doc.documentElement;
  let nextId = 1;
  const pending: Record<number, (result: Record<string, unknown>) => void> = {};
  const send = (msg: Record<string, unknown>) => win.parent.postMessage({ jsonrpc: '2.0', ...msg }, '*');
  const request = (method: string, params: unknown, then: (result: Record<string, unknown>) => void) => {
    const id = nextId++;
    pending[id] = then;
    send({ id, method, params });
  };
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
  const draw = (view: UnitPanelView | undefined) => {
    const el = doc.getElementById('panel');
    if (el) el.innerHTML = render(view);
    reportSize();
  };
  const viewOf = (result: Record<string, unknown> | undefined): UnitPanelView => {
    const meta = result?._meta as Record<string, unknown> | undefined;
    const view = meta?.[metaKey] as UnitPanelView | undefined;
    return view ?? { unit: 'Unit', tool: '', widgets: [], empty: 'This result carries no panel; the text answer has the details.' };
  };

  setTheme(win.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  win.addEventListener('message', (e) => {
    if (e.source !== undefined && e.source !== null && e.source !== win.parent) return;
    const m = e.data as { jsonrpc?: string; id?: number | string; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown> } | null;
    if (!m || m.jsonrpc !== '2.0') return;
    if (m.method === undefined && m.id !== undefined) {
      const then = pending[m.id as number];
      delete pending[m.id as number];
      if (then) then(m.result ?? {});
      return;
    }
    if (m.method === 'ui/notifications/tool-result') draw(viewOf(m.params));
    else if (m.method === 'ui/notifications/host-context-changed') setTheme(m.params?.theme);
    // Requests the host may send: answer so it is not left waiting.
    else if (m.id !== undefined && (m.method === 'ui/resource-teardown' || m.method === 'ping')) send({ id: m.id, result: {} });
  });
  request('ui/initialize', { appInfo: { name: 'ProcessForge unit panel', version: '1' }, appCapabilities: {}, protocolVersion }, (result) => {
    setTheme((result.hostContext as Record<string, unknown> | undefined)?.theme);
    send({ method: 'ui/notifications/initialized', params: {} });
    reportSize();
  });
  if (win.ResizeObserver) new win.ResizeObserver(reportSize).observe(root);
  draw(undefined);
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
.pf-trend { display: block; width: 100%; height: auto; margin-top: 6px; overflow: visible; }
.pf-axis { stroke: var(--pf-border-default); stroke-width: 1; }
.pf-tick { font-size: 10px; fill: var(--pf-text-muted); font-variant-numeric: tabular-nums; }
.pf-seg { stroke: var(--pf-text-muted); stroke-width: 2; stroke-linecap: round; }
.pf-seg[data-status="ok"] { stroke: var(--pf-jade-500); }
.pf-seg[data-status="warning"] { stroke: var(--pf-status-blocked); }
.pf-seg[data-status="error"] { stroke: var(--pf-status-failed); }
.pf-at { stroke: var(--pf-text-muted); stroke-dasharray: 3 3; }
.pf-dot { fill: var(--pf-bg-surface); stroke: var(--pf-text-primary); stroke-width: 2; }
.pf-note { padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.45; color: var(--pf-text-secondary);
  background: color-mix(in srgb, var(--pf-jade-500) 6%, transparent); border: 1px solid color-mix(in srgb, var(--pf-jade-500) 22%, transparent); }
.pf-note[data-tone="caution"] { background: color-mix(in srgb, var(--pf-status-blocked) 8%, transparent); border-color: color-mix(in srgb, var(--pf-status-blocked) 35%, transparent); }
.pf-empty { margin: 0; font-size: 13px; color: var(--pf-text-muted); }
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
