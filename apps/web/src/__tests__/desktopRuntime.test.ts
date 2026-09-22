/**
 * ProcessForge is a desktop-first application, and the desktop build must never
 * open on the public landing page.
 *
 * The same apps/web bundle is what Tauri loads (tauri.conf.json sets
 * frontendDist to ../../web/dist), so without an explicit runtime check the
 * desktop app boots straight into a marketing page that offers the user a
 * download button for the software they are already running.
 */
import { describe, it, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { isDesktopRuntime, initialViewMode, homeViewMode } from '../runtime/desktop.js';

const g = globalThis as unknown as { window?: Record<string, unknown> };

function asDesktop(marker: '__TAURI_INTERNALS__' | '__TAURI__' = '__TAURI_INTERNALS__') {
  g.window = { [marker]: { invoke: () => undefined } };
}
function asWeb() {
  g.window = {};
}
function asServer() {
  delete g.window;
}

afterEach(() => {
  delete g.window;
});

describe('Desktop runtime detection', () => {
  it('detects the Tauri shell via __TAURI_INTERNALS__', () => {
    asDesktop('__TAURI_INTERNALS__');
    assert.equal(isDesktopRuntime(), true);
  });

  it('detects the Tauri shell via the legacy __TAURI__ global', () => {
    asDesktop('__TAURI__');
    assert.equal(isDesktopRuntime(), true);
  });

  it('reports web when no Tauri bridge is present', () => {
    asWeb();
    assert.equal(isDesktopRuntime(), false);
  });

  it('does not throw when there is no window at all', () => {
    asServer();
    assert.equal(isDesktopRuntime(), false);
  });
});

describe('Initial view', () => {
  it('opens the desktop app on the project portal, never the landing page', () => {
    asDesktop();
    assert.equal(
      initialViewMode(),
      'portal',
      'The desktop app must not open on a page whose purpose is to hand out its own installer'
    );
  });

  it('opens the web build on the landing page', () => {
    asWeb();
    assert.equal(initialViewMode(), 'landing');
  });
});

describe('Home navigation', () => {
  it('sends desktop Home to the portal', () => {
    asDesktop();
    assert.equal(
      homeViewMode(),
      'portal',
      'There is no landing page in the desktop build, so Home cannot go there'
    );
  });

  it('sends web Home to the landing page', () => {
    asWeb();
    assert.equal(homeViewMode(), 'landing');
  });

  it('never returns landing under the desktop runtime, on either entry point', () => {
    asDesktop();
    for (const mode of [initialViewMode(), homeViewMode()]) {
      assert.notEqual(mode, 'landing');
    }
  });
});
