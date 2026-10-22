import { Brief } from '../../ui/Brief.js';
import React from 'react';
import {
  convertUnit,
  formatExpression,
  isTemperatureDifference,
  portPhase,
  type ExprToken,
  type PhysicsAlignment,
  type ProcessNode,
  type UnitOpContract,
  type UnitOpEvaluation
} from '@process-forge/protocol';
import type { NodeTelemetrySnapshot } from '@process-forge/simulation-core';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, AlertTriangle, XCircle, ShieldCheck, CircleDashed } from 'lucide-react';
import { tint } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import { formatQuantity } from '../../model/parameterUi.js';

/**
 * The parts of a unit's spec sheet, each drawn from its contract: the
 * header (what the equipment is and the engine's verdict), its streams (the
 * contract's ports, with their design and live figures), its equations (the
 * derived values as an engineer writes them) and its physics (the archetype
 * it is held to and the governing relations, with their numbers).
 */

export type SectionId = 'settings' | 'results' | 'checks' | 'streams' | 'equations' | 'physics';

/** A quantity's value and unit, for a name in an equation. */
export interface Lookup {
  label: (name: string) => string;
  value: (name: string) => { value: number; unit: string } | undefined;
  /** Click a parameter in an equation: show it. */
  onPick?: (name: string) => void;
  isParameter: (name: string) => boolean;
}

// ------------------------------------------------------------------ header

export const SpecHeader: React.FC<{
  node: ProcessNode;
  contract: UnitOpContract;
  own: boolean;
  alignment?: PhysicsAlignment | undefined;
}> = ({ contract, own, alignment }) => {
  const { palette } = useTheme();
  const archetype = alignment?.archetype;
  // The panel's title bar already shows the drawing and the name: this says what it is.
  return (
    <div style={{ padding: '4px 0 14px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', alignItems: 'center', fontSize: 12, color: palette.text.muted }}>
        <span style={{ color: palette.text.secondary, fontWeight: 600 }}>{archetype ? archetype.name.replace(/ \(.*\)$/, '') : own ? 'Custom unit' : 'Standard unit'}</span>
        <span aria-hidden>·</span>
        <span>{modeName(contract.behavior.mode)}</span>
        {alignment?.decidedBy === 'declared' && (
          <>
            <span aria-hidden>·</span>
            <span title="The contract declares this equipment, so the engine holds it to that physics." style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ShieldCheck size={12} color={palette.jade[500]} /> held to its physics
            </span>
          </>
        )}
      </div>
      {contract.description && (
        <Brief text={contract.description} lines={2} style={{ fontSize: 13, lineHeight: 1.55, color: palette.text.secondary, maxWidth: 640, marginTop: 6 }} mutedColor={palette.text.muted} />
      )}
    </div>
  );
};

function modeName(mode: UnitOpContract['behavior']['mode']): string {
  return mode === 'CONTINUOUS_RATE' ? 'continuous' : mode === 'DISCRETE_CYCLE' ? 'cycle by cycle' : mode === 'BATCH' ? 'batch' : 'storage';
}

// ------------------------------------------------------------------ sections

/**
 * One zone of the inspector: a titled card. The head carries the title, a
 * short state ("all 3 pass", "2 changed") and the zone's own controls; the
 * body is the zone; a foot holds its tools.
 */
export const Card = React.forwardRef<
  HTMLElement,
  { id?: SectionId; title: React.ReactNode; meta?: React.ReactNode; metaTone?: 'fail' | 'warn'; right?: React.ReactNode; foot?: React.ReactNode; children?: React.ReactNode; label?: string }
>(({ id, title, meta, metaTone, right, foot, children, label }, ref) => (
  <section ref={ref} className="pf-card" {...(id ? { id: `unit-${id}`, 'data-section': id } : {})} aria-label={label}>
    <div className="pf-card-head">
      {typeof title === 'string' ? <h3 className="pf-card-title">{title}</h3> : title}
      {meta !== undefined && (
        <span className="pf-card-meta" data-tone={metaTone}>
          {meta}
        </span>
      )}
      {right && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{right}</span>}
    </div>
    {children !== undefined && children !== null && children !== false && <div className="pf-card-body">{children}</div>}
    {foot && <div className="pf-card-foot">{foot}</div>}
  </section>
));
Card.displayName = 'Card';

// ------------------------------------------------------------------ equations

