import { z } from 'zod';
import type { NozzleDressing, UnitOpDressing } from '../nodes.js';

/**
 * The drawing of a unit operation, as part of its contract.
 *
 * Like the rest of a contract it is data: a list of primitive shapes in the
 * drawing's own coordinates, plus one nozzle for every port. The app renders
 * it; nothing in it runs. Nozzles are in percent of the drawing (0-100 on each
 * axis), the same convention as the canvas, so a pipe attaches exactly where
 * the author put the nozzle.
 */

const coord = z.number().finite();
const Point = z.tuple([coord, coord]);

/** body: the equipment outline. detail: internals, thinner. fill: a tinted area (a liquid level, a bed). */
const Layer = z.enum(['body', 'detail', 'fill']).default('body');

const common = { layer: Layer, dashed: z.boolean().optional() };

export const DrawingShapeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rect'), x: coord, y: coord, width: z.number().positive(), height: z.number().positive(), rx: z.number().min(0).optional(), ...common }),
  z.object({ type: z.literal('circle'), cx: coord, cy: coord, r: z.number().positive(), ...common }),
  z.object({ type: z.literal('ellipse'), cx: coord, cy: coord, rx: z.number().positive(), ry: z.number().positive(), ...common }),
  z.object({ type: z.literal('line'), x1: coord, y1: coord, x2: coord, y2: coord, ...common }),
  z.object({ type: z.literal('polyline'), points: z.array(Point).min(2).max(200), ...common }),
  z.object({ type: z.literal('polygon'), points: z.array(Point).min(3).max(200), ...common }),
  z.object({ type: z.literal('path'), d: z.string().min(1).max(4000), ...common })
]);
export type DrawingShape = z.infer<typeof DrawingShapeSchema>;

export const DrawingNozzleSchema = z.object({
  /** The contract port this nozzle is. */
  portId: z.string().min(1),
  /** Percent of the drawing's width and height. */
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  /** The direction the pipe leaves in. */
  side: z.enum(['top', 'bottom', 'left', 'right']),
  label: z.string().optional()
});
export type DrawingNozzle = z.infer<typeof DrawingNozzleSchema>;

export const UnitOpDrawingSchema = z.object({
  viewBox: z.object({ width: z.number().min(20).max(400), height: z.number().min(20).max(400) }),
  shapes: z.array(DrawingShapeSchema).min(1).max(150),
  nozzles: z.array(DrawingNozzleSchema).default([])
});
export type UnitOpDrawing = z.infer<typeof UnitOpDrawingSchema>;

// ---------------------------------------------------------------- path data

const PATH_TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Parses SVG path data into the points it passes through (vertices and curve
 * end points), in absolute coordinates. Returns an error for anything that is
 * not plain path data.
 */
export function pathPoints(d: string): { points: [number, number][] } | { error: string } {
  const stripped = d.replace(PATH_TOKEN, ' ').replace(/[\s,]+/g, '');
  if (stripped.length > 0) return { error: `path data has characters that are not path commands or numbers: "${stripped.slice(0, 20)}"` };
  const tokens = [...d.matchAll(PATH_TOKEN)].map((m) => m[1] ?? Number(m[2]));
  const points: [number, number][] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === 'string') {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        x = sx;
        y = sy;
        points.push([x, y]);
      }
      continue;
    }
    if (!cmd) return { error: 'path data must start with a command (M)' };
    const upper = cmd.toUpperCase();
    const n = ARGS[upper] ?? 0;
    if (n === 0) return { error: `unexpected number after ${cmd}` };
    const args = tokens.slice(i, i + n);
    if (args.length < n || args.some((a) => typeof a !== 'number')) return { error: `${cmd} needs ${n} numbers` };
    const a = args as number[];
    const rel = cmd !== upper;
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (upper) {
      case 'H':
        x = ox + a[0]!;
        break;
      case 'V':
        y = oy + a[0]!;
        break;
      case 'A':
        x = ox + a[5]!;
        y = oy + a[6]!;
        break;
      default:
        x = ox + a[n - 2]!;
        y = oy + a[n - 1]!;
    }
    if (upper === 'M') {
      sx = x;
      sy = y;
      // Further pairs after M are line-tos.
      cmd = rel ? 'l' : 'L';
    }
    points.push([x, y]);
    i += n;
  }
  if (points.length === 0) return { error: 'path data has no points' };
  return { points };
}

// ------------------------------------------------------------------ outline

function segDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function polyDistance(px: number, py: number, pts: [number, number][], closed: boolean): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) best = Math.min(best, segDistance(px, py, ...pts[i]!, ...pts[i + 1]!));
  if (closed && pts.length > 2) best = Math.min(best, segDistance(px, py, ...pts[pts.length - 1]!, ...pts[0]!));
  return best;
}

/** Distance from a point to a shape's outline, in drawing units. */
function outlineDistance(px: number, py: number, s: DrawingShape): number {
  switch (s.type) {
    case 'rect': {
      const pts: [number, number][] = [
        [s.x, s.y],
        [s.x + s.width, s.y],
        [s.x + s.width, s.y + s.height],
        [s.x, s.y + s.height]
      ];
      return polyDistance(px, py, pts, true);
    }
    case 'circle':
      return Math.abs(Math.hypot(px - s.cx, py - s.cy) - s.r);
    case 'ellipse': {
      // Distance along the ray from the centre: good enough for "is it on the wall".
      const nx = (px - s.cx) / s.rx;
      const ny = (py - s.cy) / s.ry;
      const k = Math.hypot(nx, ny);
      if (k === 0) return Math.min(s.rx, s.ry);
      return Math.hypot(px - (s.cx + (px - s.cx) / k), py - (s.cy + (py - s.cy) / k));
    }
    case 'line':
      return segDistance(px, py, s.x1, s.y1, s.x2, s.y2);
    case 'polyline':
      return polyDistance(px, py, s.points as [number, number][], false);
    case 'polygon':
      return polyDistance(px, py, s.points as [number, number][], true);
    case 'path': {
      const r = pathPoints(s.d);
      return 'error' in r ? Infinity : polyDistance(px, py, r.points, false);
    }
  }
}

function shapeExtent(s: DrawingShape): [number, number, number, number] {
  switch (s.type) {
    case 'rect':
      return [s.x, s.y, s.x + s.width, s.y + s.height];
    case 'circle':
      return [s.cx - s.r, s.cy - s.r, s.cx + s.r, s.cy + s.r];
    case 'ellipse':
      return [s.cx - s.rx, s.cy - s.ry, s.cx + s.rx, s.cy + s.ry];
    case 'line':
      return [Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2)];
    case 'polyline':
    case 'polygon': {
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case 'path': {
      const r = pathPoints(s.d);
      if ('error' in r) return [0, 0, 0, 0];
      const xs = r.points.map((p) => p[0]);
      const ys = r.points.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
  }
}

// --------------------------------------------------------------- the check

export interface DrawingCheck {
  errors: string[];
  warnings: string[];
}

/**
 * The drawing gate. Errors make the unit unusable on the canvas (a port with
 * no nozzle cannot be piped; shapes outside the drawing are cut off; path data
 * that does not parse draws nothing). Warnings are drawings that work but look
 * wrong (a nozzle floating away from the equipment, or facing inward).
 */
export function checkUnitOpDrawing(drawing: UnitOpDrawing, ports: { id: string; direction: string }[]): DrawingCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { width: W, height: H } = drawing.viewBox;
  const margin = 0.02 * Math.max(W, H);

  drawing.shapes.forEach((s, i) => {
    if (s.type === 'path') {
      const r = pathPoints(s.d);
      if ('error' in r) {
        errors.push(`drawing.shapes[${i}]: ${r.error}`);
        return;
      }
    }
    const [x0, y0, x1, y1] = shapeExtent(s);
    if (x0 < -margin || y0 < -margin || x1 > W + margin || y1 > H + margin) {
      errors.push(
        `drawing.shapes[${i}] (${s.type}) reaches outside the ${W} x ${H} viewBox (extent ${x0.toFixed(1)},${y0.toFixed(1)} to ${x1.toFixed(1)},${y1.toFixed(1)}); it would be cut off.`
      );
    }
  });

  const portIds = new Set(ports.map((p) => p.id));
  const seen = new Map<string, number>();
  drawing.nozzles.forEach((n, i) => {
    if (!portIds.has(n.portId)) errors.push(`drawing.nozzles[${i}]: portId "${n.portId}" is not a port of this unit.`);
    seen.set(n.portId, (seen.get(n.portId) ?? 0) + 1);
  });
  for (const [portId, count] of seen) {
    if (count > 1 && portIds.has(portId)) errors.push(`Port "${portId}" has ${count} nozzles; give each port exactly one.`);
  }
  for (const p of ports) {
    if (!seen.has(p.id)) errors.push(`Port "${p.id}" has no nozzle on the drawing, so it cannot be piped. Add one to drawing.nozzles.`);
  }

  const body = drawing.shapes.filter((s) => s.layer !== 'detail');
  const tolerance = 0.06 * Math.min(W, H);
  for (const n of drawing.nozzles) {
    const px = (n.x / 100) * W;
    const py = (n.y / 100) * H;
    const d = Math.min(...body.map((s) => outlineDistance(px, py, s)));
    if (Number.isFinite(d) && d > tolerance) {
      warnings.push(
        `Nozzle for "${n.portId}" at ${n.x}%, ${n.y}% is ${d.toFixed(1)} units from the nearest body outline; put it on the equipment wall.`
      );
    }
    const inward =
      (n.side === 'left' && n.x > 70) || (n.side === 'right' && n.x < 30) || (n.side === 'top' && n.y > 70) || (n.side === 'bottom' && n.y < 30);
    if (inward) warnings.push(`Nozzle for "${n.portId}" faces ${n.side} but sits on the opposite half of the drawing; the pipe would cross the equipment.`);
  }
  return { errors, warnings };
}

