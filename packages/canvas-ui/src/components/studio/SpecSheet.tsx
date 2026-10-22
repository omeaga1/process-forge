import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  fractionOf,
  caseStudy,
  convertUnit,
  engineResults,
  resultsOf,
  niceValue,
  sweepRange,
  isTemperatureDifference,
  parseQuantity,
  solveForTarget,
  type DesignSpec,
  type Fix,
  type Influence,
  type Sweep,
  type SweepPoint,
  type TargetSolution,
  type UnitOpContract,
  type UnitOpEvaluation,
  type UnitOpParameter
} from '@process-forge/protocol';
import { NumberField } from '@base-ui/react/number-field';
import { Check, ChevronRight, Copy, Crosshair, Lock, MoveHorizontal, RotateCcw } from 'lucide-react';
import { tint } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import { Button, Chip, Switch } from '../../ui/index.js';
import { controlFor, displayUnitsFor, feasibleBand, formatQuantity, statusAt, stepFor, type ParameterGroup } from '../../model/parameterUi.js';
import { QuantityText } from './ParameterControl.js';
import { distinctResults } from '../../model/specLayout.js';

/** A design spec: keep a result at its target by varying one setting (protocol's DesignSpec). */
export type HeldSpec = DesignSpec;

export interface SpecSheetProps {
  contract: UnitOpContract;
  evaluation: UnitOpEvaluation;
  groups: ParameterGroup[];
  sweeps: Record<string, Sweep>;
  influence: Influence;
  /** Parameter -> the engine figures (rate, cycle, capacity, duty) it moves. */
  engineMovers: Record<string, string[]>;
  /** Values when the unit was opened: what has been changed, and what to put back. */
  baselineParams: Record<string, number>;
  baselineDerived: Record<string, number>;
  /** The unit to show: the engineer's choice for this kind of quantity, else `fallback`, else the unit itself. */
  unitFor: (unit: string, choices: string[], fallback?: string) => string;
  setUnit: (unit: string, chosen: string) => void;
  setParam: (name: string, value: number) => void;
  /** Lit by hovering elsewhere (a check, a fix). */
  lit: (name: string) => boolean;
  onHoverParam: (name: string | null) => void;
  flash: string | null;
  onFlash: (name: string) => void;
  /** Results held at a target, each by varying one setting; that setting is the solver's, not the engineer's, while it is held. */
  holds: HeldSpec[];
  onHold: (h: HeldSpec) => void;
  onRelease: (vary: string) => void;
  /** What arrives at the design point (a designed unit's feed), edited on the same sheet. */
  feed?: { params: UnitOpParameter[]; baseline: Record<string, number>; onChange: (name: string, value: number) => void; fromLine?: boolean };
  /** The engine's counter-offer for an input, when a check fails: the value that clears it. */
  fixes?: Record<string, Fix>;
  /** A check's name, for saying what a fix clears. */
  checkName?: (id: string) => string;
  /** Wraps the results (and a copy button for the sheet) in the panel's own section. */
  resultsSection?: (children: React.ReactNode, right: React.ReactNode) => React.ReactNode;
}

/**
 * A unit's data sheet, the way a simulator's unit dialog lays it out: every
 * specification in a table with its value typed in any unit of its kind, the
 * range where the design passes, and whether you have changed it; the
 * results the engine calculates from them, read-only, with how far each has
 * moved; and a specification solver -- name the result you want and the
 * setting to vary, and the engine finds the value.
 */
type ResultDef = UnitOpContract['derived'][number];

/** Every result to show and solve for: what the engine runs the unit at, then the contract's own. */
export function allResults(contract: UnitOpContract, evaluation: UnitOpEvaluation, engineMovers: Record<string, string[]>): { defs: ResultDef[]; values: Record<string, number> } {
  // A figure that only repeats one setting (a tank's capacity, a batch's volume) is not a result worth showing.
  const echoes = (name: string, value: number) => {
    const by = contract.parameters.filter((p) => (engineMovers[p.name] ?? []).includes(name));
    return by.length === 1 && Math.abs(value - by[0]!.value) <= 1e-9 * Math.max(1, Math.abs(value));
  };
  const engine: ResultDef[] = evaluation.error
    ? []
    : engineResults(evaluation).filter((e) => !echoes(e.name, e.value)).map((e) => ({ name: e.name, label: e.label, unit: e.unit, expr: '', description: 'What the engine runs the unit at.' }));
  return { defs: [...engine, ...contract.derived], values: evaluation.error ? {} : resultsOf(evaluation) };
}

/** The results a setting moves: through the contract's equations, and through the engine's figures. */
const movedBy = (props: Pick<SpecSheetProps, 'influence' | 'engineMovers'>, param: string) => [...(props.influence.derived[param] ?? []), ...(props.engineMovers[param] ?? [])];

/** Enter commits a typed value and moves to the next specification, as in a spreadsheet; Shift+Enter moves back. */
function nextOnEnter(e: React.KeyboardEvent<HTMLTableElement>) {
  const el = e.target as HTMLElement;
  if (e.key !== 'Enter' || el.tagName !== 'INPUT' || !el.closest('[data-spec-value]')) return;
  const fields = [...e.currentTarget.querySelectorAll<HTMLInputElement>('[data-spec-value] input')];
  const next = fields[fields.indexOf(el as HTMLInputElement) + (e.shiftKey ? -1 : 1)];
  // After the field has committed its value.
  if (next) setTimeout(() => next.focus(), 0);
}

