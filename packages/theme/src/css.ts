import { OsakaJadePalette } from './palette.js';

/**
 * Generates raw CSS custom properties representing the Osaka Jade design system.
 */
export function generateOsakaJadeCssVariables(): string {
  return `
:root, .theme-osaka-jade {
  --pf-bg-base: ${OsakaJadePalette.background.base};
  --pf-bg-canvas: ${OsakaJadePalette.background.canvas};
  --pf-bg-surface: ${OsakaJadePalette.background.surface};
  --pf-bg-surface-elevated: ${OsakaJadePalette.background.surfaceElevated};
  --pf-bg-surface-hover: ${OsakaJadePalette.background.surfaceHover};
  --pf-bg-surface-active: ${OsakaJadePalette.background.surfaceActive};

  --pf-border-subtle: ${OsakaJadePalette.border.subtle};
  --pf-border-default: ${OsakaJadePalette.border.default};
  --pf-border-strong: ${OsakaJadePalette.border.strong};
  --pf-border-glow: ${OsakaJadePalette.border.glow};

  --pf-jade-400: ${OsakaJadePalette.jade[400]};
  --pf-jade-500: ${OsakaJadePalette.jade[500]};
  --pf-jade-glow: ${OsakaJadePalette.jade.glow};
  --pf-jade-muted: ${OsakaJadePalette.jade.muted};

  --pf-text-primary: ${OsakaJadePalette.text.primary};
  --pf-text-secondary: ${OsakaJadePalette.text.secondary};
  --pf-text-muted: ${OsakaJadePalette.text.muted};
  --pf-text-accent: ${OsakaJadePalette.text.accent};

  --pf-status-busy: ${OsakaJadePalette.status.busy};
  --pf-status-starved: ${OsakaJadePalette.status.starved};
  --pf-status-blocked: ${OsakaJadePalette.status.blocked};
  --pf-status-failed: ${OsakaJadePalette.status.failed};
  --pf-status-idle: ${OsakaJadePalette.status.idle};

  --pf-stream-fluid: ${OsakaJadePalette.streams.continuousFluid};
  --pf-stream-discrete: ${OsakaJadePalette.streams.discreteContainer};
  --pf-stream-blocked: ${OsakaJadePalette.streams.backpressureBlocked};
}
`.trim();
}
