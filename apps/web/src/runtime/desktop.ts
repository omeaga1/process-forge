/**
 * Which runtime is this bundle executing in?
 *
 * ProcessForge is a desktop-first application. The same `apps/web` bundle is
 * served three ways:
 *
 *   - inside the Tauri desktop shell (tauri.conf.json points frontendDist at
 *     ../../web/dist, so the desktop app IS this bundle in a WebView)
 *   - on the public web, as a demo and download page
 *   - on a local dev server
 *
 * Those are not the same product, and they must not open on the same screen.
 * The public landing page exists to explain what ProcessForge is and hand out
 * the installer. Showing it to someone who has already installed and launched
 * the desktop app is nonsense: it markets the thing they are currently running
 * and offers them a download button for it.
 *
 * Detection is structural rather than configured. Tauri injects its bridge on
 * `window` before any app code runs, so this is accurate on first render --
 * which matters, because the initial view is chosen from it.
 */

export function isDesktopRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

export type AppViewMode = 'landing' | 'portal' | 'studio';

/**
 * The view the app opens on.
 *
 * Desktop opens on the project portal -- the hub where you pick a template,
 * open a saved flowsheet, or start a blank canvas. That is the natural start
 * screen for an installed engineering tool.
 *
 * The web build opens on the landing page, which is what it is for.
 */
export function initialViewMode(): AppViewMode {
  return isDesktopRuntime() ? 'portal' : 'landing';
}

/**
 * Where "home" goes.
 *
 * On the web, home is the landing page. On the desktop there is no landing
 * page at all, so home is the portal. Without this, any Home affordance in the
 * desktop app drops the user onto a download page for software they have
 * already installed.
 */
export function homeViewMode(): AppViewMode {
  return isDesktopRuntime() ? 'portal' : 'landing';
}