/** A share between 0 and 1 reads as a percentage unless the engineer has chosen otherwise. */
const paramUnit = (unitFor: SpecSheetProps['unitFor'], p: UnitOpParameter) => {
  const choices = displayUnitsFor(p);
  const fraction = p.unit === '-' && choices.includes('%') && p.min !== undefined && p.min >= 0 && p.max !== undefined && p.max <= 1;
  return unitFor(p.unit, choices, fraction ? '%' : undefined);
};

export const SpecSheet: React.FC<SpecSheetProps> = (props) => {
  const { contract, evaluation, groups, baselineDerived, unitFor, setUnit } = props;
  const { palette, font } = useTheme();
  const [solveFor, setSolveFor] = useState<string | null>(null);
  const solverRef = useRef<HTMLDivElement>(null);
  const hidden: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // The settings that move each result and can be varied continuously: what the solver may turn.
  const moversOf = (result: string) =>
    contract.parameters.filter((p) => {
      const k = controlFor(p);
      return k !== 'fixed' && k !== 'toggle' && k !== 'select' && movedBy(props, p.name).includes(result);
    });
  const { defs, values } = useMemo(() => allResults(contract, evaluation, props.engineMovers), [contract, evaluation, props.engineMovers]);
  // Each result once: one that is a setting, the feed or a result above it again in other units is left out.
  const derivedRows = useMemo(
    () =>
      distinctResults(
        defs.filter((d) => values[d.name] !== undefined).map((d) => ({ ...d, value: values[d.name]! })),
        [...contract.parameters, ...(props.feed?.params ?? [])]
      ),
    [defs, values, contract.parameters, props.feed?.params]
  );
  // The engine's own figures lead the panel, large, above the inputs: the list here is the rest.
  const listedRows = derivedRows.filter((d) => !isEngineResult(d.name));
  const [toolsOpen, setToolsOpen] = useState(false);
  // Settings worth stepping: continuous ones that move at least one result.
  const studyable = contract.parameters.filter((p) => {
    const k = controlFor(p);
    return k !== 'fixed' && k !== 'toggle' && k !== 'select' && movedBy(props, p.name).length > 0;
  });
  const specifiable = derivedRows.filter((d) => Number.isFinite(values[d.name]!) && moversOf(d.name).length > 0);
  const specify = (name: string) => {
    setToolsOpen(true);
    setSolveFor(name);
    requestAnimationFrame(() => solverRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  // A folded group opens by itself when something in it needs the engineer: a failing value, a fix, a jump to it.
  const needsEye = (p: UnitOpParameter) => {
    if (props.fixes?.[p.name] || props.flash === p.name) return true;
    const sw = props.sweeps[p.name];
    const st = sw?.points.length ? statusAt(sw, p.value) : undefined;
    return st === 'error' || st === 'warning' || (p.min !== undefined && p.value < p.min) || (p.max !== undefined && p.value > p.max);
  };

  // The sheet as a table for a datasheet or a review: every specification, the feed, and what the engine calculates, in the shown units.
  const [sheetCopied, setSheetCopied] = useState(false);
  const copySheet = async () => {
    const line = (section: string, name: string, v: number, unit: string, du: string, difference: boolean) => {
      const shown = convertUnit(v, unit, du, { difference }) ?? v;
      return [section, name, String(Number(shown.toPrecision(6))), du === '-' ? '' : du].join('\t');
    };
    const lines = ['Section\tItem\tValue\tUnit'];
    for (const g of groups) for (const p of g.params) lines.push(line(`Input: ${g.name}`, p.label, p.value, p.unit, paramUnit(unitFor, p), isTemperatureDifference(p)));
    for (const p of props.feed?.params ?? []) lines.push(line('Feed at the design point', p.label, p.value, p.unit, paramUnit(unitFor, p), isTemperatureDifference(p)));
    for (const d of defs) {
      const v = values[d.name];
      if (v === undefined || !Number.isFinite(v)) continue;
      const du = unitFor(d.unit, displayUnitsFor({ name: d.name, label: d.label, unit: d.unit, value: 0 }));
      lines.push(line('Result', d.label ?? d.name, v, d.unit, du, isTemperatureDifference(d)));
    }
    try {
      await navigator.clipboard.writeText(`${contract.name}\n${lines.join('\n')}`);
      setSheetCopied(true);
      setTimeout(() => setSheetCopied(false), 1500);
    } catch {
      // Clipboard refused: the button simply does not change.
    }
  };

  const inputCols = (
    <colgroup>
      <col />
      <col style={{ width: 200 }} />
      <col style={{ width: 32 }} />
    </colgroup>
  );
  const disclose = (shown: boolean, text: React.ReactNode, onClick: () => void, title?: string) => (
    <button type="button" className="pf-disclose" aria-expanded={shown} onClick={onClick} title={title}>
      <ChevronRight size={13} style={{ transform: shown ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' }} aria-hidden />
      {text}
    </button>
  );

  const tools = (specifiable.length > 0 || (studyable.length > 0 && derivedRows.length > 0)) && (
    <div style={{ marginTop: 14 }}>
      {disclose(toolsOpen || props.holds.length > 0, 'Solve for a target, or run a sensitivity study', () => setToolsOpen((o) => !o))}
      {(toolsOpen || props.holds.length > 0) && (
        <>
          {specifiable.length > 0 && (
            <div ref={solverRef}>
              <TargetSolver {...props} results={specifiable} moversOf={moversOf} picked={solveFor} onPick={setSolveFor} radius={8} />
            </div>
          )}
          {studyable.length > 0 && derivedRows.length > 0 && <CaseStudy {...props} settings={studyable} radius={8} />}
        </>
      )}
    </div>
  );

  const results = (
    <>
      {listedRows.length > 0 && (
        <table className="pf-spec">
          <caption style={hidden}>Results</caption>
          <colgroup>
            <col />
            <col style={{ width: 112 }} />
            <col style={{ width: 76 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 32 }} />
          </colgroup>
          <thead style={hidden}>
            <tr>
              <th scope="col">Result</th>
              <th scope="col">Value</th>
              <th scope="col">Unit</th>
              <th scope="col">Change since opened</th>
              <th scope="col">Solve for it</th>
            </tr>
          </thead>
          <tbody>
            {listedRows.map((d) => {
              const v = values[d.name]!;
              const choices = displayUnitsFor({ name: d.name, label: d.label, unit: d.unit, value: 0 });
              // A share between 0 and 1 reads as a percentage, as an input does.
              const du = unitFor(d.unit, choices, d.unit === '-' && v >= 0 && v <= 1 && choices.includes('%') ? '%' : undefined);
              const difference = isTemperatureDifference(d);
              const shown = convertUnit(v, d.unit, du, { difference }) ?? v;
              const before = baselineDerived[d.name];
              const moved = before !== undefined && Number.isFinite(before) && Math.abs(v - before) > 1e-9 * Math.max(1, Math.abs(before));
              const pct = moved && before ? ((v - before) / Math.abs(before)) * 100 : 0;
              const td: React.CSSProperties = { padding: '8px 0' };
              const up = moved && v > before!;
              return (
                <tr key={d.name} style={{ backgroundColor: props.lit(`d:${d.name}`) ? tint(palette.jade[500], 0.08) : 'transparent', transition: 'background-color 200ms ease' }}>
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 400, color: palette.text.secondary, paddingRight: 12 }} title={d.description}>
                    {d.label ?? d.name}
                  </th>
                  <td style={{ ...td, textAlign: 'right', fontFamily: font.mono, fontWeight: 500, color: palette.text.primary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatQuantity(shown)}</td>
                  <td style={{ ...td, paddingLeft: 8 }}>
                    <UnitCell label={d.label ?? d.name} unit={d.unit} shown={du} choices={choices} onPick={(u) => setUnit(d.unit, u)} />
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {moved && (
                      <span
                        title={`When you opened it: ${formatQuantity(convertUnit(before!, d.unit, du, { difference }) ?? before!)}${du !== '-' ? ` ${du}` : ''}`}
                        style={{ fontFamily: font.mono, fontSize: 11, color: up ? palette.jade[400] : palette.text.gold, fontVariantNumeric: 'tabular-nums' }}
                      >
                        {up ? '+' : '−'}
                        {Number.isFinite(pct) && before ? `${Math.abs(pct) < 10 ? Math.abs(pct).toFixed(1) : Math.round(Math.abs(pct))}%` : ''}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, padding: '3px 0 3px 4px' }}>
                    {specifiable.includes(d) && (
                      <span className="pf-row-tool" data-on={solveFor === d.name && toolsOpen ? '' : undefined}>
                        <Button iconOnly label={`Solve for a ${d.label ?? d.name}`} size="sm" variant="ghost" icon={<Crosshair size={13} />} onClick={() => specify(d.name)} />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {tools}
    </>
  );
  const copyButton = (
    <Button size="sm" variant="ghost" icon={sheetCopied ? <Check size={13} /> : <Copy size={13} />} onClick={copySheet} title="Copy every input and result as a table, for a datasheet or a spreadsheet">
      {sheetCopied ? 'Copied' : 'Copy'}
    </Button>
  );

  return (
    <div>
      {contract.parameters.length > 0 && (
        <table className="pf-spec" onKeyDown={nextOnEnter}>
          <caption style={hidden}>Inputs</caption>
          {inputCols}
          <thead style={hidden}>
            <tr>
              <th scope="col">Input</th>
              <th scope="col">Value and unit</th>
              <th scope="col">Put back</th>
            </tr>
          </thead>
          {groups.map((g) => {
            const shown = !g.folded || open[g.name] || g.params.some(needsEye);
            return (
              <tbody key={g.name}>
                {(groups.length > 1 || g.folded) && (
                  <tr>
                    <th scope="colgroup" colSpan={3} className="pf-spec-group" style={g.folded ? { borderBottom: shown ? undefined : 'none' } : undefined}>
                      {g.folded ? disclose(Boolean(shown), `${g.name} (${g.params.length})`, () => setOpen((o) => ({ ...o, [g.name]: !shown }))) : g.name}
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
                <th scope="colgroup" colSpan={3} className="pf-spec-group" style={props.feed.fromLine && !open.__feed ? { borderBottom: 'none' } : undefined}>
                  {props.feed.fromLine
                    ? disclose(
                        Boolean(open.__feed),
                        'Design feed (the line supplies it)',
                        () => setOpen((o) => ({ ...o, __feed: !o.__feed })),
                        'The pipe in brings the real feed. These figures are only used to check the design before the line runs.'
                      )
                    : 'Feed at the design point'}
                </th>
              </tr>
              {(!props.feed.fromLine || open.__feed) &&
                props.feed.params.map((p) => <SpecRow key={p.name} p={p} {...props} sweeps={{}} fixes={{}} baselineParams={props.feed!.baseline} setParam={props.feed!.onChange} />)}
            </tbody>
          )}
        </table>
      )}

      {props.resultsSection
        ? listedRows.length > 0 || tools
          ? props.resultsSection(results, copyButton)
          : null
        : results}
    </div>
  );
};

const isEngineResult = (name: string) => name.startsWith('engine.');

/** One input: its name (drag it to scrub), the value with its unit, and what the engine says about the value when that matters. */
const SpecRow: React.FC<SpecSheetProps & { p: UnitOpParameter }> = ({ p, sweeps, baselineParams, unitFor, setUnit, setParam, lit, onHoverParam, flash, onFlash, holds, contract, evaluation, engineMovers, fixes, checkName }) => {
  const { palette, font } = useTheme();
  const kind = controlFor(p);
  const choices = displayUnitsFor(p);
  const du = paramUnit(unitFor, p);
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

  const commit = (v: number) => {
    const x = p.integer || kind === 'stepper' ? Math.round(v) : v;
    if (Number.isFinite(x)) setParam(p.name, x);
  };
  const td: React.CSSProperties = { padding: '7px 0' };
  const unitText = du !== '-' ? ` ${du}` : '';
  const allowed = p.min !== undefined || p.max !== undefined ? `${p.min !== undefined ? formatQuantity(toShown(p.min)) : '…'} to ${p.max !== undefined ? formatQuantity(toShown(p.max)) : '…'}${unitText}` : '';

  const heldBy = holds.find((h) => h.vary === p.name);
  const scrubbable = !heldBy && (kind === 'number' || kind === 'stepper');
  const fromShown = (v: number) => convertUnit(v, du, p.unit, { difference }) ?? v;
  const shownStep = Math.abs(convertUnit(stepFor(p), p.unit, du, { difference: true }) ?? stepFor(p));
  // Converted bounds can swap order (a unit with an offset never does, but a reciprocal one would).
  const shownBounds = [p.min, p.max].map((b) => (b === undefined ? undefined : toShown(b)));
  const shownMin = shownBounds[0] !== undefined && shownBounds[1] !== undefined ? Math.min(shownBounds[0], shownBounds[1]) : shownBounds[0];
  const shownMax = shownBounds[0] !== undefined && shownBounds[1] !== undefined ? Math.max(shownBounds[0], shownBounds[1]) : shownBounds[1];
  const heldFor = heldBy ? allResults(contract, evaluation, engineMovers).defs.find((d) => d.name === heldBy.result) : undefined;

  // Where the design passes along this input, in words: "17.4 to 40 gal/min", "up to 241", "from 11.6".
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  const pr = band?.passing;
  const fromBottom = Boolean(pr && sweep && (near(pr.from, sweep.range.from) || (pr.from >= 0 && pr.from <= 1e-3 * Math.abs(pr.to))));
  const toTop = Boolean(pr && sweep && near(pr.to, sweep.range.to));
  const passText = pr ? (fromBottom && toTop ? '' : fromBottom ? `up to ${formatQuantity(toShown(pr.to))}${unitText}` : toTop ? `from ${formatQuantity(toShown(pr.from))}${unitText}` : `${formatQuantity(toShown(pr.from))} to ${formatQuantity(toShown(pr.to))}${unitText}`) : '';
  // Close to an edge of the passing band: worth knowing before the next nudge crosses it.
  const tight = Boolean(
    pr && sweep && here === 'ok' && passText &&
      [!fromBottom ? pr.from : undefined, !toTop ? pr.to : undefined].some((edge) => edge !== undefined && Math.abs(fractionOf(sweep.range, p.value) - fractionOf(sweep.range, edge)) < 0.02)
  );
  const fix = fixes?.[p.name];

  // What, if anything, to say under the name. Nothing when the value is fine: a quiet row is a good row.
  let note: { tone: 'fail' | 'warn' | 'muted'; body: React.ReactNode } | null = null;
  if (heldBy) {
    note = { tone: 'muted', body: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={11} aria-hidden /> Solved to hold {heldFor?.label ?? heldBy.result} at its target</span> };
  } else if (out) {
    note = { tone: 'fail', body: <>Outside what this input allows: {allowed}</> };
  } else if (here === 'error' || here === 'warning') {
    note = {
      tone: here === 'error' ? 'fail' : 'warn',
      body: <>{here === 'error' ? 'A check fails at this value' : 'A check warns at this value'}{pr ? `; it passes ${passText || 'across the range'}` : ', and no value of this input alone clears it'}</>
    };
  } else if (tight) {
    note = { tone: 'muted', body: <>Near the edge: passes {passText}</> };
  }
  const fixButton = fix && (
    <button
      type="button"
      className="pf-spec-fix"
      onClick={() => {
        setParam(p.name, fix.value);
        onFlash(p.name);
      }}
      title={`Clears ${fix.fixes.map((id) => checkName?.(id) ?? id).join(', ')}${fix.allPass ? '; then every check passes' : fix.allErrorsPass ? '; then nothing fails' : ''}`}
    >
      Use {formatQuantity(toShown(fix.value))}{unitText}
    </button>
  );
  const fieldState = out || here === 'error' ? 'fail' : here === 'warning' ? 'warn' : changed ? 'changed' : undefined;
  const tooltip = [p.description, allowed && `Allowed ${allowed}`, passText && here === 'ok' && `Passes ${passText}`].filter(Boolean).join('\n') || undefined;

  let value: React.ReactNode;
  if (heldBy) {
    value = (
      <span className="pf-field" title={`Varied to hold ${heldFor?.label ?? heldBy.result} at its target. Release the hold under Solve for a target to set it by hand.`} style={{ borderStyle: 'dashed', background: 'transparent' }}>
        <span aria-label={`${p.label}, held by the solver`} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', fontFamily: font.mono, fontSize: 13, color: palette.text.secondary }}>
          {formatQuantity(toShown(p.value))}
        </span>
        <UnitCell label={p.label} unit={p.unit} shown={du} choices={[]} onPick={() => undefined} suffix />
      </span>
    );
  } else if (kind === 'fixed') {
    value = (
      <span style={{ display: 'block', textAlign: 'right', paddingRight: 9, fontFamily: font.mono, color: palette.text.secondary }} title="Fixed by the design">
        {formatQuantity(toShown(p.value))}
        <span style={{ fontFamily: 'inherit', fontSize: 12, color: palette.text.muted }}>{unitText}</span>
      </span>
    );
  } else if (kind === 'toggle') {
    value = (
      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Switch checked={p.value >= 0.5} onCheckedChange={(on) => commit(on ? (p.max ?? 1) : (p.min ?? 0))} label={p.label} />
      </span>
    );
  } else if (kind === 'select' && p.options?.length) {
    const known = p.options.some((o) => o.value === p.value);
    value = (
      <select className="pf-select" aria-label={p.label} value={known ? String(p.value) : 'custom'} onChange={(e) => e.target.value !== 'custom' && commit(Number(e.target.value))} style={{ height: 30, width: '100%' }}>
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
      <span className="pf-field" data-state={fieldState} title={tooltip}>
        <QuantityText value={p.value} unit={p.unit} displayUnit={du} difference={difference} label={p.label} onCommit={commit} width="100%" step={stepFor(p)} />
        <UnitCell label={p.label} unit={p.unit} shown={du} choices={choices} onPick={(u) => setUnit(p.unit, u)} suffix />
      </span>
    );
  }

  return (
    <tr
      ref={rowRef}
      onMouseEnter={() => onHoverParam(p.name)}
      onMouseLeave={() => onHoverParam(null)}
      style={{ backgroundColor: flashing ? tint(palette.jade[500], 0.16) : lit(`p:${p.name}`) ? tint(palette.jade[500], 0.08) : 'transparent', transition: 'background-color 300ms ease' }}
    >
      <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 400, color: palette.text.primary, paddingRight: 14 }} title={tooltip}>
        {scrubbable ? (
          // Drag the name left or right to run the value through its range, the way a CAD inspector does; the field still takes typing.
          <NumberField.Root
            value={toShown(p.value)}
            step={shownStep}
            snapOnStep={kind === 'stepper'}
            {...(shownMin !== undefined ? { min: shownMin } : {})}
            {...(shownMax !== undefined ? { max: shownMax } : {})}
            onValueChange={(v) => v !== null && commit(fromShown(v))}
            render={<span />}
          >
            <NumberField.ScrubArea className="pf-scrub" pixelSensitivity={3} title={`Drag to change ${p.label}${p.description ? `. ${p.description}` : ''}`}>
              {p.label}
              <NumberField.ScrubAreaCursor className="pf-scrub-cursor">
                <MoveHorizontal size={16} />
              </NumberField.ScrubAreaCursor>
            </NumberField.ScrubArea>
            {/* The scrub area drives the root through its input; the visible field is the unit-aware one in the next cell. */}
            <NumberField.Input hidden tabIndex={-1} aria-hidden />
          </NumberField.Root>
        ) : (
          p.label
        )}
        {(note || fixButton) && (
          <div className="pf-spec-note" data-tone={note?.tone ?? 'muted'}>
            {note && <span>{note.body}</span>}
            {fixButton}
          </div>
        )}
      </th>
      <td data-spec-value style={td}>{value}</td>
      <td style={{ ...td, padding: '3px 0 3px 4px' }}>
        {changed && (
          <Button iconOnly size="sm" variant="ghost" label={`Put ${p.label} back to ${formatQuantity(toShown(base!))}${unitText}`} icon={<RotateCcw size={12} />} onClick={() => setParam(p.name, base!)} />
        )}
      </td>
    </tr>
  );
};

/** The unit a value is shown in: a picker when the quantity has others, else the unit as text. As a suffix it sits inside the value's field. */
const UnitCell: React.FC<{ label: string; unit: string; shown: string; choices: string[]; onPick: (u: string) => void; suffix?: boolean }> = ({ label, unit, shown, choices, onPick, suffix }) => {
  const { palette } = useTheme();
  const text = shown && shown !== '-' ? shown : unit && unit !== '-' ? unit : '';
  if (choices.length > 1)
    return (
      // Reads as the unit, not a control: click it for the others (the US/SI switch above sets them all).
      <select
        className={suffix ? 'pf-field-unit pf-focus' : 'pf-focus'}
        aria-label={`${label} unit`}
        title="Show in another unit"
        value={shown}
        onChange={(e) => onPick(e.target.value)}
        style={suffix ? undefined : { appearance: 'none', WebkitAppearance: 'none', border: 'none', background: 'transparent', color: palette.text.muted, fontSize: 12, padding: '2px 0', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        {choices.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    );
  if (suffix) return text ? <span className="pf-field-unit">{text}</span> : null;
  return <span style={{ fontSize: 12, color: palette.text.muted }}>{text}</span>;
};

/**
 * Specify a result and let the engine find the setting: "make the air-to-cloth
 * ratio 2 ft/min by varying the filter area". Solved on the contract itself,
 * by bisection where the result crosses the target; applied only when asked.
 */
const TargetSolver: React.FC<
  SpecSheetProps & { results: ResultDef[]; moversOf: (result: string) => UnitOpParameter[]; picked: string | null; onPick: (name: string) => void; radius: number }
> = ({ contract, evaluation, engineMovers, unitFor, setParam, onFlash, results, moversOf, picked, onPick, radius, holds, onHold, onRelease }) => {
  const { palette, font } = useTheme();
  const [asked, setAsked] = useState<number | null>(null);
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

  const now = resultsOf(evaluation)[result.name]!;
  const solve = () => {
    if (!varied) return;
    const t = parseQuantity(target.trim() || formatQuantity(toShown(now)).replace(/,/g, ''), result.unit, du, { difference });
    if (t === null) {
      setBad(true);
      return;
    }
    setAsked(t);
    setSolution(solveForTarget(contract, result.name, t, varied.name));
  };

  const vdu = varied ? paramUnit(unitFor, varied) : '';
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
      {holds.length > 0 && (
        <ul aria-label="Held results" style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'grid', gap: 4 }}>
          {holds.map((h) => {
            const all = allResults(contract, evaluation, engineMovers);
            const d = all.defs.find((x) => x.name === h.result);
            const v = contract.parameters.find((x) => x.name === h.vary);
            const hu = d ? unitFor(d.unit, displayUnitsFor({ name: d.name, label: d.label, unit: d.unit, value: 0 })) : '';
            const show = (x: number) => (d ? convertUnit(x, d.unit, hu, { difference: isTemperatureDifference(d) }) ?? x : x);
            const now = all.values[h.result];
            const off = now === undefined || Math.abs(now - h.target) > 1e-6 * Math.max(1, Math.abs(h.target));
            return (
              <li key={h.vary} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: palette.text.primary, padding: '4px 8px', borderRadius: 4, background: tint(palette.jade[500], 0.08) }}>
                <Lock size={12} aria-hidden color={palette.jade[500]} />
                <span style={{ flex: 1 }}>
                  Holding <b>{d?.label ?? h.result}</b> at{' '}
                  <span style={{ fontFamily: font.mono }}>
                    {formatQuantity(show(h.target))} {hu !== '-' ? hu : ''}
                  </span>{' '}
                  by varying <b>{v?.label ?? h.vary}</b>
                  {off && now !== undefined && (
                    <span style={{ color: palette.status.failed }}>
                      {' '}
                      · out of reach, now {formatQuantity(show(now))}
                    </span>
                  )}
                </span>
                <Button size="sm" variant="ghost" onClick={() => onRelease(h.vary)} aria-label={`Release the hold on ${d?.label ?? h.result}`}>
                  Release
                </Button>
              </li>
            );
          })}
        </ul>
      )}
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
          {solution.reached && asked !== null && (
            <Button
              size="sm"
              icon={<Lock size={12} />}
              onClick={() => {
                onHold({ result: result.name, target: asked, vary: varied.name });
                onFlash(varied.name);
                setSolution(null);
              }}
            >
              Apply and hold
            </Button>
          )}
        </div>
      )}
    </section>
  );
};

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };

/**
 * A sensitivity study: one setting stepped across a range, the chosen results
 * tabulated against it with the verdict at each step. Any row can be taken.
 */
const CaseStudy: React.FC<SpecSheetProps & { settings: UnitOpParameter[]; radius: number }> = ({ contract, evaluation, influence, engineMovers, unitFor, setParam, onFlash, settings, radius }) => {
  const { palette, font } = useTheme();
  const [name, setName] = useState(settings[0]!.name);
  const p = settings.find((x) => x.name === name) ?? settings[0]!;
  const du = paramUnit(unitFor, p);
  const difference = isTemperatureDifference(p);
  const toShown = (v: number) => convertUnit(v, p.unit, du, { difference }) ?? v;
  // Around where it is now (half to one and a half times), inside its bounds; its whole range when it is zero.
  const range = useMemo(() => {
    const whole = sweepRange(p);
    if (!p.value) return whole;
    const lo = Math.min(p.value * 0.5, p.value * 1.5);
    const hi = Math.max(p.value * 0.5, p.value * 1.5);
    return { from: Math.max(p.min ?? -Infinity, lo), to: Math.min(p.max ?? Infinity, hi), log: false };
  }, [p]);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [steps, setSteps] = useState(5);
  const moved = useMemo(() => {
    const by = movedBy({ influence, engineMovers }, p.name);
    return allResults(contract, evaluation, engineMovers).defs.filter((d) => by.includes(d.name));
  }, [contract, evaluation, influence, engineMovers, p.name]);
  const [cols, setCols] = useState<string[]>(() => moved.slice(0, 3).map((d) => d.name));
  // A new setting: its own range, and the first results it moves.
  const shownFor = useRef(p.name);
  useEffect(() => {
    if (shownFor.current === p.name) return;
    shownFor.current = p.name;
    setFromText('');
    setToText('');
    setCols(moved.slice(0, 3).map((d) => d.name));
  }, [p.name, moved]);

  const parse = (t: string, fallback: number) => (t.trim() ? parseQuantity(t, p.unit, du, { difference }) : fallback);
  const from = parse(fromText, range.from);
  const to = parse(toText, range.to);
  const log = range.log && !fromText.trim() && !toText.trim();
  const rows = useMemo(() => (from !== null && to !== null && from !== to ? caseStudy(contract, p.name, from, to, steps, { log }) : []), [contract, p.name, from, to, steps, log]);
  const shownCols = moved.filter((d) => cols.includes(d.name));
  // The table as tab-separated text, headers with units, values in shown units: it pastes into a spreadsheet.
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const unitTag = (u: string) => (u !== '-' ? ` (${u})` : '');
    const head = [`${p.label}${unitTag(du)}`, ...shownCols.map((d) => `${d.label ?? d.name}${unitTag(unitOf(d))}`), 'Checks'];
    const body = rows.map((row) => [
      String(Number(toShown(row.value).toPrecision(6))),
      ...shownCols.map((d) => {
        const v = row.derived[d.name];
        return v === undefined ? '' : String(Number((convertUnit(v, d.unit, unitOf(d), { difference: isTemperatureDifference(d) }) ?? v).toPrecision(6)));
      }),
      row.status === 'ok' ? 'pass' : row.status === 'warning' ? 'warn' : row.status === 'error' ? 'fail' : 'invalid'
    ]);
    try {
      await navigator.clipboard.writeText([head, ...body].map((r) => r.join('\t')).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused: the button simply does not change.
    }
  };
  // The plot: one result against the setting, sampled finely over the same range.
  const [plotName, setPlotName] = useState<string | null>(null);
  const plotted = shownCols.find((d) => d.name === plotName) ?? shownCols[0];
  const curve = useMemo(() => (plotted && from !== null && to !== null && from !== to ? caseStudy(contract, p.name, from, to, 61, { log }) : []), [plotted, contract, p.name, from, to, log]);
  const unitOf = (d: ResultDef) => unitFor(d.unit, displayUnitsFor({ name: d.name, label: d.label, unit: d.unit, value: 0 }));
  const statusColor = (st: string) => (st === 'ok' ? palette.jade[500] : st === 'warning' ? palette.status.blocked : st === 'error' ? palette.status.failed : palette.text.muted);
  const label: React.CSSProperties = { fontSize: 12, color: palette.text.secondary };
  const cell: React.CSSProperties = {
    padding: '4px 8px',
    borderBottom: `1px solid ${palette.border.subtle}`,
    textAlign: 'right',
    fontFamily: font.mono,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap'
  };
  const head: React.CSSProperties = {
    ...cell,
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 700,
    color: palette.text.muted,
    borderBottom: `1px solid ${palette.border.default}`,
    whiteSpace: 'normal',
    verticalAlign: 'bottom'
  };
  const rangeInput = (v: string, set: (s: string) => void, placeholder: number, which: string) => (
    <input
      className="pf-input"
      aria-label={`${which} ${p.label}${du !== '-' ? ` in ${du}` : ''}`}
      aria-invalid={parse(v, 0) === null}
      inputMode="decimal"
      value={v}
      placeholder={formatQuantity(niceValue(toShown(placeholder)))}
      onChange={(e) => set(e.target.value)}
      style={{ width: 84, height: 30, fontFamily: font.mono, textAlign: 'right' }}
    />
  );

  return (
    <section
      aria-label="Sensitivity study"
      style={{ marginTop: 12, padding: '12px 12px 10px', borderRadius: radius, border: `1px solid ${palette.border.default}`, background: palette.background.surfaceElevated }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: palette.text.muted }}>Sensitivity study</span>
        {rows.length > 0 && (
          <Button size="sm" variant="ghost" icon={copied ? <Check size={13} /> : <Copy size={13} />} onClick={copy}>
            {copied ? 'Copied' : 'Copy table'}
          </Button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={label}>Vary</span>
        <select className="pf-select" aria-label="Setting to step" value={p.name} onChange={(e) => setName(e.target.value)} style={{ width: 'auto', minWidth: 150, height: 30 }}>
          {settings.map((x) => (
            <option key={x.name} value={x.name}>
              {x.label}
            </option>
          ))}
        </select>
        <span style={label}>from</span>
        {rangeInput(fromText, setFromText, range.from, 'From')}
        <span style={label}>to</span>
        {rangeInput(toText, setToText, range.to, 'To')}
        <span style={{ ...label, color: palette.text.muted }}>{du !== '-' ? du : ''}</span>
        <span style={label}>in</span>
        <select className="pf-select" aria-label="Steps" value={steps} onChange={(e) => setSteps(Number(e.target.value))} style={{ width: 'auto', height: 30 }}>
          {[3, 5, 6, 8, 10, 12, 20].map((n) => (
            <option key={n} value={n}>
              {n} steps
            </option>
          ))}
        </select>
      </div>
      {moved.length > 1 && (
        <div role="group" aria-label="Results to show" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {moved.map((d) => (
            <Chip key={d.name} active={cols.includes(d.name)} onClick={() => setCols((c) => (c.includes(d.name) ? c.filter((x) => x !== d.name) : [...c, d.name]))}>
              {d.label ?? d.name}
            </Chip>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <caption style={srOnly}>{`Results as ${p.label} changes`}</caption>
            <thead>
              <tr>
                <th scope="col" style={{ ...head, textAlign: 'left' }}>
                  {p.label}
                  {du !== '-' ? ` (${du})` : ''}
                </th>
                {shownCols.map((d) => (
                  <th key={d.name} scope="col" style={head}>
                    {d.label ?? d.name}
                    {unitOf(d) !== '-' ? ` (${unitOf(d)})` : ''}
                  </th>
                ))}
                <th scope="col" style={{ ...head, textAlign: 'left' }}>
                  Checks
                </th>
                <th scope="col" style={head}>
                  <span style={srOnly}>Use</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const current = Math.abs(row.value - p.value) <= 1e-9 * Math.max(1, Math.abs(p.value));
                return (
                  <tr key={row.value} style={{ backgroundColor: current ? tint(palette.jade[500], 0.1) : 'transparent' }}>
                    <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: current ? 700 : 500, color: palette.text.primary }}>
                      {formatQuantity(toShown(row.value))}
                    </th>
                    {shownCols.map((d) => {
                      const v = row.derived[d.name];
                      return (
                        <td key={d.name} style={{ ...cell, color: palette.text.primary }}>
                          {v === undefined ? '—' : formatQuantity(convertUnit(v, d.unit, unitOf(d), { difference: isTemperatureDifference(d) }) ?? v)}
                        </td>
                      );
                    })}
                    <td style={{ ...cell, textAlign: 'left', fontFamily: 'inherit', fontSize: 12 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: palette.text.secondary }}>
                        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor(row.status) }} />
                        {row.status === 'ok' ? 'pass' : row.status === 'warning' ? 'warn' : row.status === 'error' ? `fail (${row.failing.length})` : 'invalid'}
                      </span>
                    </td>
                    <td style={{ ...cell, padding: '2px 4px' }}>
                      {current ? (
                        <span style={{ fontSize: 11, color: palette.text.secondary, fontFamily: 'inherit' }}>now</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Use ${p.label} = ${formatQuantity(toShown(row.value))}${du !== '-' ? ` ${du}` : ''}`}
                          onClick={() => {
                            setParam(p.name, row.value);
                            onFlash(p.name);
                          }}
                        >
                          Use
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {plotted && curve.length > 1 && (
        <div style={{ marginTop: 10 }}>
          {shownCols.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={label}>Plot</span>
              <select className="pf-select" aria-label="Result to plot" value={plotted.name} onChange={(e) => setPlotName(e.target.value)} style={{ width: 'auto', height: 28, fontSize: 12 }}>
                {shownCols.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.label ?? d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <StudyPlot
            rows={curve}
            result={plotted.name}
            current={p.value}
            xLabel={`${p.label}${du !== '-' ? ` (${du})` : ''}`}
            yLabel={`${plotted.label ?? plotted.name}${unitOf(plotted) !== '-' ? ` (${unitOf(plotted)})` : ''}`}
            x={toShown}
            y={(v) => convertUnit(v, plotted.unit, unitOf(plotted), { difference: isTemperatureDifference(plotted) }) ?? v}
            log={log}
          />
        </div>
      )}
    </section>
  );
};

/**
 * A result against the setting it was stepped by: the line coloured by the
 * verdict along it (green passes, amber warns, red fails), the current value
 * marked. Drawn in shown units.
 */
const StudyPlot: React.FC<{
  rows: ReturnType<typeof caseStudy>;
  result: string;
  current: number;
  xLabel: string;
  yLabel: string;
  x: (v: number) => number;
  y: (v: number) => number;
  log: boolean;
}> = ({ rows, result, current, xLabel, yLabel, x, y, log }) => {
  const { palette, font } = useTheme();
  const W = 560;
  const H = 180;
  const pad = { l: 56, r: 12, t: 10, b: 34 };
  const pts = rows.filter((r) => r.derived[result] !== undefined && Number.isFinite(r.derived[result]!)).map((r) => ({ xv: x(r.value), yv: y(r.derived[result]!), raw: r.value, status: r.status }));
  if (pts.length < 2) return null;
  const xs = pts.map((q) => q.xv);
  const ys = pts.map((q) => q.yv);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y1 - y0 < 1e-12 * Math.max(1, Math.abs(y1))) {
    y0 -= Math.abs(y0) * 0.05 || 1;
    y1 += Math.abs(y1) * 0.05 || 1;
  }
  const useLog = log && x0 > 0;
  const fx = (v: number) => (useLog ? (Math.log(v) - Math.log(x0)) / (Math.log(x1) - Math.log(x0)) : (v - x0) / (x1 - x0));
  const px = (v: number) => pad.l + fx(v) * (W - pad.l - pad.r);
  const py = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const color = (st: string) => (st === 'ok' ? palette.jade[500] : st === 'warning' ? palette.status.blocked : st === 'error' ? palette.status.failed : palette.text.muted);
  // Runs of one verdict, each drawn in its colour, joined end to end.
  const runs: { status: string; d: string }[] = [];
  pts.forEach((q, i) => {
    const xy = `${px(q.xv).toFixed(1)},${py(q.yv).toFixed(1)}`;
    const last = runs[runs.length - 1];
    if (last && last.status === q.status) last.d += ` L${xy}`;
    else {
      const prev = pts[i - 1];
      runs.push({ status: q.status, d: prev ? `M${px(prev.xv).toFixed(1)},${py(prev.yv).toFixed(1)} L${xy}` : `M${xy}` });
    }
  });
  const cx = x(current);
  const inRange = cx >= x0 && cx <= x1;
  const tick: React.CSSProperties = { fontFamily: font.mono, fontSize: 10, fill: palette.text.secondary };
  const first = pts[0]!;
  const lastPt = pts[pts.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`${yLabel} against ${xLabel}: from ${formatQuantity(first.yv)} at ${formatQuantity(first.xv)} to ${formatQuantity(lastPt.yv)} at ${formatQuantity(lastPt.xv)}`}
      style={{ display: 'block', maxWidth: W }}
    >
      <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} fill="none" stroke={palette.border.default} />
      {[0, 0.5, 1].map((t) => {
        const v = y0 + (y1 - y0) * t;
        return (
          <g key={t}>
            {t > 0 && t < 1 && <line x1={pad.l} x2={W - pad.r} y1={py(v)} y2={py(v)} stroke={palette.border.subtle} strokeDasharray="3 3" />}
            <text x={pad.l - 6} y={py(v) + 3} textAnchor="end" style={tick}>
              {formatQuantity(v)}
            </text>
          </g>
        );
      })}
      <text x={pad.l} y={H - pad.b + 14} textAnchor="start" style={tick}>
        {formatQuantity(x0)}
      </text>
      <text x={W - pad.r} y={H - pad.b + 14} textAnchor="end" style={tick}>
        {formatQuantity(x1)}
      </text>
      <text x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle" style={{ ...tick, fontFamily: 'inherit', fontSize: 11 }}>
        {xLabel}
      </text>
      <text x={pad.l + 6} y={pad.t + 12} style={{ ...tick, fontFamily: 'inherit', fontSize: 11 }}>
        {yLabel}
      </text>
      {inRange && (
        <g>
          <line x1={px(cx)} x2={px(cx)} y1={pad.t} y2={H - pad.b} stroke={palette.text.secondary} strokeDasharray="2 3" />
          <text x={px(cx)} y={H - pad.b + 14} textAnchor="middle" style={{ ...tick, fill: palette.text.primary, fontWeight: 700 }}>
            now
          </text>
        </g>
      )}
      {runs.map((r, i) => (
        <path key={i} d={r.d} fill="none" stroke={color(r.status)} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
};
