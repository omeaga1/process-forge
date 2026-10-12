import { useEffect, useState } from 'react';
import { fetchLatestRelease, selectAsset, RELEASES_PAGE, formatSize, type DesktopOs, type ResolvedInstaller } from '../downloads/latestRelease.js';

/**
 * The installer for this visitor's computer, and every platform's, from one
 * request to GitHub's latest release.
 */

export const OS_LABELS: Record<DesktopOs, { name: string; file: string }> = {
  windows: { name: 'Windows', file: '.exe installer' },
  macos: { name: 'macOS', file: '.dmg, Apple silicon' },
  linux: { name: 'Linux', file: '.AppImage' }
};

interface Platform {
  name: string;
  os: DesktopOs | 'unknown';
  fileLabel: string;
}

function detect(): Platform {
  const ua = window.navigator.userAgent.toLowerCase();
  const plat = window.navigator.platform?.toLowerCase() || '';
  // Phones report Linux (Android) or Mac (iOS); there is no phone build, so
  // point them at every desktop download rather than offer the wrong one.
  if (/android|iphone|ipad|ipod|mobile/.test(ua)) return { name: 'desktop', os: 'unknown', fileLabel: 'Windows, macOS and Linux' };
  if (plat.includes('mac') || ua.includes('mac os x')) return { name: 'macOS', os: 'macos', fileLabel: 'macOS disk image (.dmg)' };
  if (plat.includes('linux') || ua.includes('linux')) return { name: 'Linux', os: 'linux', fileLabel: 'Linux AppImage' };
  return { name: 'Windows', os: 'windows', fileLabel: 'Windows installer (.exe)' };
}

let cached: Promise<{ tag: string | null; installers: Partial<Record<DesktopOs, ResolvedInstaller>> }> | undefined;
/** Once per visit, whichever page asks first. */
function latest() {
  cached ??= fetchLatestRelease().then((release) => {
    const installers: Partial<Record<DesktopOs, ResolvedInstaller>> = {};
    if (release) for (const os of Object.keys(OS_LABELS) as DesktopOs[]) {
      const hit = selectAsset(release, os);
      if (hit) installers[os] = hit;
    }
    return { tag: release?.tag_name ?? null, installers };
  });
  return cached;
}

export function useDownloads() {
  const [platform] = useState(detect);
  const [installers, setInstallers] = useState<Partial<Record<DesktopOs, ResolvedInstaller>>>({});
  const [releaseTag, setReleaseTag] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void latest().then((r) => {
      if (!live) return;
      setReleaseTag(r.tag);
      setInstallers(r.installers);
    });
    return () => {
      live = false;
    };
  }, []);
  const detected = platform.os === 'unknown' ? undefined : installers[platform.os];
  return {
    platform,
    installers,
    releaseTag,
    downloadUrl: detected?.url ?? RELEASES_PAGE,
    fileLabel: detected ? `${platform.fileLabel} · ${detected.version} · ${formatSize(detected.sizeBytes)}` : platform.fileLabel
  };
}
