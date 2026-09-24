import React, { useEffect, useMemo, useState } from 'react';
import { Handle, Position, useEdges, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useTheme } from '../../hooks/useTheme.js';
import type { CanvasNodeData } from '../../types.js';
import { EquipmentFigure, flangePoint } from '../../nozzles/EquipmentFigure.js';
import { drawingSize, layoutNozzles, type Side } from '../../nozzles/nozzleLayout.js';

const POSITION: Record<Side, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom
};

/** Room around the drawing for stubs, flanges and handles. */
const PAD = 18;

/**
 * A unit op on the canvas: its equipment drawing, with a stub and flange at
 * each nozzle and the pipe connection (a React Flow handle) on the flange
 * face. Inputs are targets and outputs are sources, so a pipe always runs
 * from an outlet to an inlet. Handle ids are the port ids, as before, so
 * existing pipes stay attached.
 */
export const IndustrialNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { palette, machineVisuals, font, size, weight, radius: r, motion } = useTheme();
  const nodeData = data as unknown as CanvasNodeData;
  const { processNode, state, instantaneousRate, bufferLevel, levelFraction, levelGallons, flowGpm, phase } = nodeData;
  // A pipe-fed filler has a product bowl, but what matters there is containers.
  const isLiquid = levelGallons !== undefined && processNode.kind !== 'ROTARY_FILLER';
  const [hovered, setHovered] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useEdges();

  const visualState = machineVisuals[state] ?? machineVisuals['IDLE']!;
  const isBlocked = state === 'BLOCKED';
  const isRunning = state === 'BUSY';

  const layout = useMemo(() => layoutNozzles(processNode), [processNode]);
  const { width, height } = drawingSize(processNode.kind, processNode.dressing);

  const connected = useMemo(() => {
    const s = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) s.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) s.add(e.targetHandle);
    }
    return s;
  }, [edges, id]);

  // Handles move when nozzles move: React Flow caches handle bounds, so tell
  // it to measure again, or pipes stay attached to the old positions.
  const anchorKey = layout.anchors.map((a) => `${a.port.id}:${a.x}:${a.y}:${a.side}`).join('|');
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, anchorKey, width, height, updateNodeInternals]);

  const streamColor = (dim: string) =>
    dim === 'DISCRETE_CONTAINER' ? palette.streams.discreteContainer : palette.streams.continuousFluid;
  const showLabels = hovered || selected;

  const outline = isBlocked ? palette.status.blocked : selected ? palette.border.glow : 'transparent';
  const figureStubs = [
    ...layout.anchors
      .filter((a) => a.nozzle)
      .map((a) => ({ nozzle: a.nozzle!, color: streamColor(a.port.flowDimension), emphasis: connected.has(a.port.id) })),
    ...layout.decorative.map((z) => ({ nozzle: z, color: palette.text.muted }))
  ];

  const hasBottomNozzle = [...layout.anchors.map((a) => a.side), ...layout.decorative.map((z) => z.position)].includes('bottom');

  const tag = processNode.name.match(/\b[A-Z]{1,3}-\d{2,4}\b/)?.[0];
  const title = tag ? processNode.name.replace(tag, '').trim() : processNode.name;

  return (
    <div
      // A click selects the unit (so Delete and Ctrl+D act on it) and the
      // canvas's onNodeClick opens the studio: no handler here, since
      // stopping the click would stop React Flow selecting it.
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${processNode.name}. Click to open the unit op studio.`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: font.sans,
        color: palette.text.primary,
        cursor: 'pointer',
        userSelect: 'none',
        minWidth: width + PAD * 2
      }}
    >
      <div
        style={{
          position: 'relative',
          padding: PAD,
          borderRadius: r.lg,
          outline: `1.5px ${selected ? 'solid' : 'dashed'} ${outline}`,
          outlineOffset: -4,
          backgroundColor: selected || hovered ? `${palette.background.surface}99` : 'transparent',
          boxShadow: isBlocked ? `0 0 18px ${palette.status.blocked}55` : selected ? `0 0 18px ${palette.border.glow}33` : 'none',
          transition: `background-color ${motion.fast}, box-shadow ${motion.normal}`
        }}
      >
        <EquipmentFigure
          kind={processNode.kind}
          dressing={processNode.dressing}
          isRunning={isRunning}
          stubs={figureStubs}
          {...(levelFraction !== undefined ? { levelFraction } : {})}
        >
          {layout.anchors.map((a) => {
            const at = a.nozzle ? flangePoint(a.x, a.y, a.side, width, height) : { x: (a.x / 100) * width, y: (a.y / 100) * height };
            const color = streamColor(a.port.flowDimension);
            const isConnected = connected.has(a.port.id);
            const discrete = a.port.flowDimension === 'DISCRETE_CONTAINER';
            const label = a.nozzle?.name ?? a.port.name;
            const horizontal = a.side === 'left' || a.side === 'right';
            return (
              <React.Fragment key={a.port.id}>
                <Handle
                  type={a.direction === 'in' ? 'target' : 'source'}
                  position={POSITION[a.side]}
                  id={a.port.id}
                  title={`${a.direction === 'in' ? 'Inlet' : 'Outlet'}: ${label}`}
                  className="pf-nozzle-handle"
                  style={{
                    left: at.x,
                    top: at.y,
                    right: 'auto',
                    bottom: 'auto',
                    transform: 'translate(-50%, -50%)',
                    width: 11,
                    height: 11,
                    borderRadius: discrete ? 2 : '50%',
                    backgroundColor: isConnected ? color : palette.background.base,
                    border: `2px solid ${color}`,
                    boxShadow: showLabels && !isConnected ? `0 0 0 3px ${color}33` : 'none',
                    zIndex: 3
                  }}
                />
                {showLabels && (
                  <div
                    style={{
                      position: 'absolute',
                      left: at.x,
                      top: at.y,
                      transform: horizontal
                        ? `translate(${a.side === 'left' ? 'calc(-100% - 10px)' : '10px'}, -50%)`
                        : `translate(-50%, ${a.side === 'top' ? 'calc(-100% - 9px)' : '9px'})`,
                      fontSize: 9.5,
                      fontFamily: font.mono,
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                      padding: '1px 4px',
                      borderRadius: r.sm,
                      color: palette.text.secondary,
                      backgroundColor: `${palette.background.base}d9`,
                      pointerEvents: 'none',
                      zIndex: 4
                    }}
                  >
                    {a.direction === 'in' ? '▸ ' : ''}
                    {label}
                    {a.direction === 'out' ? ' ▸' : ''}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </EquipmentFigure>
      </div>

      {/* Tag, name and state, under the drawing like a P&ID label. Opaque, so a
          pipe routed behind it (nodes draw above edges) does not strike through
          the text; and below the flange when a nozzle faces down. */}
      <div
        style={{
          marginTop: hasBottomNozzle ? 10 : -6,
          textAlign: 'center',
          maxWidth: Math.max(180, width + PAD * 2),
          lineHeight: 1.25,
          padding: '2px 8px',
          borderRadius: r.md,
          backgroundColor: palette.background.canvas,
          position: 'relative',
          zIndex: 2
        }}
      >
        <div style={{ fontFamily: font.mono, fontSize: size['2xs'], letterSpacing: '0.08em', color: palette.jade[400], fontWeight: weight.bold }}>
          {tag ?? processNode.kind.replace(/_/g, ' ')}
        </div>
        <div style={{ fontSize: size.sm, fontWeight: weight.semibold, color: palette.text.primary }}>{title}</div>
        {(state !== 'IDLE' || instantaneousRate > 0 || isLiquid) && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 4,
              padding: '1px 7px',
              borderRadius: r.full,
              fontSize: size['2xs'],
              fontWeight: weight.semibold,
              backgroundColor: visualState.badgeBg,
              color: visualState.badgeText,
              border: `1px solid ${visualState.badgeText}40`
            }}
          >
            <span>{phase ? phase.charAt(0) + phase.slice(1).toLowerCase() : visualState.label}</span>
            {isLiquid ? (
              <>
                {levelFraction !== undefined && processNode.kind !== 'PUMP' && (
                  <span style={{ fontFamily: font.mono }}>{Math.round(levelFraction * 100)}%</span>
                )}
                {(flowGpm ?? 0) > 0 && <span style={{ fontFamily: font.mono }}>{Math.round(flowGpm!)} gpm</span>}
              </>
            ) : (
              <>
                {instantaneousRate > 0 && <span style={{ fontFamily: font.mono }}>{Math.round(instantaneousRate)}/min</span>}
                {bufferLevel > 0 && <span style={{ fontFamily: font.mono }}>{bufferLevel} queued</span>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