/** An expression, set as an equation: names as labelled chips that show their values. */
export const ExpressionView: React.FC<{ expr: string; lookup: Lookup; compact?: boolean }> = ({ expr, lookup, compact }) => {
  const { palette, font, radius: r } = useTheme();
  const tokens = formatExpression(expr);
  if (!tokens) return <code style={{ fontFamily: font.mono, fontSize: 12 }}>{expr}</code>;
  const render = (ts: ExprToken[], depth = 0): React.ReactNode[] =>
    ts.map((t, i) => {
      const key = `${depth}-${i}`;
      switch (t.t) {
        case 'name': {
          const v = lookup.value(t.name);
          const isParam = lookup.isParameter(t.name);
          return (
            <span
              key={key}
              role={isParam && lookup.onPick ? 'button' : undefined}
              tabIndex={isParam && lookup.onPick ? 0 : undefined}
              onClick={isParam && lookup.onPick ? () => lookup.onPick!(t.name) : undefined}
              onKeyDown={isParam && lookup.onPick ? (e) => e.key === 'Enter' && lookup.onPick!(t.name) : undefined}
              title={`${t.name}${v ? ` = ${formatQuantity(v.value)} ${v.unit}` : ''}${isParam ? ' · click to set it' : ''}`}
              style={{
                display: 'inline-block',
                padding: compact ? '0 2px' : '0 3px',
                margin: '1px 0',
                borderRadius: r.sm,
                fontFamily: font.sans,
                fontSize: compact ? 12 : 13,
                color: isParam ? palette.jade[300] ?? palette.jade[400] : palette.text.primary,
                borderBottom: isParam ? `1px dotted ${tint(palette.jade[500], 0.6)}` : 'none',
                cursor: isParam && lookup.onPick ? 'pointer' : 'default',
                whiteSpace: 'nowrap'
              }}
            >
              {lookup.label(t.name)}
            </span>
          );
        }
        case 'num':
          return (
            <span key={key} style={{ fontFamily: font.mono, color: palette.text.secondary }}>
              {t.text}
            </span>
          );
        case 'op':
          return (
            <span key={key} style={{ color: palette.text.muted, padding: t.unary ? 0 : '0 4px' }}>
              {t.text}
            </span>
          );
        case 'fn':
          return (
            <span key={key} style={{ color: palette.text.secondary, fontStyle: 'italic' }}>
              {t.text}
            </span>
          );
        case 'paren':
          return (
            <span key={key} style={{ color: palette.text.muted }}>
              {t.text}
            </span>
          );
        case 'sep':
          return (
            <span key={key} style={{ color: palette.text.secondary, whiteSpace: 'pre' }}>
              {t.text}
            </span>
          );
        case 'sup':
          return (
            <sup key={key} style={{ fontSize: '0.75em' }}>
              {render(t.tokens, depth + 1)}
            </sup>
          );
      }
    });
  return <span style={{ lineHeight: 1.9 }}>{render(tokens)}</span>;
};

// ------------------------------------------------------------------ streams

const PHASE_WORD: Record<string, string> = { LIQUID: 'liquid', GAS: 'gas', SOLID: 'solids', ITEMS: 'items' };

