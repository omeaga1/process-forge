/**
 * The landing page must never hand a visitor a stale installer.
 *
 * It shipped one: apps/web/public/ProcessForge-Setup-x64.exe was v0.1.3, which
 * panicked at startup on a missing updater pubkey. The bug was fixed the next
 * day and released as v0.1.4, but the committed binary never changed, so every
 * Windows download was a build that could not start. macOS and Linux had the
 * same problem by a different route: both hardcoded /releases/download/v0.1.3/
 * URLs that were never bumped.
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  selectAsset,
  fetchLatestInstaller,
  formatSize,
  RELEASES_PAGE
} from '../downloads/latestRelease.js';

/** Mirrors the real v0.1.4 release payload. */
const RELEASE = {
  tag_name: 'v0.1.4',
  assets: [
    { name: 'process-forge-web-dist.tar.gz', browser_download_url: 'u/webdist', size: 4610675 },
    { name: 'process-forge-windows-portable-x64.zip', browser_download_url: 'u/zip', size: 4625517 },
    { name: 'ProcessForge_0.1.4_aarch64.dmg', browser_download_url: 'u/dmg', size: 8753671 },
    { name: 'ProcessForge_0.1.4_amd64.AppImage', browser_download_url: 'u/appimage', size: 87611896 },
    { name: 'ProcessForge_0.1.4_amd64.deb', browser_download_url: 'u/deb', size: 10361090 },
    { name: 'ProcessForge_0.1.4_x64-setup.exe', browser_download_url: 'u/setup', size: 7548478 },
    { name: 'ProcessForge_0.1.4_x64_en-US.msi', browser_download_url: 'u/msi', size: 8806400 }
  ]
};

const okFetch = (body: unknown) =>
  (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

describe('Installer asset selection', () => {
  it('prefers the NSIS setup on Windows, which installs without elevation', () => {
    const found = selectAsset(RELEASE, 'windows');
    assert.ok(found);
    assert.equal(found.fileName, 'ProcessForge_0.1.4_x64-setup.exe');
    assert.equal(found.url, 'u/setup');
    assert.equal(found.version, 'v0.1.4');
  });

  it('picks the dmg on macOS and the AppImage on Linux', () => {
    assert.equal(selectAsset(RELEASE, 'macos')!.fileName, 'ProcessForge_0.1.4_aarch64.dmg');
    assert.equal(selectAsset(RELEASE, 'linux')!.fileName, 'ProcessForge_0.1.4_amd64.AppImage');
  });

  it('matches on filename shape, so a version bump cannot break it', () => {
    const future = {
      tag_name: 'v9.9.9',
      assets: [
        { name: 'ProcessForge_9.9.9_x64-setup.exe', browser_download_url: 'u/next', size: 1 }
      ]
    };
    const found = selectAsset(future, 'windows');
    assert.equal(found!.url, 'u/next');
    assert.equal(found!.version, 'v9.9.9');
  });

  it('falls back through the preference list when the first choice is absent', () => {
    const msiOnly = {
      tag_name: 'v1.0.0',
      assets: [
        { name: 'ProcessForge_1.0.0_x64_en-US.msi', browser_download_url: 'u/msi', size: 2 }
      ]
    };
    assert.equal(selectAsset(msiOnly, 'windows')!.url, 'u/msi');
  });

  it('returns null rather than a wrong asset when nothing matches', () => {
    assert.equal(selectAsset({ tag_name: 'v1', assets: [] }, 'windows'), null);
    assert.equal(
      selectAsset(
        { tag_name: 'v1', assets: [{ name: 'notes.txt', browser_download_url: 'u', size: 1 }] },
        'macos'
      ),
      null
    );
  });

  it('never selects the web bundle as a desktop installer', () => {
    for (const os of ['windows', 'macos', 'linux'] as const) {
      const found = selectAsset(RELEASE, os);
      assert.ok(!found || !/web-dist/.test(found.fileName), `${os} picked the web bundle`);
    }
  });
});

describe('Fetching the latest release', () => {
  it('resolves the installer from a successful response', async () => {
    const found = await fetchLatestInstaller('windows', okFetch(RELEASE));
    assert.equal(found!.fileName, 'ProcessForge_0.1.4_x64-setup.exe');
  });

  it('returns null on a failed request, so the caller can fall back', async () => {
    const bad = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    assert.equal(await fetchLatestInstaller('windows', bad), null);
  });

  it('returns null when the network throws rather than surfacing an error', async () => {
    const throws = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    assert.equal(await fetchLatestInstaller('windows', throws), null);
  });

  it('returns null on a release with no assets', async () => {
    assert.equal(
      await fetchLatestInstaller('windows', okFetch({ tag_name: 'v1', assets: [] })),
      null
    );
  });
});

describe('Fallback and presentation', () => {
  it('has a fallback that is always valid and never version-pinned', () => {
    assert.match(RELEASES_PAGE, /releases\/latest$/);
    assert.ok(!/\d+\.\d+\.\d+/.test(RELEASES_PAGE), 'the fallback must not pin a version');
  });

  it('formats sizes for the download button', () => {
    assert.equal(formatSize(7548478), '7.2 MB');
    assert.equal(formatSize(4096), '4 KB');
  });
});
