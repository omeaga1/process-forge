import {
  OsakaJadeDarkPalette,
  OsakaJadeLightPalette,
  type ThemeMode,
  type ThemePalette
} from './palette.js';

function formatVariables(palette: ThemePalette): string {
  return `
  --pf-bg-base: ${palette.background.base};
  --pf-bg-canvas: ${palette.background.canvas};
  --pf-bg-surface: ${palette.background.surface};
  --pf-bg-surface-elevated: ${palette.background.surfaceElevated};
  --pf-bg-surface-hover: ${palette.background.surfaceHover};
  --pf-bg-surface-active: ${palette.background.surfaceActive};
  --pf-bg-surface-muted: ${palette.background.surfaceMuted};
  --pf-bg-selected: ${palette.background.selectedBg};
  --pf-fg-selected: ${palette.background.selectedFg};

  --pf-border-subtle: ${palette.border.subtle};
  --pf-border-default: ${palette.border.default};
  --pf-border-strong: ${palette.border.strong};
  --pf-border-glow: ${palette.border.glow};
  --pf-border-glow-amber: ${palette.border.glowAmber};
  --pf-border-glow-rose: ${palette.border.glowRose};
  --pf-border-division: ${palette.border.division};

  --pf-jade-400: ${palette.jade[400]};
  --pf-jade-500: ${palette.jade[500]};
  --pf-jade-600: ${palette.jade[600]};
  --pf-jade-glow: ${palette.jade.glow};
  --pf-jade-muted: ${palette.jade.muted};

  --pf-text-primary: ${palette.text.primary};
  --pf-text-secondary: ${palette.text.secondary};
  --pf-text-muted: ${palette.text.muted};
  --pf-text-inverse: ${palette.text.inverse};
  --pf-text-accent: ${palette.text.accent};
  --pf-text-gold: ${palette.text.gold};

  --pf-status-busy: ${palette.status.busy};
  --pf-status-starved: ${palette.status.starved};
  --pf-status-blocked: ${palette.status.blocked};
  --pf-status-failed: ${palette.status.failed};
  --pf-status-idle: ${palette.status.idle};

  --pf-stream-fluid: ${palette.streams.continuousFluid};
  --pf-stream-discrete: ${palette.streams.discreteContainer};
  --pf-stream-blocked: ${palette.streams.backpressureBlocked};
  `.trim();
}

/**
 * Generates raw CSS custom properties representing the Osaka Jade design system (Dark, Light, or Both).
 */
export function generateOsakaJadeCssVariables(target: ThemeMode | 'both' = 'both'): string {
  if (target === 'dark') {
    return `:root, [data-theme="dark"], .theme-dark, .theme-osaka-jade {\n  ${formatVariables(OsakaJadeDarkPalette)}\n}`;
  }
  if (target === 'light') {
    return `[data-theme="light"], .theme-light {\n  ${formatVariables(OsakaJadeLightPalette)}\n}`;
  }
  return `
:root, [data-theme="dark"], .theme-dark, .theme-osaka-jade {
  ${formatVariables(OsakaJadeDarkPalette)}
}

[data-theme="light"], .theme-light {
  ${formatVariables(OsakaJadeLightPalette)}
}
`.trim();
}
