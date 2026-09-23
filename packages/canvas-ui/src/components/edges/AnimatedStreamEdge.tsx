import React, { useState } from 'react';
import { getSmoothStepPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { useTheme } from '../../hooks/useTheme.js';
import type { CanvasEdgeData } from '../../types.js';

/**
 * A stream between two nozzles, drawn as a pipe: orthogonal runs with rounded
 * elbows, leaving and entering each nozzle along the side it faces. A fluid
 * line is a pipe with a moving bore while material flows; a container stream
 * is a thin line with the containers moving along it. Nothing moves until the
 * simulation reports flow, and a blocked line pulses amber.
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
  const flowing = !isBlocked && (edgeData?.activeFlowRate ?? 0) > 0;
  const stream = edgeData?.processEdge.stream;
  const isFluid = stream?.type === 'CONTINUOUS_FLUID';

  const color = isBlocked
    ? palette.status.blocked
    : isFluid
      ? palette.streams.continuousFluid
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

  const labelText = isFluid ? `${stream.designFlowRateGpm} gpm` : stream ? `${stream.targetPiecesPerMinute} cpm` : '';
  const emphasis = selected || hovered;

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
          <path d={path} fill="none" stroke={color} strokeWidth={emphasis ? 6 : 5} strokeOpacity={0.9} strokeLinejoin="round" />
          <path d={path} fill="none" stroke={palette.background.canvas} strokeWidth={emphasis ? 3 : 2.4} strokeLinejoin="round" />
          {flowing && (
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={1.6}
              strokeDasharray="10 22"
              strokeLinecap="round"
              style={{ animation: 'pf-pipe-flow 0.9s linear infinite' }}
            />
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
            style={{ animation: flowing ? 'pf-pipe-flow 1.1s linear infinite' : 'none' }}
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
              border: `1px solid ${isBlocked ? palette.status.blocked : `${color}66`}`,
              color: isBlocked ? palette.status.blocked : palette.text.secondary,
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 10,
              fontFamily: font.mono
            }}
          >
            {isBlocked ? 'BLOCKED' : labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
