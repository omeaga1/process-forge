import type { UnitOpContract } from './contract.js';
import { DRAWING_ITEMS, type DrawingNozzle, type DrawingPart, type DrawingShape, type UnitOpDrawing } from './drawing.js';

/**
 * Drawing kits: equipment drawings generated from a unit's contract, at the
 * standard of the Standard palette's own units (layered tones, internals,
 * moving parts, the items the line carries), so no model has to place a few
 * rectangles by hand and call it a drawing.
 *
 * A kit is parametric, not a picture: the contract's own numbers shape it (a
 * filler's valve count, a conveyor's lanes, a case's rows and columns, a
 * mixer's elements), and a variant seed varies what is free (panel layout,
 * guarding, lamp and HMI placement, proportions), so two units are never one
 * drawing. Every port gets a nozzle on the wall where that stream really
 * connects. The result is an ordinary contract drawing: the model or the
 * engineer reshapes it from there.
 */

export const DRAWING_KITS = [
  'rotary-machine',
  'labeler',
  'conveyor',
  'case-packer',
  'palletizer',
  'tank',
  'carbonator',
  'pump',
  'inline-mixer',
  'heat-exchanger',
  'machine'
] as const;
export type DrawingKit = (typeof DRAWING_KITS)[number];
export type DrawingItem = (typeof DRAWING_ITEMS)[number];

export const DRAWING_KIT_SUMMARY: Record<DrawingKit, string> = {
  'rotary-machine': 'Rotary monobloc (filler, capper, rinser, seamer): turret with heads, star wheels, product bowl or cap chute, guarding, HMI.',
  labeler: 'Inline labeler: label reels and web path, vacuum drum, bottles labelled on the way through, photo-eye.',
  conveyor: 'Table-top or belt conveyor: bed, rollers, side guides, lanes and items travelling; accumulation zone when it accumulates.',
  'case-packer': 'Case packer: lane divider infeed, collation grid of rows x columns, blank magazine, folding section, cases out.',
  palletizer: 'Layer palletizer: gantry frame, travelling head carrying a layer, pallet stack building, pallet magazine.',
  tank: 'Vertical vessel on legs: dished heads, live level, sight glass, manway; agitator and jacket when it has them.',
  carbonator: 'Gas-liquid contactor (carbonator, saturator, absorber): pressure vessel, spray head, gas sparger and bubbles, gauge.',
  pump: 'Centrifugal pump: volute and impeller, coupling guard, motor with cooling fins, baseplate.',
  'inline-mixer': 'Inline mixer or blender: flanged spool with helical static elements, injection quill, flow arrows.',
  'heat-exchanger': 'Plate heat exchanger: frame, plate pack, tie bars, four corner ports.',
  machine: 'A generic machine: cabinet with a process window, conveyor through it, HMI and lamp tower.'
};

// ------------------------------------------------------------------ routing

/** Words that name each kit. The one named last in the unit's name wins: in English the head noun comes last ("filler feed pump" is a pump). */
const KIT_WORDS: [DrawingKit, RegExp][] = [
  ['palletizer', /\b(palleti[sz]\w*|depalleti[sz]\w*|layer former)\b/g],
  ['labeler', /\b(label\w*|sleever|shrink sleeve)\b/g],
  ['case-packer', /\b(case[- ]?packer|packer|tray packer|wrap[- ]around case\w*|case erector|erector|cartoner|carton\w*|bundler|multipack\w*)\b/g],
  ['conveyor', /\b(conveyor|accumulat\w*|belt|table[- ]top|transfer table|lane divider)\b/g],
  ['carbonator', /\b(carbonat\w*|carbo[- ]cooler|saturator|absorber|deaerator|contactor|stripper)\b/g],
  ['rotary-machine', /\b(filler|filling|capper|capping|rinser|rinsing|seamer|monobloc\w*|rotary|turret|corker|crowner)\b/g],
  ['pump', /\b(pump\w*|booster)\b/g],
  ['inline-mixer', /\b(static mixer|inline mixer|in-line mixer|blender|blending|proportioner|mixer|injector|eductor|dosing)\b/g],
  ['heat-exchanger', /\b(heat exchanger|exchanger|chiller|cooler|heater|pasteu?ri[sz]er|plate pack|regenerat\w*)\b/g],
  ['tank', /\b(tank|vessel|silo|reservoir|hopper|bin|receiver|surge|buffer|drum|reactor|kettle)\b/g]
];

const ARCHETYPE_KIT: Record<string, DrawingKit> = {
  pump: 'pump',
  'storage-tank': 'tank',
  'case-packer': 'case-packer',
  palletizer: 'palletizer',
  conveyor: 'conveyor',
  labeler: 'labeler',
  filler: 'rotary-machine',
  'two-stream-exchanger': 'heat-exchanger',
  heater: 'heat-exchanger',
  mixer: 'inline-mixer',
  'agitated-mixer': 'tank',
  reactor: 'tank'
};

export interface KitRouting {
  kit: DrawingKit;
  /** Where the answer came from: the caller, the words, the contract's archetype, or the fallback. */
  source: 'caller' | 'name' | 'description' | 'archetype' | 'default';
  /** Other kits the words also named, last-named first. */
  alternatives: DrawingKit[];
}

