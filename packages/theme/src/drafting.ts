import { OsakaJadeDarkPalette, OsakaJadeLightPalette, type ThemePalette } from './palette.js';
import { fontFamily } from './typography.js';

/**
 * The drafting language.
 *
 * ProcessForge is read by engineers who read P&IDs fluently. The visual idiom
 * is an engineering drawing: ruled lines rather than shadows, square corners
 * rather than pills, monospace for anything that is a measurement, and colour
 * reserved for meaning.
 *
 * These are the rules, in one place, so that a new screen cannot quietly drift
 * back toward generic product styling. The landing page was rebuilt in this
 * idiom first; this module is what carries it into the studio.
 *
 * THE RULES
 *
 * 1. Lines, not shadows. Separation is a 1px rule. Elevation is not a thing a
 *    drawing has; a `boxShadow` used for depth is out of idiom. (Overlay
 *    dialogs are the one exception -- they genuinely float above the sheet.)
 * 2. Square corners. `radius.sharp` is 0. Inputs and buttons may take
 *    `radius.soft` (2px) so they read as controls rather than as cells.
 * 3. Monospace for measurements. Any number that has a unit is `data`. Prose,
 *    labels and navigation are `sans`.
 * 4. Colour means something. `semantic.ok` for a satisfied constraint,
 *    `semantic.violation` for a broken one, `semantic.caution` for engineering
 *    judgement, `semantic.inert` for anything not yet computed. Jade is not
 *    decoration.
 * 5. No gradients, and no motion that is not reporting a state change.
 */

export const draftingRadius = {
  /** Cells, panels, readouts, anything that is part of the sheet. */
  sharp: 0,
  /** Controls: buttons, inputs, chips. Enough to read as interactive. */
  soft: 2
} as const;

export const strokeWidth = {
  /** Sub-divisions inside a block. */
  hairline: 1,
  /** Block boundaries. */
  rule: 1,
  /** Drawn equipment geometry. */
  symbol: 1.4
} as const;

/**
 * A style object. Deliberately not React.CSSProperties: this package is
 * framework-agnostic and has no React dependency. It assigns cleanly into a
 * React `style` prop.
 */
export type DraftingStyle = Record<string, string | number>;

export interface DraftingTokens {
  /** Border shorthand for a block boundary. */
  rule: string;
  /** Border shorthand for an internal sub-division. */
  hairline: string;
  /** Monospace, tabular figures. Every measurement uses this. */
  data: DraftingStyle;
  /** Small uppercase mono caption, for field labels and zone markers. */
  label: DraftingStyle;
  /** Prose, navigation, headings. */
  prose: DraftingStyle;
  semantic: {
    /** A constraint that holds; a machine producing. */
    ok: string;
    /** A constraint that is violated; a design that cannot run. */
    violation: string;
    /** Operable, but outside good practice. Engineering judgement. */
    caution: string;
    /** Not computed, not connected, not yet run. */
    inert: string;
  };
}

function build(p: ThemePalette): DraftingTokens {
  return {
    rule: `${strokeWidth.rule}px solid ${p.border.default}`,
    hairline: `${strokeWidth.hairline}px solid ${p.border.subtle}`,
    data: {
      fontFamily: fontFamily.mono,
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '0'
    },
    label: {
      fontFamily: fontFamily.mono,
      fontSize: '0.64rem',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: p.text.muted
    },
    prose: { fontFamily: fontFamily.sans },
    semantic: {
      ok: p.text.accent,
      violation: p.border.glowAmber,
      caution: p.text.gold,
      inert: p.text.muted
    }
  };
}

export const draftingDark = build(OsakaJadeDarkPalette);
export const draftingLight = build(OsakaJadeLightPalette);

/** The studio runs dark; the public sheet runs light. */
export function drafting(mode: 'dark' | 'light' = 'dark'): DraftingTokens {
  return mode === 'light' ? draftingLight : draftingDark;
}
