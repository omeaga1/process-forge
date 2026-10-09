import type { Side } from '../equipment/nozzleLayout.js';

/**
 * Pipe routing on the flowsheet.
 *
 * A pipe leaves its nozzle straight out along the side the nozzle faces (the
 * "lead"), runs in horizontal and vertical lengths, and enters the other
 * nozzle straight in. Two ways to decide the runs between:
 *
 *  - by hand: the engineer's bends (ProcessEdge.waypoints), joined with
 *    elbows so every run stays horizontal or vertical (orthogonalize);
 *  - by itself: the shortest route with the fewest bends that keeps clear of
 *    every unit on the sheet (routePipe), found on the grid of lines that run
 *    along the units' edges, so it never crosses equipment when a way round
 *    exists.
 *
 * Everything here is plain geometry in flowsheet coordinates, so the canvas,
 * the tests and an MCP tool all get the same route.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A pipe end: the flange face, and the side the nozzle faces. */
export interface PipeEnd extends Point {
  side: Side;
}

export interface RouteOptions {
  /** Straight run out of a nozzle before the first bend, px. */
  lead?: number;
  /** Clearance kept from every unit, px. */
  clearance?: number;
  /** Length a bend costs, px: higher makes fewer, longer runs. */
  bendCost?: number;
  /**
   * The boxes of the units at each end. A pipe's lead only has to clear its
   * own unit: pushing it out past a neighbour would send it through that
   * neighbour and back. Absent, every obstacle counts.
   */
  fromOwn?: readonly Rect[];
  toOwn?: readonly Rect[];
}

export const PIPE_LEAD = 22;
export const PIPE_CLEARANCE = 14;
const BEND_COST = 40;
/** Units further than this from the straight-line box between the ends are not considered. */
const SEARCH_MARGIN = 260;

const DIR: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 }
};

const EPS = 0.5;

function inside(p: Point, r: Rect, pad: number): boolean {
  return p.x > r.x - pad + EPS && p.x < r.x + r.width + pad - EPS && p.y > r.y - pad + EPS && p.y < r.y + r.height + pad - EPS;
}

/** Does an axis-aligned run from a to b pass through the inside of r grown by pad? */
function runHits(a: Point, b: Point, r: Rect, pad: number): boolean {
  const x0 = r.x - pad + EPS;
  const x1 = r.x + r.width + pad - EPS;
  const y0 = r.y - pad + EPS;
  const y1 = r.y + r.height + pad - EPS;
  if (Math.abs(a.y - b.y) < EPS) {
    if (!(a.y > y0 && a.y < y1)) return false;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return hi > x0 && lo < x1;
  }
  if (!(a.x > x0 && a.x < x1)) return false;
  const lo = Math.min(a.y, b.y);
  const hi = Math.max(a.y, b.y);
  return hi > y0 && lo < y1;
}

/** Does any run of a polyline cross a unit? */
export function polylineHits(points: readonly Point[], obstacles: readonly Rect[], pad = 0): boolean {
  for (let i = 0; i + 1 < points.length; i++) {
    for (const r of obstacles) if (runHits(points[i]!, points[i + 1]!, r, pad)) return true;
  }
  return false;
}

/**
 * The end of a pipe's lead: straight out of the nozzle, pushed further out
 * while it would still sit inside a unit (a nozzle under a label, two units
 * close together).
 */
export function leadPoint(end: PipeEnd, obstacles: readonly Rect[], lead = PIPE_LEAD, clearance = PIPE_CLEARANCE): Point {
  const d = DIR[end.side];
  let len = lead;
  for (let i = 0; i < 12; i++) {
    const p = { x: end.x + d.x * len, y: end.y + d.y * len };
    const blocker = obstacles.find((r) => inside(p, r, clearance));
    if (!blocker) return p;
    // Out past the far edge of what is in the way.
    const out =
      end.side === 'right'
        ? blocker.x + blocker.width + clearance - end.x
        : end.side === 'left'
          ? end.x - (blocker.x - clearance)
          : end.side === 'bottom'
            ? blocker.y + blocker.height + clearance - end.y
            : end.y - (blocker.y - clearance);
    len = Math.max(len + 4, out + 1);
  }
  return { x: end.x + d.x * lead, y: end.y + d.y * lead };
}

