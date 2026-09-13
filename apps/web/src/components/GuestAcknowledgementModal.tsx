import React from 'react';
import { ShieldAlert, Download, ArrowRight, X } from 'lucide-react';
import { OsakaJadePalette } from '@process-forge/theme';

interface GuestAcknowledgementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportFile: () => void;
}

export const GuestAcknowledgementModal: React.FC<GuestAcknowledgementModalProps> = ({
  isOpen,
  onClose,
  onExportFile
}) => {
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
          backgroundColor: OsakaJadePalette.background.surface,
          border: `1px solid ${OsakaJadePalette.border.default}`,
          borderRadius: 12,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
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
                borderRadius: 8,
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: OsakaJadePalette.border.glowAmber
              }}
            >
              <ShieldAlert size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                Guest Mode — Exploration Notice
              </h3>
              <span style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
                Trialing ProcessForge without an account
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
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: OsakaJadePalette.text.primary }}>
            Welcome to ProcessForge. You have access to the flowsheet canvas, the local deterministic simulation engine, and unit operation tools.
          </p>

          <div
            style={{
              padding: 14,
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: `1px solid rgba(245, 158, 11, 0.25)`,
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.5,
              color: OsakaJadePalette.text.primary
            }}
          >
            <strong style={{ color: OsakaJadePalette.border.glowAmber }}>Local Storage Notice:</strong> In browser mode, your flowsheet is saved to your browser cache. Download a <code>.pfg.json</code> bundle to keep your project permanently on your drive.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: OsakaJadePalette.text.muted }}>
              Preservation Options:
            </span>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.subtle}`,
                borderRadius: 8
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Download size={18} color={OsakaJadePalette.jade[500]} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                    Download Project Bundle (.pfg.json)
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary }}>
                    Completely free &amp; offline. Keep your full simulation safe on your drive.
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
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: `1px solid ${OsakaJadePalette.jade[600]}`,
                  borderRadius: 6,
                  color: OsakaJadePalette.text.accent,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
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
            justifyContent: 'flex-end',
            gap: 10
          }}
        >
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: OsakaJadePalette.jade[500],
              border: 'none',
              borderRadius: 6,
              color: '#0c1214',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Continue as Guest
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
