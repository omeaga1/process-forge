import React, { useEffect, useMemo, useRef, useState } from 'react';
import { atFraction, convertUnit, fractionOf, isTemperatureDifference, niceValue, parseQuantity, type Sweep, type SweepPoint, type SweepRange, type UnitOpParameter } from '@process-forge/protocol';
import { Minus, Plus } from 'lucide-react';
import { tint } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import { controlFor, feasibleBand, formatQuantity, statusAt, stepFor, type ParameterControlKind } from '../../model/parameterUi.js';

export interface ParameterControlProps {
  param: UnitOpParameter;
  /** The engine's verdict across the parameter's range, the others held. Absent while it is worked out. */
  sweep?: Sweep;
  /** The unit it is shown in (the engineer's choice); its own unit when absent. */
  displayUnit: string;
  displayUnits: string[];
  onDisplayUnit: (unit: string) => void;
  /** Its value when the panel opened, marked on the track. */
  baseline?: number;
  onChange: (value: number) => void;
  /** Hovered, or a check that it moves is hovered. */
  highlighted?: boolean;
  /** Names of what it changes, for the hint under it. */
  drives?: string[];
  onHover?: (on: boolean) => void;
  flash?: boolean;
}

/**
 * One parameter, edited the way its kind of quantity is: a select for a
 * choice, a switch for yes/no, a stepper for a count, a slider for a bounded
 * value. Every slider shows where on its range the design passes its checks
 * (green), only warns (amber) or fails (red), worked out by the engine with
 * the other parameters where they are; every value can be typed in any unit
 * of the same kind ("3 bar" into a psi field).
 */