/** The contract's ports as stream cards: phase, what they carry, the design point and, in a run, what is moving. */
export const StreamsSection: React.FC<{
  contract: UnitOpContract;
  evaluation: UnitOpEvaluation;
  live?: NodeTelemetrySnapshot | undefined;
  unitFor: (unit: string, choices: string[]) => string;
}> = ({ contract, evaluation, live }) => {
  const { palette, font, radius: r } = useTheme();
  const phaseColor = (ph: string) =>
    ph === 'GAS' ? palette.streams.gas : ph === 'SOLID' ? palette.streams.solid : ph === 'ITEMS' ? palette.streams.discreteContainer : palette.streams.continuousFluid;
  const continuousInlets = contract.ports.filter((p) => p.direction === 'INLET' && p.flowDimension === 'CONTINUOUS_FLUID');
  const fig = (label: string, value: string, unit = '') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: palette.text.muted }}>{label}</span>
      <span style={{ fontFamily: font.mono, color: palette.text.primary, fontVariantNumeric: 'tabular-nums' }}>
        {value} <span style={{ color: palette.text.muted }}>{unit}</span>
      </span>
    </div>
  );
  // What arrives at the design point, component by component (kg/s), to work out what leaves by each outlet.
  const feeds = Object.keys(contract.designPorts ?? {}).length ? Object.values(contract.designPorts!) : contract.designInlet ? [contract.designInlet] : [];
  const componentsIn: Record<string, number> = {};
  for (const f of feeds) {
    if (f.massFlowKgPerS === undefined || !f.composition) continue;
    for (const [c, x] of Object.entries(f.composition)) componentsIn[c] = (componentsIn[c] ?? 0) + f.massFlowKgPerS * x;
  }
  const totalIn = feeds.reduce((s, f) => s + (f.massFlowKgPerS ?? 0), 0);
  // A component an outlet does not list goes elsewhere, so long as some outlet accounts for it.
  const accounted = new Set(Object.values(evaluation.outlets).flatMap((o) => Object.keys(o.recovery ?? {})));
  const outletFlow = (plan: UnitOpEvaluation['outlets'][string]): { kgPerS: number; mix?: [string, number][] } | undefined => {
    const comps = Object.keys(componentsIn);
    if (plan.recovery && comps.length && comps.every((c) => accounted.has(c))) {
      const out = comps.map((c) => [c, componentsIn[c]! * (plan.recovery![c] ?? 0)] as [string, number]);
      const kgPerS = out.reduce((s, [, m]) => s + m, 0);
      return { kgPerS, ...(kgPerS > 0 ? { mix: out.filter(([, m]) => m > 0).map(([c, m]) => [c, m / kgPerS] as [string, number]).sort((a, b) => b[1] - a[1]) } : {}) };
    }
    if (plan.share !== undefined && totalIn > 0) return { kgPerS: plan.share * totalIn };
    return undefined;
  };
  // A trace reads as one, not as nothing.
  const mixText = (mix: [string, number][]) => mix.slice(0, 3).map(([c, x]) => `${c} ${x > 0 && x < 0.001 ? '<0.1' : Math.round(x * 1000) / 10}%`).join(', ');

  // Several inlets checked at one mixed design point: say so, once, above the cards.
  const mixedDesign = continuousInlets.length > 1 && contract.designInlet && !Object.keys(contract.designPorts ?? {}).length ? contract.designInlet : undefined;
  return (
    <>
    {mixedDesign && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', fontSize: 12, color: palette.text.muted, margin: '0 0 8px', padding: '6px 10px', borderRadius: r.md, background: palette.background.surface, border: `1px dashed ${palette.border.subtle}` }}>
        <span style={{ fontWeight: 700, color: palette.text.secondary }}>Design point, inlets mixed</span>
        {mixedDesign.temperatureC !== undefined && <span style={{ fontFamily: font.mono }}>{formatQuantity(mixedDesign.temperatureC)} °C</span>}
        {mixedDesign.massFlowKgPerS !== undefined && <span style={{ fontFamily: font.mono }}>{formatQuantity(mixedDesign.massFlowKgPerS * 3600)} kg/h</span>}
        {mixedDesign.composition && (
          <span>
            {Object.entries(mixedDesign.composition)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([c, x]) => `${c} ${Math.round(x * 1000) / 10} %`)
              .join(', ')}
          </span>
        )}
      </div>
    )}
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {contract.ports.map((p) => {
        const phase = portPhase(p);
        const color = phaseColor(phase);
        const inlet = p.direction === 'INLET';
        const design = inlet ? contract.designPorts?.[p.id] ?? (continuousInlets.length === 1 && continuousInlets[0]!.id === p.id ? contract.designInlet : undefined) : undefined;
        const plan = !inlet ? evaluation.outlets[p.id] : undefined;
        const channel = contract.channels?.find((c) => c.inlet === p.id || c.outlet === p.id);
        const now = !inlet ? live?.portFlows?.[p.id] : undefined;
        const dispersed = Object.entries(p.dispersed ?? {});
        const Arrow = inlet ? ArrowDownRight : ArrowUpRight;
        return (
          <div key={`${p.direction}:${p.id}`} style={{ borderTop: `1px solid ${palette.border.subtle}`, padding: '16px 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px 28px' }}>
            <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Arrow size={16} color={palette.text.muted} />
              <span style={{ fontSize: 14, fontWeight: 600, color: palette.text.primary, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span style={{ fontSize: 12, color: palette.text.muted, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
                {PHASE_WORD[phase]}
              </span>
            </div>
            <div style={{ fontSize: 12, color: palette.text.muted, lineHeight: 1.5, paddingLeft: 24 }}>
              {inlet ? 'In' : 'Out'}
              {p.role !== 'MATERIAL' ? ` · ${p.role.toLowerCase()}` : ''}
              {dispersed.length ? ` · carries ${dispersed.map(([c, ph]) => `${c} as ${PHASE_WORD[ph] ?? ph}`).join(', ')}` : ''}
              {p.carries?.length ? ` · ${p.carries.join(', ')}` : ''}
              {channel ? ` · ${inlet ? `leaves by ${channel.outlet}` : `from ${channel.inlet} only`}` : ''}
            </div>
            </div>
            {design && (
              <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
                {design.temperatureC !== undefined && fig('Design T', formatQuantity(design.temperatureC), '°C')}
                {design.massFlowKgPerS !== undefined && fig('Design flow', formatQuantity(design.massFlowKgPerS * 3600), 'kg/h')}
                {design.volumetricFlowGpm !== undefined && phase === 'LIQUID' && fig('', formatQuantity(design.volumetricFlowGpm), 'gal/min')}
                {design.composition && fig('Mix', Object.entries(design.composition).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, x]) => `${c} ${Math.round(x * 1000) / 10}%`).join(', '))}
              </div>
            )}
            {plan &&
              (() => {
                const flow = outletFlow(plan);
                return (
                  <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
                    {flow && fig('Design flow', formatQuantity(flow.kgPerS * 3600), 'kg/h')}
                    {flow?.mix && fig('Mix', mixText(flow.mix))}
                    {plan.share !== undefined && fig('Share', formatQuantity(plan.share * 100), '%')}
                    {plan.temperatureC !== undefined && fig('Leaves at', formatQuantity(plan.temperatureC), '°C')}
                    {plan.recovery &&
                      Object.entries(plan.recovery)
                        .slice(0, 4)
                        .map(([c, x]) => <React.Fragment key={c}>{fig(c, formatQuantity(x * 100), "% recovered")}</React.Fragment>)}
                  </div>
                );
              })()}
            {now && (
              <div style={{ gridColumn: '1 / -1', paddingTop: 10, borderTop: `1px dashed ${palette.border.subtle}`, display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: palette.jade[400] }}>
                  <CircleDashed size={11} /> Live in the run
                </div>
                {fig('Flow', formatQuantity(now.kgPerHour), 'kg/h')}
                {now.acfm !== undefined && fig('', formatQuantity(now.acfm), 'ACFM')}
                {fig('Temperature', formatQuantity(now.temperatureC), '°C')}
              </div>
            )}
          </div>
        );
      })}
    </div>
    </>
  );
};

