import { validateProcessGraph, type ProcessGraph } from '@process-forge/protocol';
import type { SimulationResult, SteadyResult } from '@process-forge/simulation-core';
import { auditRun } from '@process-forge/tools';

/**
 * Where the flowsheet stands, in one line, as a process simulator's status
 * bar says it (Aspen Plus: "Flowsheet Not Complete", "Required Input
 * Incomplete", "Required Input Complete", "Results Available"): what is
 * missing, whether it is ready, whether it has been solved, and whether the
 * results still belong to what is on the canvas. Every problem names its unit,
 * so the bar can take the engineer to it, and F4 walks them in turn.
 */

export type StatusTone = 'empty' | 'incomplete' | 'ready' | 'solved' | 'ok' | 'warnings' | 'failed' | 'stale';

export interface StatusProblem {
  severity: 'error' | 'warning';
  nodeId?: string;
  message: string;
}

export interface FlowsheetStatus {
  tone: StatusTone;
  headline: string;
  /** Worst first; each with its unit where it has one. */
  problems: StatusProblem[];
  /** Small print for the right of the bar: how the figures were got. */
  detail?: string;
}

const kgh = (v: number) => `${Math.round(v).toLocaleString('en-US')} kg/h`;

export interface StatusInput {
  graph: ProcessGraph;
  /** The last run, if there is one. */
  result?: SimulationResult | null;
  /** The last run was made on a flowsheet that has since changed. */
  stale?: boolean;
  /** The steady-state solve of the flowsheet as it is, when it was tried. */
  steady?: SteadyResult | null;
}

export function flowsheetStatus({ graph, result, stale, steady }: StatusInput): FlowsheetStatus {
  if (graph.nodes.length === 0) return { tone: 'empty', headline: 'Empty flowsheet: add equipment to start', problems: [] };

  const diagnostics = validateProcessGraph(graph).diagnostics;
  const structural: StatusProblem[] = diagnostics
    .filter((d) => d.severity === 'ERROR' || d.severity === 'WARNING')
    .map((d) => ({ severity: d.severity === 'ERROR' ? 'error' : 'warning', ...(d.nodeId ? { nodeId: d.nodeId } : {}), message: d.message }));
  const errors = structural.filter((p) => p.severity === 'error');
  if (errors.length) {
    return {
      tone: 'incomplete',
      headline: `${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before it runs: ${errors[0]!.message}`,
      problems: [...errors, ...structural.filter((p) => p.severity === 'warning')]
    };
  }

  if (result) {
    const audit = auditRun(graph, result);
    const problems: StatusProblem[] = [
      ...audit.issues
        .filter((i) => i.severity !== 'info')
        .map((i) => ({ severity: i.severity === 'error' ? ('error' as const) : ('warning' as const), ...(i.unitId ? { nodeId: i.unitId } : {}), message: `${i.unit ? `${i.unit}: ` : ''}${i.message}` })),
      ...structural
    ];
    const output =
      result.totalUnitsPackaged > 0
        ? `${result.averageLineThroughputUnitsPerMin}/min`
        : result.totalFluidDeliveredKg > 0
          ? kgh((result.totalFluidDeliveredKg / Math.max(1, result.durationMinutes)) * 60)
          : 'no product';
    const balance = audit.balance.mass.closes ? 'mass balances' : 'MASS DOES NOT BALANCE';
    const detail = `${result.durationMinutes} min run · seed ${result.seed}`;
    if (stale) {
      return { tone: 'stale', headline: `Results are from before your last edit (${output} then): run again`, problems, detail };
    }
    if (audit.status === 'failed') {
      const first = problems.find((p) => p.severity === 'error');
      return { tone: 'failed', headline: `Run failed: ${first?.message ?? 'see the checks'}`, problems, detail };
    }
    if (audit.status === 'warnings') {
      return { tone: 'warnings', headline: `Run done with ${problems.filter((p) => p.severity === 'warning').length} warning(s): ${output}, ${balance}`, problems, detail };
    }
    return { tone: 'ok', headline: `Run done: ${output}, ${balance}`, problems, detail };
  }

  if (steady && steady.status !== 'not-applicable') {
    const problems: StatusProblem[] = [
      ...steady.units.flatMap((u) => (u.failingChecks ?? []).map((c) => ({ severity: c.severity === 'ERROR' ? ('error' as const) : ('warning' as const), nodeId: u.nodeId, message: `${u.name}: ${c.message}` }))),
      ...steady.energy.filter((e) => e.verdict === 'mismatch').map((e) => ({ severity: 'warning' as const, nodeId: e.nodeId, message: `${e.name}: ${e.note}` })),
      ...structural
    ];
    const detail = `steady state in ${steady.iterations} steps, ${steady.elapsedMs} ms`;
    if (steady.status === 'converged') {
      const product = steady.streams.filter((s) => graph.nodes.find((n) => n.name === s.to && (n.config as { role?: string }).role === 'product')).reduce((a, s) => a + s.kgPerHour, 0);
      const failing = problems.some((p) => p.severity === 'error');
      return {
        tone: failing ? 'failed' : 'solved',
        headline: failing
          ? `Solved at steady state, but ${problems.find((p) => p.severity === 'error')!.message}`
          : `Solved at steady state: ${kgh(product || steady.massBalance.outKgPerHour)} ${product ? 'of product' : 'out'}, balance closes. Run to see it over time`,
        problems,
        detail
      };
    }
    return { tone: 'warnings', headline: steady.message, problems, detail };
  }

  return { tone: 'ready', headline: 'Ready to run (Space)', problems: structural };
}
