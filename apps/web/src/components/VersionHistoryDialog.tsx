import React from 'react';
import { Modal, Button, useTheme } from '@process-forge/canvas-ui';
import { tint } from '@process-forge/theme';
import { History, RotateCcw } from 'lucide-react';
import { reasonLabel, type ProjectVersion } from '../storage/versions.js';

/**
 * Earlier versions of the open project, newest first, each with a way back.
 * Going back never loses the flowsheet as it is: that is kept as a version
 * first, so a restore can itself be undone from this list.
 */
export const VersionHistoryDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  versions: ProjectVersion[];
  onRestore: (versionId: string) => void;
}> = ({ open, onOpenChange, projectName, versions, onRestore }) => {
  const { palette, font } = useTheme();
  const day = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      width={560}
      icon={<History size={16} color={palette.jade[400]} />}
      title={`History of ${projectName}`}
      footer={<Button onClick={() => onOpenChange(false)}>Close</Button>}
    >
      <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, color: palette.text.secondary }}>
        ProcessForge never overwrites a flowsheet without keeping the one before: before an assistant&apos;s plan, before a file is opened over it, before
        going back, on every save, and every ten minutes of editing. Going back keeps the flowsheet as it is now too.
      </p>
      {versions.length === 0 ? (
        <div data-testid="history-empty" style={{ padding: '18px 0', fontSize: 13, color: palette.text.muted, textAlign: 'center' }}>
          No earlier versions yet. One is kept as soon as this flowsheet changes.
        </div>
      ) : (
        <ol data-testid="history-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 380, overflowY: 'auto' }}>
          {versions.map((v, i) => {
            const plan = v.reason === 'before-plan';
            return (
              <li
                key={v.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 4,
                  border: `1px solid ${plan ? tint(palette.jade[500], 0.35) : palette.border.subtle}`,
                  background: palette.background.surface
                }}
              >
                <div style={{ width: 64, flexShrink: 0, fontFamily: font.mono, fontSize: 11, color: palette.text.muted, lineHeight: 1.35 }}>
                  <div>{day(v.at)}</div>
                  <div style={{ color: palette.text.secondary }}>{time(v.at)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label}</div>
                  <div style={{ fontSize: 11, color: palette.text.muted }}>
                    {reasonLabel(v.reason)} · {v.nodeCount} {v.nodeCount === 1 ? 'unit' : 'units'} · {v.streamCount} {v.streamCount === 1 ? 'stream' : 'streams'}
                    {i === 0 ? ' · newest' : ''}
                  </div>
                </div>
                <Button size="sm" icon={<RotateCcw size={12} />} onClick={() => onRestore(v.id)}>
                  Go back
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
};
