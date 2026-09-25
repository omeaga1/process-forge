import { resolveUnit, validateProcessGraph, type ProcessGraph, type ProcessNode } from '@process-forge/protocol';
import { simulateProcess } from '@process-forge/simulation-core';

/**
 * What-if runs: the same line, the same seed, with some settings changed, so
 * the difference in the results is the change and nothing else. Nothing on
 * the engineer's flowsheet is touched.
 */

export interface ScenarioChange {
  /** The unit to change: id, name or tag. */
  unit: string;
  /** Settings to set, by name. Dotted names reach into nested settings, e.g. "fluid.temperatureCelsius". */
  parameters: Record<string, unknown>;
}

export interface Scenario {
  name?: string;
  changes: ScenarioChange[];
}

export interface CompareScenariosParams {
  scenarios: Scenario[];
  durationMinutes?: number;
  seed?: number;
}

interface AppliedChange {
  unit: string;
  unitId: string;
  parameter: string;
  from: unknown;
  to: unknown;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): unknown {
  const keys = path.split('.');
  let at: Record<string, unknown> = target;
  for (const k of keys.slice(0, -1)) {
    const next = at[k];
    at[k] = next && typeof next === 'object' && !Array.isArray(next) ? { ...(next as Record<string, unknown>) } : {};
    at = at[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1]!;
  const before = at[last];
  at[last] = value;
  return before;
}

/** A copy of the graph with the scenario's changes, and what each change did. */
export function applyScenario(graph: ProcessGraph, scenario: Scenario): { graph: ProcessGraph; applied: AppliedChange[]; warnings: string[] } {
  const nodes = graph.nodes.map((n) => ({ ...n, config: { ...(n.config as Record<string, unknown>) } })) as ProcessNode[];
  const copy: ProcessGraph = { ...graph, nodes };
  const applied: AppliedChange[] = [];
  const warnings: string[] = [];
  for (const change of scenario.changes ?? []) {
    const found = resolveUnit(copy, String(change?.unit ?? ''));
    if (typeof found === 'string') {
      warnings.push(found);
      continue;
    }
    for (const [param, value] of Object.entries(change.parameters ?? {})) {
      const config = found.config as Record<string, unknown>;
      const topLevel = param.split('.')[0]!;
      if (!(topLevel in config)) {
        warnings.push(`"${found.name}" had no setting "${topLevel}"; it was added. If the engine does not read it, it changes nothing (list_standard_unit_ops shows each unit's settings).`);
      }
      const from = setPath(config, param, value);
      applied.push({ unit: found.name, unitId: found.id, parameter: param, from, to: value });
    }
  }
  return { graph: copy, applied, warnings };
}

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const pct = (after: number, before: number) => (before > 0 ? round(((after - before) / before) * 100) : after > 0 ? null : 0);

function measure(graph: ProcessGraph, minutes: number, seed?: number) {
  const run = simulateProcess(graph, minutes, seed !== undefined ? { seed } : {});
  const stat = validateProcessGraph(graph).bottlenecks;
  const bottleneck = graph.nodes.find((n) => n.id === stat.bottleneckNodeId);
  return {
    seed: run.seed,
    unitsPerMinute: run.averageLineThroughputUnitsPerMin,
    unitsFinished: run.totalUnitsPackaged,
    unitsScrapped: run.totalUnitsScrapped,
    liquidOutGallons: run.totalFluidDeliveredGallons,
    staticCapacityPerMinute: round(stat.maximumSystemThroughputUnitsPerMin, 2),
    bottleneck: bottleneck ? { id: bottleneck.id, name: bottleneck.name } : null,
    run
  };
}

export function executeCompareScenarios(graph: ProcessGraph, params: CompareScenariosParams) {
  if (!Array.isArray(params?.scenarios) || params.scenarios.length === 0) {
    throw new Error('Give "scenarios": at least one { name, changes: [{ unit, parameters }] }.');
  }
  const minutes = params.durationMinutes && params.durationMinutes > 0 ? params.durationMinutes : 60;
  const base = measure(graph, minutes, params.seed);
  // Every scenario replays the baseline's seed, so random draws match.
  const seed = base.seed;

  const scenarios = params.scenarios.slice(0, 8).map((s, i) => {
    const { graph: changed, applied, warnings } = applyScenario(graph, s);
    const m = measure(changed, minutes, seed);
    const touched = [...new Set(applied.map((a) => a.unitId))].map((id) => {
      const before = base.run.nodeReports[id];
      const after = m.run.nodeReports[id];
      return {
        unit: changed.nodes.find((n) => n.id === id)?.name ?? id,
        oeeBefore: before?.overallOeePercentage,
        oeeAfter: after?.overallOeePercentage,
        blockedSecondsBefore: before?.blockedTimeSeconds,
        blockedSecondsAfter: after?.blockedTimeSeconds,
        starvedSecondsBefore: before?.starvedTimeSeconds,
        starvedSecondsAfter: after?.starvedTimeSeconds
      };
    });
    return {
      name: s.name || `Scenario ${i + 1}`,
      applied,
      ...(warnings.length ? { warnings } : {}),
      unitsPerMinute: m.unitsPerMinute,
      unitsPerMinuteChangePercent: pct(m.unitsPerMinute, base.unitsPerMinute),
      unitsFinished: m.unitsFinished,
      liquidOutGallons: m.liquidOutGallons,
      liquidOutChangePercent: pct(m.liquidOutGallons, base.liquidOutGallons),
      staticCapacityPerMinute: m.staticCapacityPerMinute,
      bottleneck: m.bottleneck,
      bottleneckMoved: m.bottleneck?.id !== base.bottleneck?.id,
      changedUnits: touched
    };
  });

  const best = [...scenarios].sort((a, b) => b.unitsPerMinute - a.unitsPerMinute || b.liquidOutGallons - a.liquidOutGallons)[0]!;
  const lines = scenarios.map((s) => {
    const d = s.unitsPerMinuteChangePercent;
    const moved = s.bottleneckMoved && s.bottleneck ? `; the bottleneck moves to ${s.bottleneck.name}` : '';
    return `${s.name}: ${s.unitsPerMinute}/min (${d === null ? 'new output' : `${d >= 0 ? '+' : ''}${d}%`})${moved}.`;
  });
  return {
    success: true,
    durationMinutes: minutes,
    seed,
    baseline: {
      unitsPerMinute: base.unitsPerMinute,
      unitsFinished: base.unitsFinished,
      unitsScrapped: base.unitsScrapped,
      liquidOutGallons: base.liquidOutGallons,
      staticCapacityPerMinute: base.staticCapacityPerMinute,
      bottleneck: base.bottleneck
    },
    scenarios,
    summary: `Baseline: ${base.unitsPerMinute}/min, limited by ${base.bottleneck?.name ?? 'nothing in the static analysis'}. ${lines.join(' ')} Best: ${best.name}. Each run used seed ${seed} over ${minutes} min; nothing on the flowsheet was changed.`
  };
}
