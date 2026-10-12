// Records the landing page's clips of the real app: the studio, as the
// desktop app shows it, working the cold-brew example (src/landing/coldBrew.ts).
//
//   pnpm --filter @process-forge/web exec tsc        (builds dist/landing/coldBrew.js)
//   pnpm --filter @process-forge/web dev             (in another terminal)
//   node apps/web/scripts/record-landing.mjs
//
// Writes public/landing/<clip>.webm and a poster .jpg for each. Re-run it
// whenever the studio changes, so the page keeps showing the app as it is.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..');
const out = path.join(web, 'public', 'landing');
const URL = process.env.STUDIO_URL ?? 'http://localhost:3000/';
// Recorded at a desktop window's size, so the toolbar shows its labels, and scaled to 1280x800.
const VIEWPORT = { width: 1440, height: 900 };
const SIZE = { width: 1280, height: 800 };

const { buildColdBrewLine } = await import(pathToFileURL(path.join(web, 'dist', 'landing', 'coldBrew.js')).href);
const { createSimulationProject } = await import('@process-forge/protocol');
const project = createSimulationProject('Cold-brew freeze concentration', buildColdBrewLine(), {
  description: 'Freeze-concentrating cold brew: a scraped-surface freezer and a wash column, designed by Claude through the MCP server.'
});

// Playwright's own ffmpeg, to cut the page load off the start of each clip.
function ffmpeg() {
  const root = path.join(os.homedir(), process.platform === 'win32' ? 'AppData/Local/ms-playwright' : process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  const dir = fs.readdirSync(root).find((d) => d.startsWith('ffmpeg'));
  const bin = dir && fs.readdirSync(path.join(root, dir)).find((f) => f.startsWith('ffmpeg'));
  return bin ? path.join(root, dir, bin) : undefined;
}

/** A button or tab by its accessible name: exact for a string, any match for a pattern. */
const button = (page, name) => {
  const opts = typeof name === 'string' ? { name, exact: true } : { name };
  return page.getByRole('button', opts).or(page.getByRole('tab', opts)).first();
};
/** Opens the example from the portal's list of projects on this computer. */
const openProject = (page) => page.getByText('Cold-brew freeze concentration', { exact: true }).last().click();

async function record(name, act) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-rec-'));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ recordVideo: { dir: tmp, size: SIZE }, viewport: VIEWPORT });
  await ctx.addInitScript((p) => {
    // The desktop runtime: the studio opens on the portal, as the app does.
    window.__TAURI__ = {};
    if (!localStorage.getItem('pf_recording')) {
      localStorage.setItem('pf_current_project', p);
      localStorage.setItem('pf_ai_setup_asked', 'recording');
      localStorage.setItem('pf_recording', '1');
    }
  }, JSON.stringify(project));
  const page = await ctx.newPage();
  const started = Date.now();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const trim = (Date.now() - started) / 1000;
  // The poster is the frame the clip shows before it plays: the moment `act` picks, else its last.
  let posed = false;
  const poster = async () => {
    posed = true;
    await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 82 });
  };
  await act(page, poster);
  if (!posed) await poster();
  const video = await page.video().path();
  await ctx.close();
  await browser.close();
  const target = path.join(out, `${name}.webm`);
  const bin = ffmpeg();
  if (bin) {
    execFileSync(bin, ['-y', '-loglevel', 'error', '-ss', trim.toFixed(2), '-i', video, '-c:v', 'libvpx', '-b:v', '900k', '-an', target]);
  } else {
    fs.copyFileSync(video, target);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${name}.webm  ${(fs.statSync(target).size / 1e6).toFixed(2)} MB`);
}

fs.mkdirSync(out, { recursive: true });

// 1. The line: open it from the portal, run it, read the stream table.
await record('studio-run', async (page, poster) => {
  await page.waitForTimeout(1200);
  await openProject(page);
  await page.waitForTimeout(1500);
  await button(page, '5×').click();
  await button(page, 'Run').click();
  await page.waitForTimeout(6000);
  await poster();
  await button(page, 'Stream table').click();
  await page.waitForTimeout(3500);
});

// 2. The unit: what comes in and goes out, its panel, and a check failing when a setting changes.
await record('studio-unit', async (page) => {
  await openProject(page);
  await page.waitForTimeout(800);
  await button(page, '5×').click();
  await button(page, 'Run').click();
  await page.waitForTimeout(2500);
  await page.getByText('Cold-Brew Freeze Concentrator').first().dblclick();
  await page.waitForTimeout(3000);
  await button(page, 'Design').click();
  await page.waitForTimeout(2500);
  await button(page, /^Settings/).click().catch(() => {});
  const chiller = page.getByLabel('Chiller capacity', { exact: true }).first();
  await chiller.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await chiller.click();
  await chiller.fill('80');
  await chiller.press('Enter');
  await page.waitForTimeout(1200);
  await button(page, /^Glance/).click().catch(() => {});
  await page.waitForTimeout(3500);
});
