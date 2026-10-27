import type { ProcessGraph } from '@process-forge/protocol';
import type { MachineOperationalState, SimulationResult } from '@process-forge/simulation-core';

/**
 * Where the line's time went: the last unit on the line, how long it ran,
 * and for every minute it waited, which unit made it wait and what that unit
 * was doing then.
 *
 * A bottleneck verdict names one unit; it does not say how much the line lost
 * to it, or to which of its phases. A line limited by a batch carbonator loses
 * its time while the carbonator fills and reacts, not while it discharges, and
 * the fix (a second vessel, a shorter reaction) follows from which. So each
 * minute the end of the line was starved is traced upstream through the units
 * that were starved too, to the first one that was not: that unit, and its
 * state or batch phase, is the cause. A blocked minute is traced downstream the
 * same way. Telemetry is a snapshot a minute, so the shares are read off the
 * snapshots and scaled to the exact starved and blocked seconds the run kept.
 */

export interface WaitCause {
  /** The unit that made the line wait, or the feed that ran dry. */
  unitId: string;
  unit: string;
  /** What it was doing: its batch phase ("Reacting"), "broken down", "running", or "ran dry" (a feed). */
  doing: string;
  /** Starved (waiting on what comes in) or blocked (waiting on what goes out). */
  wait: 'starved' | 'blocked';
  seconds: number;
  percentOfRun: number;
}

export interface LineLosses {
  /** The unit whose time this is: the last one on the line, the one that finishes product. */
  unitId: string;
  unit: string;
  runningPercent: number;
  starvedPercent: number;
  blockedPercent: number;
  downPercent: number;
  /** Largest first. */
  causes: WaitCause[];
  summary: string;
}

const WAITING: ReadonlySet<MachineOperationalState> = new Set(['STARVED', 'IDLE']);

/** Only worth saying when the end of the line waited at least this share of the run. */
const MIN_WAIT_SHARE = 0.1;

