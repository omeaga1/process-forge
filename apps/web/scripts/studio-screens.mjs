// Drives the built studio (dist/) through its main screens in a headless
// browser, the way the desktop app shows them, and checks each one: no page
// error, the screen's key parts on show, nothing spilling sideways. Every
// screen is saved as a PNG.
//
//   node scripts/studio-screens.mjs --out <dir>            check and capture
//   node scripts/studio-screens.mjs --out <dir> --capture-only
//        capture what it can without failing (an older build without a screen)
//   node scripts/studio-screens.mjs --compare <before> <after> [--report <file.md>]
//        how much each screen changed between two captures, as a Markdown table
//
// CI captures the pull request and its base branch and reports what changed
// (ci-studio-screens.yml), so a change to how the studio looks is seen in
// review, not after a release. Run after `vite build`.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (flag('--compare')) {
  const i = args.indexOf('--compare');
  await compare(args[i + 1], args[i + 2], value('--report'));
  process.exit(0);
}

const out = path.resolve(value('--out') ?? path.join(web, 'screens'));
const captureOnly = flag('--capture-only');
const dist = path.resolve(value('--dist') ?? path.join(web, 'dist'));
fs.mkdirSync(out, { recursive: true });

const port = Number(value('--port') ?? 4183);
const server = spawn(
  process.execPath,
  [path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js'), 'preview', '--port', String(port), '--strictPort', '--outDir', dist],
  { cwd: web, stdio: 'pipe' }
);
const ready = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite preview did not start')), 30000);
  server.stdout.on('data', (d) => String(d).includes(String(port)) && (clearTimeout(t), resolve()));
  server.on('exit', (code) => reject(new Error(`vite preview exited (${code})`)));
});

const results = [];
let failed = false;
const note = (name, ok, why = '') => {
  results.push({ name, ok, why });
  if (!ok && !captureOnly) failed = true;
  console.log(`${ok ? 'ok  ' : captureOnly ? 'skip' : 'FAIL'} ${name}${why ? `: ${why}` : ''}`);
};

/** Runs one screen: `fn` sets it up and returns what to check; the screen is then saved. */
async function screen(page, errors, name, fn) {
  const before = errors.length;
  try {
    const { shot = page, check = [] } = (await fn()) ?? {};
    for (const [what, ok] of check) if (!ok) throw new Error(what);
    if (errors.length > before) throw new Error(`page error: ${errors.slice(before).join(' | ')}`);
    await shot.screenshot({ path: path.join(out, `${name}.png`), animations: 'disabled' });
    note(name, true);
  } catch (e) {
    note(name, false, String(e?.message ?? e).split('\n')[0]);
  }
}

/** True when nothing inside `selector` is wider than its box (a row spilling sideways). */
const noSidewaysSpill = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return Boolean(el) && el.scrollWidth <= el.clientWidth + 1;
  }, selector);

