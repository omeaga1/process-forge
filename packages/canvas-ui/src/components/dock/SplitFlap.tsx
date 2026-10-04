import React from 'react';
import { useTheme } from '../../hooks/useTheme.js';

/**
 * A split-flap readout, like a departure board: one square cell per
 * character, and a cell flips when its character changes. The flip is the
 * only motion, and it only happens when the figure does (the drafting rule:
 * motion reports a state change).
 */

const FLAP_CSS = `
  @keyframes pf-flap-in { 0% { transform: rotateX(-88deg); opacity: .35 } 70% { transform: rotateX(8deg); opacity: 1 } 100% { transform: rotateX(0) } }
  .pf-flap-char { display: inline-block; transform-origin: 50% 50%; animation: pf-flap-in 180ms cubic-bezier(.3,.7,.4,1); backface-visibility: hidden; }
  @media (prefers-reduced-motion: reduce) { .pf-flap-char { animation: none; } }
`;

function useFlapCss() {
  React.useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('pf-flap-css')) return;
    const s = document.createElement('style');
    s.id = 'pf-flap-css';
    s.textContent = FLAP_CSS;
    document.head.appendChild(s);
  }, []);
}

/** Pads a value to `width` cells (right-aligned for numbers, left for words), and clips it. */
export function flapCells(value: string, width: number, align: 'left' | 'right' = 'right'): string[] {
  const v = value.length > width ? value.slice(0, width) : value;
  const pad = ' '.repeat(Math.max(0, width - v.length));
  return (align === 'right' ? pad + v : v + pad).split('');
}

export interface SplitFlapProps {
  value: string;
  /** Cells shown; the value is padded or clipped to it. */
  width: number;
  align?: 'left' | 'right';
  color?: string;
  /** Cell height in px. */
  size?: number;
  label?: string;
}

export const SplitFlap: React.FC<SplitFlapProps> = ({ value, width, align = 'right', color, size = 22, label }) => {
  useFlapCss();
  const { palette, font } = useTheme();
  const cells = flapCells(value, width, align);
  const ink = color ?? palette.text.primary;
  return (
    <span role="img" aria-label={label ? `${label}: ${value}` : value} style={{ display: 'inline-flex', gap: 2, perspective: 200 }}>
      {cells.map((ch, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            position: 'relative',
            width: Math.round(size * 0.68),
            height: size,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.background.base,
            border: `1px solid ${palette.border.default}`,
            color: ink,
            fontFamily: font.mono,
            fontSize: Math.round(size * 0.62),
            fontWeight: 700,
            lineHeight: 1,
            overflow: 'hidden'
          }}
        >
          {/* Keyed by the character, so a change remounts it and the flip plays. */}
          <span key={`${i}-${ch}`} className="pf-flap-char">
            {ch === ' ' ? ' ' : ch}
          </span>
          {/* The hinge between the two halves of the flap. */}
          <span style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: palette.background.canvas, opacity: 0.9 }} />
        </span>
      ))}
    </span>
  );
};
