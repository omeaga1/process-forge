import React from 'react';
import { NodeToolbar, Position } from '@xyflow/react';
import { FlipHorizontal2, Maximize2, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { flipLayout, resolvedLayout, rotateLayout, scaleLayout, type NodeLayout } from '@process-forge/protocol';
import { useTheme } from '../../hooks/useTheme.js';

/**
 * Turn, mirror and size a unit, over it while it is selected. The same moves
 * are on the right-click menu and the keyboard (R, Shift+R, F, + and -).
 */
export const LayoutToolbar: React.FC<{
  nodeId: string;
  layout: NodeLayout | undefined;
  onLayoutChange?: ((nodeId: string, layout: NodeLayout | undefined) => void) | undefined;
  /** Feeds and outlets turn and mirror but keep their size. */
  sizable?: boolean;
}> = ({ nodeId, layout, onLayoutChange, sizable = true }) => {
  const { palette, radius: r, font } = useTheme();
  if (!onLayoutChange) return null;
  const l = resolvedLayout(layout);
  const set = (next: NodeLayout | undefined) => onLayoutChange(nodeId, next);
  const btn: React.CSSProperties = {
    width: 26,
    height: 26,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: r.sm,
    background: 'transparent',
    color: palette.text.primary,
    cursor: 'pointer'
  };
  const B = (label: string, icon: React.ReactNode, run: () => void, disabled = false) => (
    <button
      type="button"
      className="nodrag nopan"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        run();
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = palette.background.surfaceHover)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      style={{ ...btn, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }}
    >
      {icon}
    </button>
  );
  return (
    <NodeToolbar position={Position.Top} offset={6}>
      <div
        className="nodrag nopan"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          padding: 2,
          borderRadius: r.md,
          background: palette.background.surfaceElevated,
          border: `1px solid ${palette.border.default}`,
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          fontFamily: font.sans
        }}
      >
        {B('Rotate left (Shift+R)', <RotateCcw size={14} />, () => set(rotateLayout(layout, -1)))}
        {B('Rotate right (R)', <RotateCw size={14} />, () => set(rotateLayout(layout, 1)))}
        {B('Mirror (F)', <FlipHorizontal2 size={14} />, () => set(flipLayout(layout)))}
        {sizable && (
          <>
            <span style={{ width: 1, height: 16, background: palette.border.subtle, margin: '0 3px' }} />
            {B('Smaller (-)', <Minus size={14} />, () => set(scaleLayout(layout, l.scale / 1.15)), l.scale <= 0.5)}
            <span style={{ minWidth: 38, textAlign: 'center', fontSize: 11, fontFamily: font.mono, color: palette.text.secondary }}>{Math.round(l.scale * 100)}%</span>
            {B('Larger (+)', <Plus size={14} />, () => set(scaleLayout(layout, l.scale * 1.15)), l.scale >= 3)}
            {B('Natural size and orientation', <Maximize2 size={13} />, () => set(undefined), l.scale === 1 && l.rotation === 0 && !l.flipX)}
          </>
        )}
      </div>
    </NodeToolbar>
  );
};
