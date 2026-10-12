// Loads the production build (dist/) in a headless browser, as the public site
// and as the desktop app sees it, and fails on any page error or a blank page.
// Unit tests run the source; this runs what ships. Run after `vite build`.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..');
const port = 4179;

const server = spawn(process.execPath, [path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js'), 'preview', '--port', String(port), '--strictPort'], { cwd: web, stdio: 'pipe' });
const ready = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite preview did not start')), 30000);
  server.stdout.on('data', (d) => String(d).includes(String(port)) && (clearTimeout(t), resolve()));
  server.on('exit', (code) => reject(new Error(`vite preview exited (${code})`)));
});

let failed = false;
try {
  await ready;
  const browser = await chromium.launch();
  const cases = [
    { name: 'public site', desktop: false, expect: /Describe the equipment/ },
    { name: 'desktop app', desktop: true, expect: /Your flowsheets/ }
  ];
  // The website builds with base '/' (VITE_BASE_PATH), so each of its pages opens from its own address.
  if (/src="\/assets\//.test(fs.readFileSync(path.join(web, 'dist', 'index.html'), 'utf8'))) {
    cases.push(
      { name: 'site: /example', path: '/example', desktop: false, expect: /freeze-concentrated/ },
      { name: 'site: /library', path: '/library', desktop: false, expect: /ProcessForge Library/ },
      { name: 'site: /claude', path: '/claude', desktop: false, expect: /tools, one engine/ },
      { name: 'site: /download', path: '/download', desktop: false, expect: /Up and running/ }
    );
  }
  for (const c of cases) {
    const page = await browser.newPage();
    if (c.desktop) await page.addInitScript(() => { window.__TAURI__ = {}; });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${port}${c.path ?? '/'}`);
    let text = '';
    for (let i = 0; i < 20 && !c.expect.test(text); i++) {
      await page.waitForTimeout(250);
      text = await page.locator('body').innerText();
    }
    const ok = !errors.length && c.expect.test(text);
    if (!ok) failed = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}${errors.length ? `: ${errors.join(' | ')}` : c.expect.test(text) ? '' : `: did not show ${c.expect}`}`);
    await page.close();
  }
  await browser.close();
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  server.kill();
}
process.exit(failed ? 1 : 0);
