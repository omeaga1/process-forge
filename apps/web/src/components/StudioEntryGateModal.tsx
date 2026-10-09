import React from 'react';
import { Cloud, HardDrive, Check, ArrowRight } from 'lucide-react';
import { Button, Modal, useTheme } from '@process-forge/canvas-ui';
import { tint } from '@process-forge/theme';

interface StudioEntryGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAccountModal: () => void;
  onContinueGuest: () => void;
}

/** Before the first flowsheet: sign in with Google, or carry on with projects kept on this device. */
export const StudioEntryGateModal: React.FC<StudioEntryGateModalProps> = ({ isOpen, onClose, onOpenAccountModal, onContinueGuest }) => {
  const { palette } = useTheme();
  const choice = (
    icon: React.ReactNode,
    accent: string,
    title: string,
    points: string[],
    action: React.ReactNode,
    highlight?: boolean
  ) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        borderRadius: 8,
        border: `1px solid ${highlight ? palette.jade[600] : palette.border.default}`,
        backgroundColor: highlight ? tint(palette.jade[500], 0.06) : palette.background.canvas
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', backgroundColor: tint(accent, 0.14), color: accent }}>{icon}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: palette.text.primary }}>{title}</div>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {points.map((p) => (
          <li key={p} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45, color: palette.text.secondary }}>
            <Check size={14} color={accent} style={{ flexShrink: 0, marginTop: 1 }} />
            {p}
          </li>
        ))}
      </ul>
      {action}
    </div>
  );
  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      width={600}
      title="Welcome to ProcessForge"
      description="Choose where your flowsheets are kept. You can sign in later."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {choice(
          <Cloud size={17} />,
          palette.jade[400],
          'Sign in with Google',
          [
            'Save to cloud keeps a copy under your account, only when you choose to',
            'Open the same projects in the desktop app and in the browser',
            'Publish unit operations to the community library under your name'
          ],
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              onOpenAccountModal();
            }}
          >
            Sign in <ArrowRight size={14} />
          </Button>,
          true
        )}
        {choice(
          <HardDrive size={17} />,
          palette.status.blocked,
          'Continue without an account',
          [
            'Projects are saved in this browser (or this desktop app) and never uploaded',
            'Clearing site data removes them, so export anything you want to keep'
          ],
          <Button
            onClick={() => {
              onClose();
              onContinueGuest();
            }}
          >
            Continue without an account <ArrowRight size={14} />
          </Button>
        )}
      </div>
    </Modal>
  );
};
