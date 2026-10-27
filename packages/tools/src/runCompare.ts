import { effectiveContract, type ProcessGraph } from '@process-forge/protocol';
import type { SimulationResult } from '@process-forge/simulation-core';
import { lineLosses, type WaitCause } from './losses.js';
import { flowsheetDiff } from './plan.js';

/**
 * Two runs of a line side by side: one the engineer pinned, and a later one
 * after they changed something. What moved (the line's rate, the end of the
 * line's OEE, how long it waited and on what) next to what was changed in
 * between, so an effect is read beside its cause. Both runs replay the same
 * seed (the engine seeds from the flowsheet's id), so a difference is the
 * change's, not chance's.
 */

export interface RunSide {
  /** The flowsheet as it was when the run was made. */
  graph: ProcessGraph;
  result: SimulationResult;
}

export interface FigureChange {
  before: number;
  after: number;
  /** Null when the pinned run had none of it: there is no percentage of nothing. */
  changePercent: number | null;
}

export interface CauseChange {
  unitId: string;
  unit: string;
  doing: string;
  wait: WaitCause['wait'];
  /** Percent of each run the end of the line spent waiting on this unit, doing this. */
  before: number;
  after: number;
}

export interface RunComparison {
  /** Items a minute, or kg an hour for a line whose product is bulk. */
  per: '/min' | 'kg/h';
  rate: FigureChange;
  /** The OEE of the unit at the end of the line, when both runs end on the same unit. */
  oee?: FigureChange & { unitId: string; unit: string };
  /** Percent of the run the end of the line waited, when both runs end on the same unit. */
  waited?: FigureChange & { unitId: string; unit: string };
  /** What the end of the line waited on, in either run, largest first. */
  causes: CauseChange[];
  /** What was changed on the flowsheet between the two runs. */
  changes: RunChange[];
  /** Run lengths, minutes: rates compare across lengths, but a short run is mostly start-up. */
  minutes: { before: number; after: number };
  summary: string;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function change(before: number, after: number): FigureChange {
  return { before, after, changePercent: before === 0 ? (after === 0 ? 0 : null) : Math.round(((after - before) / before) * 1000) / 10 };
}

const show = (v: unknown) =>
  typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : typeof v === 'string' ? v : v === undefined ? 'unset' : JSON.stringify(v);

export interface RunChange {
  /** The unit it was made on, by its name now; absent for a stream piped or unpiped. */
  unit?: string;
  /** The change, without the unit: "reaction time 45 → 30 min", "added", "piped A → B". */
  what: string;
}

/**
 * A unit's settings that differ, by the labels its contract gives them
 * ("reaction time", in min). A designed unit keeps its settings in its
 * contract, a standard one in its config; both are read through the contract
 * it runs on, and any other config key by its own name.
 */
function settingsChanged(was: ProcessGraph['nodes'][number], now: ProcessGraph['nodes'][number], before: ProcessGraph, after: ProcessGraph): string[] {
  const pa = effectiveContract(was, before.edges)?.parameters ?? [];
  const pb = effectiveContract(now, after.edges)?.parameters ?? [];
  const out: string[] = [];
  for (const p of pb) {
    const old = pa.find((q) => q.name === p.name);
    if (old && old.value !== p.value) out.push(`${p.label.toLowerCase()} ${show(old.value)} → ${show(p.value)}${p.unit && p.unit !== '-' ? ` ${p.unit}` : ''}`);
  }
  const named = new Set([...pa, ...pb].map((p) => p.name));
  const ca = was.config as Record<string, unknown>;
  const cb = now.config as Record<string, unknown>;
  for (const k of new Set([...Object.keys(ca), ...Object.keys(cb)])) {
    if (k === 'contract' || k === 'designSpecs' || named.has(k)) continue;
    if (JSON.stringify(ca[k]) !== JSON.stringify(cb[k])) out.push(`${k} ${show(ca[k])} → ${show(cb[k])}`);
  }
  if (was.name !== now.name) out.push(`renamed from ${was.name}`);
  return out;
}

/** The flowsheet changes between two runs, one each. */
export function changesBetween(before: ProcessGraph, after: ProcessGraph): RunChange[] {
  const d = flowsheetDiff(before, after);
  const was = new Map(before.nodes.map((n) => [n.id, n]));
  return [
    ...after.nodes.flatMap((n) => {
      const old = was.get(n.id);
      return old ? settingsChanged(old, n, before, after).map((what) => ({ unit: n.name, what })) : [];
    }),
    ...d.unitsAdded.map((u) => ({ unit: u, what: 'added' })),
    ...d.unitsRemoved.map((u) => ({ unit: u, what: 'removed' })),
    ...d.streamsAdded.map((s) => ({ what: `piped ${s}` })),
    ...d.streamsRemoved.map((s) => ({ what: `unpiped ${s}` }))
  ];
}

export function compareRuns(pinned: RunSide, current: RunSide): RunComparison {
  const a = pinned.result;
  const b = current.result;
  // A line that finishes no items in either run is read by mass.
  const items = a.totalUnitsPackaged > 0 || b.totalUnitsPackaged > 0;
  const per = items ? '/min' : 'kg/h';
  const rateOf = (r: SimulationResult) =>
    items ? round1(r.averageLineThroughputUnitsPerMin) : r.simulatedTimeSeconds > 0 ? Math.round((r.totalFluidDeliveredKg / r.simulatedTimeSeconds) * 3600) : 0;

  const la = lineLosses(pinned.graph, a, 0);
  const lb = lineLosses(current.graph, b, 0);
  const sameEnd = la && lb && la.unitId === lb.unitId ? lb : undefined;
  const oeeOf = (r: SimulationResult, id: string) => Math.round(r.nodeReports[id]?.overallOeePercentage ?? 0);

  const key = (c: WaitCause) => `${c.wait}|${c.unitId}|${c.doing}`;
  const merged = new Map<string, CauseChange>();
  for (const c of la?.causes ?? []) merged.set(key(c), { unitId: c.unitId, unit: c.unit, doing: c.doing, wait: c.wait, before: c.percentOfRun, after: 0 });
  for (const c of lb?.causes ?? []) {
    const m = merged.get(key(c));
    // The name as the line has it now: a unit renamed in between is still the same unit.
    merged.set(key(c), m ? { ...m, unit: c.unit, after: c.percentOfRun } : { unitId: c.unitId, unit: c.unit, doing: c.doing, wait: c.wait, before: 0, after: c.percentOfRun });
  }
  const causes = [...merged.values()].sort((x, y) => Math.max(y.before, y.after) - Math.max(x.before, x.after));

  const rate = change(rateOf(a), rateOf(b));
  const changes = changesBetween(pinned.graph, current.graph);
  const moved = rate.changePercent === null ? 'new output' : `${rate.changePercent >= 0 ? '+' : ''}${rate.changePercent}%`;
  const line = (c: RunChange) => (c.unit ? `${c.unit}: ${c.what}` : c.what);
  const after = changes.length === 0 ? 'with nothing on the flowsheet changed' : `after ${changes.slice(0, 2).map(line).join('; ')}${changes.length > 2 ? ` and ${changes.length - 2} more` : ''}`;

  return {
    per,
    rate,
    ...(sameEnd ? { oee: { ...change(oeeOf(a, sameEnd.unitId), oeeOf(b, sameEnd.unitId)), unitId: sameEnd.unitId, unit: sameEnd.unit } } : {}),
    ...(sameEnd && la
      ? { waited: { ...change(la.starvedPercent + la.blockedPercent, sameEnd.starvedPercent + sameEnd.blockedPercent), unitId: sameEnd.unitId, unit: sameEnd.unit } }
      : {}),
    causes,
    changes,
    minutes: { before: a.durationMinutes, after: b.durationMinutes },
    summary: `${rate.before} → ${rate.after} ${per} (${moved}) ${after}.`
  };
}