function namedKits(text: string): DrawingKit[] {
  const t = text.toLowerCase();
  const found: [DrawingKit, number][] = [];
  for (const [kit, re] of KIT_WORDS) {
    let last = -1;
    for (const m of t.matchAll(re)) last = Math.max(last, m.index ?? -1);
    if (last >= 0) found.push([kit, last]);
  }
  return found.sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

export function routeDrawingKit(input: { kit?: DrawingKit; name?: string; description?: string; archetype?: string }): KitRouting {
  if (input.kit) return { kit: input.kit, source: 'caller', alternatives: [] };
  const byName = namedKits(input.name ?? '');
  if (byName.length) return { kit: byName[0]!, source: 'name', alternatives: byName.slice(1) };
  const byText = namedKits(input.description ?? '');
  if (byText.length) return { kit: byText[0]!, source: 'description', alternatives: byText.slice(1) };
  const a = input.archetype ? ARCHETYPE_KIT[input.archetype] : undefined;
  if (a) return { kit: a, source: 'archetype', alternatives: [] };
  return { kit: 'machine', source: 'default', alternatives: [] };
}

// --------------------------------------------------------------- variation

/** A small seeded generator (mulberry32), so a variant draws the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable variant from a unit's id and name, so each unit has its own drawing. */
export function variantFor(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 1_000_000;
}

// -------------------------------------------------------------------- pen

type Opts = Partial<{
  layer: 'body' | 'detail' | 'fill';
  tone: NonNullable<DrawingShape['tone']>;
  weight: NonNullable<DrawingShape['weight']>;
  rx: number;
  part: string;
  dashed: boolean;
  opacity: number;
  level: boolean;
}>;

const r2 = (v: number) => Math.round(v * 100) / 100;

class Pen {
  shapes: DrawingShape[] = [];
  parts: DrawingPart[] = [];
  private common(o: Opts) {
    return {
      layer: o.layer ?? 'body',
      ...(o.tone ? { tone: o.tone } : {}),
      ...(o.weight ? { weight: o.weight } : {}),
      ...(o.part ? { part: o.part } : {}),
      ...(o.dashed ? { dashed: true } : {}),
      ...(o.opacity !== undefined ? { opacity: o.opacity } : {})
    };
  }
  rect(x: number, y: number, width: number, height: number, o: Opts = {}) {
    this.shapes.push({ type: 'rect', x: r2(x), y: r2(y), width: r2(width), height: r2(height), ...(o.rx ? { rx: o.rx } : {}), ...(o.level ? { level: true } : {}), ...this.common(o) } as DrawingShape);
  }
  circle(cx: number, cy: number, r: number, o: Opts = {}) {
    this.shapes.push({ type: 'circle', cx: r2(cx), cy: r2(cy), r: r2(r), ...this.common(o) } as DrawingShape);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, o: Opts = {}) {
    this.shapes.push({ type: 'ellipse', cx: r2(cx), cy: r2(cy), rx: r2(rx), ry: r2(ry), ...this.common(o) } as DrawingShape);
  }
  line(x1: number, y1: number, x2: number, y2: number, o: Opts = {}) {
    this.shapes.push({ type: 'line', x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), ...this.common({ layer: 'detail', ...o }) } as DrawingShape);
  }
  poly(points: [number, number][], o: Opts = {}) {
    this.shapes.push({ type: 'polygon', points: points.map(([x, y]) => [r2(x), r2(y)]), ...this.common(o) } as DrawingShape);
  }
  polyline(points: [number, number][], o: Opts = {}) {
    this.shapes.push({ type: 'polyline', points: points.map(([x, y]) => [r2(x), r2(y)]), ...this.common({ layer: 'detail', ...o }) } as DrawingShape);
  }
  path(d: string, o: Opts = {}) {
    this.shapes.push({ type: 'path', d, ...this.common(o) } as DrawingShape);
  }
  item(item: DrawingItem, x: number, y: number, width: number, height: number, o: Opts = {}) {
    this.shapes.push({ type: 'item', item, x: r2(x), y: r2(y), width: r2(width), height: r2(height), ...this.common(o) } as DrawingShape);
  }
  part(p: DrawingPart) {
    this.parts.push(p);
  }
  /** A status lamp tower: red, amber, green, the green showing whether the unit runs. */
  lampTower(x: number, y: number, s = 1) {
    this.line(x, y + 22 * s, x, y + 30 * s, { weight: 'bold', layer: 'body' });
    this.rect(x - 3 * s, y, 6 * s, 7 * s, { tone: 'alert', rx: 1, opacity: 0.55 });
    this.rect(x - 3 * s, y + 7.5 * s, 6 * s, 7 * s, { tone: 'gold', rx: 1 });
    this.rect(x - 3 * s, y + 15 * s, 6 * s, 7 * s, { tone: 'status', rx: 1, part: 'lamp' });
    if (!this.parts.some((p) => p.id === 'lamp')) this.part({ id: 'lamp', motion: 'blink', periodS: 1.4 });
  }
  /** An operator panel: a screen with a few readouts and two buttons. */
  hmi(x: number, y: number, w: number, h: number) {
    this.rect(x, y, w, h, { tone: 'metal', rx: 2 });
    this.rect(x + 2, y + 2, w - 4, h * 0.55, { tone: 'deep', rx: 1, opacity: 0.85 });
    this.line(x + 4, y + 2 + h * 0.18, x + w * 0.6, y + 2 + h * 0.18, { tone: 'glow', weight: 'hair' });
    this.line(x + 4, y + 2 + h * 0.36, x + w * 0.45, y + 2 + h * 0.36, { tone: 'glow', weight: 'hair' });
    this.circle(x + w * 0.3, y + h * 0.8, Math.min(w, h) * 0.08, { tone: 'status' });
    this.circle(x + w * 0.7, y + h * 0.8, Math.min(w, h) * 0.08, { tone: 'alert' });
  }
  /** A flange pair where a pipe meets the body. */
  flange(x: number, y: number, vertical: boolean, size = 6) {
    if (vertical) this.rect(x - size, y - 1.5, size * 2, 3, { tone: 'metal', weight: 'thin' });
    else this.rect(x - 1.5, y - size, 3, size * 2, { tone: 'metal', weight: 'thin' });
  }
}

// ------------------------------------------------------------------ ports

export interface KitPort {
  id: string;
  name: string;
  direction: 'INLET' | 'OUTLET';
  flowDimension: 'CONTINUOUS_FLUID' | 'DISCRETE_CONTAINER';
  phase?: string;
  role?: string;
}

type PortClass = 'liquid-in' | 'liquid-out' | 'gas-in' | 'gas-out' | 'items-in' | 'items-out' | 'aux-in' | 'reject-out' | 'utility-in' | 'utility-out';
type Anchor = { x: number; y: number; side: DrawingNozzle['side'] };
type Anchors = Partial<Record<PortClass, Anchor[]>>;

function classify(ports: KitPort[], scrap: Set<string>): Map<string, PortClass> {
  const out = new Map<string, PortClass>();
  const itemInlets = ports.filter((p) => p.direction === 'INLET' && p.flowDimension === 'DISCRETE_CONTAINER');
  // The main item infeed is the one that names the product (bottles, cans...), else the first.
  const main = itemInlets.find((p) => /bottle|can|container|product|item|jar|pack|unit/i.test(`${p.id} ${p.name}`)) ?? itemInlets[0];
  for (const p of ports) {
    const inlet = p.direction === 'INLET';
    const utility = p.role === 'UTILITY';
    const gas = p.phase === 'GAS' || /\b(gas|co2|air|vent|vapou?r|steam|nitrogen|n2)\b/i.test(`${p.id} ${p.name}`);
    if (p.flowDimension === 'DISCRETE_CONTAINER') {
      if (inlet) out.set(p.id, p === main ? 'items-in' : 'aux-in');
      else out.set(p.id, scrap.has(p.id) || /reject|scrap|waste|kick/i.test(`${p.id} ${p.name}`) ? 'reject-out' : 'items-out');
    } else if (utility) out.set(p.id, inlet ? 'utility-in' : 'utility-out');
    else if (gas) out.set(p.id, inlet ? 'gas-in' : 'gas-out');
    else out.set(p.id, inlet ? 'liquid-in' : 'liquid-out');
  }
  return out;
}

/** Puts every port on an anchor of its kind, else on the side its direction faces, spread so no two share a spot. */
function placeNozzles(ports: KitPort[], classes: Map<string, PortClass>, anchors: Anchors, W: number, H: number, wall: { left: number; right: number; top: number; bottom: number }): DrawingNozzle[] {
  const used = new Map<PortClass, number>();
  const nozzles: DrawingNozzle[] = [];
  const spill: KitPort[] = [];
  for (const p of ports) {
    const c = classes.get(p.id)!;
    const list = anchors[c];
    const i = used.get(c) ?? 0;
    if (list && i < list.length) {
      const a = list[i]!;
      used.set(c, i + 1);
      nozzles.push({ portId: p.id, x: r2((a.x / W) * 100), y: r2((a.y / H) * 100), side: a.side, label: p.name.slice(0, 24) });
    } else spill.push(p);
  }
  // Ports with no anchor of their own: inlets on the left wall, outlets on the right, spread down it.
  const sides: Record<'INLET' | 'OUTLET', KitPort[]> = { INLET: [], OUTLET: [] };
  for (const p of spill) sides[p.direction].push(p);
  for (const dir of ['INLET', 'OUTLET'] as const) {
    const list = sides[dir];
    list.forEach((p, k) => {
      const x = dir === 'INLET' ? wall.left : wall.right;
      const y = wall.top + ((k + 1) * (wall.bottom - wall.top)) / (list.length + 1);
      nozzles.push({ portId: p.id, x: r2((x / W) * 100), y: r2((y / H) * 100), side: dir === 'INLET' ? 'left' : 'right', label: p.name.slice(0, 24) });
    });
  }
  return nozzles;
}

// ------------------------------------------------------------------- kits

export interface KitSettings {
  /** Heads on a turret, valves on a filler. */
  heads: number;
  /** Lanes on a conveyor or packer infeed. */
  lanes: number;
  /** A case's rows and columns. */
  rows: number;
  columns: number;
  /** Layers on a pallet. */
  layers: number;
  /** Elements in a static mixer, plates in an exchanger. */
  elements: number;
  /** What the line carries. */
  item: DrawingItem;
  /** What it makes, when that differs (a case packer makes cases). */
  outItem: DrawingItem;
  agitated: boolean;
  jacketed: boolean;
  accumulates: boolean;
  /** A rotary machine that caps rather than fills. */
  capper: boolean;
}

