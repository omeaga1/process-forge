import type { ProcessGraph } from '@process-forge/protocol';
import { solveSteadyState, type SteadyResult } from '@process-forge/simulation-core';

/**
 * solve_steady_state: the line's heat and mass balance at steady state, in
 * milliseconds, with the same status and coded issues as a run. The answer is
 * the one a long dynamic run settles to (it steps the same network); what it
 * adds is speed, a converged recycle (Wegstein on the tears), and a plain
 * "no steady state" when a tank fills or a recycle cannot close.
 */
export function steadyState(graph: ProcessGraph, params: { tolerance?: number; maxIterations?: number } = {}) {
  const r: SteadyResult = solveSteadyState(graph, { ...(params.tolerance ? { tolerance: params.tolerance } : {}), ...(params.maxIterations ? { maxIterations: params.maxIterations } : {}) });
  const issues: { code: string; severity: 'error' | 'warning' | 'info'; unit?: string; message: string }[] = [];
  if (r.status === 'no-steady-state') issues.push({ code: 'NO_STEADY_STATE', severity: 'error', message: r.message });
  if (r.status === 'not-converged') issues.push({ code: 'NOT_CONVERGED', severity: 'error', message: r.message });
  for (const u of r.units) {
    for (const c of u.failingChecks ?? []) {
      issues.push({ code: c.severity === 'ERROR' ? 'CONTRACT_ERROR' : 'CONTRACT_WARNING', severity: c.severity === 'ERROR' ? 'error' : 'info', unit: u.name, message: `"${c.message}" at steady state.` });
    }
  }
  for (const e of r.energy) if (e.verdict === 'mismatch') issues.push({ code: 'ENERGY_MISMATCH', severity: 'warning', unit: e.name, message: e.note });
  const order = { error: 0, warning: 1, info: 2 } as const;
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  const status = r.status === 'not-applicable' ? 'not-applicable' : issues.some((i) => i.severity === 'error') ? 'failed' : issues.some((i) => i.severity === 'warning') ? 'warnings' : 'ok';
  return {
    success: r.status !== 'not-applicable',
    status,
    solve: r.status,
    message: r.message,
    issues,
    iterations: r.iterations,
    ...(r.tears.length ? { tears: r.tears, pattern: r.pattern } : {}),
    elapsedMs: r.elapsedMs,
    massBalance: r.massBalance,
    streams: r.streams,
    units: r.units,
    energy: r.energy.map((e) => ({ unit: e.name, kind: e.kind, verdict: e.verdict, impliedHeatKw: e.impliedHeatKwh, ...(e.statedDutyKwh !== undefined ? { statedDutyKw: e.statedDutyKwh } : {}), note: e.note })),
    convergence: r.history.length > 30 ? [...r.history.slice(0, 10), ...r.history.slice(-10)] : r.history
  };
}
