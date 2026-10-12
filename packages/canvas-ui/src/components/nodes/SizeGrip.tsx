import React, { useState } from 'react';
import { useStore } from '@xyflow/react';
import { clampScale, resolvedLayout, scaleLayout, type NodeLayout } from '@process-forge/protocol';
import { useTheme } from '../../hooks/useTheme.js';

/**
 * Sizing a unit or an arrow by dragging its corner grip. While the grip is
 * dragged the node draws at `layout` (a live scale); on release the new size
 * is written to the flowsheet once, so the drag is one undo step.
 *
 * `base` is the node's on-screen size in px at the current scale (the mean of
 * its width and height): dragging the corner that far out doubles it.
 */
export function useSizeGrip(
  nodeId: string,
  stored: NodeLayout | undefined,
  base: number,
  onLayoutChange: ((nodeId: string, layout: NodeLayout | undefined) => void) | undefined
): { layout: NodeLayout | undefined; onGripDown: (e: React.PointerEvent<HTMLDivElement>) => void } {
  const zoom = useStore((st) => st.transform[2]);
  const [liveScale, setLiveScale] = useState<number | null>(null);
  const layout = liveScale === null ? stored : scaleLayout(stored, liveScale);

  const onGripDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onLayoutChange) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const s0 = resolvedLayout(stored).scale;
    let last = s0;
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - x0 + (ev.clientY - y0)) / 2 / (zoom || 1);
      last = clampScale((s0 * (base + d)) / base);
      setLiveScale(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setLiveScale(null);
      if (last !== s0) onLayoutChange(nodeId, scaleLayout(stored, last));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return { layout, onGripDown };
}

/** The corner grip itself, at the bottom right of its positioned parent. */
export const SizeGrip: React.FC<{ scale: number; label: string; inset?: number; onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void }> = ({
  scale,
  label,
  inset = 3,
  onPointerDown
}) => {
  const { palette } = useTheme();
  return (
    <div
      className="nodrag nopan"
      role="slider"
      aria-label={label}
      aria-valuemin={50}
      aria-valuemax={300}
      aria-valuenow={Math.round(scale * 100)}
      title={`Drag to size it (${Math.round(scale * 100)}%)`}
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        right: inset,
        bottom: inset,
        width: 11,
        height: 11,
        borderRight: `2px solid ${palette.border.glow}`,
        borderBottom: `2px solid ${palette.border.glow}`,
        borderBottomRightRadius: 3,
        cursor: 'nwse-resize',
        touchAction: 'none',
        zIndex: 5
      }}
    />
  );
};