interface KitResult {
  W: number;
  H: number;
  anchors: Anchors;
  wall: { left: number; right: number; top: number; bottom: number };
}

type Kit = (pen: Pen, s: KitSettings, rand: () => number) => KitResult;

const pick = <T,>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length) % xs.length]!;

const rotaryMachine: Kit = (pen, s, rand) => {
  const W = 220;
  const H = 170;
  const cx = 110 + (rand() - 0.5) * 8;
  const cy = 86;
  const R = 34;
  // Base and machine table.
  pen.rect(12, 128, 196, 30, { tone: 'metal', rx: 3 });
  pen.line(12, 136, 208, 136, { weight: 'hair' });
  for (const x of [22, 70, 150, 198]) pen.rect(x - 4, 158, 8, 6, { tone: 'metal', weight: 'thin' });
  // Guarding: posts and panels, with a door seam picked per variant.
  pen.rect(18, 30, 184, 98, { rx: 4, weight: 'normal' });
  const doors = pick(rand, [2, 3, 4]);
  for (let k = 1; k < doors; k++) pen.line(18 + (184 * k) / doors, 30, 18 + (184 * k) / doors, 128, { weight: 'hair', dashed: true });
  pen.line(18, 40, 202, 40, { weight: 'hair' });
  // Turret seen from above: ring, heads (each a container in a pocket), centre column.
  pen.circle(cx, cy, R + 8, { tone: 'metal', weight: 'bold' });
  pen.circle(cx, cy, R + 8, { layer: 'detail', dashed: true, weight: 'hair' });
  const shown = Math.max(6, Math.min(18, Math.round(s.heads)));
  for (let k = 0; k < shown; k++) {
    const a = (2 * Math.PI * k) / shown;
    const x = cx + R * Math.cos(a);
    const y = cy + R * Math.sin(a);
    pen.circle(x, y, 5.2, { tone: k % 2 ? 'solid' : 'deep', part: 'turret', weight: 'thin' });
    pen.circle(x, y, 2, { tone: 'glow', part: 'turret', layer: 'detail' });
  }
  pen.circle(cx, cy, 13, { tone: 'deep', part: 'turret' });
  pen.line(cx - 13, cy, cx + 13, cy, { part: 'turret', weight: 'thin' });
  pen.line(cx, cy - 13, cx, cy + 13, { part: 'turret', weight: 'thin' });
  pen.part({ id: 'turret', motion: 'spin', periodS: 6, origin: { x: r2(cx), y: r2(cy) } });
  // Star wheels in and out, turning the other way.
  const sw = (x: number, id: string) => {
    pen.circle(x, 112, 11, { tone: 'metal', part: id });
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI * k) / 3;
      pen.line(x, 112, x + 11 * Math.cos(a), 112 + 11 * Math.sin(a), { part: id, weight: 'thin' });
    }
    pen.part({ id, motion: 'spin-reverse', periodS: 3, origin: { x: r2(x), y: 112 } });
  };
  sw(cx - 52, 'star-in');
  sw(cx + 52, 'star-out');
  // Infeed and discharge conveyor with containers on it.
  pen.rect(4, 118, 212, 8, { tone: 'metal', weight: 'thin' });
  for (let k = 0; k < 4; k++) pen.item(s.item, 8 + k * 14, 102, 9, 16, { part: 'feed' });
  for (let k = 0; k < 4; k++) pen.item(s.item, 160 + k * 14, 102, 9, 16, { part: 'feed', tone: s.capper ? 'deep' : 'solid' });
  pen.part({ id: 'feed', motion: 'travel', periodS: 1.6, dx: 14 });
  // Top: a product bowl with its level for a filler, a cap chute for a capper.
  if (s.capper) {
    pen.poly([[150, 4], [196, 4], [186, 26], [160, 26]], { tone: 'metal' });
    for (let k = 0; k < 4; k++) pen.ellipse(160 + k * 9, 14, 3.5, 2.2, { tone: 'light', part: 'caps', layer: 'detail' });
    pen.part({ id: 'caps', motion: 'pulse', periodS: 1.8 });
    pen.polyline([[173, 26], [150, 52], [cx + 20, cy - 26]], { weight: 'bold' });
    // Capping heads that dive onto the containers.
    for (const dx of [-14, 0, 14]) {
      pen.rect(cx + dx - 3, 44, 6, 12, { tone: 'metal', part: 'heads' });
      pen.rect(cx + dx - 4, 56, 8, 4, { tone: 'deep', part: 'heads' });
    }
    pen.part({ id: 'heads', motion: 'dive', periodS: 1.2, dy: 5 });
  } else {
    pen.rect(cx - 36, 6, 72, 22, { rx: 8 });
    pen.rect(cx - 34, 14, 68, 13, { layer: 'fill', level: true, rx: 4 });
    pen.rect(cx - 34, 14, 68, 3, { tone: 'glow', part: 'surface', layer: 'fill', opacity: 0.6 });
    pen.part({ id: 'surface', motion: 'shimmer', periodS: 3 });
    pen.line(cx, 28, cx, cy - R - 8, { weight: 'bold', layer: 'body' });
    // Fill valves, one each side, dropping product.
    for (const dx of [-20, 20]) {
      pen.rect(cx + dx - 3, 42, 6, 10, { tone: 'metal', part: 'valves' });
      pen.line(cx + dx, 52, cx + dx, 58, { tone: 'glow', part: 'valves', dashed: true });
    }
    pen.part({ id: 'valves', motion: 'dive', periodS: 1.5, dy: 4 });
  }
  // Operator panel and lamp tower, placed per variant.
  const left = rand() < 0.5;
  pen.hmi(left ? 24 : 168, 46, 26, 22);
  pen.lampTower(left ? 194 : 28, 4);
  const anchors: Anchors = {
    'liquid-in': [{ x: s.capper ? cx : cx, y: 6, side: 'top' }],
    'gas-in': [{ x: cx - 30, y: 10, side: 'top' }],
    'gas-out': [{ x: cx + 30, y: 10, side: 'top' }],
    'items-in': [{ x: 4, y: 122, side: 'left' }],
    'items-out': [{ x: 216, y: 122, side: 'right' }],
    'aux-in': [{ x: 196, y: 6, side: 'top' }, { x: 18, y: 80, side: 'left' }],
    'reject-out': [{ x: 182, y: 158, side: 'bottom' }, { x: 160, y: 158, side: 'bottom' }],
    'liquid-out': [{ x: 40, y: 158, side: 'bottom' }]
  };
  return { W, H, anchors, wall: { left: 18, right: 202, top: 40, bottom: 120 } };
};

