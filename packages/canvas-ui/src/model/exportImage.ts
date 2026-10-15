import { toSvg } from 'html-to-image';
import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';

/**
 * The flowsheet as a picture to put in a report or an email: the whole sheet
 * (not just what is in view), with a title block under it the way a drawing
 * has one (the flowsheet's name, the date, what it holds, and its status).
 */

export interface TitleBlock {
  title: string;
  /** Under the title: "7 units · 9 streams", the run's verdict. */
  lines: string[];
}

export interface ExportStyle {
  background: string;
  ink: string;
  muted: string;
  rule: string;
  font: string;
  mono: string;
}

/** Pixels per flowsheet unit: twice the screen, so the text stays sharp when printed. */
const SCALE = 2;
const MARGIN = 40;
const BLOCK = 64;

export async function renderFlowsheetPng(viewport: HTMLElement, nodes: Node[], block: TitleBlock, style: ExportStyle): Promise<Blob> {
  const bounds = getNodesBounds(nodes);
  const width = Math.ceil(bounds.width + MARGIN * 2);
  const height = Math.ceil(bounds.height + MARGIN * 2);
  const fit = getViewportForBounds(bounds, width, height, 0.2, 2, MARGIN / Math.max(width, height));
  // As SVG, then drawn onto a canvas here: html-to-image's own PNG step waits on an image decode
  // that some web views (the desktop app's among them) never finish.
  const drawing = await toSvg(viewport, {
    backgroundColor: style.background,
    width,
    height,
    skipFonts: true,
    style: { width: `${width}px`, height: `${height}px`, transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.zoom})` },
    // The selection handles and resize grips are for editing, not for the page.
    filter: (el) => !(el instanceof HTMLElement && (el.classList.contains('react-flow__resize-control') || el.getAttribute('role') === 'slider'))
  });

  const svg = await loadImage(drawing);
  const img = { width: width * SCALE, height: height * SCALE };
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height + BLOCK * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the image.');
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(svg, 0, 0, img.width, img.height);

  // The title block: a rule, the title, and the lines under it; the date on the right.
  const y0 = img.height;
  ctx.strokeStyle = style.rule;
  ctx.lineWidth = SCALE;
  ctx.beginPath();
  ctx.moveTo(MARGIN * SCALE, y0 + SCALE);
  ctx.lineTo(canvas.width - MARGIN * SCALE, y0 + SCALE);
  ctx.stroke();
  ctx.fillStyle = style.ink;
  ctx.font = `600 ${15 * SCALE}px ${style.font}`;
  ctx.textBaseline = 'top';
  ctx.fillText(block.title, MARGIN * SCALE, y0 + 14 * SCALE, canvas.width - 260 * SCALE);
  ctx.fillStyle = style.muted;
  ctx.font = `${11 * SCALE}px ${style.font}`;
  ctx.fillText(block.lines.join('   ·   '), MARGIN * SCALE, y0 + 36 * SCALE, canvas.width - 260 * SCALE);
  ctx.font = `${11 * SCALE}px ${style.mono}`;
  ctx.textAlign = 'right';
  const stamp = `ProcessForge · ${new Date().toISOString().slice(0, 10)}`;
  ctx.fillText(stamp, canvas.width - MARGIN * SCALE, y0 + 16 * SCALE);

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image.'))), 'image/png'));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const t = setTimeout(() => reject(new Error('Drawing the flowsheet took too long.')), 20000);
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      reject(new Error('Could not read the drawing.'));
    };
    img.src = src;
  });
}

/** Saves a blob as a file, as the project download does (the desktop app's web view saves it to Downloads). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Puts a PNG on the clipboard, to paste into a document or a chat. Takes the
 * image still being drawn: the clipboard is asked at once, inside the click,
 * since browsers refuse a write that comes after the click has passed.
 */
export async function copyPng(png: Promise<Blob>): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('Copying an image is not available here: export it instead.');
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  } catch (e) {
    if ((e as Error).name === 'NotAllowedError') throw new Error('this window may not use the clipboard: export it instead.');
    throw e;
  }
}

/** A file name from the flowsheet's name: letters, digits, dashes. */
export function imageFileName(name: string): string {
  const safe = name.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `${safe || 'flowsheet'}.png`;
}
