/**
 * Resolves the current installer download from GitHub Releases.
 *
 * WHY THIS EXISTS
 *
 * The landing page shipped a Windows installer as a file committed into
 * apps/web/public/. That binary was v0.1.3 and it panicked on startup:
 *
 *   PluginInitialization("updater", "Error deserializing 'plugins.updater'
 *   within your Tauri configuration: missing field `pubkey`")
 *
 * The bug was fixed the next day in c3f5f75 and released as v0.1.4, but the
 * committed copy never changed, so every visitor downloaded a build that could
 * not start. The macOS and Linux links had the same problem by a different
 * route: both hardcoded /releases/download/v0.1.3/... and were never bumped.
 *
 * A version number written into source is a version number that will be wrong.
 * So nothing is pinned here: the page asks GitHub what the latest release is
 * and links to that. There is no binary in the repo to go stale, and a release
 * is live the moment it is published.
 */

export type DesktopOs = 'windows' | 'macos' | 'linux';

export const RELEASES_PAGE = 'https://github.com/omeaga1/process-forge/releases/latest';
const LATEST_RELEASE_API =
  'https://api.github.com/repos/omeaga1/process-forge/releases/latest';

/**
 * Which asset belongs to which platform. Matched against the asset filename,
 * so a version bump cannot break them.
 */
const ASSET_PATTERNS: Record<DesktopOs, RegExp[]> = {
  // Prefer the NSIS setup over the MSI: it installs per-user without elevation.
  windows: [/x64-setup\.exe$/i, /x64_en-US\.msi$/i],
  macos: [/aarch64\.dmg$/i, /x64\.dmg$/i, /\.dmg$/i],
  linux: [/\.AppImage$/i, /amd64\.deb$/i]
};

export interface ResolvedInstaller {
  url: string;
  fileName: string;
  version: string;
  sizeBytes: number;
}

interface GhAsset {
  name: string;
  browser_download_url: string;
  size: number;
}
interface GhRelease {
  tag_name: string;
  assets: GhAsset[];
}

/**
 * Picks the best asset for an OS out of a release payload. Exported so the
 * matching can be tested without touching the network.
 */
export function selectAsset(release: GhRelease, os: DesktopOs): ResolvedInstaller | null {
  for (const pattern of ASSET_PATTERNS[os]) {
    const hit = release.assets.find((a) => pattern.test(a.name));
    if (hit) {
      return {
        url: hit.browser_download_url,
        fileName: hit.name,
        version: release.tag_name,
        sizeBytes: hit.size
      };
    }
  }
  return null;
}

/**
 * Asks GitHub for the latest release and resolves the installer for `os`.
 * Returns null on any failure -- the caller falls back to the releases page,
 * which always works and is never wrong.
 */
export async function fetchLatestInstaller(
  os: DesktopOs,
  fetchImpl: typeof fetch = fetch
): Promise<ResolvedInstaller | null> {
  try {
    const res = await fetchImpl(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!res.ok) return null;
    const release = (await res.json()) as GhRelease;
    if (!release?.assets?.length) return null;
    return selectAsset(release, os);
  } catch {
    return null;
  }
}

/** Human-readable size for the download button. */
export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