/** Drops repeated points and the middle of three in a line, keeping the first two and last two (nozzle and lead). */
export function simplifyPolyline(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < EPS && Math.abs(last.y - p.y) < EPS && out.length > 1) continue;
    out.push({ x: p.x, y: p.y });
  }
  if (out.length <= 4) return out;
  const keepHead = 2;
  const res: Point[] = out.slice(0, keepHead);
  for (let i = keepHead; i < out.length - 2; i++) {
    const a = res[res.length - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    const collinear = (Math.abs(a.x - b.x) < EPS && Math.abs(b.x - c.x) < EPS) || (Math.abs(a.y - b.y) < EPS && Math.abs(b.y - c.y) < EPS);
    const same = Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
    if (collinear || same) continue;
    res.push(b);
  }
  res.push(...out.slice(out.length - 2));
  return res;
}

/**
 * Joins points with horizontal and vertical runs. Between two points that are
 * not in line it puts one elbow, carrying on the way the pipe was going; the
 * last run goes into the nozzle along the nozzle's own axis.
 */
export function orthogonalize(points: readonly Point[], fromSide: Side, toSide: Side): Point[] {
  if (points.length === 0) return [];
  const out: Point[] = [points[0]!];
  let heading = DIR[fromSide];
  // The last run goes into the nozzle, moving against the way it faces.
  const into = { x: -DIR[toSide].x, y: -DIR[toSide].y };
  const dirOf = (a: Point, b: Point): Point => ({ x: Math.sign(Math.round(b.x - a.x)), y: Math.sign(Math.round(b.y - a.y)) });
  for (let i = 1; i < points.length; i++) {
    const p = out[out.length - 1]!;
    const q = points[i]!;
    if (Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS) continue;
    const last = i === points.length - 1;
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    // Every way to get from p to q in square runs with up to two elbows; the
    // best never doubles back on itself and, on the last leg, enters the
    // nozzle straight.
    const options: Point[][] = [
      [],
      [{ x: q.x, y: p.y }],
      [{ x: p.x, y: q.y }],
      [{ x: mx, y: p.y }, { x: mx, y: q.y }],
      [{ x: p.x, y: my }, { x: q.x, y: my }]
    ];
    let best: { elbows: Point[]; score: number; heading: Point } | null = null;
    for (const elbows of options) {
      const path = [p, ...elbows, q];
      let score = elbows.length;
      let h = heading;
      let ok = true;
      for (let k = 1; k < path.length; k++) {
        const d = dirOf(path[k - 1]!, path[k]!);
        if (d.x === 0 && d.y === 0) continue;
        if (d.x !== 0 && d.y !== 0) {
          ok = false;
          break;
        }
        if (d.x === -h.x && d.y === -h.y) score += 1000;
        h = d;
      }
      if (!ok) continue;
      if (last && !(h.x === into.x && h.y === into.y)) score += h.x === -into.x && h.y === -into.y ? 1000 : 500;
      if (!best || score < best.score) best = { elbows, score, heading: h };
    }
    for (const e of best!.elbows) out.push(e);
    out.push({ x: q.x, y: q.y });
    heading = best!.heading;
  }
  return out;
}

// ------------------------------------------------------------------ router

interface HeapItem {
  cost: number;
  key: number;
}

class MinHeap {
  private a: HeapItem[] = [];
  get size() {
    return this.a.length;
  }
  push(it: HeapItem) {
    const a = this.a;
    a.push(it);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.cost <= a[i]!.cost) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): HeapItem | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.cost < a[m]!.cost) m = l;
        if (r < a.length && a[r]!.cost < a[m]!.cost) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

