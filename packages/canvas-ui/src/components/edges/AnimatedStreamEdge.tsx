import React from 'react';
import { getBezierPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { OsakaJadePalette } from '@process-forge/theme';
import type { CanvasEdgeData } from '../../types.js';

export const AnimatedStreamEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data
}) => {
  const edgeData = data as unknown as CanvasEdgeData | undefined;
  const isBlocked = edgeData?.isBackpressureBlocked ?? false;
  const stream = edgeData?.processEdge.stream;

  const isFluid = stream?.type === 'CONTINUOUS_FLUID';

  const strokeColor = isBlocked
    ? OsakaJadePalette.status.blocked
    : isFluid
      ? OsakaJadePalette.streams.continuousFluid
      : OsakaJadePalette.streams.discreteContainer;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const labelText = isFluid
    ? `${stream.designFlowRateGpm} gpm`
    : stream
      ? `${stream.targetPiecesPerMinute} cpm`
      : '';

  return (
    <>
      <defs>
        <marker
          id={`arrow-${id}`}
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill={strokeColor} opacity="0.8" />
        </marker>
      </defs>

      {/* Background glow path */}
      <path
        id={`${id}-glow`}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={isBlocked ? 6 : 4}
        strokeOpacity={0.25}
      />

      {/* Main animated wire path */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2.5}
        strokeDasharray={isFluid ? '8 4' : '4 8'}
        markerEnd={`url(#arrow-${id})`}
        style={{
          animation: isBlocked
            ? 'pfPulse 1.5s ease-in-out infinite alternate'
            : isFluid
              ? 'pf-flow 0.9s linear infinite'
              : 'pf-flow 0.6s linear infinite'
        }}
      />

      {/* Midpoint Rate Label */}
      {labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${isBlocked ? OsakaJadePalette.status.blocked : OsakaJadePalette.border.default}`,
              color: isBlocked ? OsakaJadePalette.status.blocked : OsakaJadePalette.text.secondary,
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 10,
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              fontFamily: 'monospace'
            }}
          >
            {isBlocked ? '⚠ BLOCKED' : labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
