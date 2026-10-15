import { effectiveContract, terminalRole, type ProcessGraph } from '@process-forge/protocol';
import type { LineBalance, SimulationResult } from '@process-forge/simulation-core';

/**
 * A run's verdict on itself, before anyone reads its numbers.
 *
 * Simulators that an AI drives fail in one way above all: a run that did not
 * do what was asked gets described as if it had. So every run carries a
 * status the model must lead with, and a list of coded issues it can act on,
 * each produced by the engine's own checks (contracts' constraints, the heat
 * and mass balance, whether the line had settled), never by the model:
 *
 *   failed    the numbers cannot be used as they are: a unit broke an ERROR
 *             check (its product is off spec), a contract failed to
 *             evaluate, or mass did not balance (an engine fault);
 *   warnings  the numbers stand, with caveats to say: a duty its streams do
 *             not bear out, a line still changing at the end of the run, a
 *             reaction that ran short;
 *   ok        every check held.
 */

export type IssueCode =
  | 'MASS_BALANCE_OPEN'
  | 'CONTRACT_ERROR'
  | 'EVALUATION_FAILED'
  | 'ENERGY_MISMATCH'
  | 'ENERGY_NOT_CHECKED'
  | 'BATCH_HEAT_MISMATCH'
  | 'REACTION_SHORT'
  | 'NOT_STEADY'
  | 'CONTRACT_WARNING';

export interface RunIssue {
  code: IssueCode;
  severity: 'error' | 'warning' | 'info';
  unitId?: string;
  unit?: string;
  message: string;
}

export interface RunAudit {
  status: 'ok' | 'warnings' | 'failed';
  issues: RunIssue[];
  /** The line's heat and mass balance, compact: mass totals, and each thermal unit's duty against its streams. */
  balance: {
    mass: Pick<LineBalance['mass'], 'inKg' | 'outKg' | 'accumulatedKg' | 'closureKg' | 'relativeError' | 'closes' | 'components'>;
    energy: LineBalance['energy'];
  };
  /** Liquid lines: whether the output rate had settled by the end of the run. */
  steady?: { settled: boolean; lastWindowKgPerHour: number; previousWindowKgPerHour: number; changePercent: number };
}

const share = (seconds: number, total: number) => {
  const pct = Math.round((seconds / total) * 100);
  return pct >= 1 ? `${pct}% of the run` : `${seconds} s of the run`;
};

/**
 * Whether a line that makes liquid had reached a steady rate: product kg/h
 * over the last fifth of the run against the fifth before it. Lines with a
 * batch unit run in cycles, so a fifth of the run is not a fair window; they
 * and lines that make items are not judged.
 */
export function steadiness(graph: ProcessGraph, result: SimulationResult): RunAudit['steady'] | undefined {
  const seconds = result.simulatedTimeSeconds;
  const products = graph.nodes.filter((n) => terminalRole(n) === 'product').map((n) => n.id);
  if (!products.length || seconds < 600) return undefined;
  const batch = graph.nodes.some((n) => {
    if (n.kind === 'TERMINAL') return false;
    return effectiveContract(n, graph.edges)?.behavior.mode === 'BATCH';
  });
  if (batch) return undefined;
  const kgAt = (t: number) => {
    let total = 0;
    for (const id of products) {
      let best: number | undefined;
      let bestT = -Infinity;
      for (const s of result.telemetryLog) {
        if (s.nodeId === id && s.timeSeconds <= t && s.timeSeconds > bestT) {
          bestT = s.timeSeconds;
          best = s.levelKg;
        }
      }
      total += best ?? 0;
    }
    return total;
  };
  const w = seconds / 5;
  const last = ((kgAt(seconds) - kgAt(seconds - w)) / w) * 3600;
  const prev = ((kgAt(seconds - w) - kgAt(seconds - 2 * w)) / w) * 3600;
  if (last <= 0 && prev <= 0) return undefined;
  const change = prev > 0 ? ((last - prev) / prev) * 100 : 100;
  return {
    settled: Math.abs(change) <= 2,
    lastWindowKgPerHour: Math.round(last * 10) / 10,
    previousWindowKgPerHour: Math.round(prev * 10) / 10,
    changePercent: Math.round(change * 10) / 10
  };
}

