import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  convertUnit,
  isTemperatureDifference,
  evaluateUnitOp,
  parameterInfluence,
  physicsAlignment,
  suggestFixes,
  sweepParameter,
  type Fix,
  type ProcessNode,
  type UnitOpContract,
  type UnitOpDesignStream,
  type UnitOpParameter
} from '@process-forge/protocol';
import { AlertTriangle, CheckCircle2, ChevronRight, RotateCcw, Wand2, XCircle } from 'lucide-react';
import { tint } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import { controlFor, displayUnitsFor, formatQuantity, groupParameters, isConstantParameter, unitPreferenceKey } from '../../model/parameterUi.js';
import { FEASIBLE_RANGE_CSS, ParameterControl } from './ParameterControl.js';

interface ContractParametersPanelProps {
  node: ProcessNode;
  contract: UnitOpContract;
  /** The node carries this contract itself (a designed unit); otherwise it is built from the node's config (a standard unit). */
  own: boolean;
  onUpdateConfig: (nodeId: string, newConfig: Record<string, unknown>) => void;
}

const PREF_KEY = 'pf.displayUnits';

function loadPrefs(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** The engineer's unit for each kind of quantity (°F for every temperature, bar for every pressure), remembered in this browser. */
function useDisplayUnits() {
  const [prefs, setPrefs] = useState<Record<string, string>>(() => (typeof window === 'undefined' ? {} : loadPrefs()));
  const unitFor = useCallback(
    (unit: string, choices: string[]) => {
      const key = unitPreferenceKey(unit);
      const want = key ? prefs[key] : undefined;
      return want && choices.includes(want) ? want : unit;
    },
    [prefs]
  );
  const setUnit = useCallback((unit: string, chosen: string) => {
    const key = unitPreferenceKey(unit);
    if (!key) return;
    setPrefs((prev) => {
      const next = { ...prev, [key]: chosen };
      try {
        window.localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch {
        // Storage off: the choice holds for this session.
      }
      return next;
    });
  }, []);
  return { unitFor, setUnit };
}

/**
 * A contract's parameters as an engineer edits them: each knob the right
 * kind of control, grouped as the equipment is thought about, with the
 * engine's own verdict all over it -- where along each knob the design
 * passes, what each knob changes, which knob moves each failing check and to
 * what value, and what the engine will actually run (rate, cycle, duty).
 * Every number on it is computed by evaluating the contract, the same way
 * the simulation does.
 */
export const ContractParametersPanel: React.FC<ContractParametersPanelProps> = ({ node, contract, own, onUpdateConfig }) => {
  const { palette, font, radius: r } = useTheme();
  const config = node.config as Record<string, unknown>;
  const { unitFor, setUnit } = useDisplayUnits();

  // What it was when the panel opened, to show what has moved and to put it back.
  const baseline = useRef<{ nodeId: string; params: Record<string, number>; derived: Record<string, number>; design?: UnitOpDesignStream } | null>(null);
  if (!baseline.current || baseline.current.nodeId !== node.id) {
    const ev0 = evaluateUnitOp(contract);
    baseline.current = {
      nodeId: node.id,
      params: Object.fromEntries(contract.parameters.map((p) => [p.name, p.value])),
      derived: ev0.derived,
      ...(contract.designInlet ? { design: contract.designInlet } : {})
    };
  }

  const evaluation = useMemo(() => evaluateUnitOp(contract), [contract]);
  // The sweeps and fixes evaluate the contract many times: let typing stay ahead of them.
  const deferred = useDeferredValue(contract);
  const sweeps = useMemo(() => {
    const out: Record<string, ReturnType<typeof sweepParameter>> = {};
    for (const p of deferred.parameters) {
      const kind = controlFor(p);
      if (kind === 'fixed' || kind === 'toggle') continue;
      out[p.name] = kind === 'select' && p.options ? sweepOptions(deferred, p) : sweepParameter(deferred, p.name, 41);
    }
    return out;
  }, [deferred]);
  const influence = useMemo(() => parameterInfluence(contract), [contract]);
  const failing = evaluation.constraints.filter((c) => !c.satisfied);
  const fixes = useMemo<Fix[]>(() => (deferred === contract && failing.length ? suggestFixes(deferred, {}, 8) : []), [deferred, contract, failing.length]);
  const alignment = useMemo(() => (own ? physicsAlignment(contract, evaluation) : undefined), [own, contract, evaluation]);

  const [hover, setHover] = useState<{ param?: string; check?: string }>({});
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
  }, [flash]);

  const labelOf = (name: string) => contract.parameters.find((p) => p.name === name)?.label ?? contract.derived.find((d) => d.name === name)?.label ?? name;
  const paramOf = (name: string) => contract.parameters.find((p) => p.name === name);

  const writeParams = (values: Record<string, number>) => {
    if (own) {
      const confirmed = new Set(contract.provenance.engineerConfirmed ?? []);
      for (const k of Object.keys(values)) confirmed.add(k);
      const next: UnitOpContract = {
        ...contract,
        parameters: contract.parameters.map((p) => (p.name in values ? { ...p, value: values[p.name]! } : p)),
        // The engineer set these by hand: the contract's provenance says so.
        provenance: { ...contract.provenance, engineerConfirmed: [...confirmed] }
      };
      onUpdateConfig(node.id, { ...config, contract: next, ...values });
    } else {
      // A standard unit's contract is built from its config, key for key.
      onUpdateConfig(node.id, { ...config, ...values });
    }
  };
  const setParam = (name: string, value: number) => writeParams({ [name]: value });
  const setDesign = (patch: Partial<UnitOpDesignStream>) => {
    if (!own) return;
    const next: UnitOpContract = { ...contract, designInlet: { ...(contract.designInlet ?? {}), ...patch } };
    onUpdateConfig(node.id, { ...config, contract: next });
  };

  const changed = contract.parameters.filter((p) => baseline.current!.params[p.name] !== undefined && baseline.current!.params[p.name] !== p.value);
  const errors = failing.filter((c) => c.severity === 'ERROR');
  const warnings = failing.filter((c) => c.severity === 'WARNING');

  // What the hovered knob moves, and what moves the hovered check.
  const lit = useMemo(() => {
    const s = new Set<string>();
    if (hover.param) {
      for (const d of influence.derived[hover.param] ?? []) s.add(`d:${d}`);
      for (const c of influence.constraints[hover.param] ?? []) s.add(`c:${c}`);
    }
    if (hover.check) for (const p of influence.levers[hover.check] ?? []) s.add(`p:${p}`);
    return s;
  }, [hover, influence]);

  const heading: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: palette.text.muted,
    margin: '18px 0 4px'
  };

  const kpis = behaviorKpis(evaluation);
  const groups = groupParameters(contract.parameters);
  const inert = own
    ? []
    : (Object.entries(config).filter(([k, v]) => typeof v === 'number' && !contract.parameters.some((p) => p.name === k)) as [string, number][]);

  const renderParam = (p: UnitOpParameter) => {
    const choices = displayUnitsFor(p);
    const du = unitFor(p.unit, choices);
    const drives = [...(influence.derived[p.name] ?? []).map(labelOf), ...(influence.behavior[p.name] ?? []).map(behaviorLabel)];
    return (
      <ParameterControl
        key={p.name}
        param={p}
        {...(sweeps[p.name] ? { sweep: sweeps[p.name]! } : {})}
        displayUnit={du}
        displayUnits={choices}
        onDisplayUnit={(u) => setUnit(p.unit, u)}
        {...(baseline.current!.params[p.name] !== undefined ? { baseline: baseline.current!.params[p.name]! } : {})}
        onChange={(v) => setParam(p.name, v)}
        highlighted={hover.param === p.name || lit.has(`p:${p.name}`)}
        drives={drives}
        onHover={(on) => setHover(on ? { param: p.name } : {})}
        flash={flash === p.name}
      />
    );
  };

  return (
    <div
      style={
        {
          display: 'flex',
          flexDirection: 'column',
          '--pf-thumb-bg': palette.background.surface,
          '--pf-thumb-border': palette.text.primary,
          '--pf-thumb-ring': tint(palette.jade[500], 0.4)
        } as React.CSSProperties
      }
    >
      <style>{FEASIBLE_RANGE_CSS}</style>

      {/* The verdict, as the simulation will see it. */}
      <div
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderRadius: r.md,
          fontSize: 13,
          backgroundColor: evaluation.error || errors.length ? tint(palette.status.failed, 0.08) : warnings.length ? tint(palette.status.blocked, 0.1) : tint(palette.jade[500], 0.08),
          border: `1px solid ${evaluation.error || errors.length ? tint(palette.status.failed, 0.4) : warnings.length ? tint(palette.status.blocked, 0.4) : tint(palette.jade[500], 0.35)}`,
          color: palette.text.primary
        }}
      >
        {evaluation.error || errors.length ? (
          <XCircle size={16} color={palette.status.failed} />
        ) : warnings.length ? (
          <AlertTriangle size={16} color={palette.status.blocked} />
        ) : (
          <CheckCircle2 size={16} color={palette.jade[500]} />
        )}
        <span style={{ flex: 1 }}>
          {evaluation.error
            ? `The engine cannot evaluate this design: ${evaluation.error.message}`
            : errors.length
              ? `${errors.length} check${errors.length > 1 ? 's' : ''} fail: the simulation will refuse to run this unit.`
              : warnings.length
                ? `Runs, with ${warnings.length} warning${warnings.length > 1 ? 's' : ''}.`
                : 'Every check passes.'}
        </span>
        {changed.length > 0 && (
          <button
            type="button"
            onClick={() => writeParams(Object.fromEntries(changed.map((p) => [p.name, baseline.current!.params[p.name]!])))}
            title={`Put back ${changed.map((p) => p.label).join(', ')}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: `1px solid ${palette.border.default}`,
              background: palette.background.surface,
              color: palette.text.secondary,
              borderRadius: r.md,
              padding: '3px 8px',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={12} /> Revert {changed.length}
          </button>
        )}
      </div>

      {/* What the engine runs on. */}
      {kpis.length > 0 && !evaluation.error && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(kpis.length, 3)}, minmax(0, 1fr))`, gap: 8, marginTop: 10 }}>
          {kpis.map((k) => (
            <div key={k.label} style={{ padding: '8px 10px', borderRadius: r.md, border: `1px solid ${palette.border.subtle}`, background: palette.background.surface }}>
              <div style={{ fontSize: 11, color: palette.text.muted }}>{k.label}</div>
              <div style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 600, color: palette.text.primary }}>
                {k.value} <span style={{ fontSize: 11, color: palette.text.muted, fontWeight: 400 }}>{k.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The engine's counter-offers: one knob, the value that clears a check. */}
      {fixes.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: r.md, border: `1px dashed ${tint(palette.jade[500], 0.5)}`, background: tint(palette.jade[500], 0.04) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: palette.text.secondary, marginBottom: 6 }}>
            <Wand2 size={13} color={palette.jade[500]} /> The engine solved for values that clear the failing checks
          </div>
          {fixes.slice(0, 4).map((f) => {
            const p = paramOf(f.parameter)!;
            const du = unitFor(p.unit, displayUnitsFor(p));
            const difference = isTemperatureDifference(p);
            const shown = convertUnit(f.value, p.unit, du, { difference }) ?? f.value;
            const now = convertUnit(p.value, p.unit, du, { difference }) ?? p.value;
            return (
              <button
                key={`${f.parameter}:${f.value}`}
                type="button"
                onClick={() => {
                  setParam(f.parameter, f.value);
                  setFlash(f.parameter);
                }}
                onMouseEnter={() => setHover({ param: f.parameter })}
                onMouseLeave={() => setHover({})}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  marginTop: 2,
                  border: 'none',
                  borderRadius: r.sm,
                  background: 'transparent',
                  color: palette.text.primary,
                  fontSize: 12.5,
                  cursor: 'pointer'
                }}
              >
                <ChevronRight size={13} color={palette.jade[500]} />
                <span style={{ flex: 1 }}>
                  Set <b>{p.label}</b> from {formatQuantity(now)} to <b style={{ fontFamily: font.mono }}>{formatQuantity(shown)}</b> {du !== '-' ? du : ''}
                  <span style={{ color: palette.text.muted }}>
                    {' '}
                    · clears {f.fixes.map((id) => checkName(contract, id)).join(', ')}
                    {f.allPass ? ' · then every check passes' : f.allErrorsPass ? ' · then nothing fails' : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {groups.map((g) =>
        g.folded ? (
          <details key={g.name} style={{ marginTop: 14 }}>
            <summary style={{ ...heading, margin: 0, cursor: 'pointer', listStyle: 'revert' }}>
              {g.name} · {g.params.length}
            </summary>
            {g.params.map(renderParam)}
          </details>
        ) : (
          <React.Fragment key={g.name}>
            <div style={heading}>{g.name}</div>
            {g.params.map(renderParam)}
          </React.Fragment>
        )
      )}

      {own && contract.designInlet && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ ...heading, margin: 0, cursor: 'pointer', listStyle: 'revert' }}>Design conditions</summary>
          <div style={{ fontSize: 12, color: palette.text.muted, lineHeight: 1.5, margin: '6px 0' }}>
            What arrives when the checks above are worked out. During a run the engine uses the live stream instead.
          </div>
          {designFields(contract.designInlet).map((f) => (
            <ParameterControl
              key={f.param.name}
              param={f.param}
              displayUnit={unitFor(f.param.unit, displayUnitsFor(f.param))}
              displayUnits={displayUnitsFor(f.param)}
              onDisplayUnit={(u) => setUnit(f.param.unit, u)}
              onChange={(v) => setDesign(f.apply(v, contract.designInlet!))}
            />
          ))}
        </details>
      )}

      {contract.derived.length > 0 && (
        <>
          <div style={heading}>Computed by the engine</div>
          {contract.derived.map((d) => {
            const v = evaluation.derived[d.name];
            const before = baseline.current!.derived[d.name];
            const delta = v !== undefined && before !== undefined && Number.isFinite(v) && Number.isFinite(before) && Math.abs(v - before) > 1e-9 * Math.max(1, Math.abs(before)) ? v - before : 0;
            const pct = before ? (delta / Math.abs(before)) * 100 : 0;
            const choices = displayUnitsFor({ name: d.name, label: d.label, unit: d.unit, value: 0 });
            const du = unitFor(d.unit, choices);
            const difference = isTemperatureDifference(d);
            const shown = v !== undefined ? convertUnit(v, d.unit, du, { difference }) ?? v : NaN;
            const isLit = lit.has(`d:${d.name}`);
            return (
              <div
                key={d.name}
                title={`${d.expr}${d.description ? `\n${d.description}` : ''}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  alignItems: 'center',
                  columnGap: 12,
                  padding: '7px 8px',
                  margin: '0 -8px',
                  borderRadius: r.md,
                  borderBottom: `1px solid ${palette.border.subtle}`,
                  backgroundColor: isLit ? tint(palette.jade[500], 0.08) : 'transparent',
                  transition: 'background-color 200ms ease'
                }}
              >
                <span style={{ fontSize: 13, color: palette.text.secondary }}>{d.label ?? d.name}</span>
                <span style={{ fontFamily: font.mono, fontSize: 13, color: palette.text.primary, whiteSpace: 'nowrap' }}>
                  {delta !== 0 && (
                    <span style={{ fontSize: 11, marginRight: 6, color: palette.text.muted }} title={`When you opened it: ${formatQuantity(convertUnit(before!, d.unit, du, { difference }) ?? before!)}`}>
                      {delta > 0 ? '▲' : '▼'} {Math.abs(pct) >= 0.1 && Number.isFinite(pct) ? `${Math.abs(pct) < 10 ? Math.abs(pct).toFixed(1) : Math.round(Math.abs(pct))}%` : ''}
                    </span>
                  )}
                  {formatQuantity(shown)} <span style={{ color: palette.text.muted }}>{du !== '-' ? du : ''}</span>
                </span>
              </div>
            );
          })}
        </>
      )}

      {evaluation.constraints.length > 0 && (
        <>
          <div style={heading}>Checks</div>
          {evaluation.constraints.map((c) => {
            const bad = !c.satisfied;
            const color = !bad ? palette.jade[500] : c.severity === 'ERROR' ? palette.status.failed : palette.status.blocked;
            const Icon = !bad ? CheckCircle2 : c.severity === 'ERROR' ? XCircle : AlertTriangle;
            // The knobs worth turning: constants and correlation coefficients are not.
            const levers = (influence.levers[c.id] ?? []).filter((n) => {
              const p = paramOf(n);
              return p && !p.ui?.advanced && !isConstantParameter(p);
            });
            return (
              <div
                key={c.id}
                onMouseEnter={() => setHover({ check: c.id })}
                onMouseLeave={() => setHover({})}
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '7px 8px',
                  margin: '0 -8px',
                  borderRadius: r.md,
                  borderBottom: `1px solid ${palette.border.subtle}`,
                  backgroundColor: lit.has(`c:${c.id}`) ? tint(color, 0.08) : 'transparent'
                }}
              >
                <Icon size={15} color={color} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: bad ? palette.text.primary : palette.text.secondary, minWidth: 0 }}>
                  {c.message}
                  {bad && c.hint && <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2 }}>Try: {c.hint}</div>}
                  {levers.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {levers.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setFlash(name)}
                          title="Show this parameter"
                          style={{
                            fontSize: 11,
                            padding: '1px 7px',
                            borderRadius: r.full,
                            border: `1px solid ${palette.border.subtle}`,
                            background: palette.background.surface,
                            color: palette.text.secondary,
                            cursor: 'pointer'
                          }}
                        >
                          {labelOf(name)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {alignment && (alignment.archetype || alignment.errors.length > 0 || alignment.warnings.some((w) => w.path !== 'archetype')) && (
        <details style={{ marginTop: 14 }} open={alignment.errors.length > 0}>
          <summary style={{ ...heading, margin: 0, cursor: 'pointer', listStyle: 'revert' }}>
            Physics{alignment.archetype ? ` · ${alignment.archetype.name}` : ''}
            {alignment.checklist.length ? ` · ${alignment.checklist.filter((c) => c.met).length}/${alignment.checklist.length}` : ''}
          </summary>
          {alignment.checklist.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 8, padding: '5px 0', fontSize: 12.5, color: c.met ? palette.text.secondary : palette.text.primary }}>
              {c.met ? <CheckCircle2 size={14} color={palette.jade[500]} /> : c.severity === 'ERROR' ? <XCircle size={14} color={palette.status.failed} /> : <AlertTriangle size={14} color={palette.status.blocked} />}
              <span>{c.what.charAt(0).toUpperCase() + c.what.slice(1)}</span>
            </div>
          ))}
          {[...alignment.errors, ...alignment.warnings]
            .filter((f) => !f.requirement && f.path !== 'archetype')
            .map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', fontSize: 12.5, color: palette.text.primary }}>
                {f.severity === 'ERROR' ? <XCircle size={14} color={palette.status.failed} style={{ flexShrink: 0 }} /> : <AlertTriangle size={14} color={palette.status.blocked} style={{ flexShrink: 0 }} />}
                <span>{f.message}</span>
              </div>
            ))}
          <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 4 }}>
            {alignment.decidedBy === 'declared'
              ? 'The contract declares this equipment, so the engine holds it to that physics.'
              : alignment.decidedBy === 'inferred'
                ? 'Read from its name; the design states no archetype, so these are advice.'
                : ''}
          </div>
        </details>
      )}

      {inert.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ ...heading, margin: 0, cursor: 'pointer', listStyle: 'revert' }}>Not used by the simulation · {inert.length}</summary>
          <div style={{ fontSize: 12, color: palette.text.muted, lineHeight: 1.5, margin: '4px 0 2px' }}>Kept with the design; changing them does not change the results.</div>
          {inert.map(([k, v]) => (
            <ParameterControl
              key={k}
              param={{ name: k, label: k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()), unit: '-', value: v }}
              displayUnit="-"
              displayUnits={[]}
              onDisplayUnit={() => undefined}
              onChange={(x) => onUpdateConfig(node.id, { ...config, [k]: x })}
            />
          ))}
        </details>
      )}
    </div>
  );
};

/** A choice parameter's verdict at each of its options. */
function sweepOptions(contract: UnitOpContract, p: UnitOpParameter): ReturnType<typeof sweepParameter> {
  const values = [...p.options!.map((o) => o.value)].sort((a, b) => a - b);
  const from = values[0]!;
  const to = values[values.length - 1]!;
  const range = { from, to: to > from ? to : from + 1, log: false };
  const points = values.map((v) => {
    const one = sweepParameter(contract, p.name, 1, {}, { from: v, to: v, log: false });
    return { ...one.points[0]!, value: v };
  });
  // A choice has no in-between values: each option is its own verdict.
  return { range, points, transitions: [] };
}

function checkName(_contract: UnitOpContract, id: string): string {
  return id.replace(/[-_]/g, ' ');
}

function behaviorLabel(path: string): string {
  const k = path.replace(/^behavior\./, '').replace(/^outlets\[\d+\]\./, 'outlet ');
  const words: Record<string, string> = {
    cycleSeconds: 'the cycle time',
    unitsPerCycle: 'units per cycle',
    throughputPerMinute: 'the throughput',
    capacityGpm: 'the capacity',
    capacityKgPerHour: 'the capacity',
    dutyKw: 'the duty',
    batchGallons: 'the batch size',
    capacityGallons: 'the capacity',
    liquidPerCycleGallons: 'liquid per cycle',
    scrapFraction: 'the reject rate'
  };
  return words[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/** The figures the engine runs the unit on, from the evaluation. */
function behaviorKpis(ev: ReturnType<typeof evaluateUnitOp>): { label: string; value: string; unit: string }[] {
  const b = ev.behavior;
  const f = formatQuantity;
  switch (b.mode) {
    case 'DISCRETE_CYCLE':
      return [
        { label: 'Rate', value: f(b.unitsPerMinute), unit: '/min' },
        { label: 'Cycle', value: f(b.cycleSeconds), unit: 's' },
        { label: 'Per cycle', value: f(b.unitsPerCycle), unit: 'units' }
      ];
    case 'CONTINUOUS_RATE':
      return [
        ...(b.capacityGpm !== undefined ? [{ label: 'Capacity', value: f(b.capacityGpm), unit: 'gal/min' }] : []),
        ...(b.capacityKgPerHour !== undefined ? [{ label: 'Capacity', value: f(b.capacityKgPerHour), unit: 'kg/h' }] : []),
        ...(b.dutyKw !== undefined ? [{ label: 'Duty', value: f(b.dutyKw), unit: 'kW' }] : []),
        ...(b.residenceTimeSeconds !== undefined ? [{ label: 'Residence', value: f(b.residenceTimeSeconds), unit: 's' }] : [])
      ].slice(0, 3);
    case 'BATCH':
      return [
        { label: 'Batch', value: f(b.batchGallons), unit: 'gal' },
        { label: 'Cycle', value: f(b.cycleSecondsEstimate / 60), unit: 'min' },
        { label: 'Average', value: f(b.gallonsPerMinute), unit: 'gal/min' }
      ];
    case 'STORAGE':
      return [
        { label: 'Capacity', value: f(b.capacityGallons), unit: 'gal' },
        ...(b.maxOutflowGpm !== undefined ? [{ label: 'Most out', value: f(b.maxOutflowGpm), unit: 'gal/min' }] : [])
      ];
  }
}

/** The design inlet's fields as parameters, keeping flow, mass flow and density consistent. */
function designFields(d: UnitOpDesignStream): { param: UnitOpParameter; apply: (v: number, d: UnitOpDesignStream) => Partial<UnitOpDesignStream> }[] {
  const out: { param: UnitOpParameter; apply: (v: number, d: UnitOpDesignStream) => Partial<UnitOpDesignStream> }[] = [];
  const KG_PER_S_PER_GPM = 3.785411784 / 60; // at 1 g/cm3
  if (d.temperatureC !== undefined) out.push({ param: { name: '__designT', label: 'Inlet temperature', unit: '°C', value: d.temperatureC, min: -273.15 }, apply: (v) => ({ temperatureC: v }) });
  if (d.volumetricFlowGpm !== undefined)
    out.push({
      param: { name: '__designQ', label: 'Inlet flow', unit: 'gal/min', value: d.volumetricFlowGpm, min: 0 },
      apply: (v, cur) => ({ volumetricFlowGpm: v, ...(cur.massFlowKgPerS !== undefined ? { massFlowKgPerS: Number((v * KG_PER_S_PER_GPM * (cur.densityGPerCm3 ?? 1)).toPrecision(6)) } : {}) })
    });
  if (d.massFlowKgPerS !== undefined)
    out.push({
      param: { name: '__designM', label: 'Inlet mass flow', unit: 'kg/s', value: d.massFlowKgPerS, min: 0 },
      apply: (v, cur) => ({ massFlowKgPerS: v, ...(cur.volumetricFlowGpm !== undefined && cur.densityGPerCm3 ? { volumetricFlowGpm: Number((v / (KG_PER_S_PER_GPM * cur.densityGPerCm3)).toPrecision(6)) } : {}) })
    });
  if (d.densityGPerCm3 !== undefined)
    out.push({
      param: { name: '__designRho', label: 'Inlet density', unit: 'g/cm3', value: d.densityGPerCm3, min: 0.00001 },
      apply: (v, cur) => ({ densityGPerCm3: v, ...(cur.volumetricFlowGpm !== undefined && cur.massFlowKgPerS !== undefined ? { massFlowKgPerS: Number((cur.volumetricFlowGpm * KG_PER_S_PER_GPM * v).toPrecision(6)) } : {}) })
    });
  if (d.specificHeatKjPerKgK !== undefined)
    out.push({ param: { name: '__designCp', label: 'Inlet specific heat', unit: 'kJ/kg-K', value: d.specificHeatKjPerKgK, min: 0.01 }, apply: (v) => ({ specificHeatKjPerKgK: v }) });
  return out;
}
