import React, { useMemo } from 'react';
import {
  evaluateUnitOp,
  UnitOpContractSchema,
  type ProcessNode,
  type UnitOpContract
} from '@process-forge/protocol';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';

interface UnitParametersPanelProps {
  node: ProcessNode;
  onUpdateConfig: (nodeId: string, newConfig: Record<string, unknown>) => void;
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

function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.01 || a >= 1e6)) return v.toExponential(2);
  return v.toLocaleString(undefined, { maximumFractionDigits: a < 1 ? 4 : a < 100 ? 2 : 1 });
}

/**
 * A unit's parameters. For a unit defined by a contract, edits go into the
 * contract itself -- that is what the engine runs -- and the engine's own
 * results and checks are shown as you type. Built-in units show their numeric
 * settings with readable labels and units.
 */
export const UnitParametersPanel: React.FC<UnitParametersPanelProps> = ({ node, onUpdateConfig }) => {
  const { palette, font, radius: r } = useTheme();
  const config = node.config as Record<string, unknown>;
  const parsed = useMemo(() => UnitOpContractSchema.safeParse(config.contract), [config.contract]);
  const contract: UnitOpContract | null = parsed.success ? parsed.data : null;
  const evaluation = useMemo(() => (contract ? evaluateUnitOp(contract) : null), [contract]);

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

  // ---- a contract-defined unit ------------------------------------------------
  if (contract && evaluation) {
    const setParam = (name: string, value: number) => {
      const next: UnitOpContract = {
        ...contract,
        parameters: contract.parameters.map((p) => (p.name === name ? { ...p, value } : p))
      };
      // The contract is what the engine runs; the mirrored key is for anything
      // that reads config directly.
      onUpdateConfig(node.id, { ...config, contract: next, [name]: value });
    };
    const errors = evaluation.constraints.filter((c) => !c.satisfied && c.severity === 'ERROR');
    const warnings = evaluation.constraints.filter((c) => !c.satisfied && c.severity === 'WARNING');

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: r.md,
            fontSize: 13,
            backgroundColor: evaluation.error || errors.length ? 'rgba(239, 68, 68, 0.08)' : warnings.length ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.08)',
            border: `1px solid ${evaluation.error || errors.length ? 'rgba(239, 68, 68, 0.4)' : warnings.length ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.35)'}`,
            color: palette.text.primary
          }}
        >
          {evaluation.error || errors.length ? (
            <XCircle size={16} color="#ef4444" />
          ) : warnings.length ? (
            <AlertTriangle size={16} color={palette.status.blocked} />
          ) : (
            <CheckCircle2 size={16} color={palette.jade[500]} />
          )}
          <span>
            {evaluation.error
              ? `The engine cannot evaluate this design: ${evaluation.error.message}`
              : errors.length
                ? `${errors.length} check${errors.length > 1 ? 's' : ''} fail: the simulation will refuse to run this unit.`
                : warnings.length
                  ? `Runs, with ${warnings.length} warning${warnings.length > 1 ? 's' : ''}.`
                  : 'Every check passes.'}
          </span>
        </div>

        <div style={heading}>Parameters</div>
        {contract.parameters.map((p) => {
          const out = (p.min !== undefined && p.value < p.min) || (p.max !== undefined && p.value > p.max);
          const hasRange = p.min !== undefined && p.max !== undefined && p.max > p.min;
          return (
            <div key={p.name} style={row}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>{p.label ?? p.name}</div>
                {p.description && <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2 }}>{p.description}</div>}
              </div>
              <label style={numberBox(out)} title={hasRange ? `${p.min} to ${p.max}` : undefined}>
                <input
                  type="number"
                  aria-label={p.label ?? p.name}
                  value={p.value}
                  step="any"
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v)) setParam(p.name, v);
                  }}
                  style={input}
                />
                {p.unit && <span style={unitTag}>{p.unit}</span>}
              </label>
              {hasRange && (
                <input
                  type="range"
                  aria-hidden="true"
                  tabIndex={-1}
                  min={p.min}
                  max={p.max}
                  step={(p.max! - p.min!) / 200}
                  value={Math.min(p.max!, Math.max(p.min!, p.value))}
                  onChange={(e) => setParam(p.name, parseFloat(e.target.value))}
                  style={{ gridColumn: '1 / -1', width: '100%', accentColor: palette.jade[500], height: 14, margin: 0 }}
                />
              )}
              {out && (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: palette.status.blocked }}>
                  Outside its range ({p.min} to {p.max} {p.unit}).
                </div>
              )}
            </div>
          );
        })}

        {contract.derived.length > 0 && (
          <>
            <div style={heading}>Computed by the engine</div>
            {contract.derived.map((d) => (
              <div key={d.name} style={{ ...row, padding: '7px 0' }}>
                <span style={{ fontSize: 13, color: palette.text.secondary }}>{d.label ?? d.name}</span>
                <span style={{ fontFamily: font.mono, fontSize: 13, color: palette.text.primary }}>
                  {formatNumber(evaluation.derived[d.name] ?? NaN)} <span style={{ color: palette.text.muted }}>{d.unit}</span>
                </span>
              </div>
            ))}
          </>
        )}

        {evaluation.constraints.length > 0 && (
          <>
            <div style={heading}>Checks</div>
            {evaluation.constraints.map((c) => {
              const bad = !c.satisfied;
              const color = !bad ? palette.jade[500] : c.severity === 'ERROR' ? '#ef4444' : palette.status.blocked;
              const Icon = !bad ? CheckCircle2 : c.severity === 'ERROR' ? XCircle : AlertTriangle;
              return (
                <div key={c.id} style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: `1px solid ${palette.border.subtle}` }}>
                  <Icon size={15} color={color} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 13, color: bad ? palette.text.primary : palette.text.secondary }}>
                    {c.message}
                    {bad && c.hint && <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2 }}>Try: {c.hint}</div>}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  // ---- a built-in unit --------------------------------------------------------
  const numeric = Object.entries(config).filter(
    ([key, val]) =>
      typeof val === 'number' &&
      // Breakdowns are not simulated, so these would change nothing.
      key !== 'meanTimeBetweenFailuresMinutes' &&
      key !== 'meanTimeToRepairMinutes'
  ) as [string, number][];

  if (numeric.length === 0) {
    return <div style={{ fontSize: 13, color: palette.text.muted }}>This unit has no numeric settings.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={heading}>Settings</div>
      {numeric.map(([key, val]) => {
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
      })}
    </div>
  );
};
