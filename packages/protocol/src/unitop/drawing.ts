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

/**
 * What a shape is painted with, from the app's theme (so it follows light and
 * dark): outline is the default line drawing; solid and deep are the jade
 * masses the palette uses for product and machine parts; glow is the bright
 * turquoise of liquid and light beams; light is label-paper white; metal a
 * steel panel; gold wood and amber (pallets, cartons); alert a fault red;
 * status a lamp that shows whether the unit is running.
 */
export const DRAWING_TONES = ['outline', 'solid', 'deep', 'glow', 'light', 'metal', 'gold', 'alert', 'status'] as const;
const Tone = z.enum(DRAWING_TONES);

/** Line weight: hair for hatching and guide lines, heavy for frames and shafts. */
export const DRAWING_WEIGHTS = { hair: 0.6, thin: 1, normal: 1.5, bold: 2, heavy: 3 } as const;
const Weight = z.enum(['hair', 'thin', 'normal', 'bold', 'heavy']);

const PartId = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, 'a part id is lower-case letters, digits and dashes');

const common = {
  layer: Layer,
  dashed: z.boolean().optional(),
  tone: Tone.optional(),
  weight: Weight.optional(),
  opacity: z.number().min(0.05).max(1).optional(),
  /** The moving part this shape belongs to (drawing.parts). */
  part: PartId.optional()
};

/**
 * The things a line carries, drawn the way the palette draws them: a PET
 * bottle with its cap and label band, a can, a shipping case, a wooden pallet,
 * a sack, a drum, a carton. Fit to the box given.
 */
export const DRAWING_ITEMS = ['bottle', 'can', 'case', 'pallet', 'bag', 'drum', 'carton', 'jar'] as const;

export const DrawingShapeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rect'),
    x: coord,
    y: coord,
    width: z.number().positive(),
    height: z.number().positive(),
    rx: z.number().min(0).optional(),
    /** A fill that rises and falls with the liquid the unit holds in a run (from its bottom edge). */
    level: z.boolean().optional(),
    ...common
  }),
  z.object({ type: z.literal('circle'), cx: coord, cy: coord, r: z.number().positive(), ...common }),
  z.object({ type: z.literal('ellipse'), cx: coord, cy: coord, rx: z.number().positive(), ry: z.number().positive(), ...common }),
  z.object({ type: z.literal('line'), x1: coord, y1: coord, x2: coord, y2: coord, ...common }),
  z.object({ type: z.literal('polyline'), points: z.array(Point).min(2).max(200), ...common }),
  z.object({ type: z.literal('polygon'), points: z.array(Point).min(3).max(200), ...common }),
  z.object({ type: z.literal('path'), d: z.string().min(1).max(4000), ...common }),
  z.object({
    type: z.literal('item'),
    item: z.enum(DRAWING_ITEMS),
    x: coord,
    y: coord,
    width: z.number().positive(),
    height: z.number().positive(),
    ...common
  })
]);
export type DrawingShape = z.infer<typeof DrawingShapeSchema>;

/**
 * How a part moves while the unit runs (it holds still when the unit is
 * stopped, starved or blocked): spin turns it about its origin (a turret, a
 * reel, an impeller), travel slides it by dx, dy and starts over (bottles on a
 * belt), bob and dive move it out by dx, dy and back (a capping head, a
 * gripper), gantry carries it across and down and back (a palletizer head),
 * blink flashes it (a lamp, a photo-eye), shimmer breathes its fill (a liquid
 * surface), pulse fades it in and out (bubbles, steam).
 */
export const DRAWING_MOTIONS = ['spin', 'spin-reverse', 'travel', 'bob', 'dive', 'gantry', 'blink', 'shimmer', 'pulse'] as const;

