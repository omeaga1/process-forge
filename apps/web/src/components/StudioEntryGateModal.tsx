import React from 'react';
import { Cloud, HardDrive, ShieldAlert, ArrowRight, UserPlus, X, CheckCircle2 } from 'lucide-react';
import { useTheme } from '@process-forge/canvas-ui';
import { draftingRadius } from '@process-forge/theme';

interface StudioEntryGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAccountModal: () => void;
  onContinueGuest: () => void;
}

export const StudioEntryGateModal: React.FC<StudioEntryGateModalProps> = ({
  isOpen,
  onClose,
  onOpenAccountModal,
  onContinueGuest
}) => {
  const { palette } = useTheme();
  const OsakaJadePalette = palette;

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 12, 0.88)',
        backdropFilter: 'blur(10px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <div
        style={{
          width: 640,
          maxWidth: '100%',
          maxHeight: 'min(92vh, 700px)',
          backgroundColor: OsakaJadePalette.background.surface,
          border: `1px solid ${OsakaJadePalette.border.default}`,
          borderRadius: draftingRadius.sharp,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            backgroundColor: OsakaJadePalette.background.canvas,
            borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: OsakaJadePalette.text.primary, letterSpacing: '-0.02em' }}>
              Welcome to ProcessForge Studio
            </h3>
            <span style={{ fontSize: 13, color: OsakaJadePalette.text.secondary }}>
              Select your session mode before opening your flowsheet canvas
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: OsakaJadePalette.text.muted,
              cursor: 'pointer',
              padding: 6,
              borderRadius: draftingRadius.soft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body / Selection Cards */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* Option 1: Cloud Sync & Account */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: draftingRadius.soft,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.jade[600]}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: draftingRadius.soft,
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: OsakaJadePalette.jade[400]
                  }}
                >
                  <Cloud size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                    Sign Up or Sign In
                  </h4>
                  <span style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
                    Keep a copy of your flowsheets you can open on another device
                  </span>
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: draftingRadius.soft,
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  color: OsakaJadePalette.jade[300],
                  border: `1px solid ${OsakaJadePalette.jade[500]}66`
                }}
              >
                Google account
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: OsakaJadePalette.text.secondary }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={13} color={OsakaJadePalette.jade[400]} />
                <span>Save to Cloud keeps a copy under your Google account — only when you choose to</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={13} color={OsakaJadePalette.jade[400]} />
                <span>Open the same projects in the desktop app and in the browser</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={13} color={OsakaJadePalette.jade[400]} />
                <span>Publish unit operations to the community library under your name</span>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                onOpenAccountModal();
              }}
              style={{
                marginTop: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: draftingRadius.soft,
                backgroundColor: OsakaJadePalette.jade[500],
                color: OsakaJadePalette.text.inverse,
                border: 'none',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <UserPlus size={15} />
              <span>Sign In / Create Free Account</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Option 2: Guest Mode */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: draftingRadius.soft,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: draftingRadius.soft,
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: OsakaJadePalette.status.blocked
                  }}
                >
                  <HardDrive size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                    Continue in Guest Mode
                  </h4>
                  <span style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
                    Everything works without an account
                  </span>
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: draftingRadius.soft,
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: OsakaJadePalette.status.blocked,
                  border: '1px solid rgba(245, 158, 11, 0.3)'
                }}
              >
                This device only
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: OsakaJadePalette.text.secondary }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={13} color={OsakaJadePalette.status.blocked} />
                <span>Projects are saved in this browser (or this desktop app) and never uploaded</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={13} color={OsakaJadePalette.status.blocked} />
                <span>Clearing site data removes them, so export anything you want to keep</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={13} color={OsakaJadePalette.text.muted} />
                <span>Export a project as a <code style={{ color: OsakaJadePalette.jade[400] }}>.pfg.json</code> file at any time</span>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                onContinueGuest();
              }}
              style={{
                marginTop: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: draftingRadius.soft,
                backgroundColor: OsakaJadePalette.background.surface,
                color: OsakaJadePalette.text.primary,
                border: `1px solid ${OsakaJadePalette.border.strong}`,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <span>Enter Guest Studio (Blank Canvas)</span>
              <ArrowRight size={14} color={OsakaJadePalette.text.muted} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