const labeler: Kit = (pen, s, rand) => {
  const W = 220;
  const H = 150;
  pen.rect(16, 74, 188, 52, { tone: 'metal', rx: 4 });
  pen.line(16, 84, 204, 84, { weight: 'hair' });
  for (const x of [26, 194]) pen.rect(x - 4, 126, 8, 14, { tone: 'metal', weight: 'thin' });
  // Two label reels (unwind and rewind) with spokes, turning.
  const reel = (x: number, y: number, r: number, id: string) => {
    pen.circle(x, y, r, { weight: 'normal' });
    pen.circle(x, y, r * 0.7, { layer: 'fill', tone: 'light', opacity: 0.35 });
    pen.circle(x, y, r * 0.25, { tone: 'deep', part: id });
    for (let k = 0; k < 3; k++) {
      const a = (2 * Math.PI * k) / 3;
      pen.line(x, y, x + r * 0.9 * Math.cos(a), y + r * 0.9 * Math.sin(a), { part: id, weight: 'thin' });
    }
    pen.part({ id, motion: 'spin', periodS: id === 'unwind' ? 4 : 3, origin: { x, y } });
  };
  const rx = 42 + rand() * 10;
  reel(rx, 36, 22, 'unwind');
  reel(rx + 54, 30, 14, 'rewind');
  // Web path to the vacuum drum.
  const dx = 150;
  pen.polyline([[rx + 22, 36], [rx + 34, 58], [dx - 20, 58], [dx - 10, 66]], { tone: 'glow', dashed: true, weight: 'thin' });
  pen.circle(dx, 66, 18, { tone: 'metal', weight: 'bold' });
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI * k) / 4;
    pen.circle(dx + 13 * Math.cos(a), 66 + 13 * Math.sin(a), 1.6, { layer: 'detail', part: 'drum', tone: 'glow' });
  }
  pen.part({ id: 'drum', motion: 'spin', periodS: 2, origin: { x: dx, y: 66 } });
  // Containers through the machine: bare before the drum, labelled after.
  pen.rect(6, 96, 208, 6, { tone: 'deep', weight: 'thin' });
  for (let k = 0; k < 5; k++) pen.item(s.item, 8 + k * 16, 70, 11, 26, { part: 'line', tone: 'deep' });
  for (let k = 0; k < 4; k++) pen.item(s.item, 150 + k * 16, 70, 11, 26, { part: 'line' });
  pen.part({ id: 'line', motion: 'travel', periodS: 1.2, dx: 16 });
  // Photo-eye and its beam.
  pen.rect(118, 52, 12, 8, { tone: 'metal', rx: 1 });
  pen.line(124, 60, 124, 72, { tone: 'alert', dashed: true, part: 'eye' });
  pen.part({ id: 'eye', motion: 'blink', periodS: 0.6 });
  pen.hmi(176, 18, 26, 22);
  pen.lampTower(204, 44, 0.8);
  const anchors: Anchors = {
    'items-in': [{ x: 6, y: 99, side: 'left' }],
    'items-out': [{ x: 214, y: 99, side: 'right' }],
    'aux-in': [{ x: rx, y: 14, side: 'top' }],
    'reject-out': [{ x: 170, y: 126, side: 'bottom' }]
  };
  return { W, H, anchors, wall: { left: 16, right: 204, top: 84, bottom: 120 } };
};

const conveyor: Kit = (pen, s, rand) => {
  const W = 240;
  const H = 110;
  const lanes = Math.max(1, Math.min(6, Math.round(s.lanes)));
  const bedTop = 52;
  const bedH = 10 + lanes * 6;
  pen.rect(8, bedTop, 224, bedH, { rx: 4, weight: 'bold' });
  // Rollers / chain sprockets at each end and along the bed.
  for (const x of [16, 224]) {
    pen.circle(x, bedTop + bedH / 2, bedH / 2 - 2, { tone: 'metal', part: 'rollers' });
    pen.line(x - (bedH / 2 - 2), bedTop + bedH / 2, x + (bedH / 2 - 2), bedTop + bedH / 2, { part: 'rollers', weight: 'thin' });
  }
  pen.part({ id: 'rollers', motion: 'spin', periodS: 1.2 });
  for (let x = 36; x < 214; x += 20) pen.line(x, bedTop + 2, x, bedTop + bedH - 2, { weight: 'hair', opacity: 0.5 });
  for (let k = 1; k < lanes; k++) pen.line(10, bedTop + (bedH * k) / lanes, 230, bedTop + (bedH * k) / lanes, { dashed: true, weight: 'hair' });
  // Legs, braced.
  const legs = pick(rand, [3, 4]);
  for (let k = 0; k < legs; k++) {
    const x = 22 + (196 * k) / (legs - 1);
    pen.line(x, bedTop + bedH, x, 100, { weight: 'bold', layer: 'body' });
    pen.line(x - 7, 100, x + 7, 100, { weight: 'bold', layer: 'body' });
  }
  pen.line(22, 90, 218, 90, { weight: 'thin' });
  // Side guides.
  pen.line(8, bedTop - 18, 232, bedTop - 18, { weight: 'normal' });
  // Items: a loose spacing at the infeed, packed back-to-back where it accumulates.
  const h = 22;
  const w = s.item === 'case' || s.item === 'bag' ? 20 : 11;
  const packedFrom = s.accumulates ? 140 : 999;
  for (let x = 12; x < 226 - w; ) {
    const packed = x >= packedFrom;
    pen.item(s.item, x, bedTop - h, w, h, packed ? {} : { part: 'flow' });
    x += packed ? w + 1 : w + 14;
  }
  pen.part({ id: 'flow', motion: 'travel', periodS: 1.4, dx: w + 14 });
  if (s.accumulates) {
    pen.rect(packedFrom - 4, bedTop - 28, 232 - packedFrom, 6, { layer: 'fill', tone: 'gold', opacity: 0.6 });
    pen.rect(packedFrom - 8, bedTop - 6, 4, 8, { tone: 'metal' });
    pen.line(packedFrom - 6, bedTop - 6, packedFrom - 6, bedTop - 22, { tone: 'alert', dashed: true, part: 'eye' });
    pen.part({ id: 'eye', motion: 'blink', periodS: 0.8 });
  }
  // Drive motor under the head end.
  pen.rect(196, bedTop + bedH + 2, 26, 12, { tone: 'deep', rx: 2 });
  for (let k = 0; k < 4; k++) pen.line(199 + k * 6, bedTop + bedH + 4, 199 + k * 6, bedTop + bedH + 12, { weight: 'hair' });
  const y = bedTop + bedH / 2;
  const anchors: Anchors = {
    'items-in': [{ x: 8, y, side: 'left' }],
    'items-out': [{ x: 232, y, side: 'right' }],
    'reject-out': [{ x: 160, y: bedTop + bedH, side: 'bottom' }],
    'aux-in': [{ x: 60, y: bedTop - 18, side: 'top' }]
  };
  return { W, H, anchors, wall: { left: 8, right: 232, top: bedTop, bottom: bedTop + bedH } };
};

