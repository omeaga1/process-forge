import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  convertUnit,
  isTemperatureDifference,
  parseQuantity,
  solveForTarget,
  type Influence,
  type Sweep,
  type SweepPoint,
  type TargetSolution,
  type UnitOpContract,
  type UnitOpEvaluation,
  type UnitOpParameter
} from '@process-forge/protocol';
import { Crosshair, RotateCcw } from 'lucide-react';
import { tint } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import { Button, Switch } from '../../ui/index.js';
import { controlFor, displayUnitsFor, feasibleBand, formatQuantity, statusAt, stepFor, type ParameterGroup } from '../../model/parameterUi.js';
import { QuantityText } from './ParameterControl.js';

export interface SpecSheetProps {
  contract: UnitOpContract;
  evaluation: UnitOpEvaluation;
  groups: ParameterGroup[];
  sweeps: Record<string, Sweep>;
  influence: Influence;
  /** Values when the unit was opened: what has been changed, and what to put back. */
  baselineParams: Record<string, number>;
  baselineDerived: Record<string, number>;
  unitFor: (unit: string, choices: string[]) => string;
  setUnit: (unit: string, chosen: string) => void;
  setParam: (name: string, value: number) => void;
  /** Lit by hovering elsewhere (a check, a fix). */
  lit: (name: string) => boolean;
  onHoverParam: (name: string | null) => void;
  flash: string | null;
  onFlash: (name: string) => void;
  /** What arrives at the design point (a designed unit's feed), edited on the same sheet. */
  feed?: { params: UnitOpParameter[]; baseline: Record<string, number>; onChange: (name: string, value: number) => void };
}

/**
 * A unit's data sheet, the way a simulator's unit dialog lays it out: every
 * specification in a table with its value typed in any unit of its kind, the
 * range where the design passes, and whether you have changed it; the
 * results the engine calculates from them, read-only, with how far each has
 * moved; and a specification solver -- name the result you want and the
 * setting to vary, and the engine finds the value.
 */
