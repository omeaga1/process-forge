import React, { useState } from 'react';
import { getSmoothStepPath, EdgeLabelRenderer, Position, type ConnectionLineComponentProps, type EdgeProps } from '@xyflow/react';
import { useTheme } from '../../hooks/useTheme.js';
import type { CanvasEdgeData } from '../../types.js';
import { flowPeriodSeconds, liveLabel, pipeColor } from './streamLook.js';

/**
 * A stream between two nozzles, drawn as a pipe: orthogonal runs with rounded
 * elbows, leaving and entering each nozzle along the side it faces.
 *
 * Everything that moves or changes colour is reporting the run:
 *  - a liquid pipe shades toward blue as what it carries gets colder and
 *    toward ember as it gets hotter (streamLook.ts);
 *  - its bore moves while liquid flows, faster the more flows, and a bead of
 *    light travels it so the direction reads at a glance;
 *  - an item stream carries its containers along it at the rate they move;
 *  - a blocked line pulses amber.
 * Nothing moves until the simulation reports flow.
 */
export const AnimatedStreamEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected
}) => {
  const { palette, font } = useTheme();
  const [hovered, setHovered] = useState(false);
  const edgeData = data as unknown as CanvasEdgeData | undefined;
  const isBlocked = edgeData?.isBackpressureBlocked ?? false;
  const rate = edgeData?.activeFlowRate ?? 0;
  const flowing = !isBlocked && rate > 0;
  const stream = edgeData?.processEdge.stream;
  const isFluid = stream?.type === 'CONTINUOUS_FLUID';
  const temperatureC = flowing && isFluid ? edgeData?.temperatureC : undefined;

  const color = isBlocked
    ? palette.status.blocked
    : isFluid
      ? pipeColor(palette.streams.continuousFluid, palette.streams.cold, palette.streams.hot, temperatureC)
      : palette.streams.discreteContainer;

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
    // Straight out of the nozzle before the first elbow, like a real pipe.
    offset: 18
  });

  // The design figure when idle, the engine's live figure while it runs.
  const designLabel = isFluid ? `${stream.designFlowRateGpm} gpm` : stream ? `${stream.targetPiecesPerMinute} cpm` : '';
  const labelText = isBlocked ? 'BLOCKED' : flowing ? liveLabel(isFluid, rate, temperatureC) : designLabel;
  const emphasis = selected || hovered;
  const period = flowPeriodSeconds(rate, isFluid ? 120 : 90);

  return (
    <>
      <defs>
        <marker id={`arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill={color} />
        </marker>
      </defs>

      {/* Wide invisible hit area: hover and click the pipe, not a 2px line. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ pointerEvents: 'stroke' }}
      />

      {isFluid ? (
        <>
          {/* Pipe wall, then the bore. */}
          <path d={path} fill="none" stroke={color} strokeWidth={emphasis ? 6 : 5} strokeOpacity={0.9} strokeLinejoin="round" style={{ transition: 'stroke 600ms linear' }} />
          <path d={path} fill="none" stroke={palette.background.canvas} strokeWidth={emphasis ? 3 : 2.4} strokeLinejoin="round" />
          {flowing && (
            <>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={1.6}
                strokeDasharray="10 22"
                strokeLinecap="round"
                style={{ animation: `pf-pipe-flow ${period}s linear infinite`, transition: 'stroke 600ms linear' }}
              />
              {/* A bead travelling the bore: which way, and how fast. */}
              <circle r={2.6} fill={color} className="pf-flow-bead" style={{ filter: `drop-shadow(0 0 3px ${color})` }}>
                <animateMotion dur={`${Math.max(1.2, period * 4)}s`} repeatCount="indefinite" path={path} />
              </circle>
            </>
          )}
          <path d={path} fill="none" stroke="none" strokeWidth={2.2} markerEnd={`url(#arrow-${id})`} />
        </>
      ) : (
        <>
          <path d={path} fill="none" stroke={color} strokeWidth={emphasis ? 2 : 1.5} strokeOpacity={0.85} markerEnd={`url(#arrow-${id})`} />
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeDasharray="6 10"
            strokeOpacity={flowing ? 0.95 : 0.45}
            style={{ animation: flowing ? `pf-pipe-flow ${period}s linear infinite` : 'none' }}
          />
        </>
      )}

      {isBlocked && (
        <path d={path} fill="none" stroke={color} strokeWidth={9} strokeOpacity={0.25} style={{ animation: 'pf-fade 1.5s ease-in-out infinite' }} />
      )}

      {labelText && (emphasis || flowing || isBlocked) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              backgroundColor: palette.background.surfaceElevated,
              border: `1px solid ${isBlocked ? palette.status.blocked : `${color}88`}`,
              color: isBlocked ? palette.status.blocked : palette.text.secondary,
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 2,
              fontFamily: font.mono,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {flowing && isFluid && temperatureC !== undefined && (
              <span aria-hidden style={{ display: 'inline-block', width: 6, height: 6, marginRight: 5, backgroundColor: color, verticalAlign: 'middle' }} />
            )}
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

/**
 * The pipe being drawn while the engineer drags from a nozzle: a pipe of the
 * same idiom, with its bore running toward the cursor and the free end lit,
 * so it is clear a connection is in progress and where it will land.
 */
export const PipeConnectionLine: React.FC<ConnectionLineComponentProps> = ({ fromX, fromY, toX, toY, fromPosition, toPosition, connectionStatus }) => {
  const { palette } = useTheme();
  const [path] = getSmoothStepPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition ?? Position.Right,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition ?? Position.Left,
    borderRadius: 10,
    offset: 18
  });
  const color = connectionStatus === 'invalid' ? palette.status.failed : palette.jade[300] ?? palette.streams.continuousFluid;
  return (
    <g>
      <path d={path} fill="none" stroke={color} strokeWidth={4} strokeOpacity={0.35} strokeLinejoin="round" />
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="8 10" strokeLinecap="round" style={{ animation: 'pf-pipe-flow 0.6s linear infinite' }} />
      <circle cx={toX} cy={toY} r={4} fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      <circle cx={toX} cy={toY} r={9} fill="none" stroke={color} strokeOpacity={0.5} style={{ animation: 'pf-fade 1s ease-in-out infinite' }} />
    </g>
  );
};
