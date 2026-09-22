import React, { useState, useEffect, useCallback } from 'react';
import { isDesktopRuntime } from '../runtime/desktop.js';
import {
  Download,
  RefreshCw,
  X,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { useTheme } from '@process-forge/canvas-ui';

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  should_update: boolean;
  release_notes: string;
  release_url: string;
}

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'installing'
  | 'restarting'
  | 'error';

export interface UpdateBannerProps {
  status?: UpdaterStatus;
  updateInfo?: UpdateInfo | null;
  statusMessage?: string | null;
  onDismiss?: () => void;
  onCheckForUpdates?: () => Promise<void>;
  onRestartAndApply?: () => Promise<void>;
  onHardReload?: () => void;
}

/**
 * Re-exported for the existing call sites. The definition lives in
 * runtime/desktop.ts, which is also what decides the app's initial view.
 * Two copies of this predicate could drift, and if they did the desktop app
 * would disagree with itself about whether it is a desktop app.
 */
export function isTauriEnvironment(): boolean {
  return isDesktopRuntime();
}

export async function invokeTauriCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invoke =
    (window as any).__TAURI_INTERNALS__?.invoke ||
    (window as any).__TAURI__?.invoke ||
    (window as any).__TAURI_INVOKE__;

  if (typeof invoke !== 'function') {
    throw new Error('Tauri IPC invoke interface not available');
  }
  return invoke(cmd, args);
}

