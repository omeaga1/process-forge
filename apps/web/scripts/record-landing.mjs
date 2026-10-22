// Records the landing page's clip of the real app: the studio, as the
// desktop app shows it, running the bottling line (scripts/landing-bottling.mjs).
//
//   pnpm --filter @process-forge/web exec tsc        (builds dist/landing/coldBrew.js)
//   pnpm --filter @process-forge/web dev             (in another terminal)
//   node apps/web/scripts/record-landing.mjs
//
// Writes public/landing/<clip>.webm, .mp4 and a poster .jpg. Re-run it
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
// The canvas alone, in that window: below the toolbar, clear of the side rail and the status bar.
const CANVAS_CROP = { x: 0, y: 112, width: 1396, height: 760 };

const { buildColdBrewLine } = await import(pathToFileURL(path.join(web, 'dist', 'landing', 'coldBrew.js')).href);
const { createSimulationProject } = await import('@process-forge/protocol');
const { buildBottlingLine } = await import('./landing-bottling.mjs');
const bottling = createSimulationProject('Bottling line', buildBottlingLine(), {
  description: 'A soft-drink bottling line of designed units, from blending to finished pallets.'
});
const project = createSimulationProject('Cold-brew freeze concentration', buildColdBrewLine(), {
  description: 'Freeze-concentrating cold brew: a scraped-surface freezer and a wash column, designed by Claude through the MCP server.'
});

// Playwright's own ffmpeg, to cut the page load off the start of each clip.
function ffmpeg() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), process.platform === 'win32' ? 'AppData/Local/ms-playwright' : process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  const dir = fs.readdirSync(root).find((d) => d.startsWith('ffmpeg'));
  const bin = dir && fs.readdirSync(path.join(root, dir)).find((f) => f.startsWith('ffmpeg'));
  return bin ? path.join(root, dir, bin) : undefined;
}