export const DrawingPartSchema = z.object({
  id: PartId,
  motion: z.enum(DRAWING_MOTIONS),
  /** Seconds per cycle of the motion. */
  periodS: z.number().min(0.2).max(30).default(2),
  /** spin: the point it turns about, in drawing units. */
  origin: z.object({ x: coord, y: coord }).optional(),
  /** travel, bob, dive, gantry: how far it moves, in drawing units. */
  dx: z.number().min(-400).max(400).optional(),
  dy: z.number().min(-400).max(400).optional(),
  /** Seconds to wait before starting, to stagger parts that move alike. */
  delayS: z.number().min(0).max(30).optional()
});
export type DrawingPart = z.infer<typeof DrawingPartSchema>;

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
  shapes: z.array(DrawingShapeSchema).min(1).max(240),
  nozzles: z.array(DrawingNozzleSchema).default([]),
  /** The parts that move while the unit runs; shapes join one with `part`. */
  parts: z.array(DrawingPartSchema).max(16).optional(),
  /** Where it came from: draw_unit_op's kit and variant, or the unit it was forked from. Shown, never run. */
  origin: z
    .object({
      kit: z.string().max(64).optional(),
      variant: z.number().int().min(0).max(1_000_000).optional(),
      forkedFrom: z.string().max(200).optional()
    })
    .optional()
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
    case 'item':
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
    case 'item':
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

  const partIds = new Set((drawing.parts ?? []).map((p) => p.id));
  if (partIds.size < (drawing.parts ?? []).length) errors.push('drawing.parts: two parts share an id; give each its own.');
  const used = new Set<string>();
  drawing.shapes.forEach((s, i) => {
    if (!s.part) return;
    used.add(s.part);
    if (!partIds.has(s.part)) errors.push(`drawing.shapes[${i}]: part "${s.part}" is not in drawing.parts; declare it there with its motion.`);
  });
  for (const p of drawing.parts ?? []) {
    if (!used.has(p.id)) warnings.push(`drawing.parts: "${p.id}" has no shapes (give the shapes that move part: "${p.id}").`);
    if ((p.motion === 'travel' || p.motion === 'bob' || p.motion === 'dive' || p.motion === 'gantry') && !p.dx && !p.dy) {
      warnings.push(`drawing.parts: "${p.id}" moves by ${p.motion} but has no dx or dy, so it stands still.`);
    }
  }

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

/**
 * Theme colours by tone. Each is the app's CSS variable, so a drawing follows
 * light and dark like the palette's own units, with the dark theme's value as
 * the fallback where no variables exist (an exported image).
 */
const TONE_COLOR: Record<(typeof DRAWING_TONES)[number], string> = {
  outline: 'var(--pf-jade-400, #71cead)',
  solid: 'var(--pf-jade-500, #549e6a)',
  deep: 'var(--pf-jade-600, #509475)',
  glow: 'var(--pf-jade-glow, #2dd5b7)',
  light: 'var(--pf-text-primary, #f6f5dd)',
  metal: 'var(--pf-bg-surface-elevated, #252930)',
  gold: 'var(--pf-fg-selected, #deb266)',
  alert: 'var(--pf-status-failed, #ff5345)',
  status: 'var(--pf-unit-status, var(--pf-status-busy, #549e6a))'
};

const OPEN_SHAPES = new Set(['line', 'polyline']);

/** The paint attributes of one shape: its tone, line weight, dashes and opacity. */
function paint(s: DrawingShape): string {
  const parts: string[] = [];
  const style: string[] = [];
  if (s.layer === 'fill' && !s.tone) {
    // A tinted area takes the theme's jade where the app's CSS variables exist, and this jade elsewhere.
    style.push('fill: var(--pf-jade-500, #10b981)', 'fill-opacity: 0.26');
    parts.push(' stroke="none"');
  } else if (s.tone && s.tone !== 'outline') {
    const c = TONE_COLOR[s.tone];
    // Line work (lines, and every internal on the detail layer) takes the tone as its stroke.
    if (OPEN_SHAPES.has(s.type) || s.layer === 'detail') style.push(`stroke: ${c}`);
    else {
      style.push(`fill: ${c}`);
      if (s.tone === 'gold') style.push('fill-opacity: 0.55', `stroke: ${c}`);
      if (s.layer === 'fill') parts.push(' stroke="none"');
    }
  }
  if (s.weight) parts.push(` stroke-width="${DRAWING_WEIGHTS[s.weight]}"`);
  if (s.opacity !== undefined) parts.push(` opacity="${f(s.opacity)}"`);
  if (s.dashed) parts.push(' stroke-dasharray="4 3"');
  if (style.length) parts.push(` style="${style.join('; ')}"`);
  return parts.join('');
}

