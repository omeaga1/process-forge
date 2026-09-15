import { useState, useEffect, useCallback } from 'react';
import {
  UpdateInfo,
  UpdaterStatus,
  isTauriEnvironment,
  invokeTauriCommand
} from '../components/UpdateNotificationBanner.js';

const CURRENT_APP_VERSION = '0.1.2';

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
    setStatus('checking');
    setStatusMessage('Checking for available ProcessForge updates...');

    if (isTauriEnvironment()) {
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
    } else {
      // Browser / Web Studio check via GitHub API
      try {
        const res = await fetch('https://api.github.com/repos/omeaga1/process-forge/releases/latest', {
          headers: { Accept: 'application/vnd.github.v3+json' }
        });
        if (res.ok) {
          const data = await res.json();
          const latestTag = (data.tag_name || '').replace(/^v/, '');
          const isNewer = latestTag && latestTag !== CURRENT_APP_VERSION && latestTag > CURRENT_APP_VERSION;

          const info: UpdateInfo = {
            current_version: CURRENT_APP_VERSION,
            latest_version: latestTag || CURRENT_APP_VERSION,
            should_update: Boolean(isNewer),
            release_notes: data.body || 'New release available with performance and stability updates.',
            release_url: data.html_url || 'https://github.com/omeaga1/process-forge/releases/latest'
          };
          setUpdateInfo(info);

          if (isNewer) {
            setStatus('available');
            setStatusMessage(info.release_notes);
          } else {
            if (isManual) {
              setStatus('up-to-date');
              setStatusMessage(`ProcessForge Web Studio v${CURRENT_APP_VERSION} is running the latest version.`);
            } else {
              setStatus('idle');
            }
          }
        } else {
          if (isManual) {
            setStatus('up-to-date');
            setStatusMessage(`ProcessForge v${CURRENT_APP_VERSION} is up to date.`);
          } else {
            setStatus('idle');
          }
        }
      } catch {
        if (isManual) {
          setStatus('up-to-date');
          setStatusMessage(`ProcessForge v${CURRENT_APP_VERSION} is active.`);
        } else {
          setStatus('idle');
        }
      }
    }
  }, []);

  // Background check on load
  useEffect(() => {
    checkForUpdates(false);
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
