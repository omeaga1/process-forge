import React from 'react';
import { tint } from '@process-forge/theme';
import { useTheme } from '../hooks/useTheme.js';
import type { FlowsheetStatus, StatusTone } from '../model/flowsheetStatus.js';

/**
 * The flowsheet's status line, along the bottom of the canvas: where it
 * stands (what is missing, ready, solved, the run's verdict, results gone
 * stale) and, when something needs fixing, how many things and which is next.
 * Clicking it, or F4, opens the next unit with a problem.
 */
export const StatusBar: React.FC<{
  status: FlowsheetStatus;
  /** Which problem F4 last went to (-1: none yet). */
  cursor: number;
  onNext: () => void;
  /** Room to leave on the right for a panel that covers the canvas. */
  rightInset?: number;
}> = ({ status, cursor, onNext, rightInset = 0 }) => {
  const { palette, font } = useTheme();
  const tone: Record<StatusTone, string> = {
    empty: palette.text.muted,
    incomplete: palette.status.failed,
    ready: palette.text.secondary,
    solved: palette.jade.glow,
    ok: palette.jade.glow,
    warnings: palette.status.blocked,
    failed: palette.status.failed,
    stale: palette.status.blocked
  };
  const color = tone[status.tone];
  const withUnits = status.problems.filter((p) => p.nodeId);
  const actionable = withUnits.length > 0;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        left: 0,
        right: rightInset,
        bottom: 0,
        zIndex: 9,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 12px 0 56px',
        boxSizing: 'border-box',
        borderTop: `1px solid ${palette.border.subtle}`,
        backgroundColor: palette.background.surface,
        fontSize: 12,
        color: palette.text.secondary
      }}
    >
      {/* The state mark: a square, its colour the only colour on the bar. */}
      <span aria-hidden style={{ width: 8, height: 8, flexShrink: 0, backgroundColor: status.tone === 'empty' || status.tone === 'ready' ? 'transparent' : color, border: `1.5px solid ${color}` }} />
      <button
        type="button"
        onClick={actionable ? onNext : undefined}
        disabled={!actionable}
        title={actionable ? 'Open the next unit with a problem (F4)' : undefined}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          border: 'none',
          background: 'transparent',
          padding: 0,
          font: 'inherit',
          color: status.tone === 'failed' || status.tone === 'incomplete' ? color : palette.text.primary,
          cursor: actionable ? 'pointer' : 'default',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {status.headline}
      </button>
      {actionable && (
        <button
          type="button"
          onClick={onNext}
          title="Open the next unit with a problem"
          style={{
            flexShrink: 0,
            height: 20,
            padding: '0 8px',
            border: `1px solid ${tint(color, 0.45)}`,
            backgroundColor: tint(color, 0.1),
            color,
            fontFamily: font.mono,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          {cursor >= 0 ? `${(cursor % withUnits.length) + 1} of ${withUnits.length}` : `${withUnits.length} to check`} · F4
        </button>
      )}
      {status.detail && (
        <span style={{ flexShrink: 0, fontFamily: font.mono, fontSize: 11, color: palette.text.muted, fontVariantNumeric: 'tabular-nums' }}>{status.detail}</span>
      )}
    </div>
  );
};
