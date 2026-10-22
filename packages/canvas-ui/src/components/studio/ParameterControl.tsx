import { Brief } from '../../ui/Brief.js';
import React, { useState } from 'react';
import { convertUnit, isTemperatureDifference, parseQuantity, type UnitOpParameter } from '@process-forge/protocol';
import { Minus, Plus } from 'lucide-react';
import { tint } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import { controlFor, formatQuantity, stepFor, type ParameterControlKind } from '../../model/parameterUi.js';

export interface ParameterControlProps {
  param: UnitOpParameter;
  /** The unit it is shown in (the engineer's choice); its own unit when absent. */
  displayUnit: string;
  displayUnits: string[];
  onDisplayUnit: (unit: string) => void;
  onChange: (value: number) => void;
}

/**
 * One parameter, edited the way its kind of quantity is: a select for a
 * choice, a switch for yes/no, a stepper for a count, a field for a number.
 * Every value can be typed in any unit of the same kind ("3 bar" into a psi
 * field).
 */
export const ParameterControl: React.FC<ParameterControlProps> = ({
  param: p,
  displayUnit,
  displayUnits,
  onDisplayUnit,
  onChange
}) => {
  const { palette, font, radius: r } = useTheme();
  const kind: ParameterControlKind = controlFor(p);
  // An approach or a rise converts by size only: 10 °C of approach is 18 °F.
  const difference = isTemperatureDifference(p);
  const toShown = (v: number) => convertUnit(v, p.unit, displayUnit, { difference }) ?? v;
  const out = (p.min !== undefined && p.value < p.min) || (p.max !== undefined && p.value > p.max);

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
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => commit(o.value)}
              style={{
                padding: '5px 10px',
                borderRadius: r.md,
                fontSize: 12,
                fontWeight: on ? 700 : 500,
                border: `1px solid ${on ? palette.jade[500] : palette.border.subtle}`,
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
          {p.options.map((o) => (
            <option key={o.label} value={String(o.value)}>
              {o.label}
            </option>
          ))}
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

  return (
    <div
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
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>{p.label}</div>
        {p.description && <Brief text={p.description} lines={1} style={{ fontSize: 12, color: palette.text.muted, marginTop: 2 }} />}
      </div>
      {control}

      {out && (
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: palette.status.failed }}>
          Outside its range ({p.min !== undefined ? formatQuantity(toShown(p.min)) : '−∞'} to {p.max !== undefined ? formatQuantity(toShown(p.max)) : '∞'} {displayUnit}).
        </div>
      )}
    </div>
  );
};

/** A value field that takes a number in the shown unit, or a number with any unit of the same kind. */
export const QuantityText: React.FC<{
  value: number;
  unit: string;
  displayUnit: string;
  difference: boolean;
  label: string;
  onCommit: (v: number) => void;
  width: number | string;
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
        minWidth: 0,
        flex: typeof width === 'string' ? 1 : undefined,
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