const uniqSorted = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of s) if (!out.length || x - out[out.length - 1]! > EPS) out.push(x);
  return out;
};

/** Directions as grid steps: 0 right, 1 down, 2 left, 3 up. */
const STEPS = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: -1 }
];
const stepOf = (s: Side) => (s === 'right' ? 0 : s === 'bottom' ? 1 : s === 'left' ? 2 : 3);

/**
 * The bends of a route from lead a to lead b that keeps `clearance` from every
 * obstacle: the fewest-bend, shortest path on the grid of lines through the
 * leads and along the obstacles' grown edges. Null when there is none.
 */
function searchRoute(a: Point, aSide: Side, b: Point, bSide: Side, zones: readonly { r: Rect; pad: number }[], bendCost: number): Point[] | null {
  const xs = uniqSorted([a.x, b.x, (a.x + b.x) / 2, ...zones.flatMap(({ r, pad }) => [r.x - pad, r.x + r.width + pad])]);
  const ys = uniqSorted([a.y, b.y, (a.y + b.y) / 2, ...zones.flatMap(({ r, pad }) => [r.y - pad, r.y + r.height + pad])]);
  const nx = xs.length;
  const ny = ys.length;
  const idx = (v: number[], t: number) => v.findIndex((x) => Math.abs(x - t) < EPS);
  const ax = idx(xs, a.x);
  const ay = idx(ys, a.y);
  const bx = idx(xs, b.x);
  const by = idx(ys, b.y);
  // Grid lines sit on the grown edges, so blocking uses a hair less than each zone's clearance.
  const blocked = (x: number, y: number) => zones.some(({ r, pad }) => inside({ x, y }, r, Math.max(0, pad - 1)));
  const runFree = (x0: number, y0: number, x1: number, y1: number) => !zones.some(({ r, pad }) => runHits({ x: x0, y: y0 }, { x: x1, y: y1 }, r, Math.max(0, pad - 1)));

  const key = (ix: number, iy: number, d: number) => (iy * nx + ix) * 4 + d;
  const best = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap = new MinHeap();
  const startDir = stepOf(aSide);
  const startKey = key(ax, ay, startDir);
  best.set(startKey, 0);
  heap.push({ cost: 0, key: startKey });
  // The pipe enters b's nozzle moving opposite to the way that nozzle faces.
  const finalDir = (stepOf(bSide) + 2) % 4;
  let goal: number | null = null;
  let goalCost = Infinity;

  while (heap.size) {
    const { cost, key: k } = heap.pop()!;
    if (cost > (best.get(k) ?? Infinity)) continue;
    if (cost >= goalCost) break;
    const d = k % 4;
    const cell = (k - d) / 4;
    const ix = cell % nx;
    const iy = (cell - ix) / nx;
    if (ix === bx && iy === by) {
      const turn = d === finalDir ? 0 : (d + 2) % 4 === finalDir ? 2 * bendCost : bendCost;
      if (cost + turn < goalCost) {
        goalCost = cost + turn;
        goal = k;
      }
      continue;
    }
    for (let nd = 0; nd < 4; nd++) {
      if ((nd + 2) % 4 === d) continue; // no doubling back on itself
      const jx = ix + STEPS[nd]!.dx;
      const jy = iy + STEPS[nd]!.dy;
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      const x0 = xs[ix]!;
      const y0 = ys[iy]!;
      const x1 = xs[jx]!;
      const y1 = ys[jy]!;
      if (!(jx === bx && jy === by) && blocked(x1, y1)) continue;
      if (!runFree(x0, y0, x1, y1)) continue;
      const nk = key(jx, jy, nd);
      const nc = cost + Math.abs(x1 - x0) + Math.abs(y1 - y0) + (nd === d ? 0 : bendCost);
      if (nc < (best.get(nk) ?? Infinity)) {
        best.set(nk, nc);
        prev.set(nk, k);
        heap.push({ cost: nc, key: nk });
      }
    }
  }
  if (goal === null) return null;
  const path: Point[] = [];
  for (let k: number | undefined = goal; k !== undefined; k = prev.get(k)) {
    const cell = (k - (k % 4)) / 4;
    const ix = cell % nx;
    const iy = (cell - ix) / nx;
    path.push({ x: xs[ix]!, y: ys[iy]! });
  }
  return path.reverse();
}