export function lineLosses(graph: ProcessGraph, result: SimulationResult): LineLosses | undefined {
  const total = result.simulatedTimeSeconds;
  if (total <= 0) return undefined;
  const units = new Map(graph.nodes.filter((n) => n.kind !== 'TERMINAL').map((n) => [n.id, n]));
  const terminals = new Map(graph.nodes.filter((n) => n.kind === 'TERMINAL').map((n) => [n.id, n]));
  const into = (id: string) => graph.edges.filter((e) => e.targetNodeId === id).map((e) => e.sourceNodeId);
  const outOf = (id: string) => graph.edges.filter((e) => e.sourceNodeId === id).map((e) => e.targetNodeId);

  // The end of the line: units that send nothing on to another unit. Of those, the one that made the most.
  const made = (id: string) => {
    const r = result.nodeReports[id];
    return (r?.unitsProduced ?? 0) + (r?.fluid?.deliveredKg ?? 0);
  };
  const ends = [...units.keys()].filter((id) => !outOf(id).some((t) => units.has(t)));
  const end = ends.sort((a, b) => made(b) - made(a))[0];
  if (!end || made(end) <= 0) return undefined;
  const rep = result.nodeReports[end]!;
  const starved = rep.starvedTimeSeconds ?? 0;
  const blocked = rep.blockedTimeSeconds ?? 0;
  if ((starved + blocked) / total < MIN_WAIT_SHARE) return undefined;

  // Every unit's state at each snapshot.
  const at = new Map<number, Map<string, { state: MachineOperationalState; phase?: string }>>();
  for (const s of result.telemetryLog) {
    let m = at.get(s.timeSeconds);
    if (!m) at.set(s.timeSeconds, (m = new Map()));
    m.set(s.nodeId, { state: s.state, ...(s.phaseName ? { phase: s.phaseName } : {}) });
  }

  const doing = (x: { state: MachineOperationalState; phase?: string }) =>
    x.state === 'FAILED' ? 'broken down' : x.phase ? x.phase : x.state === 'BLOCKED' ? 'blocked' : x.state === 'STARVED' ? 'waiting' : 'running';

  /** Follow the wait from the end of the line to the unit that caused it, at one snapshot. */
  const trace = (states: Map<string, { state: MachineOperationalState; phase?: string }>, wait: 'starved' | 'blocked') => {
    const next = wait === 'starved' ? into : outOf;
    const passes = (s: MachineOperationalState) => (wait === 'starved' ? WAITING.has(s) : s === 'BLOCKED');
    const seen = new Set<string>([end]);
    let at = end;
    for (;;) {
      const around = next(at).filter((id) => !seen.has(id));
      const feed = around.find((id) => terminals.has(id));
      const near = around.filter((id) => units.has(id));
      if (!near.length) return feed ? { unitId: feed, doing: 'ran dry' } : undefined;
      // A broken-down neighbour is the cause outright; a waiting one passes the wait on.
      const failed = near.find((id) => states.get(id)?.state === 'FAILED');
      if (failed) return { unitId: failed, doing: 'broken down' };
      const onward = near.find((id) => passes(states.get(id)?.state ?? 'IDLE'));
      const cause = near.find((id) => !passes(states.get(id)?.state ?? 'IDLE'));
      if (cause && !onward) return { unitId: cause, doing: doing(states.get(cause)!) };
      if (cause && states.get(cause)?.phase) return { unitId: cause, doing: doing(states.get(cause)!) };
      if (!onward) return undefined;
      seen.add(onward);
      at = onward;
    }
  };

  const tally = new Map<string, { unitId: string; doing: string; wait: 'starved' | 'blocked'; n: number }>();
  const counted = { starved: 0, blocked: 0 };
  for (const states of at.values()) {
    const own = states.get(end)?.state;
    const wait = own && WAITING.has(own) ? 'starved' : own === 'BLOCKED' ? 'blocked' : undefined;
    if (!wait) continue;
    counted[wait]++;
    const c = trace(states, wait);
    if (!c) continue;
    const key = `${wait}|${c.unitId}|${c.doing}`;
    const t = tally.get(key) ?? { ...c, wait, n: 0 };
    t.n++;
    tally.set(key, t);
  }

  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
  const pct = (s: number) => Math.round((s / total) * 100);
  const causes: WaitCause[] = [...tally.values()]
    .map((t) => {
      const seconds = Math.round(((t.wait === 'starved' ? starved : blocked) * t.n) / Math.max(1, counted[t.wait]));
      return { unitId: t.unitId, unit: name(t.unitId), doing: t.doing, wait: t.wait, seconds, percentOfRun: pct(seconds) };
    })
    .filter((c) => c.percentOfRun >= 1)
    .sort((a, b) => b.seconds - a.seconds);

  const endName = name(end);
  const waited = pct(starved + blocked);
  // One clause per unit, its phases inside: "42% on "Carbonator" (28% reacting, 14% filling)".
  const byUnit = new Map<string, WaitCause[]>();
  for (const c of causes) byUnit.set(c.unitId, [...(byUnit.get(c.unitId) ?? []), c]);
  const parts = [...byUnit.values()].slice(0, 2).map((cs) => {
    const sum = cs.reduce((a, c) => a + c.percentOfRun, 0);
    const what = cs.map((c) => (cs.length > 1 ? `${c.percentOfRun}% ${c.doing.toLowerCase()}` : c.doing.toLowerCase())).join(', ');
    return `${sum}% on "${cs[0]!.unit}" (${what})`;
  });
  const summary = `"${endName}", the end of the line, waited ${waited}% of the run${parts.length ? `: ${parts.join('; ')}` : ''}.`;

  return {
    unitId: end,
    unit: endName,
    runningPercent: pct(rep.busyTimeSeconds ?? 0),
    starvedPercent: pct(starved),
    blockedPercent: pct(blocked),
    downPercent: pct(rep.downTimeSeconds ?? 0),
    causes,
    summary
  };
}
