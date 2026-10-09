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
import { ArrowDownRight, ArrowUpRight, CheckCircle2, AlertTriangle, XCircle, Sigma, Gauge, Waves, ShieldCheck, Settings2, ListChecks, CircleDashed } from 'lucide-react';
import { tint } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import { EquipmentFigure } from '../../nozzles/EquipmentFigure.js';
import { formatQuantity } from '../../model/parameterUi.js';

/**
 * The parts of a unit's spec sheet, each drawn from its contract: the
 * header (what the equipment is and the engine's verdict), its streams (the
 * contract's ports, with their design and live figures), its equations (the
 * derived values as an engineer writes them) and its physics (the archetype
 * it is held to and the governing relations, with their numbers).
 */

export type SectionId = 'settings' | 'streams' | 'equations' | 'checks' | 'physics';

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
  verdict: { tone: 'ok' | 'warn' | 'fail'; text: string };
  kpis: { label: string; value: string; unit: string }[];
  actions?: React.ReactNode;
}> = ({ node, contract, own, alignment, verdict, kpis, actions }) => {
  const { palette, font, radius: r } = useTheme();
  const toneColor = verdict.tone === 'ok' ? palette.jade[500] : verdict.tone === 'warn' ? palette.status.blocked : palette.status.failed;
  const Icon = verdict.tone === 'ok' ? CheckCircle2 : verdict.tone === 'warn' ? AlertTriangle : XCircle;
  const archetype = alignment?.archetype;
  return (
    <div style={{ borderRadius: r.lg, border: `1px solid ${palette.border.default}`, background: palette.background.surface, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 12, padding: 12, alignItems: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            flex: '0 0 auto',
            width: 76,
            height: 76,
            borderRadius: r.md,
            background: palette.background.canvas,
            border: `1px solid ${palette.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}
        >
          <EquipmentFigure kind={node.kind} dressing={node.dressing} width={58} style={{ maxHeight: 64 }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '2px 7px',
                borderRadius: r.full,
                color: palette.jade[400],
                background: tint(palette.jade[500], 0.12),
                border: `1px solid ${tint(palette.jade[500], 0.3)}`
              }}
            >
              {archetype ? archetype.name.replace(/ \(.*\)$/, '') : own ? 'Custom unit' : 'Standard unit'}
            </span>
            {alignment?.decidedBy === 'declared' && (
              <span title="The contract declares this equipment, so the engine holds it to that physics." style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: palette.text.secondary }}>
                <ShieldCheck size={12} color={palette.jade[500]} /> held to its physics
              </span>
            )}
            <span style={{ fontSize: 11, color: palette.text.muted }}>{modeName(contract.behavior.mode)}</span>
          </div>
          {contract.description && (
            <div
              title={contract.description}
              style={{
                fontSize: 13,
                lineHeight: 1.45,
                color: palette.text.secondary,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {contract.description}
            </div>
          )}
        </div>
      </div>
      <div
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          fontSize: 13,
          borderTop: `1px solid ${palette.border.subtle}`,
          background: tint(toneColor, 0.08),
          color: palette.text.primary
        }}
      >
        <Icon size={15} color={toneColor} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{verdict.text}</span>
        {actions}
      </div>
      {kpis.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(kpis.length, 3)}, minmax(0, 1fr))`, borderTop: `1px solid ${palette.border.subtle}` }}>
          {kpis.map((k, i) => (
            <div key={k.label} style={{ padding: '8px 12px', borderLeft: i ? `1px solid ${palette.border.subtle}` : 'none' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: palette.text.muted }}>{k.label}</div>
              <div style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: palette.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                {k.value} <span style={{ fontSize: 11, color: palette.text.muted, fontWeight: 400 }}>{k.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function modeName(mode: UnitOpContract['behavior']['mode']): string {
  return mode === 'CONTINUOUS_RATE' ? 'continuous' : mode === 'DISCRETE_CYCLE' ? 'cycle by cycle' : mode === 'BATCH' ? 'batch' : 'storage';
}

// ------------------------------------------------------------------ nav

export const SectionNav: React.FC<{
  sections: { id: SectionId; label: string; badge?: { text: string; tone: 'ok' | 'warn' | 'fail' | 'muted' } }[];
  active: SectionId;
  onGo: (id: SectionId) => void;
}> = ({ sections, active, onGo }) => {
  const { palette, radius: r } = useTheme();
  const ICON: Record<SectionId, React.ElementType> = { settings: Settings2, streams: Waves, equations: Sigma, checks: ListChecks, physics: Gauge };
  return (
    <nav
      aria-label="Unit sections"
      style={{
        position: 'sticky',
        // Over the studio's own top padding, so nothing shows above the bar as it scrolls.
        top: -8,
        zIndex: 5,
        display: 'flex',
        gap: 4,
        padding: '14px 0 8px',
        margin: '4px 0 2px',
        background: palette.background.surfaceElevated,
        borderBottom: `1px solid ${palette.border.subtle}`,
        overflowX: 'auto',
        scrollbarWidth: 'none'
      }}
    >
      {sections.map((s) => {
        const on = s.id === active;
        const Icon = ICON[s.id];
        const badgeColor =
          s.badge?.tone === 'ok' ? palette.jade[500] : s.badge?.tone === 'warn' ? palette.status.blocked : s.badge?.tone === 'fail' ? palette.status.failed : palette.text.muted;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onGo(s.id)}
            aria-current={on ? 'true' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              flex: '0 0 auto',
              padding: '5px 9px',
              borderRadius: r.full,
              border: `1px solid ${on ? tint(palette.jade[500], 0.5) : 'transparent'}`,
              background: on ? tint(palette.jade[500], 0.12) : 'transparent',
              color: on ? palette.text.primary : palette.text.secondary,
              fontSize: 12,
              fontWeight: on ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            <Icon size={13} />
            {s.label}
            {s.badge && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '0 5px', borderRadius: r.full, color: badgeColor, background: tint(badgeColor, 0.14) }}>{s.badge.text}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

export const Section = React.forwardRef<HTMLElement, { id: SectionId; title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }>(
  ({ id, title, hint, children, right }, ref) => {
    const { palette } = useTheme();
    return (
      <section ref={ref} id={`unit-${id}`} data-section={id} style={{ scrollMarginTop: 52, paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: palette.text.primary }}>{title}</h3>
          {hint && <span style={{ fontSize: 12, color: palette.text.muted, flex: 1 }}>{hint}</span>}
          {right}
        </div>
        {children}
      </section>
    );
  }
);
Section.displayName = 'Section';

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
                padding: compact ? '0 4px' : '1px 6px',
                margin: '1px 0',
                borderRadius: r.sm,
                fontFamily: font.sans,
                fontSize: compact ? 11.5 : 12,
                color: isParam ? palette.jade[300] ?? palette.jade[400] : palette.text.primary,
                background: isParam ? tint(palette.jade[500], 0.1) : palette.background.surfaceElevated,
                border: `1px solid ${isParam ? tint(palette.jade[500], 0.3) : palette.border.subtle}`,
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
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
      <span style={{ color: palette.text.muted }}>{label}</span>
      <span style={{ fontFamily: font.mono, color: palette.text.primary, fontVariantNumeric: 'tabular-nums' }}>
        {value} <span style={{ color: palette.text.muted }}>{unit}</span>
      </span>
    </div>
  );
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
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
          <div key={`${p.direction}:${p.id}`} style={{ borderRadius: r.md, border: `1px solid ${palette.border.default}`, borderLeft: `3px solid ${color}`, background: palette.background.surface, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Arrow size={14} color={color} />
              <span style={{ fontSize: 13, fontWeight: 700, color: palette.text.primary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color, padding: '1px 6px', borderRadius: r.full, background: tint(color, 0.14) }}>{PHASE_WORD[phase]}</span>
            </div>
            <div style={{ fontSize: 12, color: palette.text.muted, marginBottom: 4 }}>
              {inlet ? 'In' : 'Out'}
              {p.role !== 'MATERIAL' ? ` · ${p.role.toLowerCase()}` : ''}
              {dispersed.length ? ` · carries ${dispersed.map(([c, ph]) => `${c} as ${PHASE_WORD[ph] ?? ph}`).join(', ')}` : ''}
              {p.carries?.length ? ` · ${p.carries.join(', ')}` : ''}
              {channel ? ` · ${inlet ? `leaves by ${channel.outlet}` : `from ${channel.inlet} only`}` : ''}
            </div>
            {design && (
              <div style={{ display: 'grid', gap: 2 }}>
                {design.temperatureC !== undefined && fig('Design T', formatQuantity(design.temperatureC), '°C')}
                {design.massFlowKgPerS !== undefined && fig('Design flow', formatQuantity(design.massFlowKgPerS * 3600), 'kg/h')}
                {design.volumetricFlowGpm !== undefined && phase === 'LIQUID' && fig('', formatQuantity(design.volumetricFlowGpm), 'gal/min')}
                {design.composition && fig('Mix', Object.entries(design.composition).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, x]) => `${c} ${Math.round(x * 1000) / 10}%`).join(', '))}
              </div>
            )}
            {plan && (
              <div style={{ display: 'grid', gap: 2 }}>
                {plan.share !== undefined && fig('Share', formatQuantity(plan.share * 100), '%')}
                {plan.temperatureC !== undefined && fig('Leaves at', formatQuantity(plan.temperatureC), '°C')}
                {plan.recovery &&
                  Object.entries(plan.recovery)
                    .slice(0, 4)
                    .map(([c, x]) => <React.Fragment key={c}>{fig(`${c}`, formatQuantity(x * 100), '% of it')}</React.Fragment>)}
              </div>
            )}
            {now && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${palette.border.subtle}`, display: 'grid', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: palette.jade[400], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <CircleDashed size={10} /> Live
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
  const { palette, font, radius: r } = useTheme();
  const row = (ok: boolean | 'warn', text: React.ReactNode, detail?: React.ReactNode, key?: string) => (
    <div key={key} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: `1px solid ${palette.border.subtle}` }}>
      {ok === true ? (
        <CheckCircle2 size={14} color={palette.jade[500]} style={{ flexShrink: 0, marginTop: 1 }} />
      ) : ok === 'warn' ? (
        <AlertTriangle size={14} color={palette.status.blocked} style={{ flexShrink: 0, marginTop: 1 }} />
      ) : (
        <XCircle size={14} color={palette.status.failed} style={{ flexShrink: 0, marginTop: 1 }} />
      )}
      <div style={{ fontSize: 13, color: palette.text.primary, minWidth: 0 }}>
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
        <div style={{ borderRadius: r.md, border: `1px solid ${palette.border.default}`, padding: '6px 10px', marginBottom: 8, background: palette.background.surface }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: palette.text.muted, marginBottom: 2 }}>Governing relations, at the design point</div>
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
                      <span key={b.role} style={{ fontSize: 11, padding: '1px 6px', borderRadius: r.full, border: `1px solid ${palette.border.subtle}`, color: palette.text.secondary }}>
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
