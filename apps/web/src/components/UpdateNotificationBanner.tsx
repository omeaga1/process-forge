import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, X, Sparkles, ExternalLink } from 'lucide-react';
import { OsakaJadePalette } from '@process-forge/theme';

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  should_update: boolean;
  release_notes: string;
  release_url: string;
}

export const UpdateNotificationBanner: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  useEffect(() => {
    // Check if running inside Tauri desktop environment
    const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
    
    if (isTauri) {
      const invoke = (window as any).__TAURI_INTERNALS__?.invoke || (window as any).__TAURI__?.invoke;
      if (typeof invoke === 'function') {
        invoke('check_for_updates')
          .then((res: UpdateInfo) => {
            if (res && res.should_update) {
              setUpdateInfo(res);
            }
          })
          .catch((err: any) => {
            console.debug('ProcessForge Desktop update check:', err);
          });
      }
    }
  }, []);

  const handleUpdate = () => {
    setIsUpdating(true);
    if (updateInfo?.release_url) {
      window.open(updateInfo.release_url, '_blank');
    }
    setTimeout(() => {
      setIsUpdating(false);
      setIsDismissed(true);
    }, 2000);
  };

  if (!updateInfo || !updateInfo.should_update || isDismissed) {
    return null;
  }

  return (
    <aside
      aria-label="Application Update"
      style={{
        position: 'fixed',
        top: 54,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9000,
        width: 'calc(100% - 32px)',
        maxWidth: 760,
        backgroundColor: OsakaJadePalette.background.surfaceElevated,
        border: `1px solid ${OsakaJadePalette.jade.glow}`,
        borderRadius: 8,
        boxShadow: `0 8px 30px rgba(0,0,0,0.6), 0 0 16px ${OsakaJadePalette.jade.glow}33`,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        animation: 'slideDown 0.3s ease-out'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            backgroundColor: `${OsakaJadePalette.jade.muted}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: OsakaJadePalette.jade[300]
          }}
        >
          <Sparkles size={16} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: OsakaJadePalette.text.primary }}>
              Update Available: v{updateInfo.latest_version}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                padding: '1px 6px',
                borderRadius: 4,
                backgroundColor: OsakaJadePalette.background.surface,
                color: OsakaJadePalette.text.secondary,
                border: `1px solid ${OsakaJadePalette.border.default}`
              }}
            >
              current: v{updateInfo.current_version}
            </span>
          </div>
          <div
            style={{
              fontSize: '0.78rem',
              color: OsakaJadePalette.text.secondary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {updateInfo.release_notes || 'New stability improvements and simulation optimizations are ready.'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleUpdate}
          disabled={isUpdating}
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
        >
          {isUpdating ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
          {isUpdating ? 'Opening Releases...' : 'Update Now'}
        </button>

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
          Notes
        </a>

        <button
          onClick={() => setIsDismissed(true)}
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
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </aside>
  );
};