/** "a pump", "an evaporator". */
const an = (w: string) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;

// ------------------------------------------------------------------ physics

export const PhysicsSection: React.FC<{ alignment: PhysicsAlignment; lookup: Lookup }> = ({ alignment, lookup }) => {
  const { palette, font } = useTheme();
  const row = (ok: boolean | 'warn', text: React.ReactNode, detail?: React.ReactNode, key?: string) => (
    <div key={key} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: `1px solid ${palette.border.subtle}` }}>
      {ok === true ? (
        <CheckCircle2 size={14} color={palette.jade[500]} style={{ flexShrink: 0, marginTop: 1 }} />
      ) : ok === 'warn' ? (
        <AlertTriangle size={14} color={palette.status.blocked} style={{ flexShrink: 0, marginTop: 1 }} />
      ) : (
        <XCircle size={14} color={palette.status.failed} style={{ flexShrink: 0, marginTop: 1 }} />
      )}
      <div style={{ fontSize: 14, lineHeight: 1.5, color: palette.text.primary, minWidth: 0 }}>
        {text}
        {detail && <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2 }}>{detail}</div>}
      </div>
    </div>
  );
  const others = [...alignment.errors, ...alignment.warnings].filter((f) => !f.requirement && f.path !== 'archetype');
  return (
    <div>
      <div style={{ fontSize: 12, color: palette.text.muted, marginBottom: 6 }}>
        {alignment.decidedBy === 'declared'
          ? `Declared ${an(alignment.archetype?.name.toLowerCase() ?? 'unit')}: the engine holds it to that equipment's physics.`
          : alignment.decidedBy === 'inferred'
            ? `Reads as ${an(alignment.archetype?.name.toLowerCase() ?? 'unit')}; the design does not declare it, so these are advice.`
            : alignment.decidedBy === 'custom'
              ? 'Custom equipment: checked for units, mass, phases and energy, not against an archetype.'
              : 'No archetype: checked for units, mass, phases and energy.'}
      </div>
      {alignment.relations.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: palette.text.primary, marginBottom: 4 }}>Governing relations at the design point</div>
          {alignment.relations.map((rel) =>
            row(
              rel.status === 'holds' ? true : rel.status === 'unbound' ? 'warn' : false,
              <span>{rel.what.charAt(0).toUpperCase() + rel.what.slice(1)}</span>,
              rel.status === 'unbound' ? (
                <>Not checked: {rel.missing?.map((m) => `${m.role} (${m.reason})`).join('; ')}.</>
              ) : (
                <>
                  <span style={{ fontFamily: font.mono }}>
                    {rel.shown
                      ? `${formatQuantity(rel.shown.lhs)} ${rel.shown.unit} vs ${formatQuantity(rel.shown.rhs)} ${rel.shown.unit}`
                      : `${Number(rel.lhs!.toPrecision(4)).toLocaleString('en-US')} vs ${Number(rel.rhs!.toPrecision(4)).toLocaleString('en-US')} (SI)`}
                    {' · '}
                    {rel.deviation !== undefined ? `${Math.abs(rel.deviation) < 0.0005 ? '0' : (rel.deviation * 100).toFixed(1)} % apart` : ''}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {rel.bindings.map((b) => (
                      <span key={b.role} style={{ fontSize: 12, color: palette.text.muted }}>
                        {b.role}: {lookup.label(b.name)} = {formatQuantity(b.value)} {b.unit}
                      </span>
                    ))}
                  </div>
                </>
              ),
              rel.id
            )
          )}
        </div>
      )}
      {alignment.checklist.map((c) => row(c.met ? true : c.severity === 'ERROR' ? false : 'warn', c.what.charAt(0).toUpperCase() + c.what.slice(1), undefined, c.id))}
      {others.map((f, i) => row(f.severity === 'ERROR' ? false : 'warn', f.message, f.fix, `o${i}`))}
    </div>
  );
};

