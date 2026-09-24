import { useState, useEffect, useCallback, useRef } from 'react';
import {
  UpdateInfo,
  UpdaterStatus,
  isTauriEnvironment,
  invokeTauriCommand
} from '../components/UpdateNotificationBanner.js';

/** How often a running desktop app re-checks, so one left open still hears about a release. */
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Refocusing the window re-checks too, but not more often than this. */
const FOCUS_RECHECK_MIN_MS = 30 * 60 * 1000;
/** The version the engineer chose "Later" on, so it does not nag every check. */
const DISMISSED_KEY = 'pf_update_dismissed_version';

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(version: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, version);
  } catch {
    // Private mode or blocked storage: the banner simply returns next launch.
  }
}

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
  const lastCheckAt = useRef(0);

  const checkForUpdates = useCallback(async (isManual = false) => {
    // Only run update checks in desktop Tauri environment
    if (!isTauriEnvironment()) {
      if (isManual) {
        setStatus('up-to-date');
        setStatusMessage('The web studio is always the latest version.');
      }
      return;
    }

    lastCheckAt.current = Date.now();
    // A background check stays silent until it has something to say; only a
    // manual check shows "checking...".
    if (isManual) {
      setStatus('checking');
      setStatusMessage('Checking for available ProcessForge updates...');
    }

    try {
      const info = await invokeTauriCommand<UpdateInfo>('check_for_updates');
      setUpdateInfo(info);
      if (info && info.should_update) {
        // "Later" on this version holds until a newer one ships, or until the
        // engineer checks by hand.
        if (!isManual && readDismissed() === info.latest_version) {
          setStatus('idle');
          return;
        }
        setStatus('available');
        setStatusMessage(info.release_notes || 'New update available.');
      } else {
        if (isManual) {
          setStatus('up-to-date');
          setStatusMessage(`ProcessForge v${info?.current_version ?? ''} is the latest release.`);
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

  // Background checks (desktop only): at launch, every few hours, and when the
  // window comes back into focus after a while away.
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    void checkForUpdates(false);
    const interval = window.setInterval(() => void checkForUpdates(false), RECHECK_INTERVAL_MS);
    const onFocus = () => {
      if (Date.now() - lastCheckAt.current > FOCUS_RECHECK_MIN_MS) void checkForUpdates(false);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
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
    if (status === 'available' && updateInfo?.latest_version) writeDismissed(updateInfo.latest_version);
    setStatus('idle');
    setStatusMessage(null);
  }, [status, updateInfo]);

  return {
    status,
    updateInfo,
    statusMessage,
    isChecking: status === 'checking',
    // The header's update badge stays lit after "Later": dismissing the banner
    // is not the same as not having an update.
    hasUpdate: Boolean(updateInfo?.should_update),
    checkForUpdates,
    restartAndApplyUpdate,
    hardReloadApp,
    dismissNotification
  };
}
