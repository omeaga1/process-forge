import React, { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  TERMINAL_ROLE_LABEL,
  terminalCarries,
  terminalMaterial,
  terminalRole,
  type TerminalRole
} from '@process-forge/protocol';
import { useTheme, type ThemeContextValue } from '../../hooks/useTheme.js';
import type { CanvasNodeData } from '../../types.js';

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

const W = 168;
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
  width = W,
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
export const TerminalNode: React.FC<NodeProps> = ({ data, selected }) => {
  const { palette, font, size, weight } = useTheme();
  const { processNode, unitsProduced, levelGallons, flowGpm } = data as unknown as CanvasNodeData;
  const [hovered, setHovered] = useState(false);
  const role = terminalRole(processNode) ?? 'product';
  const color = terminalColor(role, palette);
  const material = terminalMaterial(processNode);
  const items = terminalCarries(processNode) === 'items';
  const port = role === 'feed' ? processNode.outputs[0] : processNode.inputs[0];
  const total = items ? unitsProduced : levelGallons ?? 0;
  const running = items ? unitsProduced > 0 : (flowGpm ?? 0) > 0 || (levelGallons ?? 0) > 0;
  const streamColor = items ? palette.streams.discreteContainer : palette.streams.continuousFluid;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${processNode.name}: ${TERMINAL_ROLE_LABEL[role].toLowerCase()} (${items ? 'items' : 'liquid'}). Click to open.`}
      style={{ position: 'relative', width: W, height: H, fontFamily: font.sans, cursor: 'pointer', userSelect: 'none' }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        <TerminalArrow role={role} color={color} fill={selected || hovered ? `${color}26` : `${color}14`} selected={Boolean(selected)} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: role === 'feed' ? 12 : 22,
          right: TIP + 6,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minWidth: 0,
          lineHeight: 1.2
        }}
      >
        <div style={{ fontFamily: font.mono, fontSize: size['2xs'], letterSpacing: '0.08em', fontWeight: weight.bold, color, textTransform: 'uppercase' }}>
          {TERMINAL_ROLE_LABEL[role]} · {items ? 'items' : 'liquid'}
        </div>
        <div
          style={{ fontSize: size.sm, fontWeight: weight.semibold, color: palette.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {material}
        </div>
      </div>

      {running && (
        <div
          style={{
            position: 'absolute',
            top: H + 4,
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
          {fmt(total)} {items ? 'items' : 'gal'} {role === 'feed' ? 'in' : 'out'}
          {!items && (flowGpm ?? 0) > 0 ? ` · ${Math.round(flowGpm!)} gpm` : ''}
        </div>
      )}

      {port && (
        <Handle
          type={role === 'feed' ? 'source' : 'target'}
          position={role === 'feed' ? Position.Right : Position.Left}
          id={port.id}
          title={`${role === 'feed' ? 'Outlet' : 'Inlet'}: ${material}`}
          className="pf-nozzle-handle"
          style={{
            left: role === 'feed' ? W : 0,
            top: H / 2,
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