const casePacker: Kit = (pen, s, rand) => {
  const W = 260;
  const H = 170;
  // Machine frame and guarding.
  pen.rect(10, 40, 240, 96, { rx: 4, weight: 'bold' });
  pen.rect(10, 136, 240, 16, { tone: 'metal' });
  for (const x of [20, 130, 240]) pen.rect(x - 4, 152, 8, 10, { tone: 'metal', weight: 'thin' });
  pen.line(96, 40, 96, 136, { weight: 'hair', dashed: true });
  pen.line(176, 40, 176, 136, { weight: 'hair', dashed: true });
  // Infeed lanes with containers coming in.
  const lanes = Math.max(2, Math.min(6, Math.round(s.rows)));
  for (let k = 0; k <= lanes; k++) pen.line(12, 92 + k * 6, 92, 92 + k * 6, { weight: 'hair' });
  for (let k = 0; k < 4; k++) pen.item(s.item, 14 + k * 18, 70, 10, 22, { part: 'infeed' });
  pen.part({ id: 'infeed', motion: 'travel', periodS: 1.1, dx: 18 });
  // Collation grid: rows x columns, seen from above.
  const rows = Math.max(2, Math.min(6, Math.round(s.rows)));
  const cols = Math.max(2, Math.min(8, Math.round(s.columns)));
  const gx = 104;
  const gy = 64;
  const cell = Math.min(64 / cols, 56 / rows);
  pen.rect(gx - 2, gy - 2, cols * cell + 4, rows * cell + 4, { tone: 'metal', weight: 'thin' });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pen.circle(gx + cell * (c + 0.5), gy + cell * (r + 0.5), cell * 0.38, { tone: (r + c) % 2 ? 'solid' : 'deep', weight: 'hair' });
  // Pusher that moves the group into the case.
  pen.rect(gx - 8, gy - 2, 4, rows * cell + 4, { tone: 'glow', part: 'pusher' });
  pen.part({ id: 'pusher', motion: 'bob', periodS: 2.2, dx: 6 });
  // Blank magazine on top: a stack of flat blanks, one fed down.
  pen.rect(108, 6, 52, 30, { tone: 'metal', rx: 2 });
  for (let k = 0; k < 6; k++) pen.rect(112, 10 + k * 4, 44, 2.6, { tone: 'gold', weight: 'hair' });
  pen.rect(112, 38, 44, 3, { tone: 'gold', part: 'blank' });
  pen.part({ id: 'blank', motion: 'dive', periodS: 2.2, dy: 14 });
  // Folding section: flaps closing about a case, glue guns.
  pen.item(s.outItem, 186, 70, 36, 34, { part: 'fold' });
  pen.part({ id: 'fold', motion: 'bob', periodS: 2.2, dy: -3 });
  pen.polyline([[184, 70], [176, 58]], { weight: 'bold' });
  pen.polyline([[224, 70], [232, 58]], { weight: 'bold' });
  for (const x of [196, 212]) pen.rect(x - 3, 48, 6, 10, { tone: 'deep' });
  // Outfeed: finished cases.
  pen.rect(176, 108, 82, 6, { tone: 'metal', weight: 'thin' });
  pen.item(s.outItem, 228, 88, 22, 20, { part: 'out' });
  pen.part({ id: 'out', motion: 'travel', periodS: 2.2, dx: 8 });
  pen.hmi(rand() < 0.5 ? 20 : 60, 46, 28, 22);
  pen.lampTower(244, 6, 0.9);
  const anchors: Anchors = {
    'items-in': [{ x: 10, y: 100, side: 'left' }],
    'aux-in': [{ x: 134, y: 6, side: 'top' }, { x: 60, y: 40, side: 'top' }],
    'items-out': [{ x: 250, y: 111, side: 'right' }],
    'reject-out': [{ x: 210, y: 152, side: 'bottom' }]
  };
  return { W, H, anchors, wall: { left: 10, right: 250, top: 50, bottom: 130 } };
};

const palletizer: Kit = (pen, s, rand) => {
  const W = 240;
  const H = 190;
  // Gantry frame: two posts and a beam.
  pen.rect(60, 10, 8, 168, { tone: 'metal', weight: 'bold' });
  pen.rect(214, 10, 8, 168, { tone: 'metal', weight: 'bold' });
  pen.rect(56, 6, 170, 12, { tone: 'metal', weight: 'bold' });
  pen.line(60, 30, 222, 30, { weight: 'hair', dashed: true });
  // The head: carriage, mast and a layer of cases, moving from the forming table to the stack.
  pen.rect(78, 18, 30, 12, { tone: 'deep', part: 'head', rx: 2 });
  pen.rect(90, 30, 6, 30, { tone: 'metal', part: 'head' });
  pen.rect(72, 60, 42, 6, { tone: 'glow', part: 'head' });
  for (let k = 0; k < 3; k++) pen.item(s.outItem, 74 + k * 13, 66, 12, 12, { part: 'head' });
  pen.part({ id: 'head', motion: 'gantry', periodS: 4, dx: 70, dy: 34 });
  // Layer forming table where cases arrive.
  pen.rect(4, 104, 112, 8, { tone: 'metal' });
  for (let k = 0; k < 3; k++) pen.item(s.outItem, 10 + k * 20, 84, 18, 18, { part: 'in' });
  pen.part({ id: 'in', motion: 'travel', periodS: 1.6, dx: 20 });
  // The stack on its pallet, layer by layer.
  const layers = Math.max(2, Math.min(7, Math.round(s.layers)));
  const px = 140;
  pen.item('pallet', px, 166, 70, 12);
  const lh = Math.min(16, 96 / layers);
  for (let l = 0; l < layers - 1; l++) {
    const offset = l % 2 ? 5 : 0;
    for (let k = 0; k < 3; k++) pen.item(s.outItem, px + 2 + offset + k * 21, 166 - (l + 1) * lh, 20, lh - 1, { tone: l % 2 ? 'deep' : 'solid' });
  }
  pen.line(px - 4, 166 - layers * lh - 2, px - 4, 178, { tone: 'glow', dashed: true, weight: 'hair' });
  // Pallet magazine (empty pallets) under the forming table.
  const stacked = 3 + Math.floor(rand() * 3);
  for (let k = 0; k < stacked; k++) pen.item('pallet', 10, 176 - (k + 1) * 9, 44, 8, { opacity: 0.9 });
  pen.rect(6, 176, 52, 4, { tone: 'metal' });
  pen.lampTower(232, 22, 0.8);
  pen.hmi(14, 20, 30, 24);
  const anchors: Anchors = {
    'items-in': [{ x: 4, y: 108, side: 'left' }],
    'items-out': [{ x: 222, y: 172, side: 'right' }],
    'aux-in': [{ x: 32, y: 180, side: 'bottom' }],
    'reject-out': [{ x: 120, y: 184, side: 'bottom' }]
  };
  return { W, H, anchors, wall: { left: 4, right: 222, top: 30, bottom: 170 } };
};