export const SpecSheet: React.FC<SpecSheetProps> = (props) => {
  const { contract, evaluation, groups, baselineDerived, unitFor, setUnit } = props;
  const { palette, font, radius: r } = useTheme();
  const [solveFor, setSolveFor] = useState<string | null>(null);
  const solverRef = useRef<HTMLDivElement>(null);

  const th: React.CSSProperties = {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: palette.text.muted,
    padding: '6px 8px',
    borderBottom: `1px solid ${palette.border.default}`,
    whiteSpace: 'nowrap'
  };
  const caption: React.CSSProperties = { ...th, display: 'table-caption', padding: '14px 0 4px', borderBottom: 'none', captionSide: 'top', textAlign: 'left' };
  // Both tables share their columns, so values and units line up down the sheet.
  const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' };
  const cols = (
    <colgroup>
      <col />
      <col style={{ width: 118 }} />
      <col style={{ width: 96 }} />
      <col style={{ width: 132 }} />
      <col style={{ width: 34 }} />
    </colgroup>
  );
  const groupHead: React.CSSProperties = { ...th, padding: '14px 8px 4px', borderBottom: `1px solid ${palette.border.subtle}`, color: palette.text.secondary };
  const hidden: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // The settings that move each result and can be varied continuously: what the solver may turn.
  const moversOf = (result: string) =>
    contract.parameters.filter((p) => {
      const k = controlFor(p);
      return k !== 'fixed' && k !== 'toggle' && k !== 'select' && (props.influence.derived[p.name] ?? []).includes(result);
    });
  const derivedRows = contract.derived.filter((d) => evaluation.derived[d.name] !== undefined);
  const specifiable = derivedRows.filter((d) => Number.isFinite(evaluation.derived[d.name]!) && moversOf(d.name).length > 0);

  return (
    <div>
      {contract.parameters.length > 0 && (
        <table style={table}>
          <caption style={hidden}>Specifications</caption>
          {cols}
          <thead>
            <tr>
              <th scope="col" style={th}>
                Specification
              </th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>
                Value
              </th>
              <th scope="col" style={th}>
                Unit
              </th>
              <th scope="col" style={th}>
                Passes between
              </th>
              <th scope="col" style={th}>
                <span style={hidden}>Changed</span>
              </th>
            </tr>
          </thead>
          {groups.map((g) => {
            const shown = !g.folded || open[g.name];
            return (
              <tbody key={g.name}>
                {(groups.length > 1 || g.folded) && (
                  <tr>
                    <th scope="colgroup" colSpan={5} style={groupHead}>
                      {g.folded ? (
                        <button
                          type="button"
                          className="pf-focus"
                          aria-expanded={Boolean(shown)}
                          onClick={() => setOpen((o) => ({ ...o, [g.name]: !o[g.name] }))}
                          style={{ all: 'inherit', padding: 0, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          {shown ? '▾' : '▸'} {g.name} · {g.params.length}
                        </button>
                      ) : (
                        g.name
                      )}
                    </th>
                  </tr>
                )}
                {shown && g.params.map((p) => <SpecRow key={p.name} p={p} {...props} />)}
              </tbody>
            );
          })}
          {props.feed && props.feed.params.length > 0 && (
            <tbody>
              <tr>
                <th scope="colgroup" colSpan={5} style={groupHead}>
                  Feed at the design point
                </th>
              </tr>
              {props.feed.params.map((p) => (
                <SpecRow key={p.name} p={p} {...props} sweeps={{}} baselineParams={props.feed!.baseline} setParam={props.feed!.onChange} />
              ))}
            </tbody>
          )}
        </table>
      )}

      {derivedRows.length > 0 && (
        <table style={{ ...table, marginTop: 10 }}>
          <caption style={caption}>Calculated by the engine</caption>
          {cols}
          <thead>
            <tr>
              <th scope="col" style={th}>
                Result
              </th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>
                Value
              </th>
              <th scope="col" style={th}>
                Unit
              </th>
              <th scope="col" style={th}>
                Since opened
              </th>
              <th scope="col" style={{ ...th, width: 28 }}>
                <span style={hidden}>Specify</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {derivedRows.map((d) => {
              const v = evaluation.derived[d.name]!;
              const choices = displayUnitsFor({ name: d.name, label: d.label, unit: d.unit, value: 0 });
              const du = unitFor(d.unit, choices);
              const difference = isTemperatureDifference(d);
              const shown = convertUnit(v, d.unit, du, { difference }) ?? v;
              const before = baselineDerived[d.name];
              const moved = before !== undefined && Number.isFinite(before) && Math.abs(v - before) > 1e-9 * Math.max(1, Math.abs(before));
              const pct = moved && before ? ((v - before) / Math.abs(before)) * 100 : 0;
              const td: React.CSSProperties = { padding: '5px 8px', borderBottom: `1px solid ${palette.border.subtle}` };
              return (
                <tr key={d.name} style={{ backgroundColor: props.lit(`d:${d.name}`) ? tint(palette.jade[500], 0.08) : 'transparent' }}>
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500, color: palette.text.secondary }} title={d.description}>
                    {d.label ?? d.name}
                  </th>
                  <td style={{ ...td, textAlign: 'right', fontFamily: font.mono, color: palette.text.primary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatQuantity(shown)}</td>
                  <td style={{ ...td, padding: '3px 8px' }}>
                    <UnitCell label={d.label ?? d.name} unit={d.unit} shown={du} choices={choices} onPick={(u) => setUnit(d.unit, u)} />
                  </td>
                  <td style={{ ...td, fontSize: 12, color: palette.text.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {moved ? `${v > before! ? '▲' : '▼'} ${Number.isFinite(pct) && before ? `${Math.abs(pct) < 10 ? Math.abs(pct).toFixed(1) : Math.round(Math.abs(pct))}%` : ''}` : '—'}
                  </td>
                  <td style={{ ...td, padding: '3px 4px' }}>
                    {specifiable.includes(d) && (
                      <Button
                        iconOnly
                        label={`Specify ${d.label ?? d.name}`}
                        size="sm"
                        variant="ghost"
                        icon={<Crosshair size={13} />}
                        onClick={() => {
                          setSolveFor(d.name);
                          requestAnimationFrame(() => solverRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
                        }}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {specifiable.length > 0 && (
        <div ref={solverRef}>
          <TargetSolver {...props} results={specifiable} moversOf={moversOf} picked={solveFor} onPick={setSolveFor} radius={r.md} />
        </div>
      )}
    </div>
  );
};

/** One specification: typed value, unit, the passing range and whether it has been changed. */
const SpecRow: React.FC<SpecSheetProps & { p: UnitOpParameter }> = ({ p, sweeps, baselineParams, unitFor, setUnit, setParam, lit, onHoverParam, flash }) => {
  const { palette, font } = useTheme();
  const kind = controlFor(p);
  const choices = displayUnitsFor(p);
  const du = unitFor(p.unit, choices);
  const difference = isTemperatureDifference(p);
  const toShown = (v: number) => convertUnit(v, p.unit, du, { difference }) ?? v;
  const sweep = sweeps[p.name];
  const band = useMemo(() => (sweep && sweep.points.length > 1 ? feasibleBand(sweep, p.value) : undefined), [sweep, p.value]);
  const here: SweepPoint['status'] | undefined = sweep?.points.length ? statusAt(sweep, p.value) : undefined;
  const base = baselineParams[p.name];
  const changed = base !== undefined && base !== p.value;
  const out = (p.min !== undefined && p.value < p.min) || (p.max !== undefined && p.value > p.max);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const flashing = flash === p.name;
  useEffect(() => {
    if (flashing) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [flashing]);

  const statusColor =
    here === 'ok' ? palette.jade[500] : here === 'warning' ? palette.status.blocked : here === 'error' ? palette.status.failed : palette.text.muted;
  const statusText = here === 'ok' ? 'passes' : here === 'warning' ? 'warns' : here === 'error' ? 'fails' : 'not checked';
  const commit = (v: number) => {
    const x = p.integer || kind === 'stepper' ? Math.round(v) : v;
    if (Number.isFinite(x)) setParam(p.name, x);
  };
  const td: React.CSSProperties = { padding: '3px 8px', borderBottom: `1px solid ${palette.border.subtle}`, verticalAlign: 'middle' };
  const range = p.min !== undefined || p.max !== undefined ? `Allowed ${p.min !== undefined ? formatQuantity(toShown(p.min)) : '…'} to ${p.max !== undefined ? formatQuantity(toShown(p.max)) : '…'} ${du !== '-' ? du : ''}` : '';

  let value: React.ReactNode;
  if (kind === 'fixed') {
    value = <span style={{ fontFamily: font.mono, color: palette.text.secondary }}>{formatQuantity(toShown(p.value))}</span>;
  } else if (kind === 'toggle') {
    value = <Switch checked={p.value >= 0.5} onCheckedChange={(on) => commit(on ? (p.max ?? 1) : (p.min ?? 0))} label={p.label} />;
  } else if (kind === 'select' && p.options?.length) {
    const known = p.options.some((o) => o.value === p.value);
    value = (
      <select className="pf-select" aria-label={p.label} value={known ? String(p.value) : 'custom'} onChange={(e) => e.target.value !== 'custom' && commit(Number(e.target.value))} style={{ height: 28, minWidth: 140 }}>
        {!known && <option value="custom">{formatQuantity(p.value)}</option>}
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    value = (
      <span
        title={range || undefined}
        style={{
          display: 'inline-flex',
          height: 28,
          borderRadius: 4,
          border: `1px solid ${out ? palette.status.failed : changed ? palette.jade[500] : palette.border.default}`,
          backgroundColor: changed ? tint(palette.jade[500], 0.06) : palette.background.surface,
          overflow: 'hidden'
        }}
      >
        <QuantityText value={p.value} unit={p.unit} displayUnit={du} difference={difference} label={p.label} onCommit={commit} width={96} step={stepFor(p)} />
      </span>
    );
  }

  let passes: React.ReactNode = <span style={{ color: palette.text.muted }}>—</span>;
  if (band) {
    const pr = band.passing;
    if (!pr) passes = <span style={{ color: palette.status.failed }}>nowhere in range</span>;
    else {
      const whole = sweep && Math.abs(pr.from - sweep.range.from) < 1e-9 && Math.abs(pr.to - sweep.range.to) < 1e-9;
      passes = whole ? (
        <span style={{ color: palette.text.muted }}>whole range</span>
      ) : (
        <span style={{ color: pr.containsValue ? palette.text.secondary : palette.status.failed, fontFamily: font.mono, fontSize: 12 }}>
          {formatQuantity(toShown(pr.from))} – {formatQuantity(toShown(pr.to))}
        </span>
      );
    }
  }

  return (
    <tr
      ref={rowRef}
      onMouseEnter={() => onHoverParam(p.name)}
      onMouseLeave={() => onHoverParam(null)}
      style={{ backgroundColor: flashing ? tint(palette.jade[500], 0.16) : lit(`p:${p.name}`) ? tint(palette.jade[500], 0.08) : 'transparent', transition: 'background-color 300ms ease' }}
    >
      <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500, color: palette.text.primary, minWidth: 120 }} title={p.description}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span role="img" aria-label={`At this value the design ${statusText}`} style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, backgroundColor: statusColor, opacity: here ? 1 : 0.4 }} />
          {p.label}
        </span>
      </th>
      <td style={{ ...td, textAlign: 'right' }}>{value}</td>
      <td style={td}>{kind === 'toggle' || kind === 'select' ? null : <UnitCell label={p.label} unit={p.unit} shown={du} choices={choices} onPick={(u) => setUnit(p.unit, u)} />}</td>
      <td style={{ ...td, whiteSpace: 'nowrap', fontSize: 12 }}>{passes}</td>
      <td style={{ ...td, padding: '3px 4px' }}>
        {changed && (
          <Button iconOnly size="sm" variant="ghost" label={`Put ${p.label} back to ${formatQuantity(toShown(base!))} ${du !== '-' ? du : ''}`} icon={<RotateCcw size={12} />} onClick={() => setParam(p.name, base!)} />
        )}
      </td>
    </tr>
  );
};

/** The unit a value is shown in: a picker when the quantity has others, else the unit as text. */
const UnitCell: React.FC<{ label: string; unit: string; shown: string; choices: string[]; onPick: (u: string) => void }> = ({ label, unit, shown, choices, onPick }) => {
  const { palette } = useTheme();
  if (choices.length > 1)
    return (
      <select className="pf-select" aria-label={`${label} unit`} value={shown} onChange={(e) => onPick(e.target.value)} style={{ height: 28, width: 'auto', minWidth: 76, fontSize: 12 }}>
        {choices.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    );
  return <span style={{ fontSize: 12, color: palette.text.muted }}>{unit && unit !== '-' ? unit : ''}</span>;
};

/**
 * Specify a result and let the engine find the setting: "make the air-to-cloth
 * ratio 2 ft/min by varying the filter area". Solved on the contract itself,
 * by bisection where the result crosses the target; applied only when asked.
 */
const TargetSolver: React.FC<
  SpecSheetProps & { results: UnitOpContract['derived']; moversOf: (result: string) => UnitOpParameter[]; picked: string | null; onPick: (name: string) => void; radius: number }
> = ({ contract, evaluation, unitFor, setParam, onFlash, results, moversOf, picked, onPick, radius }) => {
  const { palette, font } = useTheme();
  const result = results.find((d) => d.name === picked) ?? results[0]!;
  const choices = displayUnitsFor({ name: result.name, label: result.label, unit: result.unit, value: 0 });
  const du = unitFor(result.unit, choices);
  const difference = isTemperatureDifference(result);
  const toShown = (v: number) => convertUnit(v, result.unit, du, { difference }) ?? v;

  // The settings that move this result, and can be varied continuously.
  const movers = moversOf(result.name);
  const [vary, setVary] = useState<string>('');
  const varied = movers.find((p) => p.name === vary) ?? movers[0];
  const [target, setTarget] = useState('');
  const [bad, setBad] = useState(false);
  const [solution, setSolution] = useState<TargetSolution | null>(null);
  // A new question clears the old answer.
  useEffect(() => {
    setSolution(null);
    setBad(false);
  }, [result.name, varied?.name, contract]);

  const now = evaluation.derived[result.name]!;
  const solve = () => {
    if (!varied) return;
    const t = parseQuantity(target.trim() || formatQuantity(toShown(now)).replace(/,/g, ''), result.unit, du, { difference });
    if (t === null) {
      setBad(true);
      return;
    }
    setSolution(solveForTarget(contract, result.name, t, varied.name));
  };

  const vdu = varied ? unitFor(varied.unit, displayUnitsFor(varied)) : '';
  const vShown = (v: number) => (varied ? convertUnit(v, varied.unit, vdu, { difference: isTemperatureDifference(varied) }) ?? v : v);
  const label: React.CSSProperties = { fontSize: 12, color: palette.text.secondary };

  return (
    <section
      aria-label="Specify a result"
      style={{ marginTop: 16, padding: '12px 12px 10px', borderRadius: radius, border: `1px solid ${palette.border.default}`, background: palette.background.surfaceElevated }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: palette.text.muted, marginBottom: 8 }}>
        <Crosshair size={13} /> Specify a result
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          solve();
        }}
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
      >
        <span style={label}>Make</span>
        <select className="pf-select" aria-label="Result to specify" value={result.name} onChange={(e) => onPick(e.target.value)} style={{ width: 'auto', minWidth: 150, height: 30 }}>
          {results.map((d) => (
            <option key={d.name} value={d.name}>
              {d.label ?? d.name}
            </option>
          ))}
        </select>
        <span style={label}>=</span>
        <input
          className="pf-input"
          aria-label={`Target ${result.label ?? result.name}${du !== '-' ? ` in ${du}` : ''}`}
          aria-invalid={bad}
          inputMode="decimal"
          placeholder={formatQuantity(toShown(now))}
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setBad(false);
          }}
          style={{ width: 96, height: 30, fontFamily: font.mono, textAlign: 'right', ...(bad ? { borderColor: palette.status.failed } : {}) }}
        />
        <span style={{ ...label, color: palette.text.muted }}>{du !== '-' ? du : ''}</span>
        <span style={label}>by varying</span>
        {movers.length ? (
          <select className="pf-select" aria-label="Setting to vary" value={varied!.name} onChange={(e) => setVary(e.target.value)} style={{ width: 'auto', minWidth: 150, height: 30 }}>
            {movers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ ...label, color: palette.text.muted }}>nothing: no setting moves this result</span>
        )}
        <Button type="submit" size="sm" variant="primary" disabled={!movers.length}>
          Solve
        </Button>
      </form>

      {solution && varied && (
        <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13, color: palette.text.primary }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            {solution.reached ? 'Set' : 'Out of reach. The closest is'} <b>{varied.label}</b> to{' '}
            <b style={{ fontFamily: font.mono }}>
              {formatQuantity(vShown(solution.value))} {vdu !== '-' ? vdu : ''}
            </b>
            , giving {result.label ?? result.name} ={' '}
            <span style={{ fontFamily: font.mono }}>
              {formatQuantity(toShown(solution.achieved))} {du !== '-' ? du : ''}
            </span>
            .
            {!solution.allErrorsPass && <span style={{ color: palette.status.failed }}> A check would fail there.</span>}
          </span>
          <Button
            size="sm"
            variant={solution.reached ? 'primary' : 'default'}
            disabled={solution.value === varied.value}
            onClick={() => {
              setParam(varied.name, solution.value);
              onFlash(varied.name);
            }}
          >
            {solution.value === varied.value ? 'Applied' : 'Apply'}
          </Button>
        </div>
      )}
    </section>
  );
};
