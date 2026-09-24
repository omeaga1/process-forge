import React, { useEffect } from 'react';
import { useTheme } from '@process-forge/canvas-ui';
import { Sparkles, X } from 'lucide-react';
import type { BridgeArrival } from '../hooks/useMcpBridge.js';

/**
 * "Your MCP client added X to the flowsheet." Themed like the rest of the
 * app, and gone after a few seconds: it is a heads-up, not a dialog.
 */
export const McpArrivalNotice: React.FC<{ arrival: BridgeArrival | null; onDismiss: () => void }> = ({ arrival, onDismiss }) => {
  const { palette, radius: r } = useTheme();

  useEffect(() => {
    if (!arrival) return;
    const t = window.setTimeout(onDismiss, 6000);
    return () => window.clearTimeout(t);
  }, [arrival, onDismiss]);

  if (!arrival) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 20,
        transform: 'translateX(-50%)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: 'calc(100vw - 32px)',
        padding: '8px 8px 8px 12px',
        borderRadius: r.lg,
        backgroundColor: palette.background.surfaceElevated,
        border: `1px solid ${palette.border.default}`,
        color: palette.text.primary,
        fontSize: 13,
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.18)'
      }}
    >
      <Sparkles size={15} color={palette.jade[500]} />
      <span>
        <strong>{arrival.name}</strong> added by your MCP client
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        style={{
          display: 'inline-flex',
          background: 'none',
          border: 'none',
          color: palette.text.muted,
          cursor: 'pointer',
          padding: 4
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
};