export const ParameterControl: React.FC<ParameterControlProps> = ({
  param: p,
  sweep,
  displayUnit,
  displayUnits,
  onDisplayUnit,
  baseline,
  onChange,
  highlighted,
  drives,
  onHover,
  flash
}) => {
  const { palette, font, radius: r } = useTheme();
  const kind: ParameterControlKind = controlFor(p);
  // An approach or a rise converts by size only: 10 °C of approach is 18 °F.
  const difference = isTemperatureDifference(p);
  const toShown = (v: number) => convertUnit(v, p.unit, displayUnit, { difference }) ?? v;
  const out = (p.min !== undefined && p.value < p.min) || (p.max !== undefined && p.value > p.max);
  const band = useMemo(() => (sweep ? feasibleBand(sweep, p.value) : undefined), [sweep, p.value]);
  const statusColor = (s: SweepPoint['status']) =>
    s === 'ok' ? palette.jade[500] : s === 'warning' ? palette.status.blocked : s === 'error' ? palette.status.failed : palette.text.muted;
  const here = sweep?.points.length ? statusAt(sweep, p.value) : undefined;

  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (flash) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [flash]);

  const commit = (v: number) => {
    let x = v;
    if (p.integer || kind === 'stepper') x = Math.round(x);
    if (Number.isFinite(x)) onChange(x);
  };

  const unitPicker =
    displayUnits.length > 1 ? (
      <select
        aria-label={`${p.label} unit`}
        value={displayUnit}
        onChange={(e) => onDisplayUnit(e.target.value)}
        style={{
          height: '100%',
          border: 'none',
          borderLeft: `1px solid ${palette.border.subtle}`,
          background: palette.background.surfaceElevated,
          color: palette.text.secondary,
          fontSize: 12,
          padding: '0 4px',
          cursor: 'pointer'
        }}
      >
        {displayUnits.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    ) : p.unit && !['-', ''].includes(p.unit) ? (
      <span
        style={{
          padding: '0 8px',
          height: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: 12,
          color: palette.text.muted,
          borderLeft: `1px solid ${palette.border.subtle}`,
          backgroundColor: palette.background.surfaceElevated
        }}
      >
        {p.unit}
      </span>
    ) : null;

  const box = (invalid: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    height: 30,
    borderRadius: r.md,
    border: `1px solid ${invalid ? palette.status.failed : palette.border.default}`,
    backgroundColor: palette.background.surface,
    overflow: 'hidden'
  });

  let control: React.ReactNode;
  if (kind === 'fixed') {
    control = (
      <span style={{ fontFamily: font.mono, fontSize: 13, color: palette.text.secondary }}>
        {formatQuantity(toShown(p.value))} {displayUnit !== '-' ? displayUnit : ''}
      </span>
    );
  } else if (kind === 'toggle') {
    const on = p.value >= 0.5;
    control = (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={p.label}
        onClick={() => commit(on ? (p.min ?? 0) : (p.max ?? 1))}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          border: `1px solid ${on ? palette.jade[500] : palette.border.default}`,
          background: on ? tint(palette.jade[500], 0.35) : palette.background.surface,
          position: 'relative',
          cursor: 'pointer',
          padding: 0
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 22 : 2,
            width: 18,
            height: 18,
            borderRadius: 9,
            background: on ? palette.jade[500] : palette.text.muted,
            transition: 'left 120ms ease'
          }}
        />
      </button>
    );
  } else if (kind === 'select' && p.options) {
    const known = p.options.some((o) => o.value === p.value);
    const segmented = p.options.length <= 4 && p.options.every((o) => o.label.length <= 14);
    control = segmented ? (
      <div role="radiogroup" aria-label={p.label} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {p.options.map((o) => {
          const on = o.value === p.value;
          const st = sweep ? statusAt(sweep, o.value) : undefined;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => commit(o.value)}
              title={st && st !== 'ok' ? (st === 'error' ? 'A check fails at this choice' : 'A check warns at this choice') : undefined}
              style={{
                padding: '5px 10px',
                borderRadius: r.md,
                fontSize: 12,
                fontWeight: on ? 700 : 500,
                border: `1px solid ${on ? palette.jade[500] : palette.border.subtle}`,
                borderBottom: st ? `2px solid ${statusColor(st)}` : undefined,
                background: on ? tint(palette.jade[500], 0.15) : 'transparent',
                color: on ? palette.text.primary : palette.text.secondary,
                cursor: 'pointer'
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    ) : (
      <label style={box(false)}>
        <select
          aria-label={p.label}
          value={known ? String(p.value) : 'custom'}
          onChange={(e) => e.target.value !== 'custom' && commit(Number(e.target.value))}
          style={{ height: '100%', border: 'none', background: 'transparent', color: palette.text.primary, fontSize: 13, padding: '0 6px', cursor: 'pointer', minWidth: 120 }}
        >
          {!known && <option value="custom">{formatQuantity(p.value)} (not in the list)</option>}
          {p.options.map((o) => {
            const st = sweep ? statusAt(sweep, o.value) : undefined;
            return (
              <option key={o.label} value={String(o.value)}>
                {o.label}
                {st === 'error' ? '  ✕ fails a check' : st === 'warning' ? '  ⚠ warns' : ''}
              </option>
            );
          })}
        </select>
      </label>
    );
  } else if (kind === 'stepper') {
    const step = stepFor(p);
    const atMin = p.min !== undefined && p.value - step < p.min;
    const atMax = p.max !== undefined && p.value + step > p.max;
    const btn = (disabled: boolean): React.CSSProperties => ({
      width: 28,
      height: '100%',
      border: 'none',
      background: 'transparent',
      color: disabled ? palette.text.muted : palette.text.primary,
      cursor: disabled ? 'default' : 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    });
    control = (
      <span style={box(out)}>
        <button type="button" aria-label={`Fewer ${p.label}`} disabled={atMin} onClick={() => commit(p.value - step)} style={btn(atMin)}>
          <Minus size={13} />
        </button>
        <QuantityText value={p.value} unit={p.unit} displayUnit={displayUnit} difference={difference} label={p.label} onCommit={commit} width={52} step={step} />
        <button type="button" aria-label={`More ${p.label}`} disabled={atMax} onClick={() => commit(p.value + step)} style={btn(atMax)}>
          <Plus size={13} />
        </button>
        {unitPicker}
      </span>
    );
  } else {
    control = (
      <span style={box(out)}>
        <QuantityText value={p.value} unit={p.unit} displayUnit={displayUnit} difference={difference} label={p.label} onCommit={commit} width={92} step={stepFor(p)} />
        {unitPicker}
      </span>
    );
  }

  const showTrack = (kind === 'slider' || kind === 'number' || kind === 'stepper') && sweep && sweep.points.length > 1;
  const range = sweep?.range;
  const stops = band?.segments.map((s) => `${tint(statusColor(s.status), 0.75)} ${(s.from * 100).toFixed(2)}%, ${tint(statusColor(s.status), 0.75)} ${(s.to * 100).toFixed(2)}%`).join(', ');
  const t = range ? fractionOf(range, p.value) : 0;

  return (
    <div
      ref={rowRef}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        alignItems: 'center',
        columnGap: 12,
        rowGap: 6,
        padding: '10px 8px',
        margin: '0 -8px',
        borderRadius: r.md,
        borderBottom: `1px solid ${palette.border.subtle}`,
        backgroundColor: flash ? tint(palette.jade[500], 0.16) : highlighted ? tint(palette.jade[500], 0.06) : 'transparent',
        transition: 'background-color 300ms ease'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
          {here && kind !== 'fixed' && (
            <span
              role="img"
              aria-label={here === 'ok' ? 'every check passes here' : here === 'warning' ? 'a check warns here' : 'a check fails here'}
              title={here === 'ok' ? 'Every check passes at this value' : here === 'warning' ? 'A check warns at this value' : 'A check fails at this value'}
              style={{ width: 7, height: 7, borderRadius: 4, flex: '0 0 auto', backgroundColor: statusColor(here) }}
            />
          )}
          <span>{p.label}</span>
        </div>
        {p.description && <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2 }}>{p.description}</div>}
      </div>
      {control}

      {showTrack && range && (
        <div style={{ gridColumn: '1 / -1', position: 'relative', height: 22 }}>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 7,
              height: 6,
              borderRadius: 3,
              background: stops ? `linear-gradient(to right, ${stops})` : palette.border.subtle,
              opacity: kind === 'slider' ? 1 : 0.7
            }}
          />
          {baseline !== undefined && baseline !== p.value && (
            <div
              aria-hidden="true"
              title={`When you opened it: ${formatQuantity(toShown(baseline))} ${displayUnit}`}
              style={{ position: 'absolute', top: 3, left: `calc(${fractionOf(range, baseline) * 100}% - 1px)`, width: 2, height: 14, background: palette.text.muted, borderRadius: 1 }}
            />
          )}
          {kind === 'slider' ? (
            <input
              type="range"
              className="pf-feasible-range"
              aria-label={`${p.label} slider`}
              min={0}
              max={1000}
              step={1}
              value={Math.round(t * 1000)}
              onChange={(e) => {
                const v = atFraction(range, Number(e.target.value) / 1000);
                commit(snap(v, p));
              }}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, width: '100%', height: 20, margin: 0, background: 'transparent' }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 4,
                left: `calc(${t * 100}% - 6px)`,
                width: 12,
                height: 12,
                borderRadius: 6,
                background: palette.background.surface,
                border: `2px solid ${palette.text.primary}`
              }}
            />
          )}
        </div>
      )}
      {showTrack && range && (
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: -4, fontSize: 11, color: palette.text.muted, fontFamily: font.mono }}>
          <span>{formatQuantity(toShown(range.from))}</span>
          <span style={{ fontFamily: font.sans, textAlign: 'center', color: band?.passing ? palette.text.secondary : palette.status.failed }}>
            {bandCaption(band, (v) => `${formatQuantity(niceValue(toShown(v)))}${displayUnit && displayUnit !== '-' ? ` ${displayUnit}` : ''}`, range)}
          </span>
          <span>{formatQuantity(toShown(range.to))}</span>
        </div>
      )}
      {out && (
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: palette.status.failed }}>
          Outside its range ({p.min !== undefined ? formatQuantity(toShown(p.min)) : '−∞'} to {p.max !== undefined ? formatQuantity(toShown(p.max)) : '∞'} {displayUnit}).
        </div>
      )}
      {highlighted && drives && drives.length > 0 && (
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: palette.text.muted }}>Changes {drives.slice(0, 6).join(', ')}{drives.length > 6 ? `, and ${drives.length - 6} more` : ''}.</div>
      )}
    </div>
  );
};

