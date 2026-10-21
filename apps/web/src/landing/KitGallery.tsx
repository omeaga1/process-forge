import React, { useMemo } from 'react';
import { fontFamily } from '@process-forge/theme';
import { SITE as D } from './palette.js';
import { drawUnitOp, drawingToStandaloneSvg, type DrawUnitOpRequest } from '@process-forge/protocol';

/**
 * Units drawn by the engine's own drawing kits (draw_unit_op), in the page.
 * These are the drawings a designed unit gets on the canvas, not pictures of
 * them: shaped by the settings given here, nozzles on their ports.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };

type Port = NonNullable<DrawUnitOpRequest['ports']>[number];
const liquid = (id: string, direction: Port['direction']): Port => ({ id, name: id, direction, flowDimension: 'CONTINUOUS_FLUID' });
const items = (id: string, direction: Port['direction']): Port => ({ id, name: id, direction, flowDimension: 'DISCRETE_CONTAINER' });
const line = [items('in', 'INLET'), items('out', 'OUTLET')];

const UNITS: { title: string; note: string; req: DrawUnitOpRequest }[] = [
  { title: 'Carbonator', note: 'Spray head, CO₂ sparger, live level', req: { kit: 'carbonator', name: 'Carbonator', ports: [liquid('water', 'INLET'), liquid('co2', 'INLET'), liquid('out', 'OUTLET')] } },
  { title: 'Rotary filler', note: 'A head per valve on the turret', req: { kit: 'rotary-machine', name: 'Rotary filler', ports: [liquid('product', 'INLET'), ...line] } },
  { title: 'Capper', note: 'Cap chute and star wheels', req: { kit: 'rotary-machine', name: 'Rotary capper', ports: line, settings: { capper: true } } },
  { title: 'Labeler', note: 'Label reels, vacuum drum, photo-eye', req: { kit: 'labeler', name: 'Labeler', ports: line } },
  { title: 'Accumulation conveyor', note: 'Lanes, guides, accumulation zone', req: { kit: 'conveyor', name: 'Accumulation conveyor', ports: line, settings: { accumulates: true } } },
  { title: 'Case packer', note: 'Collation grid of rows × columns', req: { kit: 'case-packer', name: 'Case packer', ports: line } },
  { title: 'Palletizer', note: 'Gantry, layer head, pallet stack', req: { kit: 'palletizer', name: 'Palletizer', ports: line } },
  { title: 'Blend tank', note: 'Agitator, jacket, sight glass', req: { kit: 'tank', name: 'Blend tank', ports: [liquid('in', 'INLET'), liquid('out', 'OUTLET')], settings: { agitated: true, jacketed: true } } }
];

export const KitGallery: React.FC = () => {
  // Drawn once: each is a few kilobytes of SVG the engine writes from the settings above.
  const drawn = useMemo(() => UNITS.map((u) => ({ ...u, svg: drawingToStandaloneSvg(drawUnitOp(u.req).drawing, { pixelWidth: 240, background: false }) })), []);
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))', gap: 12 }}>
      {drawn.map((u) => (
        <li key={u.title} className="pf-feature pf-kit" style={{ border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.surface, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div
            role="img"
            aria-label={`${u.title}, drawn by the engine`}
            className="pf-kit-art"
            style={{ height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, background: D.background.canvas }}
            dangerouslySetInnerHTML={{ __html: u.svg }}
          />
          <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${D.border.subtle}` }}>
            <div style={{ fontSize: 14, fontWeight: 650, color: D.text.primary }}>{u.title}</div>
            <div style={{ ...mono, fontSize: 11, color: D.text.muted, marginTop: 3 }}>{u.note}</div>
          </div>
        </li>
      ))}
    </ul>
  );
};
