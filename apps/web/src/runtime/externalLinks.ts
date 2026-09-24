import { isDesktopRuntime } from './desktop.js';

/**
 * In the desktop app, links that leave the app (a provider's key page, a
 * release download, the docs) open in the user's browser. The web view is not
 * a browser and would otherwise do nothing with them.
 *
 * One capturing listener covers every <a> in the app, so components keep
 * using ordinary links. In a browser this installs nothing.
 */
export function routeExternalLinksToBrowser(): void {
  if (!isDesktopRuntime() || typeof document === 'undefined') return;
  const invoke = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } })
    .__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== 'function') return;

  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const url = a.href;
      if (!url.startsWith('https://')) return;
      if (a.target !== '_blank' && new URL(url).host === window.location.host) return;
      e.preventDefault();
      invoke('open_external', { url }).catch((err) => console.warn('Could not open link:', err));
    },
    true
  );
}