/** A slider value, tidied: whole for counts, three figures otherwise. */
function snap(v: number, p: UnitOpParameter): number {
  if (p.integer) return Math.round(v);
  const step = p.ui?.step;
  if (step) return Math.round(v / step) * step;
  if (v === 0) return 0;
  const mag = 10 ** (Math.floor(Math.log10(Math.abs(v))) - 2);
  let x = Math.round(v / mag) * mag;
  x = Number(x.toPrecision(12));
  if (p.min !== undefined) x = Math.max(p.min, x);
  if (p.max !== undefined) x = Math.min(p.max, x);
  return x;
}

function bandCaption(band: ReturnType<typeof feasibleBand> | undefined, fmt: (v: number) => string, range: SweepRange): string {
  if (!band) return '';
  const passing = band.passing;
  if (!passing) {
    const anyWarn = band.segments.some((s) => s.status === 'warning');
    return anyWarn ? 'Nowhere in range passes every check on its own' : 'No value in range passes on its own';
  }
  const whole = Math.abs(passing.from - range.from) < 1e-9 && Math.abs(passing.to - range.to) < 1e-9;
  if (whole) return 'Passes across the whole range';
  const span = `${fmt(passing.from)} to ${fmt(passing.to)}`;
  return passing.containsValue ? `Passes from ${span}` : `Fails here: passes from ${span}`;
}