export const UpdateNotificationBanner: React.FC<UpdateBannerProps> = ({
  status: controlledStatus,
  updateInfo: controlledUpdateInfo,
  statusMessage: controlledMessage,
  onDismiss: controlledDismiss,
  onCheckForUpdates,
  onRestartAndApply,
  onHardReload
}) => {
  const { palette } = useTheme();
  const OsakaJadePalette = palette;

  const [internalStatus, setInternalStatus] = useState<UpdaterStatus>('idle');
  const [internalUpdateInfo, setInternalUpdateInfo] = useState<UpdateInfo | null>(null);
  const [internalMessage, setInternalMessage] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  const status = controlledStatus ?? internalStatus;
  const updateInfo = controlledUpdateInfo ?? internalUpdateInfo;
  const statusMessage = controlledMessage ?? internalMessage;

  // Auto-check for updates once on mount in desktop environment if not externally controlled
  useEffect(() => {
    if (isTauriEnvironment() && controlledStatus === undefined) {
      invokeTauriCommand<UpdateInfo>('check_for_updates')
        .then((res) => {
          if (res && res.should_update) {
            setInternalUpdateInfo(res);
            setInternalStatus('available');
          }
        })
        .catch((err) => {
          console.debug('Background update check:', err);
        });
    }
  }, [controlledStatus]);

  // Restart & Apply update
  const handleApplyUpdate = useCallback(async () => {
    if (onRestartAndApply) {
      await onRestartAndApply();
      return;
    }

    setInternalStatus('installing');
    setInternalMessage('Downloading and preparing application update...');

    if (isTauriEnvironment()) {
      try {
        setInternalStatus('restarting');
        setInternalMessage('Installing update and restarting ProcessForge...');
        await invokeTauriCommand('install_and_restart_update');
      } catch (err: any) {
        setInternalStatus('error');
        setInternalMessage(err?.message || 'Failed to install update automatically.');
      }
    } else {
      // In browser web mode: open latest release download & perform reload
      if (updateInfo?.release_url) {
        window.open(updateInfo.release_url, '_blank');
      }
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    }
  }, [onRestartAndApply, updateInfo]);

  // Force Hard Reload & Clear Cache
  const handleHardReload = useCallback(() => {
    if (onHardReload) {
      onHardReload();
      return;
    }
    try {
      if (typeof window !== 'undefined') {
        if ('caches' in window) {
          caches.keys().then((names) => {
            names.forEach((name) => caches.delete(name));
          });
        }
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [onHardReload]);

  const handleDismiss = useCallback(() => {
    if (controlledDismiss) {
      controlledDismiss();
    } else {
      setIsDismissed(true);
      setInternalStatus('idle');
    }
  }, [controlledDismiss]);

  // In browser web studio, never show the binary update banner
  if (!isTauriEnvironment() || status === 'idle' || isDismissed) {
    return null;
  }

  return (
    <aside
      aria-label="Application Update Status"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9000,
        width: 'calc(100% - 48px)',
        maxWidth: 480,
        backgroundColor: OsakaJadePalette.background.surfaceElevated,
        border: `1px solid ${
          status === 'error'
            ? 'rgba(239, 68, 68, 0.6)'
            : status === 'available'
            ? OsakaJadePalette.jade.glow
            : OsakaJadePalette.border.default
        }`,
        borderRadius: 8,
        boxShadow: `0 8px 32px rgba(0,0,0,0.65), 0 0 16px ${
          status === 'available' ? `${OsakaJadePalette.jade.glow}33` : 'transparent'
        }`,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        animation: 'slideUp 0.3s ease-out'
      }}
    >
      {/* Left: Icon and Status Details */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden', minWidth: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            backgroundColor:
              status === 'error'
                ? 'rgba(239, 68, 68, 0.15)'
                : status === 'up-to-date'
                ? 'rgba(16, 185, 129, 0.15)'
                : `${OsakaJadePalette.jade.muted}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color:
              status === 'error'
                ? '#f87171'
                : status === 'up-to-date'
                ? OsakaJadePalette.text.accent
                : OsakaJadePalette.jade[300]
          }}
        >
          {status === 'checking' && <RefreshCw size={17} className="animate-spin" />}
          {status === 'installing' && <Download size={17} className="animate-bounce" />}
          {status === 'restarting' && <RotateCcw size={17} className="animate-spin" />}
          {status === 'available' && <Sparkles size={17} />}
          {status === 'up-to-date' && <CheckCircle2 size={17} />}
          {status === 'error' && <AlertTriangle size={17} />}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.86rem',
                fontWeight: 700,
                color: OsakaJadePalette.text.primary,
                whiteSpace: 'nowrap'
              }}
            >
              {status === 'checking' && 'Checking for updates...'}
              {status === 'installing' && 'Downloading & Installing Update...'}
              {status === 'restarting' && 'Restarting ProcessForge...'}
              {status === 'available' && `Update Available: v${updateInfo?.latest_version || 'Latest'}`}
              {status === 'up-to-date' && 'You are running the latest version'}
              {status === 'error' && 'Update Check Notice'}
            </span>

            {updateInfo?.current_version && (
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: 4,
                  backgroundColor: OsakaJadePalette.background.surface,
                  color: OsakaJadePalette.text.secondary,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  whiteSpace: 'nowrap'
                }}
              >
                current: v{updateInfo.current_version}
              </span>
            )}
          </div>

          <div
            style={{
              fontSize: '0.78rem',
              color: OsakaJadePalette.text.secondary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: 2
            }}
          >
            {statusMessage ||
              updateInfo?.release_notes ||
              (status === 'up-to-date'
                ? 'Your ProcessForge client is completely up to date with official releases.'
                : status === 'checking'
                ? 'Connecting to release servers...'
                : 'New performance improvements and simulation features are ready.')}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {status === 'available' && (
          <button
            onClick={handleApplyUpdate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.jade[500],
              color: OsakaJadePalette.text.inverse,
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: `0 0 10px ${OsakaJadePalette.jade.glow}44`
            }}
            title="Download, install, and restart ProcessForge"
          >
            <RotateCcw size={13} />
            <span>Restart & Apply Update</span>
          </button>
        )}

        {(status === 'up-to-date' || status === 'error') && (
          <button
            onClick={handleHardReload}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 6,
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.primary,
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Hard reload application and refresh cached scripts"
          >
            <RotateCcw size={12} />
            <span>Hard Reload</span>
          </button>
        )}

        {status === 'error' && onCheckForUpdates && (
          <button
            onClick={() => onCheckForUpdates()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.jade[500],
              color: OsakaJadePalette.text.inverse,
              border: 'none',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={12} />
            <span>Retry Check</span>
          </button>
        )}

        {updateInfo?.release_url && status === 'available' && (
          <a
            href={updateInfo.release_url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.background.surface,
              color: OsakaJadePalette.text.secondary,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              fontSize: '0.8rem',
              textDecoration: 'none',
              cursor: 'pointer'
            }}
          >
            <ExternalLink size={12} />
            <span>Notes</span>
          </a>
        )}

        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: OsakaJadePalette.text.muted,
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Dismiss notification"
        >
          <X size={16} />
        </button>
      </div>
    </aside>
  );
};