try {
  await ready;
  const browser = await chromium.launch();
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // The desktop app, with the first-run questions already answered and Claude as the assistant.
    await page.addInitScript((t) => {
      window.__TAURI__ = {};
      if (sessionStorage.getItem('pf-screens')) return;
      sessionStorage.setItem('pf-screens', '1');
      localStorage.setItem('pf_ai_setup_asked', 'screens');
      localStorage.setItem('pf_assistant_route', 'claude-desktop');
      localStorage.setItem('pf-theme', t);
    }, theme);
    await page.clock.install({ time: new Date('2026-10-23T09:00:00Z') });
    await page.goto(`http://localhost:${port}/`);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const suffix = theme === 'dark' ? '' : '-light';

    await screen(page, errors, `portal${suffix}`, async () => {
      await page.getByText('Your flowsheets').waitFor({ timeout: 10000 });
      return { check: [['shows the templates', await page.getByText('Juice concentration line').isVisible()]] };
    });

    await screen(page, errors, `studio${suffix}`, async () => {
      await page.getByText('Juice concentration line').first().click();
      await page.locator('.react-flow__node').first().waitFor({ timeout: 10000 });
      // Steady state settles a moment after the line opens.
      await page.clock.runFor(1500);
      await page.waitForTimeout(500);
      const units = await page.locator('.react-flow__node').count();
      return { check: [[`draws the line's 10 units (drew ${units})`, units === 10], ['the header fits', await noSidewaysSpill(page, 'header')]] };
    });

    if (theme === 'light') {
      await page.close();
      continue;
    }

    await screen(page, errors, 'unit-inspector', async () => {
      await page.locator('.react-flow__node[data-id="juice-e-101"]').dblclick();
      await page.getByText('Inputs').first().waitFor({ timeout: 5000 });
      await page.waitForTimeout(300);
      return { check: [['shows Results', await page.getByText('Results').first().isVisible()]] };
    });

    await screen(page, errors, 'history', async () => {
      // An edit ten minutes on, so the history holds the line as it opened and as it is now.
      await page.clock.fastForward('11:00');
      // The preheater's first input, its target temperature.
      const input = page.locator('input[aria-label="Target temperature"]');
      await input.fill('70', { timeout: 5000 });
      await input.press('Enter');
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /^History/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5000 });
      const rows = await page.locator('[data-testid="history-list"] li').count();
      return { shot: dialog, check: [[`lists the two versions (listed ${rows})`, rows >= 2]] };
    });
    await page.keyboard.press('Escape');

    await screen(page, errors, 'plan-receipt', async () => {
      // Back to the assistant panel, where a plan from Claude lands.
      await page.getByRole('button', { name: /^Close · Esc/ }).click();
      const { planReceipt } = await import('@process-forge/tools');
      const state = await page.evaluate(() => {
        const project = JSON.parse(localStorage.getItem('pf_current_project'));
        const versions = JSON.parse(localStorage.getItem(`pf_versions_${project.id}`) ?? '[]');
        // The line as it opened, before the edit: where "go back" should land.
        return { graph: project.graph, version: versions.at(-1) };
      });
      const receipt = planReceipt(
        state.graph,
        [
          { op: 'add-unit', unit: 'surge-tank', name: 'Concentrate Tank T-501', parameters: { capacityGallons: 2000, initialLevelGallons: 0 } },
          { op: 'remove-stream', from: 'P-401', to: 'P-600' },
          { op: 'add-stream', from: 'P-401', to: 'T-501' },
          { op: 'add-stream', from: 'T-501', to: 'P-600' }
        ],
        { restorePoint: { id: state.version.id, label: state.version.label } }
      );
      if (!receipt) throw new Error('the sample plan does not apply to the juice line');
      await page.evaluate((r) => window.dispatchEvent(new CustomEvent('pf-plan-receipt', { detail: { receipt: { ...r, readBack: { verified: true } }, source: 'mcp' } })), receipt);
      const card = page.getByTestId('plan-receipt');
      await card.waitFor({ timeout: 5000 });
      return {
        shot: card,
        check: [
          ['says the plan was applied and read back', /plan applied/i.test(await card.innerText())],
          ['shows the added tank', /Concentrate Tank T-501/.test(await card.innerText())]
        ]
      };
    });

    await screen(page, errors, 'after-going-back', async () => {
      const state = () =>
        page.evaluate(() => {
          const project = JSON.parse(localStorage.getItem('pf_current_project'));
          return { graph: JSON.stringify(project.graph), versions: JSON.parse(localStorage.getItem(`pf_versions_${project.id}`) ?? '[]').map((v) => JSON.stringify(v.graph)) };
        });
      const before = await state();
      await page.getByRole('button', { name: /Go back to before this plan/ }).click();
      await page.waitForTimeout(300);
      const after = await state();
      const t = (g) => JSON.parse(g).nodes.find((n) => n.id === 'juice-e-101')?.config?.targetC;
      return {
        check: [
          // The edit made for the history screen (68 → 70 °C) is undone.
          [`the preheater is back at ${t(before.versions.at(-1))} °C (it is at ${t(after.graph)} °C)`, t(after.graph) === t(before.versions.at(-1)) && t(before.graph) !== t(after.graph)],
          ['the flowsheet as it was before going back is kept', after.versions.some((v) => t(v) === t(before.graph))]
        ]
      };
    });

    await page.close();
  }
  await browser.close();
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  server.kill();
}
fs.writeFileSync(path.join(out, 'screens.json'), JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);

/**
 * The share of pixels that differ between two captures of each screen, worked
 * out in the browser so nothing more needs installing. A screen in only one
 * capture is listed as new or gone.
 */
async function compare(beforeDir, afterDir, reportFile) {
  const names = [...new Set([...fs.readdirSync(beforeDir), ...fs.readdirSync(afterDir)])].filter((f) => f.endsWith('.png')).sort();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const rows = [];
  for (const name of names) {
    const a = path.join(beforeDir, name);
    const b = path.join(afterDir, name);
    if (!fs.existsSync(a) || !fs.existsSync(b)) {
      rows.push({ name, change: fs.existsSync(b) ? 'new' : 'gone' });
      continue;
    }
    const url = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
    const r = await page.evaluate(
      async ([ua, ub]) => {
        const load = (src) => new Promise((ok, no) => Object.assign(new Image(), { onload() { ok(this); }, onerror: no, src }));
        const [ia, ib] = await Promise.all([load(ua), load(ub)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return { size: `${ia.width}×${ia.height} → ${ib.width}×${ib.height}` };
        const px = (img) => {
          const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, img.width, img.height).data;
        };
        const da = px(ia);
        const db = px(ib);
        let diff = 0;
        for (let i = 0; i < da.length; i += 4) {
          if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) diff++;
        }
        return { share: diff / (da.length / 4) };
      },
      [url(a), url(b)]
    );
    rows.push({ name, change: r.size ? `resized ${r.size}` : r.share < 0.001 ? 'same' : `${(r.share * 100).toFixed(1)} % of pixels` });
  }
  await browser.close();
  const changed = rows.filter((r) => r.change !== 'same');
  const md = [
    '### Studio screens',
    '',
    changed.length ? `${changed.length} of ${rows.length} screens look different from the base branch. The captures are in the run's **studio-screens** artifact.` : `All ${rows.length} screens look the same as on the base branch.`,
    '',
    '| Screen | Change |',
    '| --- | --- |',
    ...rows.map((r) => `| ${r.name.replace(/\.png$/, '')} | ${r.change} |`)
  ].join('\n');
  console.log(md);
  if (reportFile) fs.appendFileSync(reportFile, `${md}\n`);
}
