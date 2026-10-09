import React, { useMemo, useState } from 'react';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { EquipmentFigure, TerminalArrow, ThemeScope, terminalColor } from '@process-forge/canvas-ui';
import { EQUIPMENT_CATEGORIES, STANDARD_EQUIPMENT_CATALOG, createStandardUnitOp, drawingToDressing, type EquipmentPaletteItem } from '@process-forge/protocol';

/**
 * The equipment that ships with ProcessForge, from the same catalog the
 * studio's palette and the MCP server use. Pick one to see its drawing and
 * how the simulation models it.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };

/** The catalog's categories, in order; each entry says how the engine simulates it. */
const GROUPS = EQUIPMENT_CATEGORIES.map((c) => ({ title: c.label, test: (i: EquipmentPaletteItem) => i.category === c.id }));

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
  const dressing = item.contract?.drawing ? drawingToDressing(item.contract.drawing, item.contract.ports) : undefined;
  return <EquipmentFigure kind={item.kind} {...(dressing ? { dressing } : {})} width={size} isRunning />;
}

export const EquipmentExplorer: React.FC = () => {
  const [id, setId] = useState('batch-reactor');
  const item = STANDARD_EQUIPMENT_CATALOG.find((i) => i.id === id) ?? STANDARD_EQUIPMENT_CATALOG[0]!;
  const settings = useMemo((): { key: string; label: string; value: number; unit: string }[] => {
    // A designed unit labels its own parameters.
    if (item.contract) {
      return item.contract.parameters.slice(0, 4).map((p) => ({ key: p.name, label: p.label, value: p.value, unit: p.unit === '-' ? '' : p.unit }));
    }
    const node = createStandardUnitOp(item, { position: { x: 0, y: 0 } });
    return (
      Object.entries(node.config as Record<string, unknown>).filter(
        ([k, v]) => typeof v === 'number' && !/MeanTime|meanTime|Horsepower|Diameter|Psi|Efficiency/.test(k)
      ) as [string, number][]
    )
      .slice(0, 4)
      .map(([k, v]) => ({ key: k, value: v, ...words(k) }));
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
                      {i.short}
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
            <div style={{ fontSize: 18, fontWeight: 650, color: D.text.primary }}>{item.title}</div>
            <div style={{ fontSize: 13, color: D.text.muted, marginTop: 2 }}>{item.subtitle}</div>
            <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: D.text.secondary }}>{item.model}</p>
            {settings.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {settings.map((w) => (
                  <span key={w.key} style={{ ...mono, fontSize: 11, padding: '3px 8px', borderRadius: 6, background: D.background.canvas, border: `1px solid ${D.border.subtle}`, color: D.text.secondary }}>
                    {w.label} <span style={{ color: D.jade.glow }}>{Number(w.value.toFixed(2))}</span>
                    {w.unit && <span style={{ color: D.text.muted }}> {w.unit}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ThemeScope>
  );
};
