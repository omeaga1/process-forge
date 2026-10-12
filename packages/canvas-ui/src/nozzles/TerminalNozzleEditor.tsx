import React, { useRef, useState } from 'react';
import {
  TERMINAL_ARROW,
  defaultTerminalNozzle,
  snapTerminalNozzle,
  terminalNozzle,
  terminalRole,
  withTerminalNozzle,
  type ProcessNode,
  type TerminalNozzle,
  type UnitOpDressing
} from '@process-forge/protocol';
import { RotateCcw } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.js';
import { TerminalArrow, terminalArrowWidth, terminalColor } from '../components/nodes/TerminalNode.js';

const SIDE_WORD: Record<TerminalNozzle['side'], string> = { left: 'tail', right: 'tip', top: 'top edge', bottom: 'bottom edge' };

/**
 * Move where a feed's or outlet's pipe connects. The arrow is drawn upright,
 * pointing right, in the canvas's proportions; drag the connection along its
 * outline (the tip, the top or bottom edge, or across the tail) and it lands
 * at the same spot on the canvas, turned however the arrow is turned.
 */
export const TerminalNozzleEditor: React.FC<{ node: ProcessNode; onChange: (dressing: UnitOpDressing) => void }> = ({ node, onChange }) => {
  const { palette, font } = useTheme();
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<TerminalNozzle | null>(null);
  const role = terminalRole(node) ?? 'product';
  const color = terminalColor(role, palette);
  const W = terminalArrowWidth(node);
  const H = TERMINAL_ARROW.height;
  // Shown larger than on the canvas, to be easy to grab.
  const k = Math.min(1.6, 320 / W);
  const current = terminalNozzle(node);
  const shown = drag ?? current;
  const fallback = defaultTerminalNozzle(role);
  const isDefault = current.x === fallback.x && current.y === fallback.y && current.side === fallback.side;

  const at = (clientX: number, clientY: number) => {
    const b = boxRef.current!.getBoundingClientRect();
    return snapTerminalNozzle(role, ((clientX - b.left) / b.width) * 100, ((clientY - b.top) / b.height) * 100, W, H);
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag(at(e.clientX, e.clientY));
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag) setDrag(at(e.clientX, e.clientY));
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.x !== current.x || drag.y !== current.y || drag.side !== current.side) {
      const back = drag.x === fallback.x && drag.y === fallback.y && drag.side === fallback.side;
      onChange(withTerminalNozzle(node, back ? undefined : drag));
    }
    setDrag(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        borderRadius: 10,
        backgroundColor: palette.background.surfaceElevated,
        border: `1px solid ${palette.border.default}`
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: palette.text.primary }}>Nozzle</div>
        <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2, lineHeight: 1.45 }}>
          The pipe connects here. Drag it along the arrow's edge to move it. To make the arrow bigger, drag its corner on the canvas or use + and −.
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '32px 28px',
          borderRadius: 8,
          backgroundColor: palette.background.canvas,
          backgroundImage: `radial-gradient(${palette.border.subtle} 1px, transparent 1px)`,
          backgroundSize: '16px 16px'
        }}
      >
        <div
          ref={boxRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setDrag(null)}
          style={{ position: 'relative', width: W * k, height: H * k, cursor: drag ? 'grabbing' : 'pointer', touchAction: 'none' }}
        >
          <div style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: '0 0' }}>
            <TerminalArrow role={role} color={color} fill={`${color}14`} width={W} height={H} />
          </div>
          <div
            role="slider"
            aria-label={`Nozzle on the ${SIDE_WORD[shown.side]}`}
            aria-valuetext={`${shown.x}%, ${shown.y}%, ${SIDE_WORD[shown.side]}`}
            style={{
              position: 'absolute',
              left: `${shown.x}%`,
              top: `${shown.y}%`,
              transform: 'translate(-50%, -50%)',
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: drag ? color : palette.background.base,
              border: `2px solid ${color}`,
              boxShadow: `0 0 0 4px ${color}40`,
              cursor: drag ? 'grabbing' : 'grab',
              pointerEvents: 'none'
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
        <span style={{ fontFamily: font.mono, color: palette.text.secondary }}>
          {shown.x}%, {shown.y}% · {SIDE_WORD[shown.side]}
        </span>
        <button
          type="button"
          disabled={isDefault}
          onClick={() => onChange(withTerminalNozzle(node, undefined))}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 9px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: isDefault ? 'default' : 'pointer',
            opacity: isDefault ? 0.5 : 1,
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.background.surface,
            color: palette.text.primary
          }}
        >
          <RotateCcw size={11} /> Back to the {role === 'feed' ? 'tip' : 'tail'}
        </button>
      </div>
    </div>
  );
};
