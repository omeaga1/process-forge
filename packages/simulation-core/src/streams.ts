import { edgePhase, type ProcessGraph } from '@process-forge/protocol';
import type { NodeTelemetrySnapshot } from './types.js';

/** One end of a stream: the unit and the port it leaves or enters by. */
export interface StreamEnd {
  unitId: string;
  unit: string;
  port?: string;
}

/**
 * A stream at one moment of a run, as a simulator's stream report lists it.
 * Figures absent when they do not apply (no volume flow for a gas, no mass
 * flow for items) or before the run has reached the stream.
 */
export interface StreamState {
  id: string;
  /** S1, S2... in the order the flowsheet lists its streams. */
  number: string;
  from: StreamEnd;
  to: StreamEnd;
  phase: 'LIQUID' | 'GAS' | 'SOLID' | 'ITEMS';
  kgPerHour?: number;
  gpm?: number;
  itemsPerMin?: number;
  temperatureC?: number;
  /** Mass fractions, largest first. */
  composition?: Record<string, number>;
  /** The unit it leaves is blocked: the stream is backed up. */
  blocked: boolean;
}

/**
 * Every stream on the flowsheet from each unit's snapshot at one moment: a
 * unit that reports per port gives each port's own flow, temperature and mix
 * (and nothing from a port it does not list); others give the unit's.
 */
export function streamStates(graph: ProcessGraph, snapshots: ReadonlyMap<string, NodeTelemetrySnapshot>): StreamState[] {
  return graph.edges.map((e, i) => {
    const src = graph.nodes.find((n) => n.id === e.sourceNodeId);
    const dst = graph.nodes.find((n) => n.id === e.targetNodeId);
    const end = (n: typeof src, portId: string, ports: 'inputs' | 'outputs'): StreamEnd => {
      const port = n?.[ports].find((p) => p.id === portId)?.name;
      return { unitId: n?.id ?? '', unit: n?.name ?? '?', ...(port ? { port } : {}) };
    };
    const phase = edgePhase(graph.nodes, e) ?? (e.stream?.type === 'DISCRETE_CONTAINER_STREAM' ? 'ITEMS' : 'LIQUID');
    const t = snapshots.get(e.sourceNodeId);
    const port = t?.portFlows?.[e.sourcePortId];
    const kgPerHour = t ? (t.portFlows ? port?.kgPerHour ?? 0 : t.kgPerHour) : undefined;
    const gpm = t ? (t.portFlows ? port?.gpm : t.flowGpm) : undefined;
    const temperatureC = port?.temperatureC ?? t?.temperatureC;
    const composition = t ? (t.portFlows ? port?.composition : t.composition) : undefined;
    return {
      id: e.id,
      number: `S${i + 1}`,
      from: end(src, e.sourcePortId, 'outputs'),
      to: end(dst, e.targetPortId, 'inputs'),
      phase,
      ...(kgPerHour !== undefined && phase !== 'ITEMS' ? { kgPerHour } : {}),
      ...(gpm !== undefined && phase === 'LIQUID' ? { gpm } : {}),
      ...(t && phase === 'ITEMS' ? { itemsPerMin: Math.round(t.instantaneousRatePerMin * 10) / 10 } : {}),
      ...(temperatureC !== undefined && phase !== 'ITEMS' ? { temperatureC } : {}),
      ...(composition && phase !== 'ITEMS' ? { composition: Object.fromEntries(Object.entries(composition).sort((a, b) => b[1] - a[1])) } : {}),
      blocked: t?.state === 'BLOCKED'
    };
  });
}

/** Each unit's last snapshot in a run's telemetry: the state at the end of the run. */
export function finalSnapshots(log: readonly NodeTelemetrySnapshot[]): Map<string, NodeTelemetrySnapshot> {
  const out = new Map<string, NodeTelemetrySnapshot>();
  for (const s of log) {
    const prev = out.get(s.nodeId);
    if (!prev || s.timeSeconds >= prev.timeSeconds) out.set(s.nodeId, s);
  }
  return out;
}

