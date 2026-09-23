import React, { useMemo, useRef, useState } from 'react';
import type { NozzleDressing, ProcessNode } from '@process-forge/protocol';
import { Plus, Trash2, MousePointer2, X } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.js';
import { EquipmentFigure, flangePoint } from './EquipmentFigure.js';
import {
  addNozzle,
  drawingViewBox,
  layoutNozzles,
  materializeNozzles,
  moveNozzle,
  nearestSide,
  removeNozzle,
  snapPercent,
  updateNozzle,
  type NodeShape,
  type NozzleRole,
  type Side
} from './nozzleLayout.js';

interface NozzlePlacementEditorProps {
  node: ProcessNode;
  onChange: (shape: NodeShape) => void;
  /** Ports with a pipe on them: their nozzles cannot be deleted. */
  connectedPortIds?: ReadonlySet<string>;
}

const ROLES: { role: NozzleRole; label: string }[] = [
  { role: 'inlet', label: 'Inlet' },
  { role: 'outlet', label: 'Outlet' },
  { role: 'vent', label: 'Vent' },
  { role: 'drain', label: 'Drain' },
  { role: 'utility', label: 'Utility' }
];

/**
 * Place nozzles on the equipment drawing. The preview is the same drawing in
 * the same proportions as the canvas node, so a nozzle lands on the canvas
 * exactly where it is dropped here.
 *
 *  - Pick a role, then click the drawing to place it.
 *  - Drag a nozzle to move it; it snaps to whole percent and onto an edge,
 *    and faces its nearest edge (the side can be overridden).
 *  - An inlet or outlet is a pipe connection: it takes a free port of its
 *    direction or creates one, so it can be connected on the canvas at once.
 */
