import { generateOsakaJadeCssVariables, fontFamily } from '@process-forge/theme';
import { MCP_APP_LEGACY_URI_KEY, MCP_APP_PROTOCOL_VERSION } from './unitPanel.js';

/**
 * Run evidence, drawn in the chat by clients that support MCP Apps.
 *
 * plan_changes and apply_changes name this view in their tool _meta. For a
 * plan it shows what would change and how a run of the line moves, with
 * "nothing has changed yet"; for an applied plan it is the receipt: the
 * same diff and runs, whether the flowsheet read back from the app shows
 * every change, and the version the app kept of the flowsheet as it was.
 *
 * Everything it draws is in the tool result's structured content, which the
 * model reads as text too, so a client without MCP Apps loses nothing.
 */

export const PLAN_RECEIPT_URI = 'ui://process-forge/plan-receipt.html';
export const PLAN_RECEIPT_TOOLS = ['plan_changes', 'apply_changes'] as const;

export function planReceiptToolMeta(): Record<string, unknown> {
  return { ui: { resourceUri: PLAN_RECEIPT_URI }, [MCP_APP_LEGACY_URI_KEY]: PLAN_RECEIPT_URI };
}

type Json = Record<string, any>;

/**
 * The view's HTML for one tool result (plan_changes or apply_changes). Runs
 * in the view, so it is self-contained: no imports, no closures.
 */
