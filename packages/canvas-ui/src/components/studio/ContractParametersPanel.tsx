import { Brief } from '../../ui/Brief.js';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  convertUnit,
  engineInfluence,
  isTemperatureDifference,
  designSpecsOf,
  resolveDesignSpecs,
  resolvePanel,
  resultsOf,
  type DesignSpec,
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
import { AlertTriangle, CheckCircle2, ChevronRight, RotateCcw, XCircle } from 'lucide-react';
import { tint } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import { controlFor, displayUnitsFor, formatQuantity, isConstantParameter, ownSweep, unitPreferenceKey } from '../../model/parameterUi.js';
import { ParameterControl } from './ParameterControl.js';
import { allResults, SpecSheet } from './SpecSheet.js';
import { layoutGroups } from '../../model/specLayout.js';
import { UNIT_SYSTEMS, unitSystemPrefs, type UnitSystem } from '../../model/unitSystems.js';
import { UnitGlance } from './UnitGlance.js';
import { engineLabel, engineValue, ExpressionView, PhysicsSection, Section, SpecHeader, StreamsSection, type Lookup, type SectionId } from './UnitSpecSections.js';
import type { NodeTelemetrySnapshot } from '@process-forge/simulation-core';

interface ContractParametersPanelProps {
  node: ProcessNode;
  contract: UnitOpContract;
  /** The node carries this contract itself (a designed unit); otherwise it is built from the node's config (a standard unit). */
  own: boolean;
  onUpdateConfig: (nodeId: string, newConfig: Record<string, unknown>) => void;
  /** The unit's state at the simulation's playhead, when there is a run: its streams show what is moving. */
  live?: NodeTelemetrySnapshot | undefined;
  /** Ports with a pipe on them. */
  connectedPortIds?: ReadonlySet<string>;
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
    (unit: string, choices: string[], fallback?: string) => {
      const key = unitPreferenceKey(unit);
      const want = key ? prefs[key] : undefined;
      return want && choices.includes(want) ? want : fallback && choices.includes(fallback) ? fallback : unit;
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
  // One switch for every quantity at once: the units the contract was written in, US or SI.
  const system: UnitSystem = (['us', 'si'] as const).find((s) => sameEntries(prefs, unitSystemPrefs(s))) ?? (Object.keys(prefs).length ? 'mixed' : 'design');
  const setSystem = useCallback((s: Exclude<UnitSystem, 'mixed'>) => {
    const next = unitSystemPrefs(s);
    setPrefs(next);
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch {
      // Storage off: the choice holds for this session.
    }
  }, []);
  return { unitFor, setUnit, system, setSystem };
}

const sameEntries = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/**
 * A contract's parameters as an engineer edits them: each knob the right
 * kind of control, grouped as the equipment is thought about, with the
 * engine's own verdict all over it -- where along each knob the design
 * passes, what each knob changes, which knob moves each failing check and to
 * what value, and what the engine will actually run (rate, cycle, duty).
 * Every number on it is computed by evaluating the contract, the same way
 * the simulation does.
 */
export const ContractParametersPanel: React.FC<ContractParametersPanelProps> = ({ node, contract, own, onUpdateConfig, live, connectedPortIds }) => {
  const { palette, font, radius: r } = useTheme();
  const config = node.config as Record<string, unknown>;
  const { unitFor, setUnit, system, setSystem } = useDisplayUnits();
  
  // What it was when the panel opened, to show what has moved and to put it back.
  const baseline = useRef<{ nodeId: string; params: Record<string, number>; derived: Record<string, number>; design?: UnitOpDesignStream } | null>(null);
  if (!baseline.current || baseline.current.nodeId !== node.id) {
    const ev0 = evaluateUnitOp(contract);
    baseline.current = {
      nodeId: node.id,
      params: Object.fromEntries(contract.parameters.map((p) => [p.name, p.value])),
      derived: ev0.error ? ev0.derived : resultsOf(ev0),
      ...(contract.designInlet ? { design: contract.designInlet } : {})
    };
  }

  const evaluation = useMemo(() => evaluateUnitOp(contract), [contract]);
  // The sweeps and fixes evaluate the contract many times: let typing stay ahead of them.
  const deferred = useDeferredValue(contract);
  const sweeps = useMemo(() => {
    const out: Record<string, ReturnType<typeof sweepParameter>> = {};
    const moves = parameterInfluence(deferred);
    const severity = (id: string) => deferred.constraints.find((c) => c.id === id)?.severity ?? 'ERROR';
    for (const p of deferred.parameters) {
      const kind = controlFor(p);
      if (kind === 'fixed' || kind === 'toggle') continue;
      const whole = kind === 'select' && p.options ? sweepOptions(deferred, p) : sweepParameter(deferred, p.name, 41);
      // Each input is judged only by the checks it can move.
      out[p.name] = ownSweep(whole, new Set(moves.constraints[p.name] ?? []), severity);
    }
    return out;
  }, [deferred]);
  const influence = useMemo(() => parameterInfluence(contract), [contract]);
  // The engine's figures are worked out from several fields: what moves them is found by nudging.
  const engineMovers = useMemo(() => engineInfluence(deferred), [deferred]);
  const failing = evaluation.constraints.filter((c) => !c.satisfied);
  const fixes = useMemo<Fix[]>(() => (deferred === contract && failing.length ? suggestFixes(deferred, {}, 8) : []), [deferred, contract, failing.length]);
  // Standard units are checked against the equipment they are too (inferred, so advice only).
  const alignment = useMemo(() => physicsAlignment(contract, evaluation), [contract, evaluation]);

  // Sections: the reference ones start folded; jumping to one opens it and scrolls it into view.
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});
  const refFor = (id: SectionId) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  };
  const [unfolded, setUnfolded] = useState<Partial<Record<SectionId, boolean>>>({});
  const fold = (id: SectionId) => ({ open: Boolean(unfolded[id]), onToggle: () => setUnfolded((u) => ({ ...u, [id]: !u[id] })) });
  const go = useCallback((id: SectionId) => {
    setUnfolded((u) => ({ ...u, [id]: true }));
    requestAnimationFrame(() => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);
  const [showRules, setShowRules] = useState(false);
  const [showInert, setShowInert] = useState(false);

  const [hover, setHover] = useState<{ param?: string; check?: string }>({});
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
  }, [flash]);

  const labelOf = (name: string) => contract.parameters.find((p) => p.name === name)?.label ?? contract.derived.find((d) => d.name === name)?.label ?? name;
  const paramOf = (name: string) => contract.parameters.find((p) => p.name === name);

  // Results the engineer holds at a target by varying one setting: re-solved on every edit, like a simulator's design spec.
  // The same rules apply to an edit made through MCP (protocol's update-unit).
  const holds = designSpecsOf(config);
  // A fix that turns a held setting would be undone by its hold at once: offer only the others.
  const visibleFixes = fixes.filter((f) => !holds.some((h) => h.vary === f.parameter));
  const solveHolds = (values: Record<string, number>, design?: UnitOpDesignStream, list: DesignSpec[] = holds): Record<string, number> => {
    if (!list.length) return values;
    const trial: UnitOpContract = {
      ...contract,
      parameters: contract.parameters.map((p) => (p.name in values ? { ...p, value: values[p.name]! } : p)),
      ...(design ? { designInlet: design } : {})
    };
    return { ...values, ...resolveDesignSpecs(trial, list) };
  };

  const writeParams = (asked: Record<string, number>, list: DesignSpec[] = holds) => {
    const values = solveHolds(asked, undefined, list);
    const specs = list === holds ? {} : { designSpecs: list };
    if (own) {
      const confirmed = new Set(contract.provenance.engineerConfirmed ?? []);
      for (const k of Object.keys(values)) confirmed.add(k);
      const next: UnitOpContract = {
        ...contract,
        parameters: contract.parameters.map((p) => (p.name in values ? { ...p, value: values[p.name]! } : p)),
        // The engineer set these by hand: the contract's provenance says so.
        provenance: { ...contract.provenance, engineerConfirmed: [...confirmed] }
      };
      onUpdateConfig(node.id, { ...config, contract: next, ...values, ...specs });
    } else {
      // A standard unit's contract is built from its config, key for key.
      onUpdateConfig(node.id, { ...config, ...values, ...specs });
    }
  };
  const hold = (h: DesignSpec) => writeParams({}, [...holds.filter((x) => x.vary !== h.vary && x.result !== h.result), h]);
  const release = (vary: string) => writeParams({}, holds.filter((x) => x.vary !== vary));
  const setParam = (name: string, value: number) => writeParams({ [name]: value });
  const setDesign = (patch: Partial<UnitOpDesignStream>) => {
    if (!own) return;
    const design = { ...(contract.designInlet ?? {}), ...patch };
    // A new feed moves the held results: re-solve them with it.
    const values = solveHolds({}, design);
    const next: UnitOpContract = {
      ...contract,
      designInlet: design,
      parameters: contract.parameters.map((p) => (p.name in values ? { ...p, value: values[p.name]! } : p))
    };
    onUpdateConfig(node.id, { ...config, contract: next, ...values });
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


  // The engine's own figures, headline size, in the engineer's units: what the unit is doing.
  const kpis = evaluation.error
    ? []
    : allResults(contract, evaluation, engineMovers).defs
        .filter((d) => d.name.startsWith('engine.'))
        .map((d) => {
          const du = unitFor(d.unit, displayUnitsFor({ name: d.name, label: d.label, unit: d.unit, value: 0 }));
          const v = resultsOf(evaluation)[d.name]!;
          return { label: d.label ?? d.name, value: formatQuantity(convertUnit(v, d.unit, du) ?? v), unit: du !== '-' ? du : '' };
        });
  const groups = layoutGroups(contract, influence, engineMovers);
  // A pipe brings the feed in: the design-point feed only matters until the line runs.
  const fedByLine = contract.ports.some((p) => p.direction === 'INLET' && p.role !== 'ENERGY' && connectedPortIds?.has(p.id));
  const inert = own
    ? []
    : (Object.entries(config).filter(([k, v]) => typeof v === 'number' && !contract.parameters.some((p) => p.name === k)) as [string, number][]);

  const verdict = evaluation.error
    ? { tone: 'fail' as const, text: `The engine cannot evaluate this design: ${evaluation.error.message}` }
    : errors.length || (alignment?.errors.length ?? 0)
      ? {
          tone: 'fail' as const,
          text: errors.length
            ? `${errors.length > 1 ? `${errors.length} checks fail` : 'A check fails'}: the simulation will not run this unit until ${errors.length > 1 ? 'they pass' : 'it passes'}.`
            : `${alignment!.errors.length > 1 ? `${alignment!.errors.length} physics problems` : 'A physics problem'}: see Physics.`
        }
      : warnings.length
        ? { tone: 'warn' as const, text: `Runs, with ${warnings.length > 1 ? `${warnings.length} warnings` : 'a warning'}.` }
        : evaluation.constraints.length
          ? { tone: 'ok' as const, text: 'Every check passes.' }
          : { tone: 'ok' as const, text: 'No checks stated: the engine runs it as written.' };

  // Names in equations: what each one is called and what it is worth at the design point.
  const lookup: Lookup = {
    label: (name) => contract.parameters.find((p) => p.name === name)?.label ?? contract.derived.find((d) => d.name === name)?.label ?? engineLabel(name, contract),
    value: (name) => {
      const p = paramOf(name);
      if (p) return { value: p.value, unit: p.unit };
      const d = contract.derived.find((x) => x.name === name);
      if (d) return evaluation.derived[name] !== undefined ? { value: evaluation.derived[name]!, unit: d.unit } : undefined;
      return engineValue(name, contract);
    },
    isParameter: (name) => Boolean(paramOf(name)),
    onPick: (name) => {
      go('settings');
      setFlash(name);
    }
  };

  // Checks a gauge above already shows, so the list below need not say them again unless asked.
  const gauged = useMemo(() => new Set(resolvePanel(deferred).widgets.flatMap((w) => (w.kind === 'gauge' && w.check ? [w.check] : []))), [deferred]);
  const listed = evaluation.constraints.filter((c) => !c.satisfied || showRules || !gauged.has(c.id));
  const hiddenRules = evaluation.constraints.length - listed.length;
  // Each failing check's counter-offer, on the setting it turns.
  const fixesFor: Record<string, Fix> = {};
  for (const f of visibleFixes) if (!fixesFor[f.parameter]) fixesFor[f.parameter] = f;

  const unitSwitch = contract.parameters.length > 0 && (
    <div role="group" aria-label="Units" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: r.md, border: `1px solid ${palette.border.subtle}` }}>
      {(['design', 'us', 'si'] as const).map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={system === s}
          className="pf-focus"
          onClick={() => setSystem(s)}
          title={UNIT_SYSTEMS[s].title}
          style={{
            border: 'none',
            borderRadius: r.sm,
            padding: '2px 9px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            background: system === s ? tint(palette.jade[500], 0.16) : 'transparent',
            color: system === s ? palette.text.primary : palette.text.muted
          }}
        >
          {UNIT_SYSTEMS[s].label}
        </button>
      ))}
    </div>
  );

  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const passingCount = evaluation.constraints.filter((c) => c.satisfied).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <SpecHeader
        node={node}
        contract={contract}
        own={own}
        alignment={alignment}
        verdict={verdict}
        kpis={evaluation.error ? [] : kpis}
        onVerdict={() => go(errors.length || warnings.length ? 'checks' : 'physics')}
        actions={
          changed.length > 0 ? (
            <button
              type="button"
              className="pf-focus"
              onClick={() => writeParams(Object.fromEntries(changed.map((p) => [p.name, baseline.current!.params[p.name]!])))}
              title={`Put back ${changed.map((p) => p.label).join(', ')}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: `1px solid ${palette.border.default}`,
                background: 'transparent',
                color: palette.text.secondary,
                borderRadius: r.md,
                padding: '3px 8px',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={12} /> Undo {count(changed.length, 'change')}
            </button>
          ) : undefined
        }
      />

      <Section ref={refFor('settings')} id="settings" title="Inputs" right={unitSwitch || undefined}>
        {contract.parameters.length === 0 ? (
          <EmptyNote>Nothing to set: this unit runs on what its streams bring in.</EmptyNote>
        ) : null}
        <SpecSheet
          contract={contract}
          evaluation={evaluation}
          groups={groups}
          sweeps={sweeps}
          influence={influence}
          engineMovers={engineMovers}
          baselineParams={baseline.current!.params}
          baselineDerived={baseline.current!.derived}
          unitFor={unitFor}
          setUnit={setUnit}
          setParam={setParam}
          lit={(k) => lit.has(k) || (k.startsWith('p:') && hover.param === k.slice(2))}
          onHoverParam={(name) => setHover(name ? { param: name } : {})}
          flash={flash}
          onFlash={setFlash}
          holds={holds}
          onHold={hold}
          onRelease={release}
          fixes={fixesFor}
          checkName={(id) => checkName(contract, id)}
          resultsSection={(children, right) => (
            <Section ref={refFor('results')} id="results" title="Results" right={right}>
              {evaluation.error ? <EmptyNote tone="fail">No results until the design evaluates: {evaluation.error.message}</EmptyNote> : children}
            </Section>
          )}
          {...(own && contract.designInlet
            ? {
                feed: {
                  fromLine: fedByLine,
                  params: designFields(contract.designInlet).map((f) => f.param),
                  baseline: Object.fromEntries(baseline.current!.design ? designFields(baseline.current!.design).map((f) => [f.param.name, f.param.value]) : []),
                  onChange: (name: string, v: number) => {
                    const f = designFields(contract.designInlet!).find((x) => x.param.name === name);
                    if (f) setDesign(f.apply(v, contract.designInlet!));
                  }
                }
              }
            : {})}
        />

        {inert.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button type="button" className="pf-disclose" aria-expanded={showInert} onClick={() => setShowInert((v) => !v)}>
              <ChevronRight size={13} aria-hidden style={{ transform: showInert ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' }} />
              Kept with the design, not simulated ({inert.length})
            </button>
            {showInert && (
              <>
                <div style={{ fontSize: 12, color: palette.text.muted, lineHeight: 1.5, margin: '4px 0 2px' }}>Changing these does not change the results.</div>
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
              </>
            )}
          </div>
        )}
      </Section>

      {(evaluation.constraints.length > 0 || Boolean(contract.panel?.length)) && (
        <Section
          ref={refFor('checks')}
          id="checks"
          title="Checks"
          hint={
            evaluation.constraints.length === 0
              ? undefined
              : errors.length
                ? `${errors.length} failing`
                : warnings.length
                  ? `${count(warnings.length, 'warning')}`
                  : `all ${passingCount} pass`
          }
        >
          {!evaluation.error && (
            <UnitGlance
              contract={contract}
              evaluation={evaluation}
              onPickCheck={(id) => {
                setShowRules(true);
                setHover({ check: id });
              }}
            />
          )}
          {listed.length > 0 && (
            <div style={{ marginTop: gauged.size ? 12 : 0 }}>
              {listed.map((c) => {
                const bad = !c.satisfied;
                const color = !bad ? palette.jade[500] : c.severity === 'ERROR' ? palette.status.failed : palette.status.blocked;
                const Icon = !bad ? CheckCircle2 : c.severity === 'ERROR' ? XCircle : AlertTriangle;
                // The knobs worth turning: constants and correlation coefficients are not.
                const levers = (influence.levers[c.id] ?? []).filter((n) => {
                  const p = paramOf(n);
                  return p && !p.ui?.advanced && !isConstantParameter(p);
                });
                const rule = contract.constraints.find((x) => x.id === c.id)?.expr;
                return (
                  <div
                    key={c.id}
                    onMouseEnter={() => setHover({ check: c.id })}
                    onMouseLeave={() => setHover({})}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: bad ? '12px 10px' : '8px 10px',
                      margin: '0 -10px',
                      borderRadius: r.md,
                      borderBottom: `1px solid ${palette.border.subtle}`,
                      backgroundColor: lit.has(`c:${c.id}`) ? tint(color, 0.08) : bad ? tint(color, 0.05) : 'transparent'
                    }}
                  >
                    <Icon size={15} color={color} style={{ flexShrink: 0, marginTop: 3 }} />
                    <div style={{ fontSize: 13, lineHeight: 1.5, color: palette.text.primary, minWidth: 0, flex: 1 }}>
                      {/* A passing check reads as the rule it holds to; a failing one says what goes wrong, then the rule. */}
                      {bad ? (
                        <>
                          <div>{c.message}</div>
                          {rule && (
                            <div style={{ fontSize: 12, marginTop: 4 }}>
                              <ExpressionView expr={rule} lookup={lookup} compact />
                            </div>
                          )}
                          {c.hint && <div style={{ fontSize: 12, color: palette.text.secondary, marginTop: 2 }}>Try: {c.hint}</div>}
                          {levers.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginTop: 6 }}>
                              <span style={{ fontSize: 12, color: palette.text.muted }}>Moved by</span>
                              {levers.map((name) => (
                                <button
                                  key={name}
                                  type="button"
                                  className="pf-focus"
                                  onClick={() => lookup.onPick!(name)}
                                  title="Show this input"
                                  style={{
                                    fontSize: 12,
                                    padding: 0,
                                    border: 'none',
                                    background: 'transparent',
                                    color: palette.text.secondary,
                                    textDecoration: 'underline',
                                    textDecorationColor: palette.border.default,
                                    textUnderlineOffset: 3,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {labelOf(name)}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : rule ? (
                        <span title={`Guards against: ${c.message}`}>
                          <ExpressionView expr={rule} lookup={lookup} compact />
                        </span>
                      ) : (
                        <span style={{ color: palette.text.secondary }}>{c.message}</span>
                      )}
                    </div>
                    {c.severity !== 'ERROR' && <span style={{ fontSize: 11, color: palette.text.muted, whiteSpace: 'nowrap', marginTop: 3 }}>advisory</span>}
                  </div>
                );
              })}
            </div>
          )}
          {(hiddenRules > 0 || (showRules && gauged.size > 0)) && (
            <button
              type="button"
              className="pf-focus"
              onClick={() => setShowRules((v) => !v)}
              style={{ all: 'unset', marginTop: 10, fontSize: 12, color: palette.text.secondary, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: palette.border.default, textUnderlineOffset: 3 }}
            >
              {showRules ? 'Hide the rules' : `Show the rule behind each gauge (${hiddenRules})`}
            </button>
          )}
        </Section>
      )}

      <Section ref={refFor('streams')} id="streams" {...fold('streams')} title="Streams" hint={count(contract.ports.length, 'connection')}>
        <StreamsSection contract={contract} evaluation={evaluation} live={live} unitFor={unitFor} />
      </Section>

      {contract.derived.length > 0 && (
        <Section ref={refFor('equations')} id="equations" {...fold('equations')} title="Equations" hint={count(contract.derived.length, 'equation')}>
          {contract.derived.map((d) => {
            const v = evaluation.derived[d.name];
            const choices = displayUnitsFor({ name: d.name, label: d.label, unit: d.unit, value: 0 });
            const du = unitFor(d.unit, choices);
            const difference = isTemperatureDifference(d);
            const shown = v !== undefined ? convertUnit(v, d.unit, du, { difference }) ?? v : NaN;
            const isLit = lit.has(`d:${d.name}`);
            return (
              <div
                key={d.name}
                style={{
                  padding: '12px 10px',
                  margin: '0 -10px',
                  borderRadius: r.md,
                  borderBottom: `1px solid ${palette.border.subtle}`,
                  backgroundColor: isLit ? tint(palette.jade[500], 0.08) : 'transparent',
                  transition: 'background-color 200ms ease'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'baseline', columnGap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: palette.text.primary }} title={d.description}>
                    {d.label ?? d.name}
                  </span>
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: palette.text.primary, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {formatQuantity(shown)} <span style={{ color: palette.text.muted }}>{du !== '-' ? du : ''}</span>
                  </span>
                </div>
                <div style={{ fontSize: 12, color: palette.text.secondary, marginTop: 4 }}>
                  <span style={{ color: palette.text.muted }}>= </span>
                  <ExpressionView expr={d.expr} lookup={lookup} compact />
                </div>
                {d.description && <Brief text={d.description} lines={1} style={{ fontSize: 12, color: palette.text.muted, marginTop: 2 }} />}
              </div>
            );
          })}
        </Section>
      )}

      {alignment && (
        <Section
          ref={refFor('physics')}
          id="physics"
          {...fold('physics')}
          title="Physics"
          hint={
            alignment.errors.length
              ? `${count(alignment.errors.length, 'problem')}`
              : alignment.archetype
                ? alignment.archetype.name
                : undefined
          }
        >
          <PhysicsSection alignment={alignment} lookup={lookup} />
        </Section>
      )}
    </div>
  );
};

/** A quiet line where a section has nothing to show, saying why. */
const EmptyNote: React.FC<{ children: React.ReactNode; tone?: 'muted' | 'fail' }> = ({ children, tone = 'muted' }) => {
  const { palette, radius: r } = useTheme();
  return (
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.5,
        padding: '10px 12px',
        borderRadius: r.md,
        border: `1px dashed ${tone === 'fail' ? tint(palette.status.failed, 0.5) : palette.border.subtle}`,
        color: tone === 'fail' ? palette.text.primary : palette.text.muted
      }}
    >
      {children}
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