/**
 * A pipe's route from one nozzle to another that keeps clear of the units in
 * `obstacles` (give every unit on the sheet, the two it joins included: its
 * leads take it clear of those). The polyline starts at `from`, ends at `to`,
 * and its second and second-to-last points are the leads.
 */
export function routePipe(from: PipeEnd, to: PipeEnd, obstacles: readonly Rect[], options: RouteOptions = {}): Point[] {
  const clearance = options.clearance ?? PIPE_CLEARANCE;
  const lead = options.lead ?? PIPE_LEAD;
  const bendCost = options.bendCost ?? BEND_COST;
  const a = leadPoint(from, options.fromOwn ?? obstacles, lead, clearance);
  const b = leadPoint(to, options.toOwn ?? obstacles, lead, clearance);
  // Only what is near the way between the ends matters; a lead inside a unit (overlapping units) ignores that unit.
  const minX = Math.min(a.x, b.x) - SEARCH_MARGIN;
  const maxX = Math.max(a.x, b.x) + SEARCH_MARGIN;
  const minY = Math.min(a.y, b.y) - SEARCH_MARGIN;
  const maxY = Math.max(a.y, b.y) + SEARCH_MARGIN;
  // A unit whose clearance margin takes in a lead (it sits close by) still blocks with its body; only a
  // unit a lead is actually inside (units overlapping) is left out.
  const zones = obstacles
    .filter((r) => r.x < maxX && r.x + r.width > minX && r.y < maxY && r.y + r.height > minY && !inside(a, r, 0) && !inside(b, r, 0))
    .map((r) => ({ r, pad: inside(a, r, clearance - 1) || inside(b, r, clearance - 1) ? 0 : clearance }));
  const found = searchRoute(a, from.side, b, to.side, zones, bendCost);
  const middle = found ?? orthogonalize([a, b], from.side, to.side);
  return simplifyPolyline([{ x: from.x, y: from.y }, ...middle, { x: to.x, y: to.y }]);
}

/** A pipe's route through the engineer's own bends. */
export function routeThrough(from: PipeEnd, to: PipeEnd, waypoints: readonly Point[], obstacles: readonly Rect[] = [], options: RouteOptions = {}): Point[] {
  const lead = options.lead ?? PIPE_LEAD;
  const clearance = options.clearance ?? PIPE_CLEARANCE;
  const a = leadPoint(from, options.fromOwn ?? obstacles, lead, clearance);
  const b = leadPoint(to, options.toOwn ?? obstacles, lead, clearance);
  const middle = orthogonalize([a, ...waypoints, b], from.side, to.side);
  return simplifyPolyline([{ x: from.x, y: from.y }, ...middle, { x: to.x, y: to.y }]);
}