/** A value field that takes a number in the shown unit, or a number with any unit of the same kind. */
const QuantityText: React.FC<{
  value: number;
  unit: string;
  displayUnit: string;
  difference: boolean;
  label: string;
  onCommit: (v: number) => void;
  width: number;
  step: number;
}> = ({ value, unit, displayUnit, difference, label, onCommit, width, step }) => {
  const { palette, font } = useTheme();
  const shown = convertUnit(value, unit, displayUnit, { difference }) ?? value;
  const text = formatQuantity(shown).replace(/,/g, '');
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const apply = (s: string) => {
    const v = parseQuantity(s, unit, displayUnit, { difference });
    if (v === null) {
      setBad(true);
      return;
    }
    setBad(false);
    setDraft(null);
    onCommit(v);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={bad}
      title={bad ? `Type a number, or a number and a unit of the same kind (e.g. "3 bar")` : `Type a value; you can add a unit, e.g. "${formatQuantity(shown)} ${displayUnit}"`}
      value={draft ?? text}
      onChange={(e) => {
        setDraft(e.target.value);
        setBad(false);
      }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => draft !== null && apply(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') apply(draft ?? text);
        else if (e.key === 'Escape') {
          setDraft(null);
          setBad(false);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const k = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
          setDraft(null);
          onCommit(value + k * step);
        }
      }}
      style={{
        width,
        height: '100%',
        border: 'none',
        outline: 'none',
        padding: '0 8px',
        backgroundColor: bad ? tint(palette.status.failed, 0.12) : 'transparent',
        color: palette.text.primary,
        fontFamily: font.mono,
        fontSize: 13,
        textAlign: 'right'
      }}
    />
  );
};

/** Thumb styling for the feasibility sliders: the track is drawn underneath, so the input itself is transparent. */
export const FEASIBLE_RANGE_CSS = `
.pf-feasible-range { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
.pf-feasible-range:focus { outline: none; }
.pf-feasible-range::-webkit-slider-runnable-track { height: 20px; background: transparent; }
.pf-feasible-range::-moz-range-track { height: 20px; background: transparent; }
.pf-feasible-range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: 3px; border-radius: 7px; background: var(--pf-thumb-bg, #fff); border: 2px solid var(--pf-thumb-border, #111); box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.pf-feasible-range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 7px; background: var(--pf-thumb-bg, #fff); border: 2px solid var(--pf-thumb-border, #111); }
.pf-feasible-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--pf-thumb-ring, rgba(45,213,183,.4)); }
`;