// ------------------------------------------------------------------ helpers

/** "inlet.temperatureC" as words, for a name the engine supplies. */
export function engineLabel(name: string, contract: UnitOpContract): string {
  const parts = name.split('.');
  const field = parts[parts.length - 1] ?? name;
  const words: Record<string, string> = {
    temperatureC: 'temperature',
    massFlowKgPerS: 'mass flow',
    volumetricFlowGpm: 'flow',
    densityGPerCm3: 'density',
    specificHeatKjPerKgK: 'specific heat',
    latentHeatKjPerKg: 'latent heat',
    piecesPerMinute: 'items/min',
    chargedKg: 'charged',
    gallons: 'volume',
    massKg: 'mass',
    number: 'number',
    cpKjPerKgK: 'specific heat'
  };
  if (parts[0] === 'port' && parts.length >= 3) {
    const port = contract.ports.find((p) => p.id === parts[1])?.name ?? parts[1];
    return parts[2] === 'x' ? `${port} ${parts[3]} fraction` : `${port} ${words[field] ?? field}`;
  }
  if (parts[1] === 'x') return `${parts[0]} ${parts[2]} fraction`;
  return `${parts[0]} ${words[field] ?? field}`;
}

/** A value for an engine name at the design point, and its unit. */
export function engineValue(name: string, contract: UnitOpContract): { value: number; unit: string } | undefined {
  const parts = name.split('.');
  const UNITS: Record<string, string> = {
    temperatureC: '°C',
    massFlowKgPerS: 'kg/s',
    volumetricFlowGpm: 'gal/min',
    densityGPerCm3: 'g/cm3',
    specificHeatKjPerKgK: 'kJ/kg-K',
    latentHeatKjPerKg: 'kJ/kg',
    chargedKg: 'kg'
  };
  const read = (d: Record<string, unknown> | undefined, field: string) => (typeof d?.[field] === 'number' ? (d[field] as number) : undefined);
  if (parts[0] === 'inlet') {
    if (parts[1] === 'x') {
      const v = contract.designInlet?.composition?.[parts[2] ?? ''];
      return v === undefined ? undefined : { value: v, unit: '-' };
    }
    const v = read(contract.designInlet as Record<string, unknown> | undefined, parts[1] ?? '');
    return v === undefined ? undefined : { value: v, unit: UNITS[parts[1] ?? ''] ?? '' };
  }
  if (parts[0] === 'port') {
    const d = contract.designPorts?.[parts[1] ?? ''] as Record<string, unknown> | undefined;
    if (parts[2] === 'x') {
      const v = (d?.composition as Record<string, number> | undefined)?.[parts[3] ?? ''];
      return v === undefined ? undefined : { value: v, unit: '-' };
    }
    const v = read(d, parts[2] ?? '');
    return v === undefined ? undefined : { value: v, unit: UNITS[parts[2] ?? ''] ?? '' };
  }
  return undefined;
}

/** A derived value's display: in the engineer's unit, a difference by size. */
export function shownValue(value: number, unit: string, displayUnit: string, name: string, label: string): number {
  return convertUnit(value, unit, displayUnit, { difference: isTemperatureDifference({ name, label, unit }) }) ?? value;
}
