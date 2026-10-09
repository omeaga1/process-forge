/**
 * ProcessForge's UI primitives: Base UI (headless, accessible: focus trap and
 * restore, Escape, ARIA, keyboard navigation, portals) dressed in the theme
 * through one stylesheet (styles.ts) on the --pf-* variables. Use these for
 * every dialog, button, tooltip, tab set, menu and switch instead of hand
 * rolling one with inline styles.
 */
import React from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { X } from 'lucide-react';
import { UI_CSS } from './styles.js';

function injectUiCss(): void {
  if (typeof document === 'undefined' || document.getElementById('pf-ui')) return;
  const el = document.createElement('style');
  el.id = 'pf-ui';
  el.textContent = UI_CSS;
  document.head.appendChild(el);
}
injectUiCss();

// ---------------------------------------------------------------- Button

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'warning';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An icon before the label. */
  icon?: React.ReactNode;
  /** A square button holding only its icon; give it a `label` for screen readers and the tooltip. */
  iconOnly?: boolean;
  /** Read out, and shown as a tooltip, when the button has no visible text. */
  label?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', icon, iconOnly, label, className, children, type = 'button', ...rest }, ref) => {
    const button = (
      <button
        ref={ref}
        type={type}
        className={`pf-btn${className ? ` ${className}` : ''}`}
        data-variant={variant}
        data-size={size}
        {...(iconOnly ? { 'data-icon-only': '' } : {})}
        {...(label ? { 'aria-label': label } : {})}
        {...rest}
      >
        {icon}
        {!iconOnly && children}
      </button>
    );
    return iconOnly && label ? <Tooltip content={label}>{button}</Tooltip> : button;
  }
);
Button.displayName = 'Button';

// ---------------------------------------------------------------- Modal

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A small mark before the title. */
  icon?: React.ReactNode;
  /** Extra controls in the header, before the close button. */
  headerExtra?: React.ReactNode;
  /** Buttons along the bottom, right-aligned. */
  footer?: React.ReactNode;
  /** px; the dialog never exceeds the window less 32 px. */
  width?: number;
  /** Fill the body edge to edge (lists, editors) instead of padding it. */
  flush?: boolean;
  children?: React.ReactNode;
}

/**
 * A modal dialog: traps focus and gives it back on close, closes on Escape
 * and on a click outside, and is announced as a dialog with its title.
 */
