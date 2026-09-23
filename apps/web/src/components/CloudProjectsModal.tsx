import React, { useState, useEffect } from 'react';
import {
  Cloud,
  FolderOpen,
  Search,
  Check,
  Trash2,
  Download,
  Upload,
  Clock,
  Layers,
  X,
  ArrowRight,
  ShieldCheck,
  Activity
} from 'lucide-react';
import { useTheme } from '@process-forge/canvas-ui';
import type { SimulationProject } from '@process-forge/protocol';
import { useAccount } from '../auth/useAccount.js';
import {
  listUserCloudProjects,
  deleteProjectFromCloud,
  resolveProjectBundle,
  type CloudProjectRecord
} from '../storage/cloudStorageAdapter.js';
import { downloadProjectFile } from '../storage/localStorageAdapter.js';
import { draftingRadius } from '@process-forge/theme';

export interface CloudProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (project: SimulationProject) => void;
  onUploadLocalFile: (file: File) => void;
}

export const CloudProjectsModal: React.FC<CloudProjectsModalProps> = ({
  isOpen,
  onClose,
  onSelectProject,
  onUploadLocalFile
}) => {
  const { palette } = useTheme();
  const OsakaJadePalette = palette;
  const { user, isAuthenticated, openAccountModal } = useAccount();

  const [projects, setProjects] = useState<CloudProjectRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      listUserCloudProjects(user)
        .then((items) => {
          setProjects(items);
          setIsLoading(false);
        })
        .catch(() => setIsLoading(false));
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSelect = async (record: CloudProjectRecord) => {
    setLoadedId(record.id);
    const bundle = await resolveProjectBundle(record, user);
    if (!bundle) {
      setLoadedId(null);
      window.alert(`Could not load "${record.name}" from ProcessForge Cloud.`);
      return;
    }
    onSelectProject(bundle);
    onClose();
  };

  const handleDelete = async (e: React.MouseEvent, recordId: string) => {
    e.stopPropagation();
    if (window.confirm('Delete this simulation project from Cloud Storage?')) {
      await deleteProjectFromCloud(recordId, user);
      setProjects((prev) => prev.filter((p) => p.id !== recordId));
    }
  };

  const handleExport = (e: React.MouseEvent, record: CloudProjectRecord) => {
    e.stopPropagation();
    void resolveProjectBundle(record, user).then((bundle) => bundle && downloadProjectFile(bundle));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadLocalFile(file);
      e.target.value = '';
      onClose();
    }
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatRelativeTime = (isoString: string) => {
    try {
      const diff = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return 'Recently';
    }
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
          width: 720,
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
                width: 34,
                height: 34,
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
                Cloud Simulation Projects
              </h3>
              <span style={{ fontSize: 12, color: OsakaJadePalette.text.secondary }}>
                {isAuthenticated && user
                  ? `${user.name} • ${projects.length} simulations in Cloud Storage`
                  : 'Open, browse, or import saved digital twins'}
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

        {/* Action / Search Bar */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: OsakaJadePalette.background.surfaceElevated,
            borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: OsakaJadePalette.background.canvas,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: draftingRadius.soft,
              padding: '6px 12px',
              flex: 1,
              minWidth: 200
            }}
          >
            <Search size={14} color={OsakaJadePalette.text.muted} />
            <input
              type="text"
              placeholder="Search cloud simulations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                color: OsakaJadePalette.text.primary,
                fontSize: 12,
                width: '100%'
              }}
            />
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: draftingRadius.soft,
              color: OsakaJadePalette.text.secondary,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <Upload size={14} />
            Import .pfg File
            <input type="file" accept=".json,.pfg,.pfg.json" onChange={handleFileInput} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Projects List Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!isAuthenticated ? (
            /* Unauthenticated Prompt */
            <div
              style={{
                padding: 30,
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: OsakaJadePalette.jade[400]
                }}
              >
                <Cloud size={24} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: 16, color: OsakaJadePalette.text.primary }}>
                  Connect Account for Cloud Storage
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: OsakaJadePalette.text.secondary, maxWidth: 420 }}>
                  Sign in with GitHub, Google, or your corporate engineering email to automatically sync simulations to the cloud and collaborate across devices.
                </p>
              </div>
              <button
                onClick={() => {
                  onClose();
                  openAccountModal();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '9px 20px',
                  backgroundColor: OsakaJadePalette.jade[500],
                  color: OsakaJadePalette.text.inverse,
                  border: 'none',
                  borderRadius: draftingRadius.soft,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginTop: 6
                }}
              >
                Sign In Now <ArrowRight size={14} />
              </button>
            </div>
          ) : isLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: OsakaJadePalette.text.secondary }}>
              Loading cloud digital twins...
            </div>
          ) : filteredProjects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: OsakaJadePalette.text.secondary }}>
              No simulations found matching &quot;{searchQuery}&quot;. Save your active flowsheet to Cloud Storage to see it here!
            </div>
          ) : (
            filteredProjects.map((project) => {
              const isLoaded = loadedId === project.id;
              return (
                <div
                  key={project.id}
                  onClick={() => handleSelect(project)}
                  style={{
                    padding: 16,
                    borderRadius: draftingRadius.soft,
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    border: `1px solid ${isLoaded ? OsakaJadePalette.jade[500] : OsakaJadePalette.border.default}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                        {project.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: draftingRadius.soft,
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: OsakaJadePalette.jade[400],
                          border: `1px solid ${OsakaJadePalette.jade[700]}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <ShieldCheck size={10} /> Cloud Synced
                      </span>
                    </div>

                    <p
                      style={{
                        margin: '0 0 8px 0',
                        fontSize: 12,
                        color: OsakaJadePalette.text.secondary,
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {project.description || 'No description provided.'}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: OsakaJadePalette.text.muted }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Layers size={12} /> {project.nodeCount} Equipment Units
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Activity size={12} /> {project.streamCount} Streams
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} /> {formatRelativeTime(project.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={(e) => handleExport(e, project)}
                      title="Download .pfg.json bundle"
                      style={{
                        background: 'none',
                        border: `1px solid ${OsakaJadePalette.border.subtle}`,
                        borderRadius: draftingRadius.soft,
                        color: OsakaJadePalette.text.secondary,
                        padding: 6,
                        cursor: 'pointer'
                      }}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, project.id)}
                      title="Delete from Cloud"
                      style={{
                        background: 'none',
                        border: `1px solid ${OsakaJadePalette.border.subtle}`,
                        borderRadius: draftingRadius.soft,
                        color: OsakaJadePalette.text.muted,
                        padding: 6,
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={() => handleSelect(project)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: draftingRadius.soft,
                        backgroundColor: isLoaded ? OsakaJadePalette.jade[600] : OsakaJadePalette.jade[500],
                        color: OsakaJadePalette.text.inverse,
                        border: 'none',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer'
                      }}
                    >
                      {isLoaded ? <Check size={13} /> : <FolderOpen size={13} />}
                      {isLoaded ? 'Loaded' : 'Open Twin'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
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
          <span>
            ProcessForge Cloud replicates topology, machine configs, Sub-Agent transcripts, and simulation telemetry.
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: 'transparent',
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: draftingRadius.soft,
              color: OsakaJadePalette.text.secondary,
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
