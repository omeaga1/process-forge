/**
 * Osaka Jade Spatial & Structural Tokens
 *
 * These tokens define the geometry of the UI — spacing, radii, shadows, and motion.
 * Calibrated to produce the tight, information-dense feel of the Omarchy Linux rice
 * rather than the spacious "SaaS dashboard" look typical of AI-generated UIs.
 *
 * Key principles:
 * - 4px base grid for spatial harmony
 * - Tight radii (2–6px) instead of bubbly web-app corners (8–12px)
 * - Minimal shadows in dark mode; the deep surfaces (#111c18) provide natural depth
 * - Crisp, fast transitions matching terminal-style snappiness
 */

import {
  type ThemeMode,
} from './palette.js';

// ─── Spacing Scale (4px base grid) ──────────────────────────────────────────

export const spacing = {
  /** 0px */
  0: 0,
  /** 2px — micro gaps (icon-to-text inline) */
  px: 1,
  /** 2px — icon-label gaps, tight inline pairs */
  0.5: 2,
  /** 4px — minimum padding, compact list gap */
  1: 4,
  /** 6px — badge padding, small element gaps */
  1.5: 6,
  /** 8px — standard inner padding, row gaps */
  2: 8,
  /** 10px — input padding, card inner spacing */
  2.5: 10,
  /** 12px — section gaps, card padding */
  3: 12,
  /** 16px — panel padding, group spacing */
  4: 16,
  /** 20px — modal padding, major section spacing */
  5: 20,
  /** 24px — large section gaps */
  6: 24,
  /** 32px — page-level spacing */
  8: 32,
} as const;

// ─── Border Radius ──────────────────────────────────────────────────────────
// Tight radii: Omarchy desktop uses sharp/subtle corners, not bubbly web-app radii.

export const radius = {
  /** 0px — no radius (terminal-style hard edges) */
  none: 0,
  /** 2px — subtle softening for inline elements, badges, code blocks */
  sm: 2,
  /** 4px — standard cards, inputs, buttons */
  md: 4,
  /** 6px — elevated panels, modals, dropdowns */
  lg: 6,
  /** 9999px — pills, circular indicators, full-round buttons */
  full: 9999,
} as const;

// ─── Elevation / Box Shadows ────────────────────────────────────────────────
// Dark mode: minimal shadows — deep backgrounds provide natural depth.
// Light mode: subtle shadows needed since background contrast is lower.

export interface ElevationTokens {
  /** No elevation — flush surfaces */
  none: string;
  /** Subtle lift — cards, list items, nodes */
  low: string;
  /** Medium lift — floating panels, dropdowns, drawers */
  mid: string;
  /** High lift — modals, popovers, context menus */
  high: string;
  /** Glow — selected/active node border glow */
  glow: string;
  /** Warning glow — blocked/error state */
  glowWarning: string;
}

export const elevationDark: ElevationTokens = {
  none: 'none',
  low: '0 1px 3px rgba(0, 0, 0, 0.4)',
  mid: '0 2px 8px rgba(0, 0, 0, 0.5)',
  high: '0 4px 16px rgba(0, 0, 0, 0.6)',
  glow: `0 0 12px rgba(113, 206, 173, 0.35)`,
  glowWarning: `0 0 12px rgba(229, 199, 54, 0.45)`,
};

export const elevationLight: ElevationTokens = {
  none: 'none',
  low: '0 1px 3px rgba(0, 0, 0, 0.08)',
  mid: '0 2px 8px rgba(0, 0, 0, 0.1)',
  high: '0 4px 16px rgba(0, 0, 0, 0.14)',
  glow: `0 0 10px rgba(30, 126, 88, 0.3)`,
  glowWarning: `0 0 10px rgba(217, 119, 6, 0.35)`,
};

export function getElevation(mode: ThemeMode = 'dark'): ElevationTokens {
  return mode === 'light' ? elevationLight : elevationDark;
}

// ─── Motion / Transitions ───────────────────────────────────────────────────
// Snappy transitions matching terminal-style responsiveness.

export const motion = {
  /** Instant — toggles, icon swaps (60ms) */
  fast: '60ms ease-out',
  /** Standard — hover states, color transitions (120ms) */
  normal: '120ms ease-out',
  /** Smooth — panel open/close, layout shifts (200ms) */
  smooth: '200ms ease-in-out',
  /** Slow — page transitions, large layout changes (300ms) */
  slow: '300ms ease-in-out',

  /** Easing curves */
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeInOut: 'cubic-bezier(0.45, 0, 0.55, 1)',
} as const;

// ─── Z-Index Scale ──────────────────────────────────────────────────────────

export const zIndex = {
  /** Canvas elements, nodes */
  base: 0,
  /** Floating controls, toolbars */
  float: 10,
  /** Side panels, docks */
  panel: 20,
  /** Dropdowns, context menus */
  dropdown: 30,
  /** Modals, dialogs */
  modal: 40,
  /** Toasts, notifications */
  toast: 50,
  /** Tooltips */
  tooltip: 60,
} as const;

export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type Motion = typeof motion;
export type ZIndex = typeof zIndex;
