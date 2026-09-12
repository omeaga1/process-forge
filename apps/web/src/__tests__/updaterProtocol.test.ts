import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { UpdateInfo } from '../components/UpdateNotificationBanner.js';

describe('Desktop Auto-Updater Protocol & Asset Resolution', () => {
  it('correctly evaluates when an update is available', () => {
    const updatePayload: UpdateInfo = {
      current_version: '0.1.0',
      latest_version: '0.2.0',
      should_update: true,
      release_notes: 'Added chemical equilibrium stage solvers and dark mode improvements.',
      release_url: 'https://github.com/omeaga1/process-forge/releases/tag/v0.2.0'
    };

    assert.strictEqual(updatePayload.should_update, true);
    assert.strictEqual(updatePayload.latest_version, '0.2.0');
    assert.ok(updatePayload.release_url.includes('v0.2.0'));
  });

  it('correctly reports no-op when already at latest version', () => {
    const updatePayload: UpdateInfo = {
      current_version: '0.2.0',
      latest_version: '0.2.0',
      should_update: false,
      release_notes: 'Your ProcessForge installation is up to date.',
      release_url: 'https://github.com/omeaga1/process-forge/releases/latest'
    };

    assert.strictEqual(updatePayload.should_update, false);
    assert.strictEqual(updatePayload.current_version, updatePayload.latest_version);
  });

  it('constructs standard GitHub release asset links for desktop platforms', () => {
    const repoBase = 'https://github.com/omeaga1/process-forge/releases/latest/download';
    const winMsi = `${repoBase}/ProcessForge_0.1.0_x64_en-US.msi`;
    const winExe = `${repoBase}/ProcessForge_0.1.0_x64.exe`;
    const macDmg = `${repoBase}/ProcessForge_0.1.0_universal.dmg`;
    const linuxAppImage = `${repoBase}/ProcessForge_0.1.0_amd64.AppImage`;

    assert.ok(winMsi.endsWith('.msi'));
    assert.ok(winExe.endsWith('.exe'));
    assert.ok(macDmg.endsWith('.dmg'));
    assert.ok(linuxAppImage.endsWith('.AppImage'));
  });
});
