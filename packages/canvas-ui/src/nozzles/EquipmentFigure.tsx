import React from 'react';
import type { NodeKind, NozzleDressing, UnitOpDressing } from '@process-forge/protocol';
import { UnitAnim } from '../components/animations/EquipmentAnimations.js';
import { drawingSize, drawingViewBox, type Side } from './nozzleLayout.js';

/** Length of a nozzle's stub, from the vessel wall to the flange, in px at canvas scale. */
export const STUB_PX = 11;

const DIR: Record<Side, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  top: [0, -1],
  bottom: [0, 1]
};

/** Where a nozzle's flange face is, in px of a box `width` x `height`. */
export function flangePoint(x: number, y: number, side: Side, width: number, height: number, stub = STUB_PX) {
  const [dx, dy] = DIR[side];
  return { x: (x / 100) * width + dx * stub, y: (y / 100) * height + dy * stub };
}

interface EquipmentFigureProps {
  kind: NodeKind | string;
  dressing?: UnitOpDressing;
  isRunning?: boolean;
  /** A tank's level or a reactor's contents, 0..1, from the simulation. */
  levelFraction?: number;
  /** Overrides the canvas width; the height always follows the drawing's proportions. */
  width?: number;
  /** Nozzles to draw as stubs with flanges. */
  stubs?: { nozzle: NozzleDressing; color: string; emphasis?: boolean }[];
  stubScale?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * An equipment drawing in a box of exactly its viewBox's proportions, so
 * percentages mean the same thing wherever it is shown (the canvas node and
 * the nozzle editor). Children are laid over it in that box.
 */
export const EquipmentFigure: React.FC<EquipmentFigureProps> = ({
  kind,
  dressing,
  isRunning = false,
  levelFraction,
  width,
  stubs = [],
  stubScale = 1,
  children,
  style
}) => {
  const natural = drawingSize(kind, dressing);
  const [vw, vh] = drawingViewBox(kind, dressing);
  const w = width ?? natural.width;
  const h = Math.round((w * vh) / vw);
  const stub = STUB_PX * stubScale;
  return (
    <div style={{ position: 'relative', width: w, height: h, flex: '0 0 auto', ...style }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <UnitAnim
          kind={kind}
          dressing={dressing}
          isRunning={isRunning}
          colorAccent={dressing?.colorAccent}
          {...(levelFraction !== undefined ? { levelFraction } : {})}
        />
      </div>
      {stubs.length > 0 && (
        <svg
          width={w}
          height={h}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          aria-hidden="true"
        >
          {stubs.map(({ nozzle, color, emphasis }) => {
            const x0 = (nozzle.x / 100) * w;
            const y0 = (nozzle.y / 100) * h;
            const end = flangePoint(nozzle.x, nozzle.y, nozzle.position, w, h, stub);
            const horizontal = nozzle.position === 'left' || nozzle.position === 'right';
            const f = 4.5 * stubScale;
            return (
              <g key={nozzle.id} stroke={color} strokeLinecap="round">
                <line x1={x0} y1={y0} x2={end.x} y2={end.y} strokeWidth={(emphasis ? 3 : 2.4) * stubScale} />
                <line
                  x1={horizontal ? end.x : end.x - f}
                  y1={horizontal ? end.y - f : end.y}
                  x2={horizontal ? end.x : end.x + f}
                  y2={horizontal ? end.y + f : end.y}
                  strokeWidth={2 * stubScale}
                />
              </g>
            );
          })}
        </svg>
      )}
      {children}
    </div>
  );
};
