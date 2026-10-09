import { fontFamily } from '@process-forge/theme';

/**
 * The stylesheet behind the ui/ primitives: one place for what inline styles
 * cannot express (hover, focus-visible, disabled, enter and exit animations
 * from Base UI's data-starting-style / data-ending-style), all from the
 * --pf-* theme variables, so light and dark follow the theme with no copies.
 */
export const UI_CSS = `
.pf-btn {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--pf-border-default);
  background: var(--pf-bg-surface-elevated); color: var(--pf-text-primary);
  font: 600 13px/1 ${fontFamily.sans}; white-space: nowrap; cursor: pointer; user-select: none;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease;
}
.pf-btn[data-variant="default"]:hover:not(:disabled):not([data-disabled]) { background: var(--pf-bg-surface-hover); border-color: var(--pf-border-strong); }
.pf-btn:active:not(:disabled):not([data-disabled]) { filter: brightness(0.95); }
.pf-btn:focus-visible, .pf-focus:focus-visible { outline: 2px solid var(--pf-jade-400); outline-offset: 1px; }
.pf-btn:disabled, .pf-btn[data-disabled] { opacity: 0.45; cursor: not-allowed; }
.pf-btn[data-size="sm"] { height: 26px; padding: 0 9px; font-size: 12px; border-radius: 5px; }
.pf-btn[data-size="lg"] { height: 38px; padding: 0 16px; font-size: 14px; }
.pf-btn[data-variant="primary"] { background: var(--pf-jade-500); border-color: var(--pf-jade-500); color: var(--pf-text-inverse); }
.pf-btn[data-variant="primary"]:hover:not(:disabled) { background: var(--pf-jade-400); border-color: var(--pf-jade-400); }
.pf-btn[data-variant="warning"] { background: var(--pf-status-blocked); border-color: var(--pf-status-blocked); color: var(--pf-text-inverse); }
.pf-btn[data-variant="warning"]:hover:not(:disabled) { filter: brightness(1.08); background: var(--pf-status-blocked); }
.pf-btn[data-variant="ghost"] { background: transparent; border-color: transparent; color: var(--pf-text-secondary); }
.pf-btn[data-variant="ghost"]:hover:not(:disabled) { background: var(--pf-bg-surface-hover); border-color: transparent; color: var(--pf-text-primary); }
.pf-btn[data-variant="danger"] { background: transparent; border-color: color-mix(in srgb, var(--pf-status-failed) 45%, transparent); color: var(--pf-status-failed); }
.pf-btn[data-variant="danger"]:hover:not(:disabled) { background: color-mix(in srgb, var(--pf-status-failed) 12%, transparent); border-color: var(--pf-status-failed); }
.pf-split { display: inline-flex; }
.pf-split > .pf-btn:first-child { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.pf-split > .pf-btn + .pf-btn { border-top-left-radius: 0; border-bottom-left-radius: 0; margin-left: -1px; width: 28px; }
.pf-btn[data-icon-only] { width: 32px; padding: 0; }
.pf-btn[data-icon-only][data-size="sm"] { width: 26px; }

.pf-backdrop {
  position: fixed; inset: 0; z-index: 1000; background: color-mix(in srgb, var(--pf-bg-base) 72%, transparent);
  backdrop-filter: blur(2px); transition: opacity 150ms ease;
}
.pf-backdrop[data-starting-style], .pf-backdrop[data-ending-style] { opacity: 0; }
.pf-dialog {
  position: fixed; top: 50%; left: 50%; z-index: 1001; translate: -50% -50%;
  box-sizing: border-box; display: flex; flex-direction: column;
  width: min(var(--pf-dialog-width, 560px), calc(100vw - 32px)); max-height: calc(100dvh - 48px);
  background: var(--pf-bg-surface); color: var(--pf-text-primary);
  border: 1px solid var(--pf-border-default); border-radius: 10px;
  box-shadow: 0 24px 64px -16px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(0 0 0 / 0.08);
  font-family: ${fontFamily.sans}; outline: none;
  transition: opacity 150ms ease, scale 150ms ease;
}
.pf-dialog[data-starting-style], .pf-dialog[data-ending-style] { opacity: 0; scale: 0.97; }
.pf-dialog-head { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid var(--pf-border-subtle); }
.pf-dialog-title { margin: 0; font-size: 16px; font-weight: 700; line-height: 1.3; color: var(--pf-text-primary); }
.pf-dialog-desc { margin: 3px 0 0; font-size: 13px; line-height: 1.45; color: var(--pf-text-secondary); }
.pf-dialog-body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px; }
.pf-dialog-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--pf-border-subtle); }

.pf-tip {
  z-index: 1100; max-width: 280px; padding: 6px 9px; border-radius: 6px;
  background: var(--pf-bg-surface-elevated); color: var(--pf-text-primary); border: 1px solid var(--pf-border-strong);
  font: 500 12px/1.4 ${fontFamily.sans}; box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.5);
  transform-origin: var(--transform-origin); transition: opacity 100ms ease, scale 100ms ease;
}
.pf-tip[data-starting-style], .pf-tip[data-ending-style] { opacity: 0; scale: 0.96; }

.pf-menu {
  z-index: 1100; min-width: 180px; padding: 4px; border-radius: 8px; outline: none;
  background: var(--pf-bg-surface-elevated); border: 1px solid var(--pf-border-default);
  box-shadow: 0 16px 40px -12px rgb(0 0 0 / 0.55); font-family: ${fontFamily.sans};
  transform-origin: var(--transform-origin); transition: opacity 120ms ease, scale 120ms ease;
}
.pf-menu[data-starting-style], .pf-menu[data-ending-style] { opacity: 0; scale: 0.97; }
.pf-menu-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 5px; cursor: pointer; outline: none;
  font-size: 13px; color: var(--pf-text-primary); user-select: none;
}
.pf-menu-item[data-highlighted] { background: var(--pf-bg-surface-hover); }
.pf-menu-item[data-disabled] { opacity: 0.45; cursor: not-allowed; }
.pf-menu-item[data-danger] { color: var(--pf-status-failed); }
.pf-menu-sep { height: 1px; margin: 4px 2px; background: var(--pf-border-subtle); }

.pf-tabs-list { position: relative; display: flex; gap: 2px; border-bottom: 1px solid var(--pf-border-default); }
.pf-tab {
  position: relative; display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px;
  background: none; border: none; cursor: pointer; outline: none;
  font: 600 13px/1 ${fontFamily.sans}; color: var(--pf-text-muted); transition: color 120ms ease;
}
.pf-tab:hover { color: var(--pf-text-secondary); }
.pf-tab[data-active] { color: var(--pf-text-primary); }
.pf-tab:focus-visible { outline: 2px solid var(--pf-jade-400); outline-offset: -2px; border-radius: 4px; }
.pf-tabs-indicator {
  position: absolute; bottom: -1px; left: var(--active-tab-left); width: var(--active-tab-width); height: 2px;
  background: var(--pf-jade-400); transition: left 180ms ease, width 180ms ease;
}

.pf-switch {
  position: relative; display: inline-flex; width: 32px; height: 18px; padding: 0; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--pf-border-strong); background: var(--pf-bg-surface-active); transition: background-color 150ms ease;
}
.pf-switch[data-checked] { background: var(--pf-jade-500); border-color: var(--pf-jade-500); }
.pf-switch:focus-visible { outline: 2px solid var(--pf-jade-400); outline-offset: 2px; }
.pf-switch-thumb {
  position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 999px; background: var(--pf-text-primary);
  transition: translate 150ms ease;
}
.pf-switch[data-checked] .pf-switch-thumb { translate: 14px 0; background: var(--pf-text-inverse); }

.pf-input {
  box-sizing: border-box; width: 100%; height: 34px; padding: 0 10px; border-radius: 6px;
  border: 1px solid var(--pf-border-default); background: var(--pf-bg-surface-elevated); color: var(--pf-text-primary);
  font: 400 13px/1 ${fontFamily.sans}; outline: none; transition: border-color 120ms ease, box-shadow 120ms ease;
}
.pf-input::placeholder { color: var(--pf-text-muted); }
.pf-input:hover { border-color: var(--pf-border-strong); }
.pf-input:focus { border-color: var(--pf-jade-500); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pf-jade-500) 22%, transparent); }

.pf-select {
  box-sizing: border-box; width: 100%; height: 34px; padding: 0 30px 0 10px; border-radius: 6px; cursor: pointer;
  appearance: none; -webkit-appearance: none;
  border: 1px solid var(--pf-border-default); background-color: var(--pf-bg-surface-elevated); color: var(--pf-text-primary);
  background-image: linear-gradient(45deg, transparent 50%, var(--pf-text-muted) 50%), linear-gradient(135deg, var(--pf-text-muted) 50%, transparent 50%);
  background-position: calc(100% - 15px) 52%, calc(100% - 10px) 52%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
  font: 400 13px/1 ${fontFamily.sans}; outline: none; transition: border-color 120ms ease, box-shadow 120ms ease;
}
.pf-select:hover { border-color: var(--pf-border-strong); }
.pf-select:focus { border-color: var(--pf-jade-500); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pf-jade-500) 22%, transparent); }
select option, select optgroup { background-color: var(--pf-bg-surface-elevated); color: var(--pf-text-primary); }

.pf-chip {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--pf-border-default); background: transparent; color: var(--pf-text-secondary);
  font: 500 12px/1 ${fontFamily.sans}; white-space: nowrap; transition: all 120ms ease;
}
.pf-chip:hover { border-color: var(--pf-border-strong); color: var(--pf-text-primary); }
.pf-chip[data-active] { background: color-mix(in srgb, var(--pf-jade-500) 16%, transparent); border-color: var(--pf-jade-500); color: var(--pf-jade-glow); }
.pf-chip:focus-visible { outline: 2px solid var(--pf-jade-400); outline-offset: 1px; }
.pf-chip .pf-count { color: var(--pf-text-muted); font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) {
  .pf-backdrop, .pf-dialog, .pf-tip, .pf-menu, .pf-tabs-indicator, .pf-switch-thumb { transition: none; }
}
`;
