/**
 * How a stream looks, from what the engine says it carries. Pure functions,
 * so the rules are tested rather than eyeballed.
 *
 * Colour and motion both report state (the drafting rules: colour means
 * something, motion only reports a state change): a liquid pipe shades from
 * its usual turquoise toward glacial blue as its liquid gets colder and toward
 * ember as it gets hotter, and the bore moves faster the more flows.
 */

/** At or below this, a pipe is fully "cold"; at or above HOT_C, fully "hot". */
export const COLD_C = 10;
export const AMBIENT_LOW_C = 15;
export const AMBIENT_HIGH_C = 35;
export const HOT_C = 90;

const hex = (c: string): [number, number, number] => {
  const h = c.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
};

/** `a` mixed toward `b` by `t` (0..1). */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

/**
 * A liquid pipe's colour at a temperature: its own colour across the ambient
 * band, shading to `cold` below it and to `hot` above it. Unknown: its own.
 */
export function pipeColor(base: string, cold: string, hot: string, temperatureC: number | undefined): string {
  if (temperatureC === undefined || !Number.isFinite(temperatureC)) return base;
  if (temperatureC < AMBIENT_LOW_C) return mixHex(base, cold, (AMBIENT_LOW_C - temperatureC) / (AMBIENT_LOW_C - COLD_C));
  if (temperatureC > AMBIENT_HIGH_C) return mixHex(base, hot, (temperatureC - AMBIENT_HIGH_C) / (HOT_C - AMBIENT_HIGH_C));
  return base;
}

/**
 * Seconds for one dash cycle of the moving bore: brisk for a big flow, slow
 * for a trickle, so the animation tells you the flow at a glance. `full` is
 * the rate drawn at the fastest pace (gal/min, or items/min).
 */
export function flowPeriodSeconds(rate: number, full: number): number {
  if (!(rate > 0)) return 0;
  const share = Math.min(1, rate / full);
  // 2.4 s at a trickle down to 0.35 s at full flow, eased so small flows still visibly move.
  return Math.round((2.4 - 2.05 * Math.sqrt(share)) * 100) / 100;
}

/** A pipe's label while it runs: "42.5 gpm · 65 °C", or "18 /min" for items. */
export function liveLabel(isFluid: boolean, rate: number, temperatureC?: number): string {
  const r = rate >= 100 ? Math.round(rate).toString() : (Math.round(rate * 10) / 10).toString();
  if (!isFluid) return `${r} /min`;
  return temperatureC !== undefined ? `${r} gpm · ${Math.round(temperatureC)} °C` : `${r} gpm`;
}
