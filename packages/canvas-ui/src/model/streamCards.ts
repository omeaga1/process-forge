import type { ProcessGraph } from '@process-forge/protocol';
import type { SteadyResult, StreamState } from '@process-forge/simulation-core';
import type { StreamCard } from '../types.js';

/**
 * What each pipe carries, as the card shown when it is hovered and (before a
 * run) the figure drawn on it: from the run at the playhead when there is one,
 * else from the steady state the engine solved for the flowsheet as it is.
 */

const n = (v: number, d = 1) => v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : d });
const PHASE: Record<string, string> = { LIQUID: 'liquid', GAS: 'gas', SOLID: 'solids', ITEMS: 'items' };

function composition(c: Record<string, number> | undefined): [string, number][] | undefined {
  if (!c) return undefined;
  const entries = Object.entries(c)
    .filter(([, v]) => v > 1e-4)
    .sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.slice(0, 4) : undefined;
}

/** A pipe's one-line figure: gal/min and °C for a liquid, kg/h for a gas or solids. */
export function pipeFigure(phase: string, f: { kgPerHour?: number; gpm?: number; itemsPerMin?: number; temperatureC?: number }): string {
  const t = f.temperatureC !== undefined ? ` · ${n(f.temperatureC)} °C` : '';
  if (phase === 'ITEMS') return f.itemsPerMin !== undefined ? `${n(f.itemsPerMin)}/min` : '';
  if (phase === 'LIQUID' && f.gpm !== undefined) return `${n(f.gpm)} gpm${t}`;
  return f.kgPerHour !== undefined ? `${n(f.kgPerHour)} kg/h${t}` : '';
}

export function cardsFromRun(rows: StreamState[], at: string): Map<string, StreamCard> {
  return new Map(
    rows.map((s) => [
      s.id,
      {
        number: s.number,
        from: `${s.from.unit}${s.from.port ? ` · ${s.from.port}` : ''}`,
        to: `${s.to.unit}${s.to.port ? ` · ${s.to.port}` : ''}`,
        phase: PHASE[s.phase] ?? s.phase.toLowerCase(),
        source: at,
        rows: [
          ...(s.itemsPerMin !== undefined ? ([['Items', `${n(s.itemsPerMin)}/min`]] as [string, string][]) : []),
          ...(s.kgPerHour !== undefined ? ([['Mass flow', `${n(s.kgPerHour)} kg/h`]] as [string, string][]) : []),
          ...(s.gpm !== undefined ? ([['Volume flow', `${n(s.gpm)} gal/min`]] as [string, string][]) : []),
          ...(s.temperatureC !== undefined ? ([['Temperature', `${n(s.temperatureC)} °C`]] as [string, string][]) : []),
          ...(s.blocked ? ([['State', 'backed up']] as [string, string][]) : [])
        ],
        ...(composition(s.composition) ? { composition: composition(s.composition)! } : {})
      }
    ])
  );
}

export function cardsFromSteady(graph: ProcessGraph, steady: SteadyResult): Map<string, StreamCard> {
  const port = (nodeId: string | undefined, portId: string, side: 'inputs' | 'outputs') => graph.nodes.find((x) => x.id === nodeId)?.[side].find((p) => p.id === portId)?.name;
  return new Map(
    steady.streams.map((s) => {
      const e = graph.edges.find((x) => x.id === s.id);
      const fromPort = e ? port(e.sourceNodeId, e.sourcePortId, 'outputs') : undefined;
      const toPort = e ? port(e.targetNodeId, e.targetPortId, 'inputs') : undefined;
      return [
        s.id,
        {
          number: s.number,
          from: `${s.from}${fromPort ? ` · ${fromPort}` : ''}`,
          to: `${s.to}${toPort ? ` · ${toPort}` : ''}`,
          phase: PHASE[s.phase] ?? s.phase.toLowerCase(),
          source: 'steady state',
          rows: [
            ['Mass flow', `${n(s.kgPerHour)} kg/h`],
            ...(s.gpm !== undefined ? ([['Volume flow', `${n(s.gpm)} gal/min`]] as [string, string][]) : []),
            ...(s.temperatureC !== undefined ? ([['Temperature', `${n(s.temperatureC)} °C`]] as [string, string][]) : [])
          ],
          ...(composition(s.composition) ? { composition: composition(s.composition)! } : {})
        }
      ];
    })
  );
}