export function auditRun(graph: ProcessGraph, result: SimulationResult): RunAudit {
  const total = result.simulatedTimeSeconds || 1;
  const issues: RunIssue[] = [];
  const bal = result.balance;

  if (!bal.mass.closes) {
    issues.push({
      code: 'MASS_BALANCE_OPEN',
      severity: 'error',
      message: `Mass did not balance: ${bal.mass.inKg} kg in, ${bal.mass.outKg} kg out, ${bal.mass.accumulatedKg} kg more held, ${bal.mass.closureKg} kg unaccounted (${bal.mass.relativeError}). This is an engine fault, not a design problem: report it, and do not use this run's figures.`
    });
  }

  for (const node of graph.nodes) {
    const d = result.nodeReports[node.id]?.designedUnit;
    if (!d) continue;
    for (const c of d.brokenConstraints) {
      if (c.severity === 'ERROR') {
        issues.push({ code: 'CONTRACT_ERROR', severity: 'error', unitId: node.id, unit: node.name, message: `"${c.message}" for ${share(c.seconds, total)}: what it made then is off spec.` });
      } else if (c.seconds / total >= 0.05) {
        issues.push({ code: 'CONTRACT_WARNING', severity: 'info', unitId: node.id, unit: node.name, message: `"${c.message}" for ${share(c.seconds, total)}.` });
      }
    }
    if (d.evaluationError) {
      issues.push({ code: 'EVALUATION_FAILED', severity: 'error', unitId: node.id, unit: node.name, message: `Its contract failed to evaluate for ${d.evaluationErrorSeconds} s (${d.evaluationError}); it ran on its last good values meanwhile.` });
    }
    for (const r of d.shortReactions ?? []) {
      issues.push({ code: 'REACTION_SHORT', severity: 'warning', unitId: node.id, unit: node.name, message: `Reaction ${r} ran short of a co-reactant and stopped there.` });
    }
    for (const h of d.heatBalance ?? []) {
      issues.push({
        code: 'BATCH_HEAT_MISMATCH',
        severity: 'warning',
        unitId: node.id,
        unit: node.name,
        message: `Its "${h.phase}" phase put in ${h.deliveredKwh} kWh (duty × time) where the batch took ${h.neededKwh} kWh (m·cp·ΔT), in ${h.batches} batch${h.batches === 1 ? '' : 'es'}.`
      });
    }
  }

  for (const e of bal.energy) {
    if (e.verdict === 'mismatch') issues.push({ code: 'ENERGY_MISMATCH', severity: 'warning', unitId: e.nodeId, unit: e.name, message: e.note });
    else if (e.verdict === 'not-checked' && e.note.startsWith('A phase change')) issues.push({ code: 'ENERGY_NOT_CHECKED', severity: 'info', unitId: e.nodeId, unit: e.name, message: e.note });
  }

  const steady = steadiness(graph, result);
  if (steady && !steady.settled) {
    issues.push({
      code: 'NOT_STEADY',
      severity: 'warning',
      message: `The line was still changing at the end of the run: product ${steady.lastWindowKgPerHour} kg/h over the last fifth against ${steady.previousWindowKgPerHour} kg/h over the fifth before (${steady.changePercent > 0 ? '+' : ''}${steady.changePercent}%). Run it longer before quoting its rate.`
    });
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  const status = issues.some((i) => i.severity === 'error') ? 'failed' : issues.some((i) => i.severity === 'warning') ? 'warnings' : 'ok';
  const { inKg, outKg, accumulatedKg, closureKg, relativeError, closes, components } = bal.mass;
  return { status, issues, balance: { mass: { inKg, outKg, accumulatedKg, closureKg, relativeError, closes, components }, energy: bal.energy }, ...(steady ? { steady } : {}) };
}

/** Issues the diagnosis already explains unit by unit, with what to change. */
const EXPLAINED_IN_NOTES = new Set<IssueCode>(['CONTRACT_ERROR', 'CONTRACT_WARNING', 'EVALUATION_FAILED', 'REACTION_SHORT', 'BATCH_HEAT_MISMATCH']);

/**
 * The sentence a run's diagnosis starts with: the status and what it rests
 * on, and the issues no unit note below covers (the balance, steadiness).
 */
export function auditHeadline(a: RunAudit): string {
  const errors = a.issues.filter((i) => i.severity === 'error').length;
  const warnings = a.issues.filter((i) => i.severity === 'warning').length;
  const mass = a.balance.mass.closes ? 'mass balances' : 'MASS DOES NOT BALANCE';
  const energy = a.balance.energy.length
    ? `; ${a.balance.energy.filter((e) => e.verdict === 'consistent').length} of ${a.balance.energy.length} heating, cooling and phase-changing units' duties match their streams`
    : '';
  const own = a.issues
    .filter((i) => i.severity !== 'info' && !EXPLAINED_IN_NOTES.has(i.code))
    .map((i) => `${i.unit ? `${i.unit}: ` : ''}${i.message}`)
    .join(' ');
  const counts = [errors ? `${errors} error${errors === 1 ? '' : 's'}` : '', warnings ? `${warnings} warning${warnings === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
  const head = a.status === 'failed' ? 'Status: FAILED' : a.status === 'warnings' ? 'Status: ok, with warnings' : 'Status: ok';
  return `${head} (${counts ? `${counts}; ` : ''}${mass}${energy}).${own ? ` ${own}` : ''}`;
}
