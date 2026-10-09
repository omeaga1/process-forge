import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.js';

/**
 * Ctrl+K: every action in the studio from the keyboard. Type any words of
 * what you want ("add pump", "run", "open filler") and press Enter.
 */

export interface PaletteCommand {
  id: string;
  title: string;
  group: string;
  /** Extra words it answers to. */
  keywords?: string;
  /** A shortcut to show, e.g. "Space". */
  hint?: string;
  run(): void;
}

/** Commands whose text holds every word of the query, best matches first (title starts, then title contains). */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  const scored = commands
    .map((c) => {
      const title = c.title.toLowerCase();
      const hay = `${title} ${c.group.toLowerCase()} ${(c.keywords ?? '').toLowerCase()}`;
      if (!words.every((w) => hay.includes(w))) return null;
      const score = (title.startsWith(words[0]!) ? 0 : 2) + (words.every((w) => title.includes(w)) ? 0 : 1);
      return { c, score };
    })
    .filter((x): x is { c: PaletteCommand; score: number } => x !== null);
  return scored.sort((a, b) => a.score - b.score).map((x) => x.c);
}

export const CommandPalette: React.FC<{ open: boolean; onClose(): void; commands: PaletteCommand[] }> = ({ open, onClose, commands }) => {
  const { palette, font } = useTheme();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => filterCommands(commands, query).slice(0, 60), [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (c: PaletteCommand | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(shown[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';
  return (
    <div
      onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, backgroundColor: `${palette.background.base}99`, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '14vh' }}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
        style={{
          width: 'min(560px, calc(100vw - 32px))',
          backgroundColor: palette.background.surfaceElevated,
          border: `1px solid ${palette.border.strong}`,
          borderRadius: 2,
          // Overlay dialogs are the one thing allowed to float above the sheet.
          boxShadow: `0 24px 60px ${palette.background.base}cc, 0 0 0 1px ${palette.jade[500]}22`,
          overflow: 'hidden',
          fontFamily: font.sans
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${palette.border.default}` }}>
          <Search size={16} color={palette.text.muted} />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command: add pump, run, open filler…"
            aria-label="Command"
            aria-controls="pf-command-list"
            aria-activedescendant={shown[active] ? `pf-cmd-${shown[active]!.id}` : undefined}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: palette.text.primary, fontSize: 16 }}
          />
          <kbd style={{ fontFamily: font.mono, fontSize: 10, color: palette.text.muted, border: `1px solid ${palette.border.default}`, padding: '1px 5px', borderRadius: 2 }}>Esc</kbd>
        </div>
        <div ref={list} id="pf-command-list" role="listbox" aria-label="Commands" tabIndex={0} style={{ maxHeight: '46vh', overflowY: 'auto', padding: '6px 0' }}>
          {shown.length === 0 && <div style={{ padding: '14px 16px', color: palette.text.muted, fontSize: 13 }}>Nothing matches “{query}”.</div>}
          {shown.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <React.Fragment key={c.id}>
                {header && (
                  <div style={{ padding: '8px 16px 4px', fontFamily: font.mono, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: palette.text.muted }}>{header}</div>
                )}
                <div
                  id={`pf-cmd-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(c)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: i === active ? palette.text.primary : palette.text.secondary,
                    backgroundColor: i === active ? palette.background.surfaceActive : 'transparent',
                    borderLeft: `2px solid ${i === active ? palette.jade[400] : 'transparent'}`
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  {c.hint && <span style={{ fontFamily: font.mono, fontSize: 11, color: palette.text.secondary, flexShrink: 0 }}>{c.hint}</span>}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '7px 14px', borderTop: `1px solid ${palette.border.default}`, fontFamily: font.mono, fontSize: 10, color: palette.text.muted }}>
          <span>↑↓ choose</span>
          <span>Enter run</span>
          <span style={{ marginLeft: 'auto' }}>Ctrl+K</span>
        </div>
      </div>
    </div>
  );
};
