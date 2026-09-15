import React, { useState, useCallback, useEffect } from 'react';
import {
  ProcessCanvas,
  SHERWIN_WILLIAMS_PAINT_LINE,
  BEVERAGE_BOTTLING_LINE,
  BLANK_LINE,
  AiModelModal,
  CommunityUnitOpLibraryModal,
  getAiConfig,
  type AiModelConfig,
  ThemeProvider
} from '@process-forge/canvas-ui';
import {
  createSimulationProject,
  type SimulationProject,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { HeaderBar } from './components/HeaderBar.js';
import { GuestAcknowledgementModal } from './components/GuestAcknowledgementModal.js';
import { SaveProjectModal } from './components/SaveProjectModal.js';
import { UpdateNotificationBanner } from './components/UpdateNotificationBanner.js';
import { useAppUpdater } from './hooks/useAppUpdater.js';
import {
  saveLocalProject,
  loadCurrentLocalProject,
  downloadProjectFile,
  readProjectFromFile
} from './storage/localStorageAdapter.js';

export const App: React.FC = () => {
  const updater = useAppUpdater();
  const [templateKey, setTemplateKey] = useState<string>('sherwin-williams-paint-line');
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiConfig, setAiConfig] = useState<AiModelConfig>(() => getAiConfig());
  const [isGuestModalOpen, setIsGuestModalOpen] = useState<boolean>(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [isCommunityLibraryOpen, setIsCommunityLibraryOpen] = useState<boolean>(false);

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

  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 960;
  });

  // Hotkey support: Alt+D or Ctrl+B toggles the Software Engineer dock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey && (e.key === 'd' || e.key === 'D')) || (e.ctrlKey && (e.key === 'b' || e.key === 'B'))) {
        e.preventDefault();
        setIsDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectTemplate = useCallback((key: string) => {
    setTemplateKey(key);
    let targetGraph = SHERWIN_WILLIAMS_PAINT_LINE;
    let targetName = 'Sherwin-Williams Paint Canning Line';
    let targetDesc = 'Industrial paint blending, filling, labeling, and palletizing line';
    if (key === 'beverage-bottling-line') {
      targetGraph = BEVERAGE_BOTTLING_LINE;
      targetName = 'High-Speed Beverage Bottling Line';
      targetDesc = 'High-speed carbonated beverage bottling and packaging line';
    } else if (key === 'blank') {
      targetGraph = BLANK_LINE;
      targetName = 'Custom Process Flow';
      targetDesc = 'Custom industrial process line';
    }
    const updated = createSimulationProject(targetName, targetGraph, {
      description: targetDesc,
      isGuest: project.isGuestProject
    });
    setProject(updated);
    saveLocalProject(updated);
  }, [project.isGuestProject]);

  const handleGraphChange = useCallback((updatedGraph: ProcessGraph) => {
    setProject((prev) => {
      const updated: SimulationProject = {
        ...prev,
        graph: updatedGraph,
        updatedAt: new Date().toISOString()
      };
      saveLocalProject(updated);
      return updated;
    });
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

  const handleInsertCommunityNode = useCallback((newNode: ProcessNode) => {
    setProject((prev) => {
      const updated: SimulationProject = {
        ...prev,
        graph: {
          ...prev.graph,
          nodes: [...prev.graph.nodes, newNode]
        },
        updatedAt: new Date().toISOString()
      };
      saveLocalProject(updated);
      return updated;
    });
  }, []);

  return (
    <ThemeProvider>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', maxWidth: '100vw', maxHeight: '100vh', overflow: 'hidden' }}>
        {/* Top Application Navigation */}
      <HeaderBar
        currentTemplate={templateKey}
        isGuestMode={project.isGuestProject}
        activeAiProvider={aiConfig.provider}
        onSelectTemplate={handleSelectTemplate}
        onOpenAiModal={() => setIsAiModalOpen(true)}
        onOpenForgeHub={() => setIsCommunityLibraryOpen(true)}
        onOpenSaveModal={() => setIsSaveModalOpen(true)}
        onOpenGuestModal={() => setIsGuestModalOpen(true)}
        onImportFile={handleImportFile}
        isDockCollapsed={isDockCollapsed}
        onToggleDockCollapse={() => setIsDockCollapsed((prev) => !prev)}
        onCheckForUpdates={() => updater.checkForUpdates(true)}
        isCheckingUpdates={updater.isChecking}
        hasUpdateAvailable={updater.hasUpdate}
      />

      {/* Desktop & Web In-App Auto Update Banner */}
      <UpdateNotificationBanner
        status={updater.status}
        updateInfo={updater.updateInfo}
        statusMessage={updater.statusMessage}
        onDismiss={updater.dismissNotification}
        onCheckForUpdates={() => updater.checkForUpdates(true)}
        onRestartAndApply={updater.restartAndApplyUpdate}
        onHardReload={updater.hardReloadApp}
      />

      {/* Main Interactive Studio Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <ProcessCanvas
          graph={project.graph}
          onGraphChange={handleGraphChange}
          isDockCollapsed={isDockCollapsed}
          onToggleDockCollapse={() => setIsDockCollapsed((prev) => !prev)}
        />
      </div>

      {/* Modals */}
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

        <CommunityUnitOpLibraryModal
          isOpen={isCommunityLibraryOpen}
          onClose={() => setIsCommunityLibraryOpen(false)}
          onInsertNode={handleInsertCommunityNode}
        />
      </div>
    </ThemeProvider>
  );
};

export default App;
