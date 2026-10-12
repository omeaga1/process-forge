import React, { useEffect, useState } from 'react';

/**
 * The public site's pages, as real paths. Cloudflare Pages serves index.html
 * for any path without a file of its own, so /library opens straight on the
 * library and a link to it can be shared.
 */

export const PAGES = {
  home: { path: '/', title: 'ProcessForge: describe the equipment, the engine checks the physics' },
  example: { path: '/example', title: 'Worked example: cold brew, freeze-concentrated · ProcessForge' },
  library: { path: '/library', title: 'ProcessForge Library · ProcessForge' },
  claude: { path: '/claude', title: 'Claude & MCP · ProcessForge' },
  download: { path: '/download', title: 'Download · ProcessForge' }
} as const;

export type PageId = keyof typeof PAGES;

export function pageOf(pathname: string): PageId {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return (Object.keys(PAGES) as PageId[]).find((id) => PAGES[id].path === clean) ?? 'home';
}

const listeners = new Set<() => void>();

/** Goes to a page without reloading (the frame then scrolls to its top, or to the anchor). */
export function navigate(to: string): void {
  const [path, hash] = to.split('#');
  if (path && path !== window.location.pathname) window.history.pushState({}, '', path + (hash ? `#${hash}` : ''));
  else window.history.replaceState({}, '', `${window.location.pathname}${hash ? `#${hash}` : ''}`);
  listeners.forEach((l) => l());
}

export interface SiteLocation {
  page: PageId;
  /** The anchor to show, if any. */
  hash: string;
  /** Changes on every navigation, even to the same page: when to scroll. */
  visit: number;
}

/** Where the address bar is, following links and the back button. */
export function useLocation(): SiteLocation {
  const read = (visit: number): SiteLocation => ({ page: pageOf(window.location.pathname), hash: window.location.hash.slice(1), visit });
  const [loc, setLoc] = useState<SiteLocation>(() => read(0));
  const page = loc.page;
  useEffect(() => {
    const sync = () => setLoc((l) => read(l.visit + 1));
    listeners.add(sync);
    window.addEventListener('popstate', sync);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  useEffect(() => {
    document.title = PAGES[page].title;
  }, [page]);
  return loc;
}

/** After each navigation has rendered: to the anchor if there is one, else to the top of `top`. */
export function useScrollOnVisit(loc: SiteLocation, top: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const target = (loc.hash && document.getElementById(loc.hash)) || top.current;
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: loc.visit && loc.hash ? 'smooth' : 'auto' });
  }, [loc, top]);
}

/** A link to one of the site's pages: a real href, followed without a reload. */
export const PageLink: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }> = ({ to, onClick, children, ...rest }) => (
  <a
    href={to}
    onClick={(e) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    }}
    {...rest}
  >
    {children}
  </a>
);