export const NozzlePlacementEditor: React.FC<NozzlePlacementEditorProps> = ({ node, onChange, connectedPortIds }) => {
  const { palette, font, radius: r } = useTheme();
  const boxRef = useRef<HTMLDivElement>(null);
  const [placing, setPlacing] = useState<NozzleRole | { portId: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const layout = useMemo(() => layoutNozzles(node), [node]);
  const nozzles = useMemo(() => materializeNozzles(node), [node]);
  const unplacedPorts = layout.anchors.filter((a) => !a.nozzle);
  const portOf = (z: NozzleDressing) => [...node.inputs, ...node.outputs].find((p) => p.id === z.portId);

  const [vw, vh] = drawingViewBox(node.kind, node.dressing);
  const width = Math.min(340, vw >= vh ? 340 : Math.round((340 * vw) / vh));
  const height = Math.round((width * vh) / vw);
  const scale = width / 150;

  const pointToPercent = (clientX: number, clientY: number) => {
    const b = boxRef.current!.getBoundingClientRect();
    return { x: snapPercent(((clientX - b.left) / b.width) * 100), y: snapPercent(((clientY - b.top) / b.height) * 100) };
  };

  const commit = (shape: NodeShape) => {
    setNotice(null);
    onChange(shape);
  };

  const handleBoxClick = (e: React.MouseEvent) => {
    if (!placing || !boxRef.current) return;
    const { x, y } = pointToPercent(e.clientX, e.clientY);
    if (typeof placing === 'string') {
      const res = addNozzle(node, placing, x, y);
      commit(res);
      setSelectedId(res.nozzle.id);
    } else {
      // Give a port that sat on the edge a nozzle of its own.
      const port = [...node.inputs, ...node.outputs].find((p) => p.id === placing.portId);
      if (port) {
        const role: NozzleRole = node.inputs.some((p) => p.id === port.id) ? 'inlet' : 'outlet';
        const res = addNozzle(node, role, x, y);
        const nozzlesWithPort = res.dressing.nozzles.map((z) => (z.id === res.nozzle.id ? { ...z, portId: port.id, name: port.name } : z));
        commit({ dressing: { ...res.dressing, nozzles: nozzlesWithPort }, inputs: node.inputs, outputs: node.outputs });
        setSelectedId(res.nozzle.id);
      }
    }
    setPlacing(null);
  };

  const startDrag = (e: React.PointerEvent, z: NozzleDressing) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(z.id);
    setDrag({ id: z.id, x: z.x, y: z.y });
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!drag || !boxRef.current) return;
    const p = pointToPercent(e.clientX, e.clientY);
    setDrag({ ...drag, ...p });
  };
  const endDrag = () => {
    if (!drag) return;
    const z = nozzles.find((n) => n.id === drag.id);
    if (z && (z.x !== drag.x || z.y !== drag.y)) commit(moveNozzle(node, drag.id, drag.x, drag.y));
    setDrag(null);
  };

  const shown = nozzles.map((z) => (drag && z.id === drag.id ? { ...z, x: drag.x, y: drag.y, position: nearestSide(drag.x, drag.y) } : z));
  const selected = shown.find((z) => z.id === selectedId) ?? null;
  const colorFor = (z: NozzleDressing) => {
    const port = portOf(z);
    if (!port) return palette.text.muted;
    return port.flowDimension === 'DISCRETE_CONTAINER' ? palette.streams.discreteContainer : palette.streams.continuousFluid;
  };

  const chip = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 9px',
    borderRadius: r.md,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    border: `1px solid ${active ? palette.jade[400] : palette.border.subtle}`,
    backgroundColor: active ? palette.jade.muted : palette.background.surfaceElevated,
    color: active ? palette.jade[200] : palette.text.primary
  });
  const field: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    borderRadius: 4,
    backgroundColor: palette.background.surface,
    border: `1px solid ${palette.border.subtle}`,
    color: palette.text.primary,
    fontSize: 13,
    boxSizing: 'border-box'
  };
  const label: React.CSSProperties = { display: 'block', fontSize: 12, color: palette.text.muted, marginBottom: 3 };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        borderRadius: 10,
        backgroundColor: palette.background.surfaceElevated,
        border: `1px solid ${palette.border.default}`
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: palette.text.primary }}>Nozzles</div>
        <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2, lineHeight: 1.45 }}>
          Pipes connect at inlets and outlets, exactly where they sit on this drawing. Drag a nozzle to move it.
        </div>
      </div>

      {/* Place a new nozzle */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {ROLES.map(({ role, label: l }) => (
          <button key={role} type="button" onClick={() => setPlacing(placing === role ? null : role)} style={chip(placing === role)}>
            <Plus size={11} /> {l}
          </button>
        ))}
        {placing && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: palette.jade[300] }}>
            <MousePointer2 size={12} /> Click the drawing to place it
            <button
              type="button"
              aria-label="Cancel placing"
              onClick={() => setPlacing(null)}
              style={{ background: 'none', border: 'none', color: palette.text.muted, cursor: 'pointer', padding: 2, display: 'flex' }}
            >
              <X size={12} />
            </button>
          </span>
        )}
      </div>

      {/* The drawing, in canvas proportions, with nozzles to drag */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 28,
          borderRadius: 8,
          backgroundColor: palette.background.canvas,
          backgroundImage: `radial-gradient(${palette.border.subtle} 1px, transparent 1px)`,
          backgroundSize: '16px 16px'
        }}
      >
        <div
          ref={boxRef}
          onClick={handleBoxClick}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          style={{
            position: 'relative',
            cursor: placing ? 'crosshair' : 'default',
            outline: placing || drag ? `1px dashed ${palette.jade[600]}` : 'none',
            outlineOffset: 2
          }}
        >
          <EquipmentFigure
            kind={node.kind}
            dressing={node.dressing}
            width={width}
            stubScale={scale}
            stubs={shown.map((z) => ({ nozzle: z, color: colorFor(z), emphasis: z.id === selectedId }))}
          >
            {/* Edge guides while dragging onto an edge */}
            {drag && (drag.x === 0 || drag.x === 100) && (
              <div style={{ position: 'absolute', top: -12, bottom: -12, left: `${drag.x}%`, borderLeft: `1px dashed ${palette.jade[400]}` }} />
            )}
            {drag && (drag.y === 0 || drag.y === 100) && (
              <div style={{ position: 'absolute', left: -12, right: -12, top: `${drag.y}%`, borderTop: `1px dashed ${palette.jade[400]}` }} />
            )}
            {shown.map((z) => {
              const end = flangePoint(z.x, z.y, z.position, width, height, 11 * scale);
              const isSel = z.id === selectedId;
              const c = colorFor(z);
              return (
                <div
                  key={z.id}
                  role="button"
                  aria-label={`${z.name}, ${z.role}, ${z.x}% ${z.y}%`}
                  onPointerDown={(e) => startDrag(e, z)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    left: end.x,
                    top: end.y,
                    transform: 'translate(-50%, -50%)',
                    width: 16,
                    height: 16,
                    borderRadius: portOf(z)?.flowDimension === 'DISCRETE_CONTAINER' ? 3 : '50%',
                    backgroundColor: isSel ? c : palette.background.base,
                    border: `2px solid ${c}`,
                    boxShadow: isSel ? `0 0 0 4px ${c}40` : 'none',
                    cursor: drag?.id === z.id ? 'grabbing' : 'grab',
                    touchAction: 'none',
                    zIndex: 5
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: -18,
                      transform: 'translateX(-50%)',
                      fontSize: 10,
                      fontFamily: font.mono,
                      whiteSpace: 'nowrap',
                      color: isSel ? palette.text.primary : palette.text.secondary,
                      pointerEvents: 'none'
                    }}
                  >
                    {z.id}
                  </span>
                </div>
              );
            })}
            {drag && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: -22,
                  fontSize: 11,
                  fontFamily: font.mono,
                  color: palette.jade[300]
                }}
              >
                {drag.x}%, {drag.y}% · {nearestSide(drag.x, drag.y)}
              </div>
            )}
          </EquipmentFigure>
        </div>
      </div>

      {notice && (
        <div role="alert" style={{ fontSize: 12, color: palette.status.blocked }}>
          {notice}
        </div>
      )}

      {/* Ports still on the drawing's edge, without a nozzle */}
      {unplacedPorts.length > 0 && (
        <div style={{ fontSize: 12, color: palette.text.secondary, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span>On the edge, not yet placed:</span>
          {unplacedPorts.map((a) => (
            <button
              key={a.port.id}
              type="button"
              onClick={() => setPlacing({ portId: a.port.id })}
              style={chip(typeof placing === 'object' && placing?.portId === a.port.id)}
            >
              {a.direction === 'in' ? 'Inlet' : 'Outlet'}: {a.port.name}
            </button>
          ))}
        </div>
      )}

      {/* The list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {shown.map((z) => {
          const port = portOf(z);
          const isSel = z.id === selectedId;
          return (
            <div
              key={z.id}
              onClick={() => setSelectedId(z.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '14px 34px 1fr auto auto',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                backgroundColor: isSel ? palette.background.surfaceActive : 'transparent',
                border: `1px solid ${isSel ? palette.jade[600] : 'transparent'}`
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: colorFor(z) }} />
              <span style={{ fontFamily: font.mono, fontWeight: 700 }}>{z.id}</span>
              <span style={{ color: palette.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {z.name}
                <span style={{ color: palette.text.muted }}>
                  {' '}
                  · {port ? (node.inputs.includes(port) ? 'pipe in' : 'pipe out') : z.role}
                </span>
              </span>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: palette.text.muted }}>
                {z.x},{z.y} {z.position}
              </span>
              <button
                type="button"
                aria-label={`Delete ${z.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const res = removeNozzle(node, z.id, connectedPortIds ?? new Set());
                  if ('blocked' in res) setNotice(res.blocked);
                  else {
                    commit(res);
                    if (selectedId === z.id) setSelectedId(null);
                  }
                }}
                style={{ background: 'none', border: 'none', color: palette.text.muted, cursor: 'pointer', padding: 2, display: 'flex' }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {/* The selected nozzle's details */}
      {selected && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
            padding: 12,
            borderRadius: 6,
            backgroundColor: palette.background.surface,
            border: `1px solid ${palette.border.subtle}`
          }}
        >
          <div>
            <label style={label}>Name</label>
            <input style={field} value={selected.name} onChange={(e) => commit(updateNozzle(node, selected.id, { name: e.target.value }))} />
          </div>
          <div>
            <label style={label}>Faces</label>
            <select
              style={field}
              value={selected.position}
              onChange={(e) => commit(updateNozzle(node, selected.id, { position: e.target.value as Side }))}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="top">Up</option>
              <option value="bottom">Down</option>
            </select>
          </div>
          <div>
            <label style={label}>Size</label>
            <select
              style={field}
              value={selected.sizeInches}
              onChange={(e) => commit(updateNozzle(node, selected.id, { sizeInches: parseFloat(e.target.value) }))}
            >
              {[1, 1.5, 2, 3, 4, 6, 8].map((s) => (
                <option key={s} value={s}>
                  {s}&quot;
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Flange class</label>
            <select
              style={field}
              value={selected.ratingPsi}
              onChange={(e) => commit(updateNozzle(node, selected.id, { ratingPsi: parseInt(e.target.value, 10) }))}
            >
              <option value={150}>150#</option>
              <option value={300}>300#</option>
              <option value={600}>600#</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
