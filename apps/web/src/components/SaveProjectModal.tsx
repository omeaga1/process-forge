import React, { useState } from 'react';
import { Save, Download, X, Check } from 'lucide-react';
import { OsakaJadePalette } from '@process-forge/theme';
import type { SimulationProject } from '@process-forge/protocol';

interface SaveProjectModalProps {
  isOpen: boolean;
  project: SimulationProject;
  onClose: () => void;
  onSaveLocal: (name: string, description: string) => void;
  onDownloadFile: (name: string, description: string) => void;
}

export const SaveProjectModal: React.FC<SaveProjectModalProps> = ({
  isOpen,
  project,
  onClose,
  onSaveLocal,
  onDownloadFile
}) => {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [isSavedLocally, setIsSavedLocally] = useState(false);

  if (!isOpen) return null;

  const handleSaveLocal = () => {
    onSaveLocal(name, description);
    setIsSavedLocally(true);
    setTimeout(() => setIsSavedLocally(false), 2000);
  };

  const handleDownload = () => {
    onDownloadFile(name, description);
    onClose();
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
          width: 560,
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
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                Save Simulation Flowsheet
              </h3>
              <span style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
                Preserve topology, equipment parameters, and stream connections
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

        {/* Form Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 6 }}>
              Project / Line Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paint Packaging Line A"
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
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 6 }}>
              Description & Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Facility notes, fluid batch details, or line targets..."
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
            {/* Download File */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.subtle}`,
                borderRadius: 8
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Download size={20} color={OsakaJadePalette.jade[500]} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                    Download .pfg.json Bundle
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary }}>
                    Recommended for Guest Mode: 100% offline file on your disk.
                  </div>
                </div>
              </div>
              <button
                onClick={handleDownload}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  backgroundColor: OsakaJadePalette.jade[500],
                  border: 'none',
                  borderRadius: 6,
                  color: '#0c1214',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Download size={14} />
                Download File
              </button>
            </div>

            {/* Browser Local Storage Cache */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.subtle}`,
                borderRadius: 8
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Save size={20} color={OsakaJadePalette.jade[400]} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                    Browser Local Storage Cache
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary }}>
                    Persists this project in your local browser cache for immediate reloading.
                  </div>
                </div>
              </div>
              <button
                onClick={handleSaveLocal}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  backgroundColor: isSavedLocally ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  border: `1px solid ${isSavedLocally ? OsakaJadePalette.jade[500] : OsakaJadePalette.border.default}`,
                  borderRadius: 6,
                  color: isSavedLocally ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {isSavedLocally && <Check size={14} color={OsakaJadePalette.jade[400]} />}
                {isSavedLocally ? 'Saved to Cache' : 'Save to Cache'}
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
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <button
            onClick={handleSaveLocal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: `1px solid ${OsakaJadePalette.border.subtle}`,
              borderRadius: 6,
              color: OsakaJadePalette.text.secondary,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            {isSavedLocally ? <Check size={14} color={OsakaJadePalette.jade[500]} /> : <Save size={14} />}
            {isSavedLocally ? 'Saved in Browser Cache!' : 'Cache in Browser'}
          </button>

          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: 'transparent',
              border: 'none',
              color: OsakaJadePalette.text.muted,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
