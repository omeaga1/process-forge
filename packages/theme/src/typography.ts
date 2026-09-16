/**
 * Osaka Jade Typography Tokens
 *
 * Derived from the Omarchy Linux desktop rice aesthetic:
 * - Monospace (JetBrains Mono / Fira Code / system mono) for data readouts,
 *   numeric values, code, and terminal-style elements — the core of the rice look.
 * - Sans-serif (Inter / system-ui) for labels, headings, and body text.
 *
 * The Omarchy desktop is monospace-dominant (Neovim, Btop, Kitty, Alacritty).
 * ProcessForge uses mono for data-heavy contexts and sans for navigation/UI chrome.
 */

// ─── Font Families ───────────────────────────────────────────────────────────

export const fontFamily = {
  /** Monospace stack — primary for data readouts, numeric values, parameters, code */
  mono: '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", "Consolas", ui-monospace, monospace',
  /** Sans-serif stack — headings, labels, navigation, body text */
  sans: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
} as const;

// ─── Font Sizes (px) ─────────────────────────────────────────────────────────
// Tight scale suited for information-dense industrial UIs.

export const fontSize = {
  /** 10px — timestamps, unit labels, tertiary hints */
  '2xs': 10,
  /** 11px — secondary data, badge text, port labels */
  xs: 11,
  /** 12px — body small, table cells, parameter values */
  sm: 12,
  /** 13px — standard body text, chat messages */
  base: 13,
  /** 14px — section headings, node titles, input text */
  md: 14,
  /** 16px — panel titles, modal headings */
  lg: 16,
  /** 18px — primary headings, feature titles */
  xl: 18,
  /** 22px — page-level headings (rare) */
  '2xl': 22,
} as const;

// ─── Font Weights ────────────────────────────────────────────────────────────

export const fontWeight = {
  /** Normal body text */
  normal: 400,
  /** Slightly emphasized labels, active nav items */
  medium: 500,
  /** Section headings, node names, strong emphasis */
  semibold: 600,
  /** Page headings, modal titles */
  bold: 700,
} as const;

// ─── Line Heights ────────────────────────────────────────────────────────────

export const lineHeight = {
  /** Tight — single-line labels, badges, compact rows */
  tight: 1.2,
  /** Normal — body text, descriptions */
  normal: 1.4,
  /** Relaxed — multi-line readable blocks, chat messages */
  relaxed: 1.6,
} as const;

// ─── Letter Spacing ──────────────────────────────────────────────────────────

export const letterSpacing = {
  /** Tight — headings */
  tight: '-0.01em',
  /** Normal — body */
  normal: '0em',
  /** Wide — all-caps labels, overlines */
  wide: '0.04em',
} as const;

export type FontFamily = typeof fontFamily;
export type FontSize = typeof fontSize;
export type FontWeight = typeof fontWeight;
export type LineHeight = typeof lineHeight;
export type LetterSpacing = typeof letterSpacing;