// ---------------------------------------------------------------- rendering

const f = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

function shapeSvg(s: DrawingShape, extra: string): string {
  const dash = s.dashed ? ' stroke-dasharray="4 3"' : '';
  const a = `${extra}${dash}`;
  switch (s.type) {
    case 'rect':
      return `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.width)}" height="${f(s.height)}"${s.rx ? ` rx="${f(s.rx)}"` : ''}${a}/>`;
    case 'circle':
      return `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}"${a}/>`;
    case 'ellipse':
      return `<ellipse cx="${f(s.cx)}" cy="${f(s.cy)}" rx="${f(s.rx)}" ry="${f(s.ry)}"${a}/>`;
    case 'line':
      return `<line x1="${f(s.x1)}" y1="${f(s.y1)}" x2="${f(s.x2)}" y2="${f(s.y2)}"${a}/>`;
    case 'polyline':
      return `<polyline points="${s.points.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="none"${a}/>`;
    case 'polygon':
      return `<polygon points="${s.points.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}"${a}/>`;
    case 'path': {
      // Re-emitted from the parsed tokens, never the author's raw string.
      const tokens = [...s.d.matchAll(PATH_TOKEN)].map((m) => m[1] ?? f(Number(m[2])));
      return `<path d="${tokens.join(' ')}"${a}/>`;
    }
  }
}

/**
 * SVG markup for the drawing, built from the validated shapes with every
 * value re-formatted as a number, so nothing the author wrote reaches the
 * page as markup.
 */
export function drawingToSvg(drawing: UnitOpDrawing): { shell: string; details: string; viewBox: string } {
  const shell = drawing.shapes
    .filter((s) => s.layer !== 'detail')
    .map((s) => shapeSvg(s, s.layer === 'fill' ? ' fill="rgba(16, 185, 129, 0.26)" stroke="none"' : ''))
    .join('');
  const details = drawing.shapes
    .filter((s) => s.layer === 'detail')
    .map((s) => shapeSvg(s, ''))
    .join('');
  return { shell, details, viewBox: `0 0 ${f(drawing.viewBox.width)} ${f(drawing.viewBox.height)}` };
}

/** The canvas dressing for a unit drawn by its contract: its shapes, and its nozzles linked to its ports. */
export function drawingToDressing(
  drawing: UnitOpDrawing,
  ports: { id: string; name: string; direction: 'INLET' | 'OUTLET' }[]
): UnitOpDressing {
  const svg = drawingToSvg(drawing);
  const nozzles: NozzleDressing[] = drawing.nozzles
    .filter((n) => ports.some((p) => p.id === n.portId))
    .map((n, i) => {
      const port = ports.find((p) => p.id === n.portId)!;
      return {
        id: `N${i + 1}`,
        name: n.label ?? port.name,
        role: port.direction === 'INLET' ? 'inlet' : 'outlet',
        x: n.x,
        y: n.y,
        position: n.side,
        sizeInches: 2,
        ratingPsi: 150,
        portId: port.id
      };
    });
  const w = drawing.viewBox.width;
  const h = drawing.viewBox.height;
  return {
    nozzles,
    internals: {
      agitatorType: 'none',
      hasJacket: false,
      jacketType: 'none',
      baffleCount: 0,
      packingType: 'none',
      hasDemister: false,
      hasSprayHeader: false
    },
    customSvgShell: svg.shell,
    customSvgDetails: svg.details || undefined,
    viewBox: svg.viewBox,
    // Wide drawings get more room on the canvas than tall ones.
    defaultSize: (() => {
      const width = Math.round(Math.min(220, Math.max(110, w > h ? 190 : 150)));
      return { width, height: Math.round((width * h) / w) };
    })(),
    generatedBySubAgent: true
  };
}