/** Item glyphs, drawn in a 100 x 100 box and fitted to the shape's. Body first, then its details. */
const ITEM_GLYPHS: Record<(typeof DRAWING_ITEMS)[number], { tone: (typeof DRAWING_TONES)[number]; body: string[]; details: string[] }> = {
  bottle: {
    tone: 'solid',
    body: ['M42 9 L42 17 C42 25 27 27 27 40 L27 91 Q27 100 36 100 L64 100 Q73 100 73 91 L73 40 C73 27 58 25 58 17 L58 9 Z'],
    details: ['M39 0 L61 0 L61 9 L39 9 Z', 'M27 52 L73 52 L73 74 L27 74 Z', 'M35 80 L35 94']
  },
  can: {
    tone: 'solid',
    body: ['M18 10 Q18 4 26 4 L74 4 Q82 4 82 10 L82 92 Q82 98 74 98 L26 98 Q18 98 18 92 Z'],
    details: ['M18 16 L82 16', 'M18 86 L82 86', 'M28 30 L72 30 L72 70 L28 70 Z']
  },
  case: {
    tone: 'deep',
    body: ['M2 14 L98 14 L98 98 L2 98 Z'],
    details: ['M2 14 L14 2 L86 2 L98 14', 'M50 2 L50 98', 'M2 40 L98 40']
  },
  pallet: {
    tone: 'gold',
    body: ['M0 0 L100 0 L100 34 L0 34 Z', 'M2 34 L18 34 L18 100 L2 100 Z', 'M42 34 L58 34 L58 100 L42 100 Z', 'M82 34 L98 34 L98 100 L82 100 Z'],
    details: ['M0 17 L100 17']
  },
  bag: {
    tone: 'light',
    body: ['M16 14 Q50 0 84 14 L92 86 Q50 100 8 86 Z'],
    details: ['M22 22 Q50 12 78 22', 'M30 50 L70 50', 'M30 62 L62 62']
  },
  drum: {
    tone: 'metal',
    body: ['M14 6 L86 6 L86 94 L14 94 Z'],
    details: ['M14 30 L86 30', 'M14 70 L86 70', 'M60 12 L72 12']
  },
  carton: {
    tone: 'light',
    body: ['M14 22 L50 2 L86 22 L86 98 L14 98 Z'],
    details: ['M14 22 L86 22', 'M50 2 L50 22', 'M24 46 L76 46 L76 78 L24 78 Z']
  },
  jar: {
    tone: 'glow',
    body: ['M20 18 L80 18 L84 30 L84 92 Q84 98 78 98 L22 98 Q16 98 16 92 L16 30 Z'],
    details: ['M22 4 L78 4 L78 18 L22 18 Z', 'M16 44 L84 44 L84 76 L16 76 Z']
  }
};

function itemSvg(s: Extract<DrawingShape, { type: 'item' }>): string {
  const glyph = ITEM_GLYPHS[s.item];
  const tone = s.tone ?? glyph.tone;
  const t = `translate(${f(s.x)} ${f(s.y)}) scale(${f(s.width / 100)} ${f(s.height / 100)})`;
  const fill = TONE_COLOR[tone];
  const opacity = s.opacity !== undefined ? ` opacity="${f(s.opacity)}"` : '';
  const stroke = ' vector-effect="non-scaling-stroke"';
  const body = glyph.body
    .map((d) => `<path d="${d}"${stroke} style="fill: ${fill}${tone === 'gold' ? '; fill-opacity: 0.55' : ''}"/>`)
    .join('');
  // Details sit on the item: label paper on a bottle, a lid, tape on a case.
  const details = glyph.details
    .map((d) => (/Z$/.test(d) ? `<path d="${d}"${stroke} style="fill: ${TONE_COLOR.light}; fill-opacity: 0.8"/>` : `<path d="${d}"${stroke} fill="none"/>`))
    .join('');
  return `<g transform="${t}"${opacity}>${body}${details}</g>`;
}

function shapeSvg(s: DrawingShape): string {
  const a = paint(s);
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
    case 'item':
      return itemSvg(s);
  }
}

