import { useStore } from '@xyflow/react';

/**
 * How much to enlarge a unit's labels at the current zoom, so they stay
 * readable when the flowsheet is zoomed out to fit (a 12 px name at 0.6x is
 * 7 px on screen): never smaller than they are at 0.8x, never more than
 * twice their size. At 0.8x and closer they are as designed. In steps of
 * 0.05, so panning and small zooms do not re-render every node.
 */
export function useLabelScale(): number {
  return useStore((s) => Math.round(Math.min(2, Math.max(1, 0.8 / s.transform[2])) * 20) / 20);
}