export function renderPlanReceipt(result: Json | undefined): string {
  const esc = (v: unknown) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  const num = (v: unknown, digits = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—');
  const show = (v: unknown) => (typeof v === 'number' ? num(v, 3) : typeof v === 'string' ? v : JSON.stringify(v));
  if (!result) return '<p class="pf-empty">Waiting for the plan.</p>';
  if (result.success === false || result.applied === false) {
    return `<div class="pf-head"><span class="pf-kicker">Plan</span><span class="pf-badge" data-tone="error">Nothing changed</span></div><p class="pf-error">${esc(result.error ?? 'The plan could not be used.')}</p>`;
  }
  const receipt: Json | undefined = result.receipt;
  const applied = Boolean(receipt) || result.applied === true;
  const r: Json = receipt ?? result;
  const diff: Json = r.diff ?? {};
  const run: Json | undefined = r.run;
  const readBack: Json | undefined = receipt?.readBack ?? result.readBack;

  const badge = applied
    ? readBack?.verified
      ? '<span class="pf-badge" data-tone="ok">Applied · read back</span>'
      : '<span class="pf-badge" data-tone="warn">Applied · check it</span>'
    : '<span class="pf-badge" data-tone="idle">Not applied yet</span>';
  const when = applied && typeof r.appliedAt === 'string' ? `<span class="pf-meta">${esc(new Date(r.appliedAt).toLocaleString())}</span>` : '';

  const list = (title: string, items: unknown[] | undefined, sign: string) =>
    items?.length ? `<li><span class="pf-sign" data-sign="${sign}">${sign}</span><span><b>${esc(title)}</b> ${items.map(esc).join(', ')}</span></li>` : '';
  const settings = (diff.settingsChanged as Json[] | undefined)
    ?.map(
      (u) =>
        `<li><span class="pf-sign" data-sign="~">~</span><span><b>${esc(u.unit)}</b> ${(u.changes as Json[])
          .map((c) => `${esc(c.setting)} <s>${esc(show(c.from))}</s> → ${esc(show(c.to))}`)
          .join('; ')}</span></li>`
    )
    .join('');
  const changes =
    list('Units added', diff.unitsAdded, '+') +
    list('Units removed', diff.unitsRemoved, '−') +
    list('Streams added', diff.streamsAdded, '+') +
    list('Streams removed', diff.streamsRemoved, '−') +
    (settings ?? '');

  const tile = (label: string, before: unknown, after: unknown, unit = '') => {
    const moved = before !== after;
    return `<div class="pf-tile"><div class="pf-label">${esc(label)}</div><div class="pf-figure">${esc(after)}${unit ? `<span class="pf-unit">${esc(unit)}</span>` : ''}</div><div class="pf-was">${moved ? `was ${esc(before)}${unit ? ` ${esc(unit)}` : ''}` : 'unchanged'}</div></div>`;
  };
  const items = Boolean(run?.before?.unitsPerMinute) || Boolean(run?.after?.unitsPerMinute);
  const liquid = Boolean(run?.before?.liquidOutKg) || Boolean(run?.after?.liquidOutKg);
  const runs = run
    ? `<section><div class="pf-label">Run of the line, ${esc(run.minutes)} min, before → after (seed ${esc(run.seed ?? '—')})</div><div class="pf-tiles">${
        tile('Status', run.before?.status ?? '—', run.after?.status ?? '—') +
        // Items for a packaging line, kilograms for a liquid one; a line that makes neither shows both.
        (items || !liquid ? tile('Output', num(run.before?.unitsPerMinute), num(run.after?.unitsPerMinute), 'units/min') : '') +
        (liquid || !items ? tile('Liquid out', num(run.before?.liquidOutKg, 0), num(run.after?.liquidOutKg, 0), 'kg') : '') +
        tile('Bottleneck', run.before?.bottleneck ?? 'none', run.after?.bottleneck ?? 'none')
      }</div>${
        (run.after?.issues as string[] | undefined)?.length ? `<p class="pf-issues">After: ${(run.after.issues as string[]).map(esc).join(', ')}</p>` : ''
      }</section>`
    : '';

  const check: Json = r.staticCheck ?? {};
  const checks =
    (check.newErrors?.length ? `<p class="pf-issues">New check errors: ${(check.newErrors as string[]).map(esc).join('; ')}</p>` : '') +
    (check.clearedErrors?.length ? `<p class="pf-cleared">Cleared: ${(check.clearedErrors as string[]).map(esc).join('; ')}</p>` : '');

  const missing = readBack && !readBack.verified
    ? `<p class="pf-issues">${esc(
        readBack.note ??
          [
            readBack.missingUnits?.length ? `missing: ${readBack.missingUnits.join(', ')}` : '',
            readBack.unexpectedUnits?.length ? `unexpected: ${readBack.unexpectedUnits.join(', ')}` : '',
            readBack.settingsNotApplied?.length ? `settings not applied: ${readBack.settingsNotApplied.join(', ')}` : ''
          ]
            .filter(Boolean)
            .join('; ')
      )}</p>`
    : '';
  const foot = applied
    ? receipt?.restorePoint
      ? `<p class="pf-foot">The flowsheet as it was is kept as “${esc(receipt.restorePoint.label)}”. Go back to it from History in ProcessForge.</p>`
      : '<p class="pf-foot">Undo the whole plan in one step on the canvas.</p>'
    : '<p class="pf-foot">Nothing has changed yet. Say yes and Claude applies exactly this plan, only if the flowsheet has not moved on.</p>';

  return `<div class="pf-head"><span><span class="pf-kicker">${applied ? 'Receipt' : 'Plan'}</span><span class="pf-id">${esc(r.planId ?? '')}</span></span>${badge}</div>${when ? `<div>${when}</div>` : ''}
<section><div class="pf-label">What changes</div>${changes ? `<ul class="pf-list">${changes}</ul>` : '<p class="pf-empty">No change to units or streams.</p>'}</section>
${runs}${checks}${missing}${foot}`;
}

interface ViewWindow {
  document: { documentElement: { scrollHeight: number; dataset: Record<string, string> }; getElementById(id: string): { innerHTML: string } | null };
  parent: { postMessage(msg: unknown, target: string): void };
  addEventListener(type: 'message', fn: (e: { data: unknown; source?: unknown }) => void): void;
  matchMedia?(q: string): { matches: boolean };
  ResizeObserver?: new (cb: () => void) => { observe(el: unknown): void };
}

/** The MCP Apps handshake: initialize, then draw each tool result the host posts. Runs in the view. */
export function bootPlanReceipt(win: ViewWindow, render: (result: Json | undefined) => string, protocolVersion: string): void {
  type Msg = { jsonrpc?: string; id?: number | string; method?: string; params?: Json; result?: Json };
  const doc = win.document;
  const root = doc.documentElement;
  const send = (msg: Json) => win.parent.postMessage({ jsonrpc: '2.0', ...msg }, '*');
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
  let result: Json | undefined;
  const draw = () => {
    const el = doc.getElementById('receipt');
    if (el) el.innerHTML = render(result);
    reportSize();
  };
  setTheme(win.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  win.addEventListener('message', (e) => {
    if (e.source !== undefined && e.source !== null && e.source !== win.parent) return;
    const m = e.data as Msg | null;
    if (!m || m.jsonrpc !== '2.0') return;
    if (m.method === undefined && m.id === 1) {
      setTheme((m.result?.hostContext as Json | undefined)?.theme);
      send({ method: 'ui/notifications/initialized', params: {} });
      draw();
    } else if (m.method === 'ui/notifications/tool-result') {
      result = (m.params?.structuredContent as Json | undefined) ?? undefined;
      draw();
    } else if (m.method === 'ui/notifications/host-context-changed') setTheme(m.params?.theme);
    else if (m.id !== undefined && (m.method === 'ui/resource-teardown' || m.method === 'ping')) send({ id: m.id, result: {} });
  });
  send({ id: 1, method: 'ui/initialize', params: { appInfo: { name: 'ProcessForge run receipt', version: '1' }, appCapabilities: {}, protocolVersion } });
  if (win.ResizeObserver) new win.ResizeObserver(reportSize).observe(root);
  draw();
}

const STYLES = `
${generateOsakaJadeCssVariables('both')}
html, body { margin: 0; background: var(--pf-bg-base); color: var(--pf-text-primary); font-family: ${fontFamily.sans}; }
body { padding: 12px; overflow-wrap: anywhere; font-size: 13px; line-height: 1.45; }
section { margin-top: 12px; }
.pf-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pf-kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--pf-text-accent); margin-right: 8px; }
.pf-id, .pf-meta { font: 400 11px/1 ${fontFamily.mono}; color: var(--pf-text-muted); }
.pf-badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap; }
.pf-badge[data-tone="ok"] { color: var(--pf-jade-400); }
.pf-badge[data-tone="warn"] { color: var(--pf-status-blocked); }
.pf-badge[data-tone="error"] { color: var(--pf-status-failed); }
.pf-badge[data-tone="idle"] { color: var(--pf-text-secondary); }
.pf-label { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--pf-text-muted); margin-bottom: 6px; }
.pf-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.pf-list li { display: flex; gap: 8px; align-items: baseline; }
.pf-list s { color: var(--pf-text-muted); }
.pf-sign { flex: none; width: 14px; text-align: center; font: 700 13px/1 ${fontFamily.mono}; color: var(--pf-text-secondary); }
.pf-sign[data-sign="+"] { color: var(--pf-jade-400); }
.pf-sign[data-sign="−"] { color: var(--pf-status-failed); }
.pf-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(140px, 100%), 1fr)); gap: 8px; }
.pf-tile { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--pf-border-subtle); background: var(--pf-bg-surface); min-width: 0; }
.pf-figure { margin-top: 2px; font: 600 16px/1.2 ${fontFamily.mono}; font-variant-numeric: tabular-nums; }
.pf-unit { margin-left: 4px; font: 400 11px/1 ${fontFamily.mono}; color: var(--pf-text-muted); }
.pf-was { font-size: 11px; color: var(--pf-text-muted); }
.pf-issues, .pf-error { margin: 8px 0 0; color: var(--pf-status-failed); }
.pf-cleared { margin: 8px 0 0; color: var(--pf-jade-400); }
.pf-foot { margin: 12px 0 0; padding-top: 8px; border-top: 1px solid var(--pf-border-subtle); color: var(--pf-text-secondary); font-size: 12px; }
.pf-empty { margin: 0; color: var(--pf-text-muted); }
`;

/** The view: one self-contained page. */
export function planReceiptHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Run receipt</title>
<style>${STYLES}</style>
</head>
<body>
<main id="receipt" aria-live="polite"></main>
<script>
(${bootPlanReceipt.toString()})(window, ${renderPlanReceipt.toString()}, ${JSON.stringify(MCP_APP_PROTOCOL_VERSION)});
</script>
</body>
</html>
`;
}