/**
 * Every stream averaged over a run up to a moment: flows over the time, the
 * temperature and mix weighted by the mass that moved (so an idle stretch does
 * not drag the temperature to the unit's resting state). What an engineer
 * reads from a stream report; the snapshot at one moment can catch a line
 * between batches with everything at zero.
 */
export function averageStreamStates(graph: ProcessGraph, log: readonly NodeTelemetrySnapshot[], untilSeconds = Infinity): StreamState[] {
  const times = [...new Set(log.filter((s) => s.timeSeconds <= untilSeconds).map((s) => s.timeSeconds))].sort((a, b) => a - b);
  if (!times.length) return streamStates(graph, new Map());
  const byTime = new Map<number, Map<string, NodeTelemetrySnapshot>>();
  for (const s of log) {
    if (s.timeSeconds > untilSeconds) continue;
    let m = byTime.get(s.timeSeconds);
    if (!m) byTime.set(s.timeSeconds, (m = new Map()));
    m.set(s.nodeId, s);
  }
  type Acc = { kg: number; gal: number; items: number; heat: number; comp: Record<string, number>; seconds: number; any: boolean };
  const acc = new Map<string, Acc>();
  let prev = 0;
  let last: StreamState[] = [];
  for (const t of times) {
    const dt = t - prev;
    prev = t;
    last = streamStates(graph, byTime.get(t)!);
    if (dt <= 0) continue;
    for (const s of last) {
      const a = acc.get(s.id) ?? { kg: 0, gal: 0, items: 0, heat: 0, comp: {}, seconds: 0, any: false };
      a.seconds += dt;
      const kg = ((s.kgPerHour ?? 0) * dt) / 3600;
      a.kg += kg;
      a.gal += ((s.gpm ?? 0) * dt) / 60;
      a.items += ((s.itemsPerMin ?? 0) * dt) / 60;
      if (kg > 0 && s.temperatureC !== undefined) a.heat += kg * s.temperatureC;
      if (kg > 0 && s.composition) for (const [c, x] of Object.entries(s.composition)) a.comp[c] = (a.comp[c] ?? 0) + kg * x;
      a.any ||= s.kgPerHour !== undefined || s.itemsPerMin !== undefined;
      acc.set(s.id, a);
    }
  }
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const lastSnaps = byTime.get(times[times.length - 1]!)!;
  return last.map((s) => {
    const a = acc.get(s.id);
    if (!a || !a.any || a.seconds <= 0) return s;
    const kgWeighted = a.kg > 0;
    const compTotal = Object.values(a.comp).reduce((x, y) => x + y, 0);
    const { kgPerHour: _k, gpm: _g, itemsPerMin: _i, temperatureC: _t, composition: _c, ...rest } = s;
    return {
      ...rest,
      ...(s.kgPerHour !== undefined ? { kgPerHour: round1((a.kg / a.seconds) * 3600) } : {}),
      ...(s.gpm !== undefined ? { gpm: round1((a.gal / a.seconds) * 60) } : {}),
      // Items: what the unit it leaves has made, over the time (a windowed rate would smear its bursts).
      ...(s.itemsPerMin !== undefined ? { itemsPerMin: round1(((lastSnaps.get(s.from.unitId)?.unitsProduced ?? 0) / a.seconds) * 60) } : {}),
      // Temperature and mix of what flowed; with nothing flowed, the snapshot's own.
      ...(kgWeighted ? { temperatureC: round1(a.heat / a.kg) } : s.temperatureC !== undefined ? { temperatureC: s.temperatureC } : {}),
      ...(compTotal > 0
        ? { composition: Object.fromEntries(Object.entries(a.comp).map(([c, v]) => [c, Math.round((v / compTotal) * 1e4) / 1e4] as [string, number]).sort((x, y) => y[1] - x[1])) }
        : s.composition
          ? { composition: s.composition }
          : {}),
      blocked: false
    };
  });
}