export const Modal: React.FC<ModalProps> = ({ open, onOpenChange, title, description, icon, headerExtra, footer, width, flush, children }) => (
  <Dialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
    <Dialog.Portal>
      <Dialog.Backdrop className="pf-backdrop" />
      <Dialog.Popup className="pf-dialog" style={width ? ({ '--pf-dialog-width': `${width}px` } as React.CSSProperties) : undefined}>
        <div className="pf-dialog-head">
          {icon && <div style={{ flexShrink: 0, marginTop: 1 }}>{icon}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Dialog.Title className="pf-dialog-title">{title}</Dialog.Title>
            {description && <Dialog.Description className="pf-dialog-desc">{description}</Dialog.Description>}
          </div>
          {headerExtra}
          <Dialog.Close className="pf-btn" data-variant="ghost" data-size="sm" data-icon-only="" aria-label="Close">
            <X size={15} />
          </Dialog.Close>
        </div>
        <div className="pf-dialog-body" style={flush ? { padding: 0 } : undefined}>
          {children}
        </div>
        {footer && <div className="pf-dialog-foot">{footer}</div>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);

// ---------------------------------------------------------------- Tooltip

export interface TooltipProps {
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** One element that takes a ref (a button, a link). */
  children: React.ReactElement;
}

/** Shown on hover and on keyboard focus, after a short delay; replaces title="". */
export const Tooltip: React.FC<TooltipProps> = ({ content, side = 'top', children }) => (
  <BaseTooltip.Root>
    <BaseTooltip.Trigger render={children} />
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner side={side} sideOffset={6}>
        <BaseTooltip.Popup className="pf-tip">{content}</BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  </BaseTooltip.Root>
);

/** Wrap the app once so tooltips share their open delay (moving between them is instant). */
export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BaseTooltip.Provider delay={400} closeDelay={0}>
    {children}
  </BaseTooltip.Provider>
);

// ---------------------------------------------------------------- Tabs

export interface TabItem<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

/** A tab strip with arrow-key navigation and a sliding underline. Panels are the caller's. */
export function TabStrip<T extends string>({
  value,
  onValueChange,
  items,
  label,
  style
}: {
  value: T;
  onValueChange: (v: T) => void;
  items: readonly TabItem<T>[];
  label?: string;
  style?: React.CSSProperties;
}) {
  return (
    <BaseTabs.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <BaseTabs.List className="pf-tabs-list" aria-label={label} style={style}>
        {items.map((t) => (
          <BaseTabs.Tab key={t.value} value={t.value} className="pf-tab">
            {t.icon}
            {t.label}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className="pf-tabs-indicator" />
      </BaseTabs.List>
    </BaseTabs.Root>
  );
}

// ---------------------------------------------------------------- Menu

export interface MenuItem {
  label: React.ReactNode;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** A rule above this item. */
  separatorBefore?: boolean;
}

/** A dropdown menu on a trigger: arrow keys, type-ahead, Escape, focus return. */
export const DropdownMenu: React.FC<{ trigger: React.ReactElement; items: readonly MenuItem[]; align?: 'start' | 'center' | 'end' }> = ({
  trigger,
  items,
  align = 'end'
}) => (
  <BaseMenu.Root>
    <BaseMenu.Trigger render={trigger} />
    <BaseMenu.Portal>
      <BaseMenu.Positioner align={align} sideOffset={6}>
        <BaseMenu.Popup className="pf-menu">
          {items.map((it, i) => (
            <React.Fragment key={i}>
              {it.separatorBefore && <BaseMenu.Separator className="pf-menu-sep" />}
              <BaseMenu.Item
                className="pf-menu-item"
                disabled={it.disabled}
                {...(it.danger ? { 'data-danger': '' } : {})}
                onClick={it.onSelect}
              >
                {it.icon}
                {it.label}
              </BaseMenu.Item>
            </React.Fragment>
          ))}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  </BaseMenu.Root>
);

// ---------------------------------------------------------------- Switch

export const Switch: React.FC<{ checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({
  checked,
  onCheckedChange,
  label,
  disabled
}) => (
  <BaseSwitch.Root className="pf-switch" checked={checked} onCheckedChange={(v) => onCheckedChange(v)} aria-label={label} disabled={disabled}>
    <BaseSwitch.Thumb className="pf-switch-thumb" />
  </BaseSwitch.Root>
);

// ---------------------------------------------------------------- Chip

/** A filter chip: on or off, with an optional count. */
export const Chip: React.FC<{ active?: boolean; count?: number; onClick?: () => void; children: React.ReactNode }> = ({ active, count, onClick, children }) => (
  <button type="button" className="pf-chip" aria-pressed={Boolean(active)} {...(active ? { 'data-active': '' } : {})} onClick={onClick}>
    {children}
    {count !== undefined && <span className="pf-count">{count}</span>}
  </button>
);

// ---------------------------------------------------------------- DialogShell

/**
 * A modal with no header of its own, for content that brings one (the Unit
 * Op Creator): the same focus trap, Escape, outside click and animation.
 */
export const DialogShell: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void; label: string; width?: number; children: React.ReactNode }> = ({
  open,
  onOpenChange,
  label,
  width,
  children
}) => (
  <Dialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
    <Dialog.Portal>
      <Dialog.Backdrop className="pf-backdrop" />
      <Dialog.Popup
        className="pf-dialog"
        aria-label={label}
        style={{ ...(width ? ({ '--pf-dialog-width': `${width}px` } as React.CSSProperties) : {}), overflowY: 'auto' }}
      >
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);

// ---------------------------------------------------------------- Sheet

/** A bottom sheet (phones): a modal dialog that slides up from the bottom edge. */
export const Sheet: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void; label: string; children: React.ReactNode }> = ({ open, onOpenChange, label, children }) => (
  <Dialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
    <Dialog.Portal>
      <Dialog.Backdrop className="pf-backdrop" />
      <Dialog.Popup className="pf-sheet" aria-label={label}>
        <div aria-hidden style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--pf-border-strong)', margin: '8px auto 2px', flexShrink: 0 }} />
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
