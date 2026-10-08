import React, { useMemo } from 'react';
import {
  calculateStream,
  effectiveContract,
  UnitOpContractSchema,
  TERMINAL_ROLE_LABEL,
  terminalCarries,
  terminalPhase,
  terminalMaterial,
  terminalRole,
  terminalSupplyRate,
  type ProcessNode,
  type UnitOpContract
} from '@process-forge/protocol';
import { ContractParametersPanel } from './ContractParametersPanel.js';
import type { NodeTelemetrySnapshot } from '@process-forge/simulation-core';
import { useTheme } from '../../hooks/useTheme.js';
import { engineKeysOf } from '../../model/unitBehavior.js';

interface UnitParametersPanelProps {
  node: ProcessNode;
  onUpdateConfig: (nodeId: string, newConfig: Record<string, unknown>) => void;
  /** The unit's state at the simulation's playhead, when there is a run. */
  live?: NodeTelemetrySnapshot | undefined;
}

/** Unit words at the end of a built-in config key, and how they are shown. */
const UNIT_SUFFIXES: [RegExp, string][] = [
  [/Gpm$/, 'gpm'],
  [/Feet$/, 'ft'],
  [/Inches$/, 'in'],
  [/Horsepower$/, 'hp'],
  [/Percent$/, '%'],
  [/Percentage$/, '%'],
  [/Seconds$/, 's'],
  [/Minutes$/, 'min'],
  [/Gallons$/, 'gal'],
  [/Psi$/, 'psi'],
  [/Celsius$/, '°C'],
  [/PerMinute$/, '/min'],
  [/Rpm$/, 'rpm'],
  [/Kg$/, 'kg'],
  [/Kw$/, 'kW']
];

/** "designFlowRateGpm" -> { label: "Design flow rate", unit: "gpm" }. */
export function describeConfigKey(key: string): { label: string; unit: string } {
  let base = key;
  let unit = '';
  for (const [re, u] of UNIT_SUFFIXES) {
    if (re.test(base)) {
      base = base.replace(re, '');
      unit = u;
      break;
    }
  }
  const words = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return { label: words.charAt(0).toUpperCase() + words.slice(1), unit };
}

/**
 * A unit's settings. Every unit the engine runs has a contract -- its own
 * (a designed unit), or one built from its config (a standard unit) -- and
 * both are edited in ContractParametersPanel, with the engine's verdict on
 * every knob. Feeds and outlets have their own settings below.
 */
