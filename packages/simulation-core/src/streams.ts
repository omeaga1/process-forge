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
