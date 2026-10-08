import React, { useEffect, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import {
  TERMINAL_ROLE_LABEL,
  placePoint,
  terminalPhase,
  terminalCarries,
  terminalMaterial,
  terminalRole,
  type TerminalRole
} from '@process-forge/protocol';
import { useTheme, type ThemeContextValue } from '../../hooks/useTheme.js';
import type { CanvasNodeData } from '../../types.js';
import { LayoutToolbar } from './LayoutToolbar.js';

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
const H = 52;
const TIP = 18;

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
  const tip = Math.min(TIP, width / 4);
  const notch = role === 'feed' ? 0 : Math.min(14, width / 6);
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

  // Which way the arrow points once turned or mirrored, and where its nozzle ends up.
  const pointing = placePoint(100, 50, 'right', processNode.layout).side;
  const vertical = pointing === 'top' || pointing === 'bottom';
  // As long as its words need, so "Evaporator condensate" is not cut short: 168 to 300 px.
  const heading = `${TERMINAL_ROLE_LABEL[role]} · ${carriesWord}`;
  const W = Math.round(Math.min(300, Math.max(168, 52 + Math.max(material.length * 7.4, heading.length * 6.6))));
  const boxW = vertical ? H : W;
  const boxH = vertical ? W : H;
  const nozzle = role === 'feed' ? placePoint(100, 50, 'right', processNode.layout) : placePoint(0, 50, 'left', processNode.layout);
  const handlePosition = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom }[nozzle.side];
  // Upright and pointing right, the arrow and its words; turned, the whole label turns with it (reading up the page when it points up).
  const contentTransform = pointing === 'bottom' ? 'rotate(90deg)' : pointing === 'top' ? 'rotate(-90deg)' : undefined;
  const mirrored = pointing === 'left';
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, pointing, updateNodeInternals]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${processNode.name}: ${TERMINAL_ROLE_LABEL[role].toLowerCase()} (${carriesWord}). Click to open.`}
      style={{ position: 'relative', width: boxW, height: boxH, fontFamily: font.sans, cursor: 'pointer', userSelect: 'none' }}
    >
      <LayoutToolbar nodeId={id} layout={processNode.layout} onLayoutChange={onLayoutChange} sizable={false} />
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

      {running && (
        <div
          style={{
            position: 'absolute',
            top: boxH + 4,
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
            left: (nozzle.x / 100) * boxW,
            top: (nozzle.y / 100) * boxH,
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
