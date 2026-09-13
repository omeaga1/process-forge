import React, { useState, useCallback, useEffect } from 'react';
import {
  ProcessCanvas,
  SHERWIN_WILLIAMS_PAINT_LINE,
  AiModelModal,
  getAiConfig,
  type AiModelConfig
} from '@process-forge/canvas-ui';
import {
  createSimulationProject,
  type SimulationProject
} from '@process-forge/protocol';
import { HeaderBar } from './components/HeaderBar.js';
import { McpModal } from './components/McpModal.js';
import { GuestAcknowledgementModal } from './components/GuestAcknowledgementModal.js';
import { SaveProjectModal } from './components/SaveProjectModal.js';
import { UpdateNotificationBanner } from './components/UpdateNotificationBanner.js';
import {
  saveLocalProject,
  loadCurrentLocalProject,
  downloadProjectFile,
  readProjectFromFile
} from './storage/localStorageAdapter.js';

export const App: React.FC = () => {
  const [templateKey, setTemplateKey] = useState<string>('sherwin-williams-paint-line');
  const [isMcpModalOpen, setIsMcpModalOpen] = useState<boolean>(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiConfig, setAiConfig] = useState<AiModelConfig>(() => getAiConfig());
  const [isGuestModalOpen, setIsGuestModalOpen] = useState<boolean>(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);

  // Initialize or restore active project
  const [project, setProject] = useState<SimulationProject>(() => {
    const cached = loadCurrentLocalProject();
    if (cached) return cached;
    return createSimulationProject(
      'Sherwin-Williams Paint Canning Line',
      SHERWIN_WILLIAMS_PAINT_LINE,
      {
        description: 'Industrial paint blending, filling, labeling, and palletizing line',
        isGuest: true
      }
    );
  });

  // Check if first-time guest visit
  useEffect(() => {
    const hasSeenNotice = localStorage.getItem('pf_guest_notice_acknowledged');
    if (!hasSeenNotice && project.isGuestProject) {
      setIsGuestModalOpen(true);
      localStorage.setItem('pf_guest_notice_acknowledged', 'true');
    }
  }, [project.isGuestProject]);

  // Persist project changes to local browser cache
  useEffect(() => {
    saveLocalProject(project);
  }, [project]);

  const handleSelectTemplate = useCallback((key: string) => {
    setTemplateKey(key);
  }, []);

  const handleSaveLocal = useCallback((name: string, description: string) => {
    setProject((prev) => {
      const updated: SimulationProject = {
        ...prev,
        name,
        description,
        updatedAt: new Date().toISOString()
      };
      saveLocalProject(updated);
      return updated;
    });
  }, []);

  const handleDownloadFile = useCallback((name: string, description: string) => {
    const updated: SimulationProject = {
      ...project,
      name,
      description,
      updatedAt: new Date().toISOString()
    };
    setProject(updated);
    saveLocalProject(updated);
    downloadProjectFile(updated);
  }, [project]);

  const handleImportFile = useCallback(async (file: File) => {
    try {
      const imported = await readProjectFromFile(file);
      setProject(imported);
      saveLocalProject(imported);
      alert(`Successfully loaded project: "${imported.name}" with ${imported.graph.nodes.length} machines.`);
    } catch (err: any) {
      alert(`Error loading project file: ${err?.message || String(err)}`);
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Top Application Navigation */}
      <HeaderBar
        currentTemplate={templateKey}
        isGuestMode={project.isGuestProject}
        activeAiProvider={aiConfig.provider}
        onSelectTemplate={handleSelectTemplate}
        onOpenMcpModal={() => setIsMcpModalOpen(true)}
        onOpenAiModal={() => setIsAiModalOpen(true)}
        onOpenForgeHub={() => {}}
        onOpenSaveModal={() => setIsSaveModalOpen(true)}
        onOpenGuestModal={() => setIsGuestModalOpen(true)}
        onImportFile={handleImportFile}
      />

      {/* Desktop In-App Auto Update Banner */}
      <UpdateNotificationBanner />

      {/* Main Interactive Studio Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ProcessCanvas />
      </div>

      {/* Modals */}
      <McpModal isOpen={isMcpModalOpen} onClose={() => setIsMcpModalOpen(false)} />

      <AiModelModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onConfigChanged={(cfg) => setAiConfig(cfg)}
      />

      <GuestAcknowledgementModal
        isOpen={isGuestModalOpen}
        onClose={() => setIsGuestModalOpen(false)}
        onExportFile={() => downloadProjectFile(project)}
      />

      <SaveProjectModal
        isOpen={isSaveModalOpen}
        project={project}
        onClose={() => setIsSaveModalOpen(false)}
        onSaveLocal={handleSaveLocal}
        onDownloadFile={handleDownloadFile}
      />
    </div>
  );
};

export default App;
