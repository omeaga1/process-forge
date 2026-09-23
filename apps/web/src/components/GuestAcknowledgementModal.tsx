import React from 'react';
import { ShieldCheck, Download, ArrowRight, X, Cloud } from 'lucide-react';
import { useTheme } from '@process-forge/canvas-ui';
import { draftingRadius } from '@process-forge/theme';

interface GuestAcknowledgementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportFile: () => void;
  onOpenAccountModal?: () => void;
}

export const GuestAcknowledgementModal: React.FC<GuestAcknowledgementModalProps> = ({
  isOpen,
  onClose,
  onExportFile,
  onOpenAccountModal
}) => {
  const { palette } = useTheme();
  const OsakaJadePalette = palette;

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 12, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <div
        style={{
          width: 580,
          maxWidth: '100%',
          maxHeight: 'min(90vh, calc(100vh - 40px))',
          backgroundColor: OsakaJadePalette.background.surface,
          border: `1px solid ${OsakaJadePalette.border.default}`,
          borderRadius: draftingRadius.sharp,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            backgroundColor: OsakaJadePalette.background.canvas,
            borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: draftingRadius.soft,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: OsakaJadePalette.jade[500]
              }}
            >
              <Cloud size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                ProcessForge Cloud &amp; Storage
              </h3>
              <span style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
                Preserve your simulation digital twin
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: OsakaJadePalette.text.muted,
              cursor: 'pointer',
              padding: 4
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: OsakaJadePalette.text.primary }}>
            Everything works without an account: the flowsheet canvas, the discrete-event simulation, and unit-op design. Your projects are saved on this device.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: OsakaJadePalette.text.muted }}>
              Cloud &amp; Storage Options:
            </span>

            {/* Cloud Storage Card */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: `1px solid ${OsakaJadePalette.jade[600]}`,
                borderRadius: draftingRadius.soft
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Cloud size={20} color={OsakaJadePalette.jade[400]} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ProcessForge Cloud Storage
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: draftingRadius.soft,
                        backgroundColor: OsakaJadePalette.jade[500],
                        color: OsakaJadePalette.text.inverse
                      }}
                    >
                      RECOMMENDED
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary, marginTop: 2 }}>
                    Sign in with Google to keep a copy in ProcessForge Cloud when you choose Save to Cloud.
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenAccountModal?.();
                }}
                style={{
                  padding: '7px 14px',
                  backgroundColor: OsakaJadePalette.jade[500],
                  border: 'none',
                  borderRadius: draftingRadius.soft,
                  color: OsakaJadePalette.text.inverse,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Sign In
              </button>
            </div>

            {/* Download File */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.subtle}`,
                borderRadius: draftingRadius.soft
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Download size={18} color={OsakaJadePalette.text.secondary} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                    Download Project File (.pfg.json)
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary }}>
                    Export a standalone digital twin JSON file to your disk anytime.
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  onExportFile();
                  onClose();
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: draftingRadius.soft,
                  color: OsakaJadePalette.text.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Download File
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: OsakaJadePalette.background.canvas,
            borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: OsakaJadePalette.text.muted }}>
            <ShieldCheck size={14} color={OsakaJadePalette.jade[500]} />
            No account needed
          </span>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: draftingRadius.soft,
              color: OsakaJadePalette.text.primary,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Continue
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
