import React from 'react';
import { Modal, Button, useTheme } from '@process-forge/canvas-ui';
import { tint } from '@process-forge/theme';
import { Sparkles } from 'lucide-react';
import type { ClaudeToolsStatus, ReleaseNote } from '../releaseNotes/model.js';
import { claudeToolsVerdict } from '../releaseNotes/model.js';

/** **bold** and `code` inside a line of notes. */
function inline(text: string, mono: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : part.startsWith('`') ? (
      <code key={i} style={{ fontFamily: mono, fontSize: '0.92em' }}>
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    )
  );
}

/** A note's body: bullet lines become a list, other lines paragraphs. */
const NoteBody: React.FC<{ body: string }> = ({ body }) => {
  const { palette, font } = useTheme();
  const lines = body.split('\n').filter((l) => l.trim());
  const items = lines.filter((l) => l.startsWith('- '));
  const paras = lines.filter((l) => !l.startsWith('- '));
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.5, color: palette.text.secondary }}>
          {inline(p, font.mono)}
        </p>
      ))}
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((l, i) => (
          <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: palette.text.secondary }}>
            {inline(l.slice(2), font.mono)}
          </li>
        ))}
      </ul>
    </>
  );
};

/**
 * What changed: the notes of every version since the one last seen (or the
 * newest few when opened by hand), and which ProcessForge server Claude is
 * running, so an update to Claude's tools that is waiting on a restart of
 * Claude is said rather than missed.
 */
export const WhatsNewDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: ReleaseNote[];
  currentVersion: string | null;
  claudeTools: ClaudeToolsStatus | null;
}> = ({ open, onOpenChange, notes, currentVersion, claudeTools }) => {
  const { palette, font } = useTheme();
  const verdict = claudeToolsVerdict(claudeTools);
  const tools =
    verdict.kind === 'restart'
      ? { tone: palette.status.blocked, text: `Claude is running ProcessForge tools ${verdict.running}; ${verdict.ready} is ready. Quit and reopen Claude to use it.` }
      : verdict.kind === 'current'
        ? { tone: palette.jade.glow, text: `Claude is running the newest ProcessForge tools, ${verdict.version}.` }
        : verdict.kind === 'unknown'
          ? { tone: palette.text.muted, text: `Claude has ProcessForge tools ${verdict.ready} ready; they report the running version once Claude has restarted on them.` }
          : null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      width={560}
      icon={<Sparkles size={16} color={palette.jade[400]} />}
      title={currentVersion ? `What's new in ProcessForge ${currentVersion}` : "What's new in ProcessForge"}
      footer={
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          Got it
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {notes.map((n) => (
          <section key={n.version}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: palette.text.primary }}>{n.title}</h3>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: palette.text.muted }}>{n.version}</span>
            </div>
            <NoteBody body={n.body} />
          </section>
        ))}
        {notes.length === 0 && <p style={{ margin: 0, fontSize: 13, color: palette.text.muted }}>No notes for this version.</p>}
        {tools && (
          <div
            role="note"
            style={{ fontSize: 12, lineHeight: 1.45, padding: '8px 10px', color: palette.text.secondary, backgroundColor: tint(tools.tone, 0.08), borderLeft: `2px solid ${tools.tone}` }}
          >
            <span style={{ fontWeight: 700, color: palette.text.primary }}>Claude's tools · </span>
            {tools.text}
          </div>
        )}
      </div>
    </Modal>
  );
};
