import React from 'react';
import { terminalRole, type ProcessGraph } from '@process-forge/protocol';
import type { NodeTelemetrySnapshot, SimulationResult } from '@process-forge/simulation-core';
import { tint } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import { unitTag } from '../../model/unitTag.js';

export interface RunView {
  result: SimulationResult;
  /** Seconds into the run the canvas is showing. */
  timeSeconds: number;
  /** Every unit's recorded state at that moment. */
  snapshot: Map<string, NodeTelemetrySnapshot>;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const kg = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1));

/**
 * The run as it plays, in the copilot: how far in it is, what every outlet
 * has received so far and is receiving now, and every check a unit broke.
 * Follows the same playhead as the canvas, so it moves with the line.
 */
export const RunDigest: React.FC<{ graph: ProcessGraph; run: RunView }> = ({ graph, run }) => {
  const { palette, font } = useTheme();
  const { result, timeSeconds, snapshot } = run;
  const outlets = graph.nodes
    .map((n) => ({ n, role: terminalRole(n) }))
    .filter((x): x is { n: (typeof graph.nodes)[number]; role: 'product' | 'byproduct' | 'waste' } => x.role !== null && x.role !== 'feed');
  const roleColor = { product: palette.jade.glow, byproduct: palette.status.blocked, waste: palette.status.failed } as const;
  const progress = result.simulatedTimeSeconds > 0 ? Math.min(1, timeSeconds / result.simulatedTimeSeconds) : 0;
  const checks = graph.nodes.flatMap((n) =>
    (result.nodeReports[n.id]?.designedUnit?.brokenConstraints ?? []).map((c) => ({ unit: unitTag(n.name) ?? n.name, ...c }))
  );

  const label: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 700,
    color: palette.text.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontFamily: font.mono
  };

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: `1px solid ${palette.border.default}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={label}>This run</span>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: palette.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
            {clock(timeSeconds)} / {clock(result.simulatedTimeSeconds)}
          </span>
        </div>
        <div style={{ height: 3, borderRadius: 2, backgroundColor: palette.border.default, overflow: 'hidden' }}>
          <div style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: palette.jade[400], transition: 'width 0.3s linear' }} />
        </div>
      </div>

      {outlets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {outlets.map(({ n, role }) => {
            const s = snapshot.get(n.id);
            const items = (s?.unitsProduced ?? 0) > 0;
            return (
              <div
                key={n.id}
                style={{ display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 8, alignItems: 'center', padding: '6px 0' }}
                title={`${n.name} (${role})`}
              >
                <span style={{ alignSelf: 'stretch', borderRadius: 2, backgroundColor: roleColor[role] }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, color: palette.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</span>
                  <span style={{ fontSize: 10, color: palette.text.muted, textTransform: 'capitalize' }}>{role}</span>
                </span>
                <span style={{ textAlign: 'right', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ display: 'block', fontSize: 12, color: palette.text.primary }}>
                    {items ? `${(s?.unitsProduced ?? 0).toLocaleString()} units` : `${kg(s?.levelKg ?? 0)} kg`}
                  </span>
                  <span style={{ fontSize: 10, color: palette.text.muted }}>
                    {items ? `${(s?.instantaneousRatePerMin ?? 0).toFixed(1)} /min` : `${kg(s?.kgPerHour ?? 0)} kg/h now`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={label}>Checks</span>
        {checks.length === 0 ? (
          <span style={{ fontSize: 12, color: palette.jade.glow }}>Every unit kept to its contract.</span>
        ) : (
          checks.slice(0, 6).map((c, i) => {
            const color = c.severity === 'ERROR' ? palette.status.failed : palette.status.blocked;
            return (
              <div
                key={i}
                style={{
                  fontSize: 11.5,
                  lineHeight: 1.4,
                  color: palette.text.secondary,
                  padding: '6px 8px',
                  borderRadius: 6,
                  backgroundColor: tint(color, 0.08),
                  borderLeft: `2px solid ${color}`
                }}
              >
                <span style={{ fontFamily: font.mono, color, fontWeight: 700 }}>{c.unit}</span> {c.message}{' '}
                <span style={{ color: palette.text.muted }}>({c.seconds} s)</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
