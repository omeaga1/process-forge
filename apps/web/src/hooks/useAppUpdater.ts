import { useState, useEffect, useCallback } from 'react';
import {
  UpdateInfo,
  UpdaterStatus,
  isTauriEnvironment,
  invokeTauriCommand
} from '../components/UpdateNotificationBanner.js';

const CURRENT_APP_VERSION = '0.1.3';

export interface UseAppUpdaterReturn {
  status: UpdaterStatus;
  updateInfo: UpdateInfo | null;
  statusMessage: string | null;
  isChecking: boolean;
  hasUpdate: boolean;
  checkForUpdates: (isManual?: boolean) => Promise<void>;
  restartAndApplyUpdate: () => Promise<void>;
  hardReloadApp: () => void;
  dismissNotification: () => void;
}

export function useAppUpdater(): UseAppUpdaterReturn {
  const [status, setStatus] = useState<UpdaterStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const checkForUpdates = useCallback(async (isManual = false) => {
    // Only run update checks in desktop Tauri environment
    if (!isTauriEnvironment()) {
      if (isManual) {
        setStatus('up-to-date');
        setStatusMessage(`ProcessForge Web Studio v${CURRENT_APP_VERSION} is current.`);
      }
      return;
    }

    setStatus('checking');
    setStatusMessage('Checking for available ProcessForge updates...');

    try {
      const info = await invokeTauriCommand<UpdateInfo>('check_for_updates');
      setUpdateInfo(info);
      if (info && info.should_update) {
        setStatus('available');
        setStatusMessage(info.release_notes || 'New update available.');
      } else {
        if (isManual) {
          setStatus('up-to-date');
          setStatusMessage(`ProcessForge v${info?.current_version || CURRENT_APP_VERSION} is the latest release.`);
        } else {
          setStatus('idle');
        }
      }
    } catch (err: any) {
      console.debug('Tauri update check failed:', err);
      if (isManual) {
        setStatus('error');
        setStatusMessage(err?.message || 'Unable to connect to update server.');
      } else {
        setStatus('idle');
      }
    }
  }, []);

  // Background check on load (Tauri desktop only)
  useEffect(() => {
    if (isTauriEnvironment()) {
      checkForUpdates(false);
    }
  }, [checkForUpdates]);

  const restartAndApplyUpdate = useCallback(async () => {
    setStatus('installing');
    setStatusMessage('Downloading update payload and preparing installation...');

    if (isTauriEnvironment()) {
      try {
        setStatus('restarting');
        setStatusMessage('Installing update and restarting ProcessForge...');
        await invokeTauriCommand('install_and_restart_update');
      } catch (err: any) {
        setStatus('error');
        setStatusMessage(err?.message || 'Failed to install update automatically.');
      }
    } else {
      const isDesktopLauncher = typeof window !== 'undefined' &&
        (window.location.port === '42421' || window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');

      if (isDesktopLauncher) {
        try {
          setStatus('installing');
          setStatusMessage('Pulling latest release update from repository...');
          const resp = await fetch('/api/pull-update', { method: 'POST' });
          if (resp.ok) {
            setStatus('restarting');
            setStatusMessage('Update applied successfully. Refreshing application...');
            setTimeout(() => {
              window.location.reload();
            }, 1200);
            return;
          } else {
            const errData = await resp.json().catch(() => ({}));
            setStatus('error');
            setStatusMessage(errData.message || 'Launcher update pull failed. Run Update-ProcessForge.cmd if offline.');
            return;
          }
        } catch (err: any) {
          console.debug('Launcher pull-update fallback:', err);
        }
      }

      if (updateInfo?.release_url) {
        window.open(updateInfo.release_url, '_blank');
      }
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }, [updateInfo]);

  const hardReloadApp = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        if ('caches' in window) {
          caches.keys().then((keys) => {
            keys.forEach((k) => caches.delete(k));
          });
        }
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, []);

  const dismissNotification = useCallback(() => {
    setStatus('idle');
    setStatusMessage(null);
  }, []);

  return {
    status,
    updateInfo,
    statusMessage,
    isChecking: status === 'checking',
    hasUpdate: status === 'available',
    checkForUpdates,
    restartAndApplyUpdate,
    hardReloadApp,
    dismissNotification
  };
}