function vessel(pen: Pen, s: KitSettings, rand: () => number, opts: { gas: boolean }): KitResult {
  const W = 160;
  const H = 210;
  const w = 76 + Math.round(rand() * 12);
  const x0 = (W - w) / 2;
  const top = 34;
  const bottom = 160;
  const head = 16;
  // Shell with dished heads, as one outline.
  pen.path(`M${x0} ${top + head} Q${x0} ${top} ${W / 2} ${top} Q${x0 + w} ${top} ${x0 + w} ${top + head} L${x0 + w} ${bottom} Q${x0 + w} ${bottom + head} ${W / 2} ${bottom + head} Q${x0} ${bottom + head} ${x0} ${bottom} Z`, { weight: 'bold' });
  // The liquid, rising and falling with the run.
  pen.rect(x0 + 3, top + head + 4, w - 6, bottom - top - head - 2, { layer: 'fill', level: true, rx: 3 });
  pen.line(x0 + 3, top + head + 30, x0 + w - 3, top + head + 30, { tone: 'glow', part: 'surface', dashed: true, weight: 'hair' });
  pen.part({ id: 'surface', motion: 'shimmer', periodS: 3 });
  // Weld seams and nameplate.
  pen.line(x0, top + head + 8, x0 + w, top + head + 8, { weight: 'hair', opacity: 0.6 });
  pen.line(x0, bottom - 6, x0 + w, bottom - 6, { weight: 'hair', opacity: 0.6 });
  pen.rect(x0 + w - 22, bottom - 30, 14, 9, { tone: 'light', opacity: 0.7, weight: 'hair' });
  // Legs.
  for (const x of [x0 + 8, x0 + w - 8]) {
    pen.line(x, bottom + 8, x - (x < W / 2 ? 6 : -6), 200, { weight: 'heavy', layer: 'body' });
    pen.rect(x - (x < W / 2 ? 12 : 0), 198, 12, 4, { tone: 'metal' });
  }
  // Sight glass with its own level.
  pen.rect(x0 - 10, top + head + 10, 6, bottom - top - head - 20, { tone: 'metal', rx: 2 });
  pen.rect(x0 - 9, top + head + 12, 4, bottom - top - head - 24, { layer: 'fill', tone: 'glow', level: true, opacity: 0.8 });
  // Manway, CIP spray ball, radar level transmitter and a thermowell.
  pen.rect(W / 2 + 14, top - 6, 18, 8, { tone: 'metal', rx: 2 });
  if (!opts.gas) {
    pen.line(W / 2 - 4, top, W / 2 - 4, top + head + 6, { weight: 'thin' });
    pen.circle(W / 2 - 4, top + head + 9, 4, { tone: 'metal' });
    for (const a of [-0.6, 0, 0.6]) pen.line(W / 2 - 4, top + head + 12, W / 2 - 4 + 14 * Math.sin(a), top + head + 24, { tone: 'glow', dashed: true, weight: 'hair', part: 'cip' });
    pen.part({ id: 'cip', motion: 'pulse', periodS: 2.6 });
  }
  pen.rect(x0 + 12, top - 8, 10, 10, { tone: 'deep', rx: 1 });
  pen.line(x0 + 17, top + 2, x0 + 17, top + head + 26, { dashed: true, weight: 'hair', tone: 'gold' });
  pen.line(x0 + w, bottom - 34, x0 + w - 16, bottom - 34, { weight: 'bold' });
  pen.circle(x0 + w + 4, bottom - 34, 4, { tone: 'light', opacity: 0.85 });
  if (s.agitated && !opts.gas) {
    pen.rect(W / 2 - 9, 6, 18, 20, { tone: 'deep', rx: 2 });
    for (let k = 0; k < 3; k++) pen.line(W / 2 - 7 + k * 7, 8, W / 2 - 7 + k * 7, 24, { weight: 'hair' });
    pen.line(W / 2, 26, W / 2, bottom - 8, { weight: 'bold', layer: 'body' });
    pen.poly([[W / 2 - 18, bottom - 12], [W / 2, bottom - 18], [W / 2 + 18, bottom - 12], [W / 2, bottom - 6]], { tone: 'solid', part: 'impeller' });
    pen.part({ id: 'impeller', motion: 'spin', periodS: 1.5, origin: { x: W / 2, y: bottom - 12 } });
  }
  if (s.jacketed) {
    pen.path(`M${x0 - 5} ${top + head + 14} L${x0 - 5} ${bottom + 2} Q${x0 - 5} ${bottom + head + 5} ${W / 2} ${bottom + head + 5} Q${x0 + w + 5} ${bottom + head + 5} ${x0 + w + 5} ${bottom + 2} L${x0 + w + 5} ${top + head + 14}`, { dashed: true, tone: 'gold', weight: 'thin', layer: 'detail' });
  }
  if (opts.gas) {
    // Spray head on top, gas sparger ring at the bottom, bubbles rising.
    pen.rect(W / 2 - 12, top + 8, 24, 6, { tone: 'metal', rx: 2 });
    for (const dx of [-8, 0, 8]) pen.line(W / 2 + dx, top + 14, W / 2 + dx * 1.8, top + 30, { tone: 'glow', dashed: true, part: 'spray' });
    pen.part({ id: 'spray', motion: 'pulse', periodS: 1 });
    pen.ellipse(W / 2, bottom - 10, w / 2 - 10, 4, { tone: 'metal', weight: 'thin' });
    const rnd = rng(Math.floor(rand() * 1e6));
    for (let k = 0; k < 9; k++) {
      const bx = x0 + 14 + rnd() * (w - 28);
      const by = bottom - 20 - rnd() * 60;
      pen.circle(bx, by, 1.4 + rnd() * 2, { tone: 'light', opacity: 0.7, part: `bubbles-${k % 3}`, layer: 'detail' });
    }
    for (let k = 0; k < 3; k++) pen.part({ id: `bubbles-${k}`, motion: 'travel', periodS: 2.4, dy: -26, delayS: k * 0.8 });
    // Pressure gauge on the top head.
    pen.circle(x0 + 16, top - 4, 7, { tone: 'light', opacity: 0.85 });
    pen.line(x0 + 16, top - 4, x0 + 20, top - 8, { weight: 'thin' });
  }
  const anchors: Anchors = {
    'liquid-in': [{ x: W / 2 - 18, y: top + 2, side: 'top' }, { x: x0 + w, y: top + head + 16, side: 'right' }],
    'liquid-out': [{ x: W / 2, y: bottom + head, side: 'bottom' }, { x: x0 + w, y: bottom - 10, side: 'right' }],
    'gas-in': [{ x: x0, y: bottom - 12, side: 'left' }],
    'gas-out': [{ x: W / 2 + 34, y: top + 6, side: 'top' }],
    'utility-in': [{ x: x0 - 5, y: bottom - 4, side: 'left' }],
    'utility-out': [{ x: x0 + w + 5, y: top + head + 18, side: 'right' }]
  };
  return { W, H, anchors, wall: { left: x0, right: x0 + w, top: top + head, bottom } };
}

const tank: Kit = (pen, s, rand) => vessel(pen, s, rand, { gas: false });
const carbonator: Kit = (pen, s, rand) => vessel(pen, s, rand, { gas: true });

const pump: Kit = (pen, _s, rand) => {
  const W = 200;
  const H = 120;
  // Baseplate.
  pen.rect(8, 94, 184, 10, { tone: 'metal' });
  for (const x of [20, 100, 180]) pen.circle(x, 99, 2, { layer: 'detail' });
  // Volute casing and impeller.
  const vx = 52;
  const vy = 58;
  pen.path(`M${vx + 30} ${vy - 34} L${vx + 30} ${vy - 18} A30 30 0 1 1 ${vx + 4} ${vy - 30} Z`, { weight: 'bold' });
  pen.circle(vx, vy, 24, { tone: 'deep', opacity: 0.6 });
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI * k) / 3;
    pen.path(`M${r2(vx)} ${r2(vy)} Q${r2(vx + 14 * Math.cos(a + 0.5))} ${r2(vy + 14 * Math.sin(a + 0.5))} ${r2(vx + 20 * Math.cos(a))} ${r2(vy + 20 * Math.sin(a))}`, { part: 'impeller', layer: 'detail', tone: 'glow' });
  }
  pen.circle(vx, vy, 4, { tone: 'metal', part: 'impeller' });
  pen.part({ id: 'impeller', motion: 'spin', periodS: 0.8, origin: { x: vx, y: vy } });
  pen.rect(vx - 14, 86, 28, 8, { tone: 'metal' });
  // Bearing frame, coupling guard, motor with fins.
  pen.rect(84, 46, 22, 26, { tone: 'metal', rx: 2 });
  pen.poly([[106, 48], [124, 44], [124, 74], [106, 70]], { dashed: true, weight: 'thin' });
  const mw = 52 + rand() * 10;
  pen.rect(124, 38, mw, 44, { tone: 'deep', rx: 6 });
  for (let k = 0; k < 7; k++) pen.line(130 + k * ((mw - 10) / 6), 40, 130 + k * ((mw - 10) / 6), 80, { weight: 'hair' });
  pen.rect(140, 30, 18, 8, { tone: 'metal', rx: 1 });
  pen.rect(124 + mw - 8, 86, 10, 8, { tone: 'metal' });
  pen.circle(150, 34, 2, { tone: 'status', part: 'lamp' });
  pen.part({ id: 'lamp', motion: 'blink', periodS: 1.4 });
  const anchors: Anchors = {
    'liquid-in': [{ x: vx - 30, y: vy, side: 'left' }],
    'liquid-out': [{ x: vx + 22, y: vy - 34, side: 'top' }],
    'utility-in': [{ x: 120, y: 94, side: 'bottom' }]
  };
  pen.flange(vx - 30, vy, false);
  pen.flange(vx + 22, vy - 34, true);
  return { W, H, anchors, wall: { left: vx - 30, right: 124 + mw, top: 38, bottom: 90 } };
};