/** The bends to store for a route (everything between the two leads). */
export function waypointsOf(polyline: readonly Point[]): Point[] {
  return polyline.slice(2, -2).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

/**
 * Moves run `i` of a route (from point i to i+1) sideways by `delta`, keeping
 * every run horizontal or vertical, and returns the bends to store. Moving a
 * run that touches a lead keeps the lead and adds the elbow that joins it.
 */
export function moveRun(polyline: readonly Point[], i: number, delta: number): Point[] {
  const a = polyline[i];
  const b = polyline[i + 1];
  if (!a || !b || i < 1 || i + 1 > polyline.length - 2) return waypointsOf(polyline);
  const vertical = Math.abs(a.x - b.x) < EPS;
  const shift = (p: Point): Point => (vertical ? { x: p.x + delta, y: p.y } : { x: p.x, y: p.y + delta });
  const inner = polyline.slice(1, -1).map((p, j) => (j + 1 === i || j + 1 === i + 1 ? shift(p) : { ...p }));
  // inner[0] and inner[last] are the leads: they stay; a moved copy of one becomes a bend.
  const leadA = polyline[1]!;
  const leadB = polyline[polyline.length - 2]!;
  const bends: Point[] = [];
  if (i === 1) bends.push(inner[0]!);
  bends.push(...inner.slice(1, -1));
  if (i + 1 === polyline.length - 2) bends.push(inner[inner.length - 1]!);
  return bends
    .filter((p) => !(Math.abs(p.x - leadA.x) < EPS && Math.abs(p.y - leadA.y) < EPS) && !(Math.abs(p.x - leadB.x) < EPS && Math.abs(p.y - leadB.y) < EPS))
    .map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

/** An SVG path along the route with rounded elbows, and the point halfway along it (for a label). */
export function roundedPath(points: readonly Point[], radius = 10): { d: string; mid: Point; length: number } {
  if (points.length === 0) return { d: '', mid: { x: 0, y: 0 }, length: 0 };
  const p0 = points[0]!;
  let d = `M ${p0.x} ${p0.y}`;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1]!;
    const c = points[i]!;
    const n = points[i + 1]!;
    const lin = Math.hypot(c.x - p.x, c.y - p.y);
    const lout = Math.hypot(n.x - c.x, n.y - c.y);
    const cross = (c.x - p.x) * (n.y - c.y) - (c.y - p.y) * (n.x - c.x);
    const r = Math.min(radius, lin / 2, lout / 2);
    if (Math.abs(cross) < 1e-6 || r < 0.5 || lin === 0 || lout === 0) {
      d += ` L ${c.x} ${c.y}`;
      continue;
    }
    const ix = c.x - ((c.x - p.x) / lin) * r;
    const iy = c.y - ((c.y - p.y) / lin) * r;
    const ox = c.x + ((n.x - c.x) / lout) * r;
    const oy = c.y + ((n.y - c.y) / lout) * r;
    d += ` L ${ix} ${iy} Q ${c.x} ${c.y} ${ox} ${oy}`;
  }
  const last = points[points.length - 1]!;
  if (points.length > 1) d += ` L ${last.x} ${last.y}`;
  // Halfway along.
  let half = length / 2;
  let mid = p0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (half <= l && l > 0) {
      mid = { x: a.x + ((b.x - a.x) * half) / l, y: a.y + ((b.y - a.y) * half) / l };
      break;
    }
    half -= l;
    mid = b;
  }
  return { d, mid, length };
}

/**
 * Where to put a label of `width` x `height` on a pipe: the point along the
 * route nearest its middle where the label (centred on the point) overlaps no
 * obstacle (a unit, a feed's or outlet's tag) and no label already placed.
 * Tries every 8 px of the route; falls back to the middle when nothing is clear.
 */
export function labelSpot(points: readonly Point[], width: number, height: number, obstacles: readonly Rect[]): Point {
  const segs: { a: Point; b: Point; l: number }[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, l });
    total += l;
  }
  const at = (s: number): Point => {
    for (const g of segs) {
      if (s <= g.l && g.l > 0) return { x: g.a.x + ((g.b.x - g.a.x) * s) / g.l, y: g.a.y + ((g.b.y - g.a.y) * s) / g.l };
      s -= g.l;
    }
    return points[points.length - 1] ?? { x: 0, y: 0 };
  };
  const clear = (p: Point) =>
    obstacles.every(
      (r) => p.x + width / 2 <= r.x || p.x - width / 2 >= r.x + r.width || p.y + height / 2 <= r.y || p.y - height / 2 >= r.y + r.height
    );
  const mid = at(total / 2);
  if (clear(mid)) return mid;
  // Outward from the middle, alternating sides.
  for (let k = 8; k <= total / 2; k += 8) {
    for (const s of [total / 2 - k, total / 2 + k]) {
      const p = at(s);
      if (clear(p)) return p;
    }
  }
  return mid;
}
