import React, { useMemo } from 'react';
import type { ProcessGraph } from '@process-forge/protocol';
import { useTheme } from '@process-forge/canvas-ui';

/**
 * A flowsheet in miniature: units as blocks at their canvas positions, and
 * streams as lines between them. Enough to tell projects apart at a glance.
 */
export const FlowsheetThumbnail: React.FC<{ graph?: ProcessGraph | null; width?: number; height?: number }> = ({
  graph,
  width = 96,
  height = 60
}) => {
  const { palette } = useTheme();
  const layout = useMemo(() => {
    const nodes = graph?.nodes ?? [];
    if (nodes.length === 0) return null;
    // Canvas units are roughly this size; blocks are drawn at their centres.
    const unitW = 160;
    const unitH = 120;
    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX + unitW;
    const spanY = Math.max(...ys) - minY + unitH;
    const pad = 6;
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const offX = (width - spanX * scale) / 2;
    const offY = (height - spanY * scale) / 2;
    const centre = new Map(
      nodes.map((n) => [
        n.id,
        { x: offX + (n.position.x - minX + unitW / 2) * scale, y: offY + (n.position.y - minY + unitH / 2) * scale }
      ])
    );
    const block = Math.max(4, Math.min(14, unitW * scale * 0.55));
    return { centre, block, edges: graph?.edges ?? [] };
  }, [graph, width, height]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{
        flexShrink: 0,
        borderRadius: 4,
        backgroundColor: palette.background.canvas,
        border: `1px solid ${palette.border.subtle}`
      }}
    >
      {layout ? (
        <>
          {layout.edges.map((e) => {
            const a = layout.centre.get(e.sourceNodeId);
            const b = layout.centre.get(e.targetNodeId);
            if (!a || !b) return null;
            return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={palette.jade[400]} strokeWidth={1.2} />;
          })}
          {[...layout.centre.entries()].map(([id, c]) => (
            <rect
              key={id}
              x={c.x - layout.block / 2}
              y={c.y - layout.block / 2}
              width={layout.block}
              height={layout.block}
              rx={1.5}
              fill={palette.background.surface}
              stroke={palette.jade[500]}
              strokeWidth={1.2}
            />
          ))}
        </>
      ) : (
        <text x={width / 2} y={height / 2 + 3} textAnchor="middle" fontSize={9} fill={palette.text.muted}>
          empty
        </text>
      )}
    </svg>
  );
};