/** The centre of a part's shapes: where it spins about unless it says. */
function partCentre(drawing: UnitOpDrawing, id: string): { x: number; y: number } {
  const boxes = drawing.shapes.filter((s) => s.part === id).map(shapeExtent);
  if (!boxes.length) return { x: drawing.viewBox.width / 2, y: drawing.viewBox.height / 2 };
  const x0 = Math.min(...boxes.map((b) => b[0]));
  const y0 = Math.min(...boxes.map((b) => b[1]));
  const x1 = Math.max(...boxes.map((b) => b[2]));
  const y1 = Math.max(...boxes.map((b) => b[3]));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

/**
 * The CSS that moves a part. Keyframes live in the app (EQUIPMENT_ANIM_CSS);
 * a unit that is not running sets --pf-play to paused, so it holds still.
 */
function motionStyle(drawing: UnitOpDrawing, part: DrawingPart): string {
  const period = `${f(part.periodS ?? 2)}s`;
  const delay = part.delayS ? ` ${f(part.delayS)}s` : '';
  const play = 'animation-play-state: var(--pf-play, running)';
  const moves = `--pf-dx: ${f(part.dx ?? 0)}px; --pf-dy: ${f(part.dy ?? 0)}px`;
  switch (part.motion) {
    case 'spin':
    case 'spin-reverse': {
      const o = part.origin ?? partCentre(drawing, part.id);
      return `transform-box: view-box; transform-origin: ${f(o.x)}px ${f(o.y)}px; animation: pf-spin ${period} linear${delay} infinite${part.motion === 'spin-reverse' ? ' reverse' : ''}; ${play}`;
    }
    case 'travel':
      return `${moves}; animation: pf-d-travel ${period} linear${delay} infinite; ${play}`;
    case 'bob':
    case 'dive':
      return `${moves}; animation: pf-d-bob ${period} ease-in-out${delay} infinite; ${play}`;
    case 'gantry':
      return `${moves}; animation: pf-d-gantry ${period} ease-in-out${delay} infinite; ${play}`;
    case 'blink':
      return `animation: pf-sensor-blink ${period} ease-in-out${delay} infinite; ${play}`;
    case 'shimmer':
      return `animation: pf-shimmer ${period} ease-in-out${delay} infinite; ${play}`;
    case 'pulse':
      return `animation: pf-fade ${period} ease-in-out${delay} infinite; ${play}`;
  }
}

/** One shape, inside the groups that move it (its part) and size it (a live level). */
function placed(s: DrawingShape, motions: Map<string, string>): string {
  let svg = shapeSvg(s);
  if (s.type === 'rect' && s.level) {
    svg = `<g style="transform-box: view-box; transform-origin: 0px ${f(s.y + s.height)}px; transform: scaleY(var(--pf-level, 0.6)); transition: transform 0.6s ease">${svg}</g>`;
  }
  const motion = s.part ? motions.get(s.part) : undefined;
  return motion ? `<g style="${motion}">${svg}</g>` : svg;
}

/**
 * SVG markup for the drawing, built from the validated shapes with every
 * value re-formatted as a number, so nothing the author wrote reaches the
 * page as markup.
 */
export function drawingToSvg(drawing: UnitOpDrawing): { shell: string; details: string; viewBox: string } {
  const motions = new Map((drawing.parts ?? []).map((p) => [p.id, motionStyle(drawing, p)]));
  const shell = drawing.shapes
    .filter((s) => s.layer !== 'detail')
    .map((s) => placed(s, motions))
    .join('');
  const details = drawing.shapes
    .filter((s) => s.layer === 'detail')
    .map((s) => placed(s, motions))
    .join('');
  return { shell, details, viewBox: `0 0 ${f(drawing.viewBox.width)} ${f(drawing.viewBox.height)}` };
}

/**
 * The drawing as a whole SVG document, the way the canvas draws it (outline
 * jade on a faint tint, internals thinner), with nozzle stubs. For previews
 * and exported images: colours fall back to the dark theme, on its canvas.
 */
export function drawingToStandaloneSvg(drawing: UnitOpDrawing, options: { pixelWidth?: number; level?: number; background?: boolean } = {}): string {
  const svg = drawingToSvg(drawing);
  const { width: W, height: H } = drawing.viewBox;
  const px = options.pixelWidth ?? 480;
  const nozzles = drawing.nozzles
    .map((n) => {
      const x = (n.x / 100) * W;
      const y = (n.y / 100) * H;
      const len = 0.04 * Math.max(W, H);
      const [dx, dy] = n.side === 'left' ? [-len, 0] : n.side === 'right' ? [len, 0] : n.side === 'top' ? [0, -len] : [0, len];
      return `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + dx)}" y2="${f(y + dy)}" stroke="#2dd5b7" stroke-width="2"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(0.012 * Math.max(W, H) + 1)}" fill="#14161a" stroke="#2dd5b7" stroke-width="1.2"/>`;
    })
    .join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${svg.viewBox}" width="${px}" height="${Math.round((px * H) / W)}" style="--pf-level: ${f(options.level ?? 0.6)}">`,
    options.background === false ? '' : `<rect x="0" y="0" width="${f(W)}" height="${f(H)}" fill="#181a1f"/>`,
    `<g fill="rgba(84, 158, 106, 0.08)" stroke="#71cead" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${svg.shell}</g>`,
    svg.details ? `<g fill="none" stroke="#71cead" stroke-width="1.2" stroke-linecap="round" opacity="0.75">${svg.details}</g>` : '',
    nozzles,
    '</svg>'
  ].join('');
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