/** A button or tab by its accessible name: exact for a string, any match for a pattern. */
const button = (page, name) => {
  const opts = typeof name === 'string' ? { name, exact: true } : { name };
  return page.getByRole('button', opts).or(page.getByRole('tab', opts)).first();
};
/** Where the line's units sit in the window, in CSS pixels. */
const lineBox = (page) =>
  page.evaluate(() => {
    const rs = [...document.querySelectorAll('.react-flow__node')].map((n) => n.getBoundingClientRect());
    return { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
  });
/** Opens the example from the portal's list of projects on this computer. */
const openProject = (page, name = 'Cold-brew freeze concentration') => page.getByText(name, { exact: true }).last().click();

// ONLY=studio-bottling records just that clip.
const only = process.env.ONLY?.split(',');

/** Records one clip. `act` may call `mark()` to start the clip there, cutting what came before (a line warming up). */
async function record(name, act, opened = project, { hifi } = {}) {
  if (only && !only.includes(name)) return;
  if (hifi) return recordHifi(name, act, opened, hifi);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-rec-'));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ recordVideo: { dir: tmp, size: SIZE }, viewport: VIEWPORT });
  await ctx.addInitScript(seed, JSON.stringify(opened));
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
  let from = trim;
  const mark = () => {
    from = (Date.now() - started) / 1000;
  };
  await act(page, poster, mark);
  if (!posed) await poster();
  const video = await page.video().path();
  await ctx.close();
  await browser.close();
  const target = path.join(out, `${name}.webm`);
  const bin = ffmpeg();
  if (bin) {
    execFileSync(bin, ['-y', '-loglevel', 'error', '-ss', from.toFixed(2), '-i', video, '-c:v', 'libvpx', '-b:v', '900k', '-an', target]);
  } else {
    fs.copyFileSync(video, target);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${name}.webm  ${(fs.statSync(target).size / 1e6).toFixed(2)} MB`);
}

/** The desktop runtime: the studio opens on the portal, as the app does, with `p` among the projects on this computer. */
function seed(p) {
  window.__TAURI__ = {};
  if (!localStorage.getItem('pf_recording')) {
    localStorage.setItem('pf_current_project', p);
    localStorage.setItem('pf_ai_setup_asked', 'recording');
    localStorage.setItem('pf_recording', '1');
  }
}

/**
 * Records a clip sharp enough for a retina screen. Playwright's own recorder
 * is fixed at one pixel per CSS pixel and a low bitrate, so instead the page's
 * clock is stopped at `mark()` and stepped a frame at a time, with a
 * screenshot at twice the pixel density after each step: every frame is as
 * sharp as a still, and the motion is even however slow the capture. `crop`
 * is the region to keep, in CSS pixels; the clip is written as VP9 .webm and
 * H.264 .mp4, `width` pixels wide, `seconds` long. Needs ffmpeg with
 * libvpx-vp9 and libx264 on the PATH.
 */
async function recordHifi(name, act, opened, { crop, seconds = Number(process.env.SECONDS ?? 16), width = 2240, fps = 30 }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-rec-'));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await ctx.addInitScript(seed, JSON.stringify(opened));
  const page = await ctx.newPage();
  await page.clock.install();
  await page.goto(URL, { waitUntil: 'networkidle' });
  // The canvas's zoom buttons are for working, not for the picture.
  await page.addStyleTag({ content: '.react-flow__controls, .react-flow__attribution { display: none !important; }' });
  await page.waitForTimeout(600);
  let clip = { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
  let frames = 0;
  // From here the clock only moves when a frame is taken: the clip is `act`'s last stretch, frame by frame. `act` may narrow the crop as it marks.
  const mark = async (narrowed) => {
    if (narrowed) clip = narrowed;
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50);
    for (; frames < seconds * fps; frames++) {
      await page.clock.runFor(1000 / fps);
      await page.screenshot({ path: path.join(tmp, `f${String(frames).padStart(5, '0')}.png`), clip });
      if (frames % fps === 0) console.log(`${name}: ${frames / fps} s`);
    }
    await page.clock.resume();
  };
  await act(page, async () => {}, mark);
  await ctx.close();
  await browser.close();
  console.log(`${name}: ${frames} frames`);
  const vf = `scale=${width}:-2:flags=lanczos`;
  const input = ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(tmp, 'f%05d.png'), '-vf', vf, '-an'];
  execFileSync('ffmpeg', [...input, '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', path.join(out, `${name}.webm`)]);
  execFileSync('ffmpeg', [...input, '-c:v', 'libx264', '-crf', '22', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, `${name}.mp4`)]);
  // The poster is the clip's first frame, so nothing jumps when it starts playing.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(tmp, 'f00000.png'), '-vf', vf, '-q:v', '3', path.join(out, `${name}.jpg`)]);
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const ext of ['webm', 'mp4', 'jpg']) console.log(`${name}.${ext}  ${(fs.statSync(path.join(out, `${name}.${ext}`)).size / 1e6).toFixed(2)} MB`);
}

fs.mkdirSync(out, { recursive: true });

// The front page's line: every machine a designed unit drawn by its kit, running at 5x once the line has filled.
await record(
  'studio-bottling',
  async (page, poster, mark) => {
    await page.waitForTimeout(800);
    await openProject(page, 'Bottling line');
    await page.waitForTimeout(1200);
    // The canvas on its own: the line is the picture.
    await page.getByRole('button', { name: /^Hide the Process Copilot/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /fit view/i }).first().click().catch(() => {});
    await page.waitForTimeout(600);
    // A notch out from the fit, so the line has room at the edges, then centred in the part of the canvas the clip keeps (fitting ignores the floating toolbar).
    const { width: w, height: h } = page.viewportSize();
    await page.mouse.move(w * 0.5, h * 0.5);
    const out = Number(process.env.ZOOM_OUT ?? 0);
    if (out) await page.mouse.wheel(0, out);
    await page.waitForTimeout(500);
    const box = await lineBox(page);
    const crop = CANVAS_CROP;
    const dx = crop.x + crop.width / 2 - (box.l + box.r) / 2;
    const dy = crop.y + crop.height / 2 - (box.t + box.b) / 2;
    // Dragged by a patch of canvas clear of the line.
    const from = { x: dx > 0 ? box.r + 40 : box.l - 40, y: (box.t + box.b) / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    // A long horizon, so the line is still running when the clip ends.
    await button(page, '8h').click();
    await button(page, '5×').click();
    await button(page, 'Run').click();
    // Let the tank fill and bottles reach the palletizer before the clip starts.
    await page.waitForTimeout(25000);
    // Then keep just the line, with a margin, in the canvas's own proportions.
    const line = await lineBox(page);
    const aspect = CANVAS_CROP.width / CANVAS_CROP.height;
    let cw = line.r - line.l + 96;
    let ch = line.b - line.t + 96;
    if (cw / ch < aspect) cw = ch * aspect;
    else ch = cw / aspect;
    const cx = (line.l + line.r) / 2;
    const cy = (line.t + line.b) / 2;
    await mark({ x: Math.round(cx - cw / 2), y: Math.round(cy - ch / 2), width: Math.round(cw), height: Math.round(ch) });
  },
  bottling,
  // Just the canvas, below the toolbar and clear of the side rail and status bar: the line is the picture.
  { hifi: { crop: CANVAS_CROP } }
);
