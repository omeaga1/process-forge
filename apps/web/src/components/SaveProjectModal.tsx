import React, { useState } from 'react';
import {
  Save,
  Download,
  X,
  Check,
  Cloud,
  ShieldCheck,
  User,
  HardDrive
} from 'lucide-react';
import { useTheme } from '@process-forge/canvas-ui';
import type { SimulationProject } from '@process-forge/protocol';
import { useAccount } from '../auth/useAccount.js';
import { hasCloudSession } from '../auth/accountManager.js';

interface SaveProjectModalProps {
  isOpen: boolean;
  project: SimulationProject;
  onClose: () => void;
  onSaveLocal: (name: string, description: string) => void;
  onDownloadFile: (name: string, description: string) => void;
  /** Resolves with what was actually written, so the button cannot claim a sync that failed. */
  onSaveCloud?: (name: string, description: string) => Promise<{ synced: boolean; message: string }>;
}

export const SaveProjectModal: React.FC<SaveProjectModalProps> = ({
  isOpen,
  project,
  onClose,
  onSaveLocal,
  onDownloadFile,
  onSaveCloud
}) => {
  const { palette } = useTheme();
  const OsakaJadePalette = palette;
  const { user, openAccountModal } = useAccount();
  // Only a Google account verified by the cloud API can sync. A local email
  // profile is "signed in" but has no cloud credential.
  const canSync = hasCloudSession(user);

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [isSavedLocally, setIsSavedLocally] = useState(false);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [isSavedCloud, setIsSavedCloud] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveLocal = () => {
    onSaveLocal(name, description);
    setIsSavedLocally(true);
    setTimeout(() => setIsSavedLocally(false), 2000);
  };

  const handleSaveCloud = async () => {
    if (!onSaveCloud) return;
    setIsSavingCloud(true);
    try {
      const result = await onSaveCloud(name, description);
      setCloudMessage(result.message);
      if (result.synced) {
        setIsSavedCloud(true);
        setTimeout(() => setIsSavedCloud(false), 2000);
      }
    } catch (e: any) {
      setCloudMessage(`Cloud save failed: ${e?.message || String(e)}`);
    } finally {
      setIsSavingCloud(false);
    }
  };

  const handleDownload = () => {
    onDownloadFile(name, description);
  };

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
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: OsakaJadePalette.jade[500]
              }}
            >
              <Save size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                Save Simulation Flowsheet
              </h3>
              <span style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
                Preserve digital twin topology, equipment dressing, and agent transcripts
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

        {/* Content Form */}
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 4 }}>
              Simulation Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sherwin-Williams Line Twin"
              style={{
                width: '100%',
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                borderRadius: 6,
                padding: '8px 12px',
                color: OsakaJadePalette.text.primary,
                fontSize: 13,
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 4 }}>
              Description &amp; Engineering Notes
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Facility notes, batch recipe details, or line targets..."
              style={{
                width: '100%',
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                borderRadius: 6,
                padding: '8px 12px',
                color: OsakaJadePalette.text.primary,
                fontSize: 13,
                outline: 'none',
                resize: 'none'
              }}
            />
          </div>

          {/* Storage Destination Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {/* Primary: ProcessForge Cloud Storage */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: `1px solid ${OsakaJadePalette.jade[600]}`,
                borderRadius: 8
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Cloud size={20} color={OsakaJadePalette.jade[400]} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Save to ProcessForge Cloud
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 10,
                        backgroundColor: OsakaJadePalette.jade[500],
                        color: OsakaJadePalette.text.inverse
                      }}
                    >
                      RECOMMENDED
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary, marginTop: 2 }}>
                    {canSync && user
                      ? `Syncs to ${user.email} • available on any device you sign in on`
                      : user
                        ? 'Needs a Google sign-in. Email profiles are stored on this device only.'
                        : 'Sign in with Google to keep a copy you can open on any device'}
                    {cloudMessage && (
                      <div role="status" style={{ marginTop: 4, color: OsakaJadePalette.text.primary }}>
                        {cloudMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {canSync ? (
                <button
                  onClick={handleSaveCloud}
                  disabled={isSavingCloud}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    backgroundColor: isSavedCloud ? OsakaJadePalette.jade[600] : OsakaJadePalette.jade[500],
                    border: 'none',
                    borderRadius: 6,
                    color: OsakaJadePalette.text.inverse,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: isSavingCloud ? 'wait' : 'pointer'
                  }}
                >
                  {isSavedCloud ? <Check size={14} /> : <Cloud size={14} />}
                  {isSavedCloud ? 'Saved to Cloud!' : isSavingCloud ? 'Syncing...' : 'Save to Cloud'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    onClose();
                    openAccountModal();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    backgroundColor: OsakaJadePalette.jade[500],
                    border: 'none',
                    borderRadius: 6,
                    color: OsakaJadePalette.text.inverse,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <User size={13} />
                  {user ? 'Sign in with Google' : 'Sign In to Sync'}
                </button>
              )}
            </div>

            {/* Browser Storage */}
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
                <HardDrive size={18} color={OsakaJadePalette.text.secondary} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                    Browser Local Storage
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary }}>
                    Quick save to this browser for fast reloading
                  </div>
                </div>
              </div>
              <button
                onClick={handleSaveLocal}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  backgroundColor: isSavedLocally ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                  border: `1px solid ${isSavedLocally ? OsakaJadePalette.jade[500] : OsakaJadePalette.border.default}`,
                  borderRadius: 6,
                  color: isSavedLocally ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {isSavedLocally ? <Check size={13} /> : <Save size={13} />}
                {isSavedLocally ? 'Saved' : 'Save Local'}
              </button>
            </div>

            {/* Download File */}
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
                <Download size={18} color={OsakaJadePalette.text.secondary} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                    Download .pfg.json Bundle
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary }}>
                    Export a standalone JSON file to share or archive on your drive
                  </div>
                </div>
              </div>
              <button
                onClick={handleDownload}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: 6,
                  color: OsakaJadePalette.text.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Download size={13} />
                Download
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: OsakaJadePalette.background.canvas,
            borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: OsakaJadePalette.text.muted
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ShieldCheck size={12} color={OsakaJadePalette.jade[500]} />
            100% Deterministic Simulation State Preservation
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: 'transparent',
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 6,
              color: OsakaJadePalette.text.secondary,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