const inlineMixer: Kit = (pen, s, rand) => {
  const W = 240;
  const H = 100;
  const y = 56;
  pen.rect(14, y - 14, 212, 28, { rx: 3, weight: 'bold' });
  for (const x of [14, 70, 170, 226]) pen.rect(x - 3, y - 20, 6, 40, { tone: 'metal' });
  // Helical elements, alternating hand.
  const n = Math.max(4, Math.min(16, Math.round(s.elements)));
  const ew = 100 / n;
  for (let k = 0; k < n; k++) {
    const x = 70 + k * ew;
    pen.path(k % 2 ? `M${r2(x)} ${y - 12} C${r2(x + ew * 0.6)} ${y - 12} ${r2(x + ew * 0.4)} ${y + 12} ${r2(x + ew)} ${y + 12}` : `M${r2(x)} ${y + 12} C${r2(x + ew * 0.6)} ${y + 12} ${r2(x + ew * 0.4)} ${y - 12} ${r2(x + ew)} ${y - 12}`, {
      layer: 'detail',
      tone: k % 2 ? 'solid' : 'glow',
      weight: 'bold'
    });
  }
  // Two streams: the main flow from the left, the dosed one by a quill from the top.
  pen.rect(40, y - 40, 8, 26, { tone: 'metal' });
  pen.line(44, y - 14, 44, y, { tone: 'glow', dashed: true });
  pen.rect(28, y - 48, 32, 10, { tone: 'deep', rx: 2 });
  // Flow arrows moving along the pipe.
  for (let k = 0; k < 3; k++) pen.poly([[20 + k * 16, y - 4], [28 + k * 16, y], [20 + k * 16, y + 4]], { tone: 'glow', part: 'flow', layer: 'detail' });
  for (let k = 0; k < 2; k++) pen.poly([[184 + k * 16, y - 4], [192 + k * 16, y], [184 + k * 16, y + 4]], { tone: 'glow', part: 'flow', layer: 'detail' });
  pen.part({ id: 'flow', motion: 'travel', periodS: 1, dx: 16 });
  // Sample valve and a conductivity/brix probe, per variant.
  const px = 150 + rand() * 20;
  pen.rect(px - 3, y - 30, 6, 16, { tone: 'metal' });
  pen.circle(px, y - 34, 6, { tone: 'light', opacity: 0.85 });
  pen.line(px, y - 34, px + 3, y - 37, { weight: 'thin' });
  // Supports.
  for (const x of [50, 190]) pen.line(x, y + 14, x, 94, { weight: 'bold', layer: 'body' });
  pen.line(30, 94, 210, 94, { weight: 'bold', layer: 'body' });
  const anchors: Anchors = {
    'liquid-in': [{ x: 14, y, side: 'left' }, { x: 44, y: y - 48, side: 'top' }, { x: 100, y: y - 14, side: 'top' }],
    'gas-in': [{ x: 120, y: y - 14, side: 'top' }],
    'liquid-out': [{ x: 226, y, side: 'right' }]
  };
  return { W, H, anchors, wall: { left: 14, right: 226, top: y - 14, bottom: y + 14 } };
};

const heatExchanger: Kit = (pen, s, rand) => {
  const W = 220;
  const H = 150;
  // Fixed and moving frames, tie bars, carrying bar.
  pen.rect(20, 20, 16, 112, { tone: 'deep', rx: 2 });
  pen.rect(164, 20, 16, 112, { tone: 'deep', rx: 2 });
  pen.line(20, 16, 210, 16, { weight: 'heavy', layer: 'body' });
  pen.rect(200, 16, 6, 124, { tone: 'metal' });
  for (const y of [28, 124]) pen.line(36, y, 164, y, { weight: 'bold' });
  // The plate pack, alternating hot and cold.
  const n = Math.max(12, Math.min(40, Math.round(s.elements * 2)));
  for (let k = 0; k < n; k++) {
    const x = 40 + (k * 120) / n;
    pen.rect(x, 30, 120 / n - 1, 92, { tone: k % 2 ? 'solid' : 'glow', opacity: 0.55 + 0.3 * rand(), weight: 'hair' });
  }
  pen.line(40, 76, 160, 76, { tone: 'glow', part: 'flow', dashed: true, weight: 'thin' });
  pen.part({ id: 'flow', motion: 'pulse', periodS: 1.6 });
  for (const x of [26, 174]) pen.rect(x - 4, 132, 8, 12, { tone: 'metal' });
  // Tightening bolts with their nuts, and the nameplate.
  for (const y of [28, 124]) for (const x of [38, 162]) pen.rect(x - 3, y - 3, 6, 6, { tone: 'metal', weight: 'thin' });
  pen.rect(166, 60, 10, 14, { tone: 'light', opacity: 0.7, weight: 'hair' });
  const anchors: Anchors = {
    'liquid-in': [{ x: 20, y: 40, side: 'left' }, { x: 20, y: 112, side: 'left' }],
    'liquid-out': [{ x: 20, y: 112, side: 'left' }, { x: 20, y: 40, side: 'left' }],
    'utility-in': [{ x: 180, y: 112, side: 'right' }],
    'utility-out': [{ x: 180, y: 40, side: 'right' }]
  };
  return { W, H, anchors, wall: { left: 20, right: 180, top: 30, bottom: 122 } };
};

const machine: Kit = (pen, s, rand) => {
  const W = 220;
  const H = 150;
  pen.rect(30, 22, 160, 98, { rx: 6, weight: 'bold' });
  pen.rect(30, 120, 160, 16, { tone: 'metal' });
  const win = pick(rand, [0, 1]);
  pen.rect(60, 40, 100, 52, { tone: 'metal', rx: win ? 12 : 3, opacity: 0.8 });
  pen.rect(64, 44, 92, 44, { layer: 'fill', tone: 'glow', opacity: 0.2 });
  // Work inside the window: a tool that cycles over the item.
  pen.rect(102, 44, 16, 14, { tone: 'deep', part: 'tool' });
  pen.line(110, 58, 110, 66, { weight: 'bold', part: 'tool' });
  pen.part({ id: 'tool', motion: 'dive', periodS: 1.2, dy: 6 });
  pen.rect(6, 96, 208, 6, { tone: 'metal', weight: 'thin' });
  for (let k = 0; k < 6; k++) pen.item(s.item, 8 + k * 36, 74, 12, 22, { part: 'flow' });
  pen.part({ id: 'flow', motion: 'travel', periodS: 2, dx: 36 });
  pen.hmi(150, 96, 30, 20);
  pen.lampTower(180, 0, 0.9);
  const anchors: Anchors = {
    'items-in': [{ x: 6, y: 99, side: 'left' }],
    'items-out': [{ x: 214, y: 99, side: 'right' }],
    'liquid-in': [{ x: 70, y: 22, side: 'top' }],
    'liquid-out': [{ x: 90, y: 136, side: 'bottom' }],
    'gas-in': [{ x: 100, y: 22, side: 'top' }],
    'gas-out': [{ x: 130, y: 22, side: 'top' }],
    'reject-out': [{ x: 160, y: 136, side: 'bottom' }],
    'aux-in': [{ x: 160, y: 22, side: 'top' }]
  };
  return { W, H, anchors, wall: { left: 30, right: 190, top: 30, bottom: 116 } };
};

const KITS: Record<DrawingKit, Kit> = {
  'rotary-machine': rotaryMachine,
  labeler,
  conveyor,
  'case-packer': casePacker,
  palletizer,
  tank,
  carbonator,
  pump,
  'inline-mixer': inlineMixer,
  'heat-exchanger': heatExchanger,
  machine
};

// -------------------------------------------------------------- settings

const ITEM_WORDS: [DrawingItem, RegExp][] = [
  ['can', /\bcans?\b/],
  ['jar', /\bjars?\b/],
  ['bag', /\b(bags?|sacks?|pouch\w*)\b/],
  ['drum', /\b(drums?|pails?|kegs?)\b/],
  ['carton', /\b(cartons?|gable[- ]top)\b/],
  ['case', /\b(cases?|boxes|box|trays?)\b/],
  ['bottle', /\b(bottles?|pet|glass|preforms?)\b/]
];

function itemFrom(text: string, fallback: DrawingItem): DrawingItem {
  const t = text.toLowerCase();
  for (const [item, re] of ITEM_WORDS) if (re.test(t)) return item;
  return fallback;
}

