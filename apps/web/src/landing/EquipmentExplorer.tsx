import React, { useMemo, useState } from 'react';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { EquipmentFigure, TerminalArrow, ThemeScope, terminalColor } from '@process-forge/canvas-ui';
import { STANDARD_EQUIPMENT_CATALOG, createStandardUnitOp, type EquipmentPaletteItem } from '@process-forge/protocol';

/**
 * The equipment that ships with ProcessForge, from the same catalog the
 * studio's palette and the MCP server use. Pick one to see its drawing and
 * how the simulation models it.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };

/** How the engine treats each unit, in a sentence or two (simulation-core). */
const MODEL: Record<string, string> = {
  feed: 'Supplies whatever the units it feeds can take, or up to a supply rate you set, so a short supply shows up as the bottleneck.',
  product: 'Takes everything it is sent. What arrives here is the line’s output.',
  byproduct: 'Takes everything it is sent, totalled on its own: an overhead vapor or a co-product does not count as output.',
  waste: 'Takes everything it is sent, totalled on its own, so rejects and purge are visible without inflating output.',
  pump: 'Passes liquid up to its design flow. A pump too small caps everything downstream of it.',
  'surge-tank': 'Fills and drains second by second. Full, it backs up whatever feeds it; empty, it starves whatever it feeds.',
  'batch-reactor': 'Cycles through filling, reacting and discharging. Its output averages one batch per cycle, however fast it discharges.',
  'heat-exchanger': 'Passes flow up to its shell-side rate. Heat duty is not simulated yet.',
  separator: 'Splits its feed between the vapor overhead and the liquid bottoms, by its vapor ratio.',
  'rotary-filler': 'Turns liquid into containers: each cycle draws one container per nozzle from its bowl, and waits when the product runs out.',
  conveyor: 'Carries and buffers items. When it is full, whatever feeds it blocks.',
  labeler: 'Labels one container at a time at its speed; failed inspections are scrapped.',
  palletizer: 'Waits for a full layer, stacks it, and passes loaded skids on.'
};

/** Names short enough for a chip. */
const SHORT: Record<string, string> = {
  pump: 'Pump',
  'surge-tank': 'Surge tank',
  'batch-reactor': 'Batch reactor',
  'heat-exchanger': 'Heat exchanger',
  separator: 'Separator',
  'rotary-filler': 'Filler',
  conveyor: 'Conveyor',
  labeler: 'Labeler',
  palletizer: 'Palletizer'
};

const GROUPS:{ title: string; test: (i: EquipmentPaletteItem) => boolean }[] = [
  { title: 'Streams in and out', test: (i) => i.category === 'FEEDS_OUTLETS' },
  { title: 'Liquid', test: (i) => i.category === 'FLUID_PROCESSING' || i.category === 'STORAGE_HEAT' },
  { title: 'Packaging', test: (i) => i.category === 'PACKAGING' }
];

const words = (key: string) => {
  const unit = key.match(/(Gpm|Gallons|Seconds|Minutes|PerMinute|Percentage|Percent|Feet|Inches|Horsepower|Kw|Psi)$/)?.[0];
  const base = unit ? key.slice(0, -unit.length) : key;
  const label = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const u = { Gpm: 'gpm', Gallons: 'gal', Seconds: 's', Minutes: 'min', PerMinute: '/min', Percentage: '%', Percent: '%', Feet: 'ft', Inches: 'in', Horsepower: 'hp', Kw: 'kW', Psi: 'psi' }[unit ?? ''] ?? '';
  return { label: label.charAt(0).toUpperCase() + label.slice(1), unit: u };
};

function Glyph({ item, size }: { item: EquipmentPaletteItem; size: number }) {
  if (item.terminalRole) {
    const c = terminalColor(item.terminalRole, D);
    return <TerminalArrow role={item.terminalRole} color={c} fill={`${c}22`} width={size * 1.3} height={size * 0.55} />;
  }
  return <EquipmentFigure kind={item.kind} width={size} isRunning />;
}

export const EquipmentExplorer: React.FC = () => {
  const [id, setId] = useState('batch-reactor');
  const item = STANDARD_EQUIPMENT_CATALOG.find((i) => i.id === id) ?? STANDARD_EQUIPMENT_CATALOG[0]!;
  const settings = useMemo(() => {
    const node = createStandardUnitOp(item, { position: { x: 0, y: 0 } });
    return Object.entries(node.config as Record<string, unknown>)
      .filter(([k, v]) => typeof v === 'number' && !/MeanTime|meanTime|Horsepower|Diameter|Psi|Efficiency/.test(k))
      .slice(0, 4) as [string, number][];
  }, [item]);

  return (
    <ThemeScope mode="dark">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* The list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '0.14em', color: D.text.muted, marginBottom: 8 }}>{g.title.toUpperCase()}</div>
              <div role="listbox" aria-label={g.title} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STANDARD_EQUIPMENT_CATALOG.filter(g.test).map((i) => {
                  const on = i.id === id;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => setId(i.id)}
                      onMouseEnter={() => setId(i.id)}
                      onFocus={() => setId(i.id)}
                      className="pf-chip"
                      style={{
                        fontFamily: fontFamily.sans,
                        fontSize: 13,
                        padding: '7px 12px',
                        borderRadius: 999,
                        cursor: 'pointer',
                        border: `1px solid ${on ? D.jade.glow : D.border.default}`,
                        background: on ? `${D.jade.glow}1a` : D.background.surface,
                        color: on ? D.text.primary : D.text.secondary,
                        transition: 'all .15s'
                      }}
                    >
                      {SHORT[i.id] ?? i.title}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* The one picked */}
        <div
          aria-live="polite"
          style={{
            border: `1px solid ${D.border.default}`,
            borderRadius: 14,
            background: D.background.surface,
            padding: 20,
            display: 'grid',
            gridTemplateColumns: '150px minmax(0, 1fr)',
            gap: 20,
            alignItems: 'center',
            minHeight: 210
          }}
          className="pf-explorer-detail"
        >
          <div
            key={item.id}
            className="pf-pop"
            style={{
              height: 150,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              background: D.background.canvas,
              backgroundImage: `radial-gradient(${D.border.default} 1px, transparent 1px)`,
              backgroundSize: '14px 14px'
            }}
          >
            <Glyph item={item} size={item.terminalRole ? 90 : 110} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 650, color: D.text.primary }}>{item.title}</div>
            <div style={{ fontSize: 12.5, color: D.text.muted, marginTop: 2 }}>{item.subtitle}</div>
            <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.55, color: D.text.secondary }}>{MODEL[item.id] ?? item.description}</p>
            {settings.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {settings.map(([k, v]) => {
                  const w = words(k);
                  return (
                    <span key={k} style={{ ...mono, fontSize: 11, padding: '3px 8px', borderRadius: 6, background: D.background.canvas, border: `1px solid ${D.border.subtle}`, color: D.text.secondary }}>
                      {w.label} <span style={{ color: D.jade.glow }}>{Number(v.toFixed(2))}</span>
                      {w.unit && <span style={{ color: D.text.muted }}> {w.unit}</span>}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </ThemeScope>
  );
};
