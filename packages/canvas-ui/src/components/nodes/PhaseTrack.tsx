import React from 'react';
import { useTheme } from '../../hooks/useTheme.js';

/**
 * Where a batch is in its cycle: one segment per phase of the unit's
 * contract, ticked between phases, the phase in hand lit and the ones behind
 * it shaded. Read from the run's telemetry; nothing here estimates anything.
 */
export const PhaseTrack: React.FC<{ phases: string[]; current?: string; color: string; width: number }> = ({ phases, current, color, width }) => {
  const { palette, font } = useTheme();
  const at = current ? phases.indexOf(current) : -1;
  if (phases.length < 2) return null;
  return (
    <div
      role="img"
      aria-label={at >= 0 ? `Phase ${at + 1} of ${phases.length}: ${current}` : `${phases.length} phases`}
      title={phases.map((p, i) => `${i + 1}. ${p}${i === at ? ' (now)' : ''}`).join('\n')}
      style={{ display: 'flex', flexDirection: 'column', gap: 3, width, margin: '5px auto 0' }}
    >
      <div style={{ display: 'flex', gap: 2, height: 5 }}>
        {phases.map((p, i) => (
          <div
            key={p + i}
            style={{
              flex: 1,
              backgroundColor: i === at ? color : i < at ? `${color}55` : palette.background.surfaceMuted,
              border: `1px solid ${i === at ? color : palette.border.default}`,
              boxShadow: i === at ? `0 0 6px ${color}88` : 'none',
              transition: 'background-color 300ms linear'
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: font.mono, fontSize: 10, color: palette.text.muted, letterSpacing: '0.04em' }}>
        <span>{at >= 0 ? `${at + 1}/${phases.length}` : ''}</span>
        <span>{at >= 0 && at + 1 < phases.length ? `next: ${phases[at + 1]}` : at === phases.length - 1 ? `next: ${phases[0]}` : ''}</span>
      </div>
    </div>
  );
};
