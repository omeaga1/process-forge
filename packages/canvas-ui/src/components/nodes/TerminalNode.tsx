import React, { useEffect, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import {
  TERMINAL_ARROW,
  TERMINAL_ROLE_LABEL,
  placePoint,
  resolvedLayout,
  terminalArrowGeometry,
  terminalNozzle,
  terminalPhase,
  terminalCarries,
  terminalMaterial,
  terminalRole,
  type TerminalRole
} from '@process-forge/protocol';
import { useTheme, type ThemeContextValue } from '../../hooks/useTheme.js';
import type { CanvasNodeData } from '../../types.js';
import type { ProcessNode } from '@process-forge/protocol';
import { LayoutToolbar } from './LayoutToolbar.js';
import { SizeGrip, useSizeGrip } from './SizeGrip.js';

/** Each role's color, from the theme's status colors so both themes read well. */
export function terminalColor(role: TerminalRole, palette: ThemeContextValue['palette']): string {
  switch (role) {
    case 'feed':
      return palette.status.busy;
    case 'product':
      return palette.status.starved;
    case 'byproduct':
      return palette.status.blocked;
    case 'waste':
      return palette.status.failed;
  }
}

const W_MIN = 168;
const H = TERMINAL_ARROW.height;
const TIP = TERMINAL_ARROW.tip;

/** How long a feed's or outlet's arrow is at its natural size: as long as its words need, so "Evaporator condensate" is not cut short (168 to 300 px). */
export function terminalArrowWidth(node: Pick<ProcessNode, 'kind' | 'config' | 'inputs' | 'outputs'>): number {
  const role = terminalRole(node) ?? 'product';
  const items = terminalCarries(node) === 'items';
  const carriesWord = items ? 'items' : (terminalPhase(node) ?? 'liquid').toLowerCase();
  const heading = `${TERMINAL_ROLE_LABEL[role]} · ${carriesWord}`;
  return Math.round(Math.min(300, Math.max(W_MIN, 52 + Math.max(terminalMaterial(node).length * 7.4, heading.length * 6.6))));
}

/**
 * The arrow itself, pointing the way material flows (left to right). A feed
 * has a square tail and its connection at the tip; an outlet has a notched
 * tail where the stream comes in. The same shape a PFD uses for a stream
 * that comes from, or goes to, somewhere off the sheet.
 */
export const TerminalArrow: React.FC<{ role: TerminalRole; color: string; fill: string; width?: number; height?: number; selected?: boolean }> = ({
  role,
  color,
  fill,
  width = W_MIN,
  height = H,
  selected = false
}) => {
  const { tip, notch } = terminalArrowGeometry(role, width);
  const points = `0,0 ${width - tip},0 ${width},${height / 2} ${width - tip},${height} 0,${height} ${notch},${height / 2}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      <polygon
        points={points}
        fill={fill}
        stroke={color}
        strokeWidth={selected ? 2.5 : 1.6}
        strokeLinejoin="round"
        strokeDasharray={role === 'waste' ? '5 3' : undefined}
      />
    </svg>
  );
};

const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: v >= 100 ? 0 : 1 });

/**
 * A feed, product, byproduct or waste arrow on the canvas: where material
 * enters or leaves the flowsheet (protocol/terminals.ts). While a run plays
 * back it shows what has gone through it so far.
 */
export const TerminalNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { palette, font, size, weight } = useTheme();
  const { processNode, unitsProduced, levelGallons, flowGpm, levelKg, kgPerHour, onLayoutChange } = data as unknown as CanvasNodeData;
  const updateNodeInternals = useUpdateNodeInternals();
  const [hovered, setHovered] = useState(false);
  const role = terminalRole(processNode) ?? 'product';
  const color = terminalColor(role, palette);
  const material = terminalMaterial(processNode);
  const items = terminalCarries(processNode) === 'items';
  // A gas or solids arrow is counted in kg, not gallons.
  const phase = items ? undefined : terminalPhase(processNode);
  const byMass = phase === 'GAS' || phase === 'SOLID';
  const carriesWord = items ? 'items' : (phase ?? 'liquid').toLowerCase();
  const port = role === 'feed' ? processNode.outputs[0] : processNode.inputs[0];
  const total = items ? unitsProduced : byMass ? levelKg ?? 0 : levelGallons ?? 0;
  const running = items ? unitsProduced > 0 : (flowGpm ?? 0) > 0 || (levelGallons ?? 0) > 0;
  const streamColor = items
    ? palette.streams.discreteContainer
    : phase === 'GAS'
      ? palette.streams.gas
      : phase === 'SOLID'
        ? palette.streams.solid
        : palette.streams.continuousFluid;

  // Its size: a live scale while the corner grip is dragged, else the flowsheet's.
  const W = terminalArrowWidth(processNode);
  const { layout, onGripDown } = useSizeGrip(id, processNode.layout, ((W + H) / 2) * resolvedLayout(processNode.layout).scale, onLayoutChange);
  const { scale } = resolvedLayout(layout);
  // Which way the arrow points once turned or mirrored, and where its nozzle ends up.
  const pointing = placePoint(100, 50, 'right', layout).side;
  const vertical = pointing === 'top' || pointing === 'bottom';
  // The box at natural size, and on the sheet (sized).
  const boxW = vertical ? H : W;
  const boxH = vertical ? W : H;
  const outW = Math.round(boxW * scale);
  const outH = Math.round(boxH * scale);
  const own = terminalNozzle(processNode);
  const nozzle = placePoint(own.x, own.y, own.side, layout);
  const handlePosition = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom }[nozzle.side];
  // Upright and pointing right, the arrow and its words; turned, the whole label turns with it (reading up the page when it points up).
  const contentTransform = pointing === 'bottom' ? 'rotate(90deg)' : pointing === 'top' ? 'rotate(-90deg)' : undefined;
  const mirrored = pointing === 'left';
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, pointing, outW, outH, nozzle.x, nozzle.y, nozzle.side, updateNodeInternals]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${processNode.name}: ${TERMINAL_ROLE_LABEL[role].toLowerCase()} (${carriesWord}). Click to open.`}
      style={{ position: 'relative', width: outW, height: outH, fontFamily: font.sans, cursor: 'pointer', userSelect: 'none' }}
    >
      <LayoutToolbar nodeId={id} layout={processNode.layout} onLayoutChange={onLayoutChange} />
      {/* Drawn at natural size and grown as a picture, words and all, as a unit's drawing is. */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: boxW, height: boxH, ...(scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: '0 0' } : {}) }}>
      <div
        style={{
          position: 'absolute',
          width: W,
          height: H,
          left: (boxW - W) / 2,
          top: (boxH - H) / 2,
          ...(contentTransform ? { transform: contentTransform, transformOrigin: 'center center' } : {})
        }}
      >
      <div style={{ position: 'absolute', inset: 0, ...(mirrored ? { transform: 'scaleX(-1)' } : {}) }}>
        <TerminalArrow role={role} color={color} fill={selected || hovered ? `${color}26` : `${color}14`} selected={Boolean(selected)} width={W} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: mirrored ? TIP + 6 : role === 'feed' ? 12 : 22,
          right: mirrored ? (role === 'feed' ? 12 : 22) : TIP + 6,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minWidth: 0,
          lineHeight: 1.2
        }}
      >
        <div style={{ fontFamily: font.mono, fontSize: size['2xs'], letterSpacing: '0.08em', fontWeight: weight.bold, color, textTransform: 'uppercase' }}>
          {TERMINAL_ROLE_LABEL[role]} · {carriesWord}
        </div>
        <div
          style={{ fontSize: size.sm, fontWeight: weight.semibold, color: palette.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {material}
        </div>
      </div>
      </div>
      </div>

      {selected && onLayoutChange && <SizeGrip scale={scale} label="Arrow size" inset={-10} onPointerDown={onGripDown} />}

      {running && (
        <div
          style={{
            position: 'absolute',
            top: outH + 4,
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            padding: '1px 7px',
            borderRadius: 999,
            fontFamily: font.mono,
            fontSize: size['2xs'],
            fontWeight: weight.semibold,
            color,
            backgroundColor: palette.background.canvas,
            border: `1px solid ${color}55`
          }}
        >
          {fmt(total)} {items ? 'items' : byMass ? 'kg' : 'gal'} {role === 'feed' ? 'in' : 'out'}
          {byMass ? ((kgPerHour ?? 0) > 0 ? ` · ${fmt(kgPerHour!)} kg/h` : '') : !items && (flowGpm ?? 0) > 0 ? ` · ${fmt(flowGpm!)} gpm` : ''}
        </div>
      )}

      {port && (
        <Handle
          type={role === 'feed' ? 'source' : 'target'}
          position={handlePosition}
          id={port.id}
          title={`${role === 'feed' ? 'Outlet' : 'Inlet'}: ${material}`}
          className="pf-nozzle-handle"
          style={{
            left: (nozzle.x / 100) * outW,
            top: (nozzle.y / 100) * outH,
            right: 'auto',
            bottom: 'auto',
            transform: 'translate(-50%, -50%)',
            width: 11,
            height: 11,
            borderRadius: items ? 2 : '50%',
            backgroundColor: palette.background.base,
            border: `2px solid ${streamColor}`,
            zIndex: 3
          }}
        />
      )}
    </div>
  );
};