/** A parameter's value by the first name that matches, rounded, else the fallback. */
function param(contract: Pick<UnitOpContract, 'parameters'> | undefined, re: RegExp, fallback: number): number {
  const p = contract?.parameters.find((x) => re.test(x.name));
  return typeof p?.value === 'number' && Number.isFinite(p.value) ? p.value : fallback;
}

export function kitSettingsFor(contract: Partial<UnitOpContract> | undefined, text: string, overrides: Partial<KitSettings> = {}): KitSettings {
  const c = contract as UnitOpContract | undefined;
  const t = text.toLowerCase();
  // The item: what the infeed port says, else the words, else bottles.
  const portWords = (c?.ports ?? []).map((p) => `${p.id} ${p.name}`).join(' ');
  const item = itemFrom(`${portWords} ${t}`.replace(/\bcases?\b/g, ''), 'bottle');
  const outPort = (c?.ports ?? []).find((p) => p.direction === 'OUTLET' && p.flowDimension === 'DISCRETE_CONTAINER');
  const outItem = itemFrom(outPort ? `${outPort.id} ${outPort.name}` : '', /pack|palleti|erector|carton/.test(t) ? 'case' : item);
  return {
    heads: param(c, /valve|head|nozzle|station|spindle|pocket/i, 12),
    lanes: param(c, /lane/i, 2),
    rows: param(c, /^rows?$|rows/i, 3),
    columns: param(c, /col/i, 4),
    layers: param(c, /layer/i, 5),
    elements: param(c, /element|plate/i, 8),
    item,
    outItem: outItem === item && /pack|palleti/.test(t) ? 'case' : outItem,
    agitated: /agitat|stirr|impeller|mix/.test(t) && !/static|inline|in-line/.test(t),
    jacketed: /jacket|glycol|steam[- ]?heated|half[- ]pipe/.test(t),
    accumulates: /accumulat|buffer|surge/.test(t),
    capper: /cap(per|ping|s)\b|closure|crown|corker/.test(t),
    ...overrides
  };
}

// ------------------------------------------------------------------ draw

export interface DrawUnitOpRequest {
  /** The contract to draw: its ports become nozzles, its numbers shape the drawing. */
  contract?: Omit<Partial<UnitOpContract>, 'ports'> & { ports: KitPort[] };
  /** Or just ports, with a name and description. */
  ports?: KitPort[];
  name?: string;
  description?: string;
  /** Draw this kit instead of choosing one. */
  kit?: DrawingKit;
  /** A different variant of the same kit (free choices: panels, lamp, proportions). */
  variant?: number;
  /** Override what the contract implies (heads, lanes, item...). */
  settings?: Partial<KitSettings>;
}

export interface DrawUnitOpResult {
  drawing: UnitOpDrawing;
  routing: KitRouting;
  settings: KitSettings;
  variant: number;
}

export function drawUnitOp(req: DrawUnitOpRequest): DrawUnitOpResult {
  const contract = req.contract;
  const ports = (contract?.ports ?? req.ports ?? []) as KitPort[];
  const name = req.name ?? contract?.name ?? '';
  const description = req.description ?? contract?.description ?? '';
  const routing = routeDrawingKit({ ...(req.kit ? { kit: req.kit } : {}), name, description, ...(contract?.archetype ? { archetype: contract.archetype } : {}) });
  const settings = kitSettingsFor(contract as Partial<UnitOpContract> | undefined, `${name} ${description}`, req.settings);
  const variant = req.variant ?? variantFor(`${contract?.id ?? ''}|${name}`);
  const pen = new Pen();
  const kit = KITS[routing.kit](pen, settings, rng(variant + 1));
  const behavior = (contract as UnitOpContract | undefined)?.behavior;
  const scrap = new Set<string>(behavior && behavior.mode === 'DISCRETE_CYCLE' ? (behavior.outputs ?? []).filter((o) => o.scrap).map((o) => o.port) : []);
  const nozzles = placeNozzles(ports, classify(ports, scrap), kit.anchors, kit.W, kit.H, kit.wall);
  return {
    drawing: {
      viewBox: { width: kit.W, height: kit.H },
      shapes: pen.shapes,
      nozzles,
      ...(pen.parts.length ? { parts: pen.parts } : {}),
      origin: { kit: routing.kit, variant }
    },
    routing,
    settings,
    variant
  };
}

// ------------------------------------------------------------- quality

export interface DrawingQuality {
  /** 0..100: richness against the palette's own units. */
  score: number;
  warnings: string[];
}

/**
 * How a drawing compares with the palette's: enough shapes to read as the
 * equipment, internals as well as an outline, more than one tone, and moving
 * parts on a machine that moves. Warnings, never errors: an engineer may want
 * a schematic.
 */
export function drawingQuality(drawing: UnitOpDrawing, opts: { moves?: boolean } = {}): DrawingQuality {
  const warnings: string[] = [];
  const n = drawing.shapes.length;
  const details = drawing.shapes.filter((s) => s.layer === 'detail').length;
  const tones = new Set(drawing.shapes.map((s) => s.tone ?? (s.type === 'item' ? 'item' : s.layer === 'fill' ? 'fill' : 'outline')));
  const parts = drawing.parts?.length ?? 0;
  let score = Math.min(40, n * 1.2) + Math.min(20, details * 2.5) + Math.min(20, (tones.size - 1) * 5) + (parts ? Math.min(20, parts * 7) : 0);
  if (!opts.moves) score += parts ? 0 : 10;
  score = Math.round(Math.min(100, score));
  if (n < 18) warnings.push(`The drawing has ${n} shapes; the palette's units have 25 to 60. Start from draw_unit_op, which draws this equipment from the contract, then make it this unit's own.`);
  if (details < 3) warnings.push('The drawing shows no internals (layer "detail"): add what makes the equipment recognisable (turret heads, plates, impeller, rollers).');
  if (tones.size < 3) warnings.push('The drawing uses one colour: give the masses tones (solid, deep, metal, glow, light) the way the palette does.');
  if (opts.moves && !parts) warnings.push('This unit moves while it runs but nothing in its drawing does: give its turret, belt, head or impeller a part with a motion (drawing.parts).');
  return { score, warnings };
}

/**
 * A fingerprint of a drawing's geometry, for telling a near copy from an
 * original: the shapes' kinds and their positions on a coarse grid.
 */
export function drawingFingerprint(drawing: UnitOpDrawing): Set<string> {
  const { width: W, height: H } = drawing.viewBox;
  const cell = (x: number, y: number) => `${Math.round((x / W) * 12)}:${Math.round((y / H) * 12)}`;
  const out = new Set<string>();
  for (const s of drawing.shapes) {
    switch (s.type) {
      case 'rect':
      case 'item':
        out.add(`${s.type}@${cell(s.x, s.y)}/${cell(s.x + s.width, s.y + s.height)}`);
        break;
      case 'circle':
        out.add(`c@${cell(s.cx, s.cy)}/${Math.round((s.r / W) * 24)}`);
        break;
      case 'ellipse':
        out.add(`e@${cell(s.cx, s.cy)}`);
        break;
      case 'line':
        out.add(`l@${cell(s.x1, s.y1)}/${cell(s.x2, s.y2)}`);
        break;
      default:
        out.add(`${s.type}#${'points' in s ? s.points.length : s.type === 'path' ? s.d.length >> 3 : 0}`);
    }
  }
  return out;
}

/** Jaccard similarity of two drawings' fingerprints, 0..1. */
export function drawingSimilarity(a: UnitOpDrawing, b: UnitOpDrawing): number {
  const fa = drawingFingerprint(a);
  const fb = drawingFingerprint(b);
  let both = 0;
  for (const k of fa) if (fb.has(k)) both++;
  const union = fa.size + fb.size - both;
  return union ? both / union : 1;
}
