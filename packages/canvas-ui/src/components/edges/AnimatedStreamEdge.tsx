import React, { useMemo, useState } from 'react';
import { getSmoothStepPath, EdgeLabelRenderer, Position, useReactFlow, useStore, type ConnectionLineComponentProps, type EdgeProps, type ReactFlowState } from '@xyflow/react';
import { moveRun, roundedPath, routePipe, routeThrough, type Point, type Rect } from '@process-forge/protocol';
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
 *
 * The route keeps clear of the equipment: with no bends of its own a pipe
 * finds the shortest square route round every unit on the sheet, and
 * re-finds it as units move. Select a pipe and drag any of its runs sideways
 * to route it by hand; from then on it keeps the bends it was given
 * (ProcessEdge.waypoints) until it is set back to route itself.
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

  const phase = edgeData?.phase;
  const color = isBlocked
    ? palette.status.blocked
    : phase === 'GAS'
      ? palette.streams.gas
      : phase === 'SOLID'
        ? palette.streams.solid
        : isFluid
          ? pipeColor(palette.streams.continuousFluid, palette.streams.cold, palette.streams.hot, temperatureC)
          : palette.streams.discreteContainer;

  // Every unit on the sheet, as the boxes the pipe keeps clear of. A string, so
  // panning (which moves nothing on the sheet) does not re-route every pipe.
  const obstacleKey = useStore(obstaclesOf);
  const obstacles = useMemo(() => parseObstacles(obstacleKey), [obstacleKey]);
  const waypoints = edgeData?.processEdge.waypoints;
  const from = { x: sourceX, y: sourceY, side: sourcePosition };
  const to = { x: targetX, y: targetY, side: targetPosition };
  const route = useMemo(
    () => (waypoints?.length ? routeThrough(from, to, waypoints, obstacles) : routePipe(from, to, obstacles)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, waypoints, obstacles]
  );
  // A run being dragged: the route as it will be when let go.
  const [dragging, setDragging] = useState<Point[] | null>(null);
  const shown = dragging ?? route;
  const rounded = roundedPath(shown, 10);
  const path = rounded.d;
  const labelX = rounded.mid.x;
  const labelY = rounded.mid.y;
  const { screenToFlowPosition } = useReactFlow();
  const onRouteChange = edgeData?.onRouteChange;

  // Drag run i sideways: the bends it gives are stored on the stream.
  const startRunDrag = (i: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (!onRouteChange) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const base = route;
    const a = base[i]!;
    const vertical = Math.abs(a.x - base[i + 1]!.x) < 0.5;
    const start = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    let bends: Point[] | null = null;
    const move = (ev: PointerEvent) => {
      const now = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      // Snap to the 10 px grid the canvas draws.
      const raw = vertical ? now.x - start.x : now.y - start.y;
      const target = Math.round(((vertical ? a.x : a.y) + raw) / 10) * 10;
      const delta = target - (vertical ? a.x : a.y);
      bends = moveRun(base, i, delta);
      setDragging(routeThrough(from, to, bends, obstacles));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setDragging(null);
      if (bends) onRouteChange(id, bends);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // The design figure when idle, the engine's live figure while it runs.
  // A gas or solids pipe is not sized in gal/min: name what it carries instead.
  const designLabel =
    phase === 'GAS' ? 'gas' : phase === 'SOLID' ? 'solids' : isFluid ? `${stream.designFlowRateGpm} gpm` : stream ? `${stream.targetPiecesPerMinute} cpm` : '';
  const labelText = isBlocked ? 'BLOCKED' : flowing ? (edgeData?.liveText ?? liveLabel(isFluid, rate, temperatureC)) : designLabel;
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

      {selected && onRouteChange && (
        <EdgeLabelRenderer>
          {shown.slice(1, -2).map((p, j) => {
            // Runs between the two leads can be dragged; the leads stay square off their nozzles.
            const i = j + 1;
            const q = shown[i + 1]!;
            const len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
            if (len < 16) return null;
            const vertical = Math.abs(p.x - q.x) < 0.5;
            return (
              <div
                key={i}
                className="nodrag nopan"
                role="slider"
                aria-label={`Move this ${vertical ? 'vertical' : 'horizontal'} run of the pipe`}
                aria-valuenow={Math.round(vertical ? p.x : p.y)}
                title="Drag to move this run of the pipe"
                onPointerDown={(e) => startRunDrag(i, e)}
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${(p.x + q.x) / 2}px, ${(p.y + q.y) / 2}px)`,
                  width: vertical ? 8 : 22,
                  height: vertical ? 22 : 8,
                  borderRadius: 4,
                  background: palette.background.surfaceElevated,
                  border: `1.5px solid ${color}`,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                  cursor: vertical ? 'ew-resize' : 'ns-resize',
                  pointerEvents: 'all',
                  zIndex: 10
                }}
              />
            );
          })}
        </EdgeLabelRenderer>
      )}

      {labelText && (emphasis || flowing || isBlocked) && !dragging && (
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

/** Each unit's box on the sheet, as a string key: "x,y,w,h;..." */
function obstaclesOf(st: ReactFlowState): string {
  const out: string[] = [];
  for (const n of st.nodeLookup.values()) {
    const w = n.measured?.width;
    const h = n.measured?.height;
    if (!w || !h) continue;
    const p = n.internals.positionAbsolute;
    out.push(`${Math.round(p.x)},${Math.round(p.y)},${Math.round(w)},${Math.round(h)}`);
  }
  return out.join(';');
}

function parseObstacles(key: string): Rect[] {
  if (!key) return [];
  return key.split(';').map((r) => {
    const [x, y, width, height] = r.split(',').map(Number) as [number, number, number, number];
    return { x, y, width, height };
  });
}

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
