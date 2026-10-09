import React from 'react';
import { Download, Cloud, ArrowRight } from 'lucide-react';
import { Button, Modal, useTheme } from '@process-forge/canvas-ui';
import { tint } from '@process-forge/theme';

interface GuestAcknowledgementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportFile: () => void;
  onOpenAccountModal?: () => void;
}

/** Working without an account: where the work is kept, and the two ways to keep a copy elsewhere. */
export const GuestAcknowledgementModal: React.FC<GuestAcknowledgementModalProps> = ({ isOpen, onClose, onExportFile, onOpenAccountModal }) => {
  const { palette } = useTheme();
  const option = (icon: React.ReactNode, title: React.ReactNode, text: string, action: React.ReactNode, highlight?: boolean) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 8,
        border: `1px solid ${highlight ? palette.jade[600] : palette.border.default}`,
        backgroundColor: highlight ? tint(palette.jade[500], 0.07) : palette.background.canvas
      }}
    >
      <div style={{ color: highlight ? palette.jade[400] : palette.text.secondary, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 650, color: palette.text.primary }}>{title}</div>
        <div style={{ fontSize: 12, color: palette.text.secondary, marginTop: 2, lineHeight: 1.45 }}>{text}</div>
      </div>
      {action}
    </div>
  );
  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      width={540}
      title="Working without an account"
      description="Everything works: the canvas, the simulation and unit-op design. Your projects are saved on this device."
      footer={
        <Button variant="primary" onClick={onClose}>
          Continue <ArrowRight size={14} />
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {option(
          <Cloud size={20} />,
          'Keep a copy in ProcessForge Cloud',
          'Sign in with Google, then use Save to cloud to open your projects on any device.',
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onClose();
              onOpenAccountModal?.();
            }}
          >
            Sign in
          </Button>,
          true
        )}
        {option(
          <Download size={20} />,
          'Download the project file',
          'A .pfg.json file you can keep, share or open again later.',
          <Button
            size="sm"
            onClick={() => {
              onExportFile();
              onClose();
            }}
          >
            Download
          </Button>
        )}
      </div>
    </Modal>
  );
};