export const UnitParametersPanel: React.FC<UnitParametersPanelProps> = ({ node, onUpdateConfig, live: telemetry }) => {
  const { palette, font, radius: r } = useTheme();
  const config = node.config as Record<string, unknown>;
  const parsed = useMemo(() => UnitOpContractSchema.safeParse(config.contract), [config.contract]);
  const own = parsed.success;
  // A standard unit's contract is built from its config, so the same panel edits it.
  const contract: UnitOpContract | null = useMemo(() => (parsed.success ? parsed.data : node.kind === 'TERMINAL' ? null : effectiveContract(node) ?? null), [parsed, node]);

  const row: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 6,
    padding: '10px 0',
    borderBottom: `1px solid ${palette.border.subtle}`
  };
  const numberBox = (invalid: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    height: 30,
    borderRadius: r.md,
    border: `1px solid ${invalid ? palette.status.blocked : palette.border.default}`,
    backgroundColor: palette.background.surface,
    overflow: 'hidden'
  });
  const input: React.CSSProperties = {
    width: 84,
    height: '100%',
    border: 'none',
    outline: 'none',
    padding: '0 8px',
    backgroundColor: 'transparent',
    color: palette.text.primary,
    fontFamily: font.mono,
    fontSize: 13,
    textAlign: 'right'
  };
  const unitTag: React.CSSProperties = {
    padding: '0 8px',
    height: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 12,
    color: palette.text.muted,
    borderLeft: `1px solid ${palette.border.subtle}`,
    backgroundColor: palette.background.surfaceElevated,
    minWidth: 26,
    justifyContent: 'center'
  };
  const heading: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: palette.text.muted,
    margin: '18px 0 2px'
  };

  // ---- a unit run by a contract: designed, or a standard unit built from its config ----
  if (contract && !terminalRole(node)) {
    return <ContractParametersPanel node={node} contract={contract} own={own} onUpdateConfig={onUpdateConfig} live={telemetry} />;
  }

  // ---- a feed or outlet arrow -------------------------------------------------
  const tRole = terminalRole(node);
  if (tRole) {
    const items = terminalCarries(node) === 'items';
    const phase = terminalPhase(node) ?? 'LIQUID';
    // A feed's supply is stated in one unit: SCFM (a gas), kg/h, or gal/min (items/min for items).
    const supplyUnit: 'scfm' | 'kgh' | 'gpm' =
      !items && phase === 'GAS' && typeof config.supplyScfm === 'number' ? 'scfm' : !items && typeof config.supplyKgPerHour === 'number' ? 'kgh' : 'gpm';
    const supplyValue = supplyUnit === 'scfm' ? Number(config.supplyScfm) : supplyUnit === 'kgh' ? Number(config.supplyKgPerHour) : terminalSupplyRate(node);
    // The same supply in another unit, by the feed's own temperature, density and composition.
    const convert = (v: number, from: 'scfm' | 'kgh' | 'gpm', to: 'scfm' | 'kgh' | 'gpm', ph: 'LIQUID' | 'GAS' | 'SOLID' = phase as 'LIQUID' | 'GAS' | 'SOLID'): number => {
      if (!(v > 0) || from === to) return v;
      const unitOf = { scfm: 'SCFM', kgh: 'kg/h', gpm: 'gal/min' } as const;
      const rho = typeof config.densityGPerCm3 === 'number' ? config.densityGPerCm3 * 1000 : undefined;
      const r = calculateStream({
        phase: ph,
        flow: { value: v, unit: unitOf[from] },
        ...(typeof config.temperatureC === 'number' ? { temperatureC: config.temperatureC } : {}),
        ...(config.composition && typeof config.composition === 'object' ? { composition: config.composition as Record<string, number> } : {}),
        ...(rho !== undefined && ph !== 'GAS' ? { densityKgPerM3: rho } : {})
      });
      if (!r.success) return v;
      const out = to === 'kgh' ? r.mass!.kgPerHour : to === 'scfm' ? r.volume!.standardCubicFeetPerMinute ?? v : r.volume!.gallonsPerMinute ?? (r.volume!.actualM3PerHour / 0.227124707);
      return Number(out.toPrecision(4));
    };
    const withSupply = (unit: 'scfm' | 'kgh' | 'gpm', v: number): Record<string, unknown> => {
      const { supplyScfm: _s, supplyKgPerHour: _k, ...rest } = config as Record<string, unknown>;
      if (unit === 'scfm') return { ...rest, supplyRate: 0, supplyScfm: v };
      if (unit === 'kgh') return { ...rest, supplyRate: 0, supplyKgPerHour: v };
      return { ...rest, supplyRate: v };
    };
    const chip = (on: boolean): React.CSSProperties => ({
      padding: '5px 10px',
      borderRadius: r.md,
      fontSize: 12,
      fontWeight: on ? 700 : 500,
      border: `1px solid ${on ? palette.jade[500] : palette.border.subtle}`,
      background: on ? `${palette.jade[500]}22` : 'transparent',
      color: on ? palette.text.primary : palette.text.secondary,
      cursor: 'pointer'
    });
    const textBox: React.CSSProperties = { ...numberBox(false), width: 200, padding: '5px 8px' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={heading}>{tRole === 'feed' ? 'Feed' : 'Outlet'}</div>
        {tRole !== 'feed' && (
          <div style={row}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>Leaves as</div>
              <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2 }}>Only product counts toward the line's output.</div>
            </div>
            <div role="radiogroup" aria-label="Leaves as" style={{ display: 'flex', gap: 4 }}>
              {(['product', 'byproduct', 'waste'] as const).map((r2) => (
                <button
                  key={r2}
                  type="button"
                  role="radio"
                  aria-checked={tRole === r2}
                  onClick={() => onUpdateConfig(node.id, { ...config, role: r2 })}
                  style={{
                    padding: '5px 10px',
                    borderRadius: r.md,
                    fontSize: 12,
                    fontWeight: tRole === r2 ? 700 : 500,
                    border: `1px solid ${tRole === r2 ? palette.jade[500] : palette.border.subtle}`,
                    background: tRole === r2 ? `${palette.jade[500]}22` : 'transparent',
                    color: tRole === r2 ? palette.text.primary : palette.text.secondary,
                    cursor: 'pointer'
                  }}
                >
                  {TERMINAL_ROLE_LABEL[r2]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={row}>
          <div style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>Material</div>
          <label style={textBox}>
            <input
              type="text"
              aria-label="Material"
              value={terminalMaterial(node)}
              onChange={(e) => onUpdateConfig(node.id, { ...config, material: e.target.value })}
              style={{ ...input, textAlign: 'left' }}
            />
          </label>
        </div>
        {!items && (
          <div style={row}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>Phase</div>
              <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2 }}>
                {phase === 'GAS' ? 'An ideal gas at its temperature, unless it states a density.' : phase === 'SOLID' ? 'Bulk solids, counted in kg.' : 'A liquid.'}
              </div>
            </div>
            <div role="radiogroup" aria-label="Phase" style={{ display: 'flex', gap: 4 }}>
              {(['LIQUID', 'GAS', 'SOLID'] as const).map((ph) => (
                <button
                  key={ph}
                  type="button"
                  role="radio"
                  aria-checked={phase === ph}
                  onClick={() => {
                    const next: Record<string, unknown> = { ...config, phase: ph };
                    // SCFM only describes a gas: keep the same supply as a mass flow.
                    if (ph !== 'GAS' && typeof next.supplyScfm === 'number') {
                      const kgh = convert(next.supplyScfm as number, 'scfm', 'kgh', 'GAS');
                      delete next.supplyScfm;
                      if (kgh > 0) next.supplyKgPerHour = kgh;
                    }
                    onUpdateConfig(node.id, next);
                  }}
                  style={chip(phase === ph)}
                >
                  {ph.charAt(0) + ph.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        )}
        {tRole === 'feed' && (
          <div style={row}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>Supply rate</div>
              <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2 }}>0 supplies whatever the line takes.</div>
            </div>
            <label style={numberBox(false)}>
              <input
                type="number"
                aria-label="Supply rate"
                min={0}
                step="any"
                value={supplyValue}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v) && v >= 0) onUpdateConfig(node.id, withSupply(supplyUnit, v));
                }}
                style={input}
              />
              {items ? (
                <span style={unitTag}>items/min</span>
              ) : (
                <select
                  aria-label="Supply unit"
                  value={supplyUnit}
                  onChange={(e) => {
                    const to = e.target.value as 'scfm' | 'kgh' | 'gpm';
                    onUpdateConfig(node.id, withSupply(to, convert(supplyValue, supplyUnit, to)));
                  }}
                  style={{ ...unitTag, background: 'transparent', border: 'none', color: palette.text.secondary, cursor: 'pointer' }}
                >
                  {(phase !== 'GAS' || supplyUnit === 'gpm') && <option value="gpm">gal/min</option>}
                  <option value="kgh">kg/h</option>
                  {phase === 'GAS' && <option value="scfm">SCFM</option>}
                </select>
              )}
            </label>
          </div>
        )}
        <div style={{ fontSize: 12, color: palette.text.muted, lineHeight: 1.5, marginTop: 10 }}>
          Carries {items ? 'whole items' : phase === 'GAS' ? 'a gas' : phase === 'SOLID' ? 'bulk solids' : 'liquid'}. An arrow with nothing piped to it takes on the kind of the first unit you pipe it to.
        </div>
      </div>
    );
  }

  // ---- a built-in unit --------------------------------------------------------
  const numeric = Object.entries(config).filter(([, val]) => typeof val === 'number') as [string, number][];

  if (numeric.length === 0) {
    return <div style={{ fontSize: 13, color: palette.text.muted }}>This unit has no numeric settings.</div>;
  }

  // Settings the engine reads first; the rest are kept on the unit for the
  // record but change nothing in a run, and say so.
  const used = new Set(engineKeysOf(node));
  const live = numeric.filter(([k]) => used.has(k));
  const inert = numeric.filter(([k]) => !used.has(k));

  const renderRow = ([key, val]: [string, number]) => {
    const { label, unit } = describeConfigKey(key);
    const step = Math.abs(val) < 1 ? 0.01 : Math.abs(val) < 10 ? 0.1 : 1;
    const max = Math.max(val * 2, Math.abs(val) < 1 ? 1 : 100);
    return (
      <div key={key} style={row}>
        <div style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>{label}</div>
        <label style={numberBox(false)}>
          <input
            type="number"
            aria-label={label}
            min={0}
            step={step}
            value={val}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) onUpdateConfig(node.id, { ...config, [key]: v });
            }}
            style={input}
          />
          {unit && <span style={unitTag}>{unit}</span>}
        </label>
        <input
          type="range"
          aria-hidden="true"
          tabIndex={-1}
          min={0}
          max={max}
          step={step}
          value={val}
          onChange={(e) => onUpdateConfig(node.id, { ...config, [key]: parseFloat(e.target.value) })}
          style={{ gridColumn: '1 / -1', width: '100%', accentColor: palette.jade[500], height: 14, margin: 0 }}
        />
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {live.length > 0 && (
        <>
          <div style={heading}>Used by the simulation</div>
          {live.map(renderRow)}
        </>
      )}
      {inert.length > 0 && (
        <details open={live.length === 0} style={{ marginTop: live.length ? 14 : 0 }}>
          <summary style={{ ...heading, cursor: 'pointer', listStyle: 'revert' }}>
            {live.length === 0 ? 'Design values' : 'Not used by the simulation yet'} · {inert.length}
          </summary>
          <div style={{ fontSize: 12, color: palette.text.muted, lineHeight: 1.5, margin: '4px 0 2px' }}>
            {live.length === 0
              ? 'The line simulation does not step this kind of unit yet, so these values are kept with the design but do not change the results.'
              : 'Kept with the design; changing them does not change the simulation.'}
          </div>
          {inert.map(renderRow)}
        </details>
      )}
    </div>
  );
};
