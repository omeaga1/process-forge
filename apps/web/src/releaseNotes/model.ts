/**
 * Release notes, one Markdown file per desktop version (0.1.90.md), written
 * in each release PR in plain words: what you will notice and where. The same
 * file becomes the GitHub release's text and the update banner's notes
 * (release-desktop.yml), and the app shows it once after updating to it.
 * CI refuses a desktop version with no notes (tooling/check-release-notes.mjs).
 */

export interface ReleaseNote {
  version: string;
  /** The first line's heading, without the '# '. */
  title: string;
  /** The rest of the file. */
  body: string;
}

/** -1, 0 or 1, comparing dotted versions numerically. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

export function parseNote(version: string, text: string): ReleaseNote {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n');
  const head = lines[0]?.startsWith('# ') ? lines.shift()!.slice(2).trim() : `ProcessForge ${version}`;
  return { version, title: head, body: lines.join('\n').trim() };
}

/** Newest first. */
export function sortNotes(notes: ReleaseNote[]): ReleaseNote[] {
  return [...notes].sort((a, b) => compareVersions(b.version, a.version));
}

/** On a first run the whole history is not news: the last few versions are. */
export const FIRST_RUN_NOTES = 3;

/**
 * What to show after an update: every version newer than the one last seen,
 * up to the one running. With no version seen yet (a first run, or the first
 * version that has this window), the running version and the two before it.
 * Nothing when nothing is new.
 */
export function notesToShow(notes: ReleaseNote[], current: string, lastSeen: string | null): ReleaseNote[] {
  const upToCurrent = sortNotes(notes).filter((n) => compareVersions(n.version, current) <= 0);
  if (!lastSeen) return upToCurrent.slice(0, FIRST_RUN_NOTES);
  if (compareVersions(current, lastSeen) <= 0) return [];
  return upToCurrent.filter((n) => compareVersions(n.version, lastSeen) > 0);
}

/** What the app reads about Claude's ProcessForge tools (desktop command claude_tools_status). */
export interface ClaudeToolsStatus {
  running: { version: string; startedAt?: string } | null;
  downloaded: { version: string; build?: string } | null;
  extension: string | null;
  log: string[];
}

export type ClaudeToolsVerdict =
  | { kind: 'none' }
  | { kind: 'current'; version: string }
  | { kind: 'restart'; running: string; ready: string }
  | { kind: 'unknown'; ready: string };

/**
 * Whether Claude is on the newest server it has. The extension runs the
 * newer of the one it shipped and the one it downloaded, from Claude's next
 * start; the running record says what this start actually is.
 */
export function claudeToolsVerdict(s: ClaudeToolsStatus | null): ClaudeToolsVerdict {
  if (!s) return { kind: 'none' };
  const candidates = [s.downloaded?.version, s.extension].filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (candidates.length === 0) return { kind: 'none' };
  const ready = candidates.sort((a, b) => compareVersions(b, a))[0]!;
  const running = s.running?.version;
  // A server older than the running record (before 0.22) never wrote one.
  if (!running) return { kind: 'unknown', ready };
  return compareVersions(running, ready) < 0 ? { kind: 'restart', running, ready } : { kind: 'current', version: running };
}
