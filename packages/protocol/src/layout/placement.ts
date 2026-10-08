import type { NodeLayout } from '../nodes.js';
import type { Side } from '../equipment/nozzleLayout.js';

/**
 * Where a unit's drawing and nozzles end up once the unit is sized, turned
 * and mirrored on the flowsheet (ProcessNode.layout).
 *
 * Nozzle positions are stored as percent of the drawing's own box and the
 * side the pipe leaves by. Those never change when a unit is turned: the
 * transform is applied on the way to the screen, so turning a pump back
 * restores exactly what was there, and the nozzle editor keeps working in the
 * drawing's own frame.
 */

export type Rotation = 0 | 90 | 180 | 270;

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3;

/** The layout with its defaults filled in. */
export function resolvedLayout(layout: NodeLayout | undefined): { scale: number; rotation: Rotation; flipX: boolean } {
  const scale = layout?.scale;
  return {
    scale: typeof scale === 'number' && Number.isFinite(scale) ? clampScale(scale) : 1,
    rotation: layout?.rotation ?? 0,
    flipX: layout?.flipX ?? false
  };
}

export function clampScale(s: number): number {
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)) * 100) / 100;
}

/** True when the layout is the identity (nothing to store). */
export function isDefaultLayout(layout: NodeLayout | undefined): boolean {
  const l = resolvedLayout(layout);
  return l.scale === 1 && l.rotation === 0 && !l.flipX;
}

/** A layout with the defaults left out, or undefined when nothing differs from them. */
export function compactLayout(layout: NodeLayout | undefined): NodeLayout | undefined {
  const l = resolvedLayout(layout);
  const out: NodeLayout = {};
  if (l.scale !== 1) out.scale = l.scale;
  if (l.rotation !== 0) out.rotation = l.rotation;
  if (l.flipX) out.flipX = true;
  return Object.keys(out).length ? out : undefined;
}

/** Turned a quarter turn clockwise (or anticlockwise with -1). */
export function rotateLayout(layout: NodeLayout | undefined, quarterTurns: number): NodeLayout | undefined {
  const l = resolvedLayout(layout);
  const rotation = ((((l.rotation + quarterTurns * 90) % 360) + 360) % 360) as Rotation;
  return compactLayout({ ...l, rotation });
}

/** Mirrored left to right, as seen on screen (whatever way it is turned). */
export function flipLayout(layout: NodeLayout | undefined): NodeLayout | undefined {
  const l = resolvedLayout(layout);
  // Mirroring the screen image of a turned drawing is mirroring the drawing and turning it the other way.
  const rotation = ((360 - l.rotation) % 360) as Rotation;
  return compactLayout({ ...l, flipX: !l.flipX, rotation });
}

export function scaleLayout(layout: NodeLayout | undefined, scale: number): NodeLayout | undefined {
  return compactLayout({ ...resolvedLayout(layout), scale: clampScale(scale) });
}

/** The box a drawing of natural size w x h takes once sized and turned. */
export function placedSize(width: number, height: number, layout: NodeLayout | undefined): { width: number; height: number; drawnWidth: number; drawnHeight: number } {
  const l = resolvedLayout(layout);
  const drawnWidth = Math.round(width * l.scale);
  const drawnHeight = Math.round(height * l.scale);
  const quarter = l.rotation === 90 || l.rotation === 270;
  return { width: quarter ? drawnHeight : drawnWidth, height: quarter ? drawnWidth : drawnHeight, drawnWidth, drawnHeight };
}

const CW: Record<Side, Side> = { left: 'top', top: 'right', right: 'bottom', bottom: 'left' };
const MIRROR: Record<Side, Side> = { left: 'right', right: 'left', top: 'top', bottom: 'bottom' };

/**
 * A point given in percent of the drawing's own box (and the side its pipe
 * leaves by) in percent of the placed box. Mirroring happens first, then the
 * clockwise turn, matching the CSS `rotate(r) scaleX(-1)` the canvas draws with.
 */
export function placePoint(x: number, y: number, side: Side, layout: NodeLayout | undefined): { x: number; y: number; side: Side } {
  const l = resolvedLayout(layout);
  let px = l.flipX ? 100 - x : x;
  let py = y;
  let s = l.flipX ? MIRROR[side] : side;
  for (let r = 0; r < l.rotation; r += 90) {
    const nx = 100 - py;
    py = px;
    px = nx;
    s = CW[s];
  }
  return { x: px, y: py, side: s };
}

/** The CSS transform that draws a drawing box with this layout (about its centre). */
export function layoutTransform(layout: NodeLayout | undefined): string {
  const l = resolvedLayout(layout);
  const parts: string[] = [];
  if (l.rotation) parts.push(`rotate(${l.rotation}deg)`);
  if (l.flipX) parts.push('scaleX(-1)');
  return parts.join(' ');
}
