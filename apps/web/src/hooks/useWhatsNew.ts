import { useCallback, useEffect, useState } from 'react';
import { invokeTauriCommand, isTauriEnvironment } from '../components/UpdateNotificationBanner.js';
import { RELEASE_NOTES } from '../releaseNotes/index.js';
import { notesToShow, sortNotes, type ClaudeToolsStatus, type ReleaseNote } from '../releaseNotes/model.js';

const SEEN_KEY = 'pf.whatsNew.seen';

const readSeen = (): string | null => {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};
const writeSeen = (v: string) => {
  try {
    window.localStorage.setItem(SEEN_KEY, v);
  } catch {
    // Storage off: the notes may show again next start, nothing worse.
  }
};

/**
 * "What's new": opens by itself once after the desktop app updates (the notes
 * of every version since the last one seen), and on demand. Reads which
 * ProcessForge server Claude has whenever it opens.
 */
export function useWhatsNew() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [claudeTools, setClaudeTools] = useState<ClaudeToolsStatus | null>(null);

  const readClaudeTools = useCallback(async () => {
    if (!isTauriEnvironment()) return;
    try {
      setClaudeTools(await invokeTauriCommand<ClaudeToolsStatus>('claude_tools_status'));
    } catch {
      setClaudeTools(null);
    }
  }, []);

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let cancelled = false;
    void (async () => {
      let current: string;
      try {
        current = await invokeTauriCommand<string>('plugin:app|version');
      } catch {
        return;
      }
      if (cancelled) return;
      setVersion(current);
      const seen = readSeen();
      const fresh = notesToShow(RELEASE_NOTES, current, seen);
      writeSeen(current);
      if (fresh.length) {
        setNotes(fresh);
        await readClaudeTools();
        if (!cancelled) setOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readClaudeTools]);

  /** By hand: the newest three versions' notes. */
  const show = useCallback(() => {
    setNotes(sortNotes(RELEASE_NOTES).slice(0, 3));
    void readClaudeTools();
    setOpen(true);
  }, [readClaudeTools]);

  return { open, setOpen, notes, version, claudeTools, show };
}
