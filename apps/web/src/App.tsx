import React, { useState, useCallback, useEffect } from 'react';
import {
  ProcessCanvas,
  SHERWIN_WILLIAMS_PAINT_LINE,
  BEVERAGE_BOTTLING_LINE,
  BLANK_LINE,
  AiModelModal,
  CommunityUnitOpLibraryModal,
  UnitOpCreator,
  getAiConfig,
  loadLlmCredentials,
  hasValidCredentials,
  authorUnitOpContract,
  useAssistantRoute,
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
import { StudioEntryGateModal } from './components/StudioEntryGateModal.js';
import { initialViewMode, homeViewMode, isDesktopRuntime } from './runtime/desktop.js';
import { contractToProcessNode } from './unitop/contractToNode.js';
import { SaveProjectModal } from './components/SaveProjectModal.js';
import { UpdateNotificationBanner } from './components/UpdateNotificationBanner.js';
import { AccountModal } from './components/AccountModal.js';
import { CloudProjectsModal } from './components/CloudProjectsModal.js';
import { StudioErrorBoundary } from './components/StudioErrorBoundary.js';
import { LandingPageHub } from './components/LandingPageHub.js';
import { ProductLandingPage } from './components/ProductLandingPage.js';
import { AccountProvider, useAccount } from './auth/useAccount.js';
import { saveProjectToCloud } from './storage/cloudStorageAdapter.js';
import { useAppUpdater } from './hooks/useAppUpdater.js';
import { useMcpBridge } from './hooks/useMcpBridge.js';
import { McpArrivalNotice } from './components/McpArrivalNotice.js';
import {
  saveLocalProject,
  loadCurrentLocalProject,
  downloadProjectFile,
  readProjectFromFile
} from './storage/localStorageAdapter.js';

function inferTemplateKeyFromProject(proj: SimulationProject): string {
  if (!proj || !proj.graph) return 'blank';
  const name = (proj.name || '').toLowerCase();
  const graphId = (proj.graph.id || '').toLowerCase();
  if (graphId === 'beverage-bottling-line' || name.includes('beverage')) {
    return 'beverage-bottling-line';
  }
  if (graphId === 'blank' || proj.graph.nodes.length === 0 || name.includes('custom')) {
    return 'blank';
  }
  if (graphId === 'sherwin-williams-paint-line' || name.includes('paint') || name.includes('sherwin')) {
    return 'sherwin-williams-paint-line';
  }
  return 'blank';
}

const AppInner: React.FC = () => {
  const updater = useAppUpdater();
  const assistantRoute = useAssistantRoute();
  const { isAccountModalOpen, openAccountModal, closeAccountModal, isAuthenticated } = useAccount();
  const [isEntryGateOpen, setIsEntryGateOpen] = useState<boolean>(false);
  const [isCloudProjectsModalOpen, setIsCloudProjectsModalOpen] = useState<boolean>(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiConfig, setAiConfig] = useState<AiModelConfig>(() => getAiConfig());
  const [isGuestModalOpen, setIsGuestModalOpen] = useState<boolean>(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [isCommunityLibraryOpen, setIsCommunityLibraryOpen] = useState<boolean>(false);
  const [isUnitOpCreatorOpen, setIsUnitOpCreatorOpen] = useState<boolean>(false);
  // App navigation state:
  // - 'landing': Clean Product Showcase Landing Page (what is ProcessForge, animated PFD tutorial, download .exe)
  // - 'portal': Engineering Project Portal & Hub (cloud projects, orchestrator, templates, quotas)
  // - 'studio': Interactive Flowsheet Canvas Studio (ReactFlow, equipment palette, live simulation)
  // Desktop opens on the portal; only the web build has a landing page.
  // See runtime/desktop.ts for why these are different products.
  const [viewMode, setViewMode] = useState<'landing' | 'portal' | 'studio'>(initialViewMode);

  // Initialize or restore active project
  const [project, setProject] = useState<SimulationProject>(() => {
    const cached = loadCurrentLocalProject();
    if (cached) return cached;
    return createSimulationProject(
      'Custom Process Forge',
      BLANK_LINE,
      {
        description: 'Clean slate industrial process flowsheet',
        isGuest: true
      }
    );
  });

  const [templateKey, setTemplateKey] = useState<string>(() => inferTemplateKeyFromProject(project));



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
    let targetName = 'Architectural Paint Canning Line';
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

  const handleSaveCloud = useCallback(async (name: string, description: string) => {
    const updated: SimulationProject = {
      ...project,
      name,
      description,
      isGuestProject: false,
      updatedAt: new Date().toISOString()
    };
    setProject(updated);
    saveLocalProject(updated);
    const result = await saveProjectToCloud(updated);
    return { synced: result.synced, message: result.message };
  }, [project]);

  const handleSelectCloudProject = useCallback((loaded: SimulationProject) => {
    setProject(loaded);
    setTemplateKey(inferTemplateKeyFromProject(loaded));
    saveLocalProject(loaded);
    setIsCloudProjectsModalOpen(false);
  }, []);

  const handleUploadLocalFile = useCallback(async (file: File) => {
    try {
      const imported = await readProjectFromFile(file);
      setProject(imported);
      setTemplateKey(inferTemplateKeyFromProject(imported));
      saveLocalProject(imported);
      // An import stays on this device; uploading is a separate, explicit Save to Cloud.
      setIsCloudProjectsModalOpen(false);
      alert(`Imported "${imported.name}" on this device.`);
    } catch (err: any) {
      alert(`Error importing file: ${err?.message || String(err)}`);
    }
  }, []);

  const handleImportFile = useCallback(async (file: File) => {
    try {
      const imported = await readProjectFromFile(file);
      setProject(imported);
      setTemplateKey(inferTemplateKeyFromProject(imported));
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

  // Desktop: unit ops sent by an MCP client on this computer land here.
  const mcpBridge = useMcpBridge(project.name, project.graph, handleInsertCommunityNode);

  /**
   * A contract that passed every gate becomes a node on the flowsheet. The
   * engine re-evaluates it at construction, so an accepted design is checked
   * once more before it can affect a simulation.
   */
  // Claude designs the unit op from inside the app, on the engineer's own API
  // key. Anthropic does not allow third-party apps to use a Claude
  // subscription, so a key is the permitted route; MCP remains the way to use
  // a subscription from Claude Desktop.
  const handleProposeUnitOp = useCallback(async (description: string, onProgress?: (note: string) => void) => {
    const creds = await loadLlmCredentials();
    // Any provider the app can call: a key for Claude, GPT or Gemini, or a
    // local Ollama model. The engine judges the result either way.
    if (!hasValidCredentials(creds)) {
      throw new Error(
        'Add an API key in AI settings (Claude, GPT or Gemini), or connect a local Ollama model, to have AI design this. Or paste a contract below.'
      );
    }
    const providerName = { claude: 'Claude', openai: 'GPT', gemini: 'Gemini', ollama: 'your local model', openrouter: 'your OpenRouter model' }[creds.provider] ?? creds.provider;
    onProgress?.(`Asking ${providerName} to write the contract…`);
    const result = await authorUnitOpContract(description, {
      creds,
      onRound: (r) =>
        onProgress?.(
          r.verdict === 'ACCEPTED'
            ? `Round ${r.round}: the engine accepted it.`
            : r.verdict === 'NOT_JSON'
              ? `Round ${r.round}: the reply was not a contract; asking again.`
              : `Round ${r.round}: the engine rejected it (${r.feedback.split('\n')[0]}); sending the reasons back.`
        )
    });
    if (!result.accepted) {
      onProgress?.('Out of rounds. The last draft is below, with exactly what still fails.');
    }
    return typeof result.draft === 'string' ? result.draft : JSON.stringify(result.draft, null, 2);
  }, []);

  const handleAcceptUnitOpContract = useCallback(
    (contract: Parameters<typeof contractToProcessNode>[0]) => {
      handleInsertCommunityNode(contractToProcessNode(contract));
      setIsUnitOpCreatorOpen(false);
    },
    [handleInsertCommunityNode]
  );

  const handleCreateBlank = useCallback(() => {
    const blank = createSimulationProject('Custom Process Forge', BLANK_LINE, {
      description: 'Clean slate industrial process flowsheet',
      isGuest: project.isGuestProject
    });
    setTemplateKey('blank');
    setProject(blank);
    saveLocalProject(blank);
    setViewMode('studio');
  }, [project.isGuestProject]);

  const handleSelectTemplateAndLaunch = useCallback((key: string) => {
    handleSelectTemplate(key);
    setViewMode('studio');
  }, [handleSelectTemplate]);

  const handleSelectCloudProjectAndLaunch = useCallback((loaded: SimulationProject) => {
    handleSelectCloudProject(loaded);
    setViewMode('studio');
  }, [handleSelectCloudProject]);

  const handleImportFileAndLaunch = useCallback(async (file: File) => {
    await handleImportFile(file);
    setViewMode('studio');
  }, [handleImportFile]);

  const handleEnterStudioWithBlankCanvas = useCallback((asGuest: boolean = false) => {
    const blank = createSimulationProject('Custom Process Flow', BLANK_LINE, {
      description: 'Clean slate industrial process flowsheet',
      isGuest: asGuest
    });
    setTemplateKey('blank');
    setProject(blank);
    saveLocalProject(blank);
    setViewMode('studio');
  }, []);

  // Opens the studio on the project already in progress, never a blank canvas
  // saved over it.
  const handleOpenStudio = useCallback(() => {
    setViewMode('studio');
  }, []);

  const handleNavigateHome = useCallback(() => {
    saveLocalProject(project);
    setViewMode(homeViewMode());
  }, [project]);

  const handleOpenPortal = useCallback(() => {
    saveLocalProject(project);
    setViewMode('portal');
  }, [project]);

  const handleLaunchStudioFromLanding = useCallback(() => {
    if (isAuthenticated) {
      handleEnterStudioWithBlankCanvas(false);
    } else {
      setIsEntryGateOpen(true);
    }
  }, [isAuthenticated, handleEnterStudioWithBlankCanvas]);

  // A guest carries on with whatever is on this device; a first visit already
  // has a blank project. Starting a fresh blank here discarded a returning
  // guest's work.
  const handleContinueGuest = useCallback(() => {
    setViewMode('studio');
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', maxWidth: '100vw', maxHeight: '100vh', overflow: viewMode === 'landing' ? 'auto' : 'hidden', position: 'relative' }}>
      {viewMode === 'landing' && !isDesktopRuntime() ? (
        <ProductLandingPage
          onLaunchStudio={handleLaunchStudioFromLanding}
        />
      ) : viewMode === 'portal' || viewMode === 'landing' ? (
        <LandingPageHub
          currentProject={project}
          {...(isDesktopRuntime() ? {} : { onNavigateLanding: handleNavigateHome })}
          onCreateBlank={handleCreateBlank}
          onSelectTemplate={handleSelectTemplateAndLaunch}
          onOpenProject={handleSelectCloudProjectAndLaunch}
          onImportFile={handleImportFileAndLaunch}
          onOpenStudio={handleOpenStudio}
          onOpenForgeHub={() => setIsCommunityLibraryOpen(true)}
          onOpenAiModal={() => setIsAiModalOpen(true)}
          onOpenAccountModal={openAccountModal}
          onOpenCloudProjectsModal={() => setIsCloudProjectsModalOpen(true)}
        />
      ) : (
        <>
          {/* Top Application Navigation */}
          <HeaderBar
            currentTemplate={templateKey}
            // "Guest" means not signed in now, not "this project was started signed out".
            isGuestMode={!isAuthenticated}
            activeAiProvider={aiConfig.provider}
            onNavigateHome={handleOpenPortal}
            onSelectTemplate={handleSelectTemplate}
            onOpenAiModal={() => setIsAiModalOpen(true)}
            onOpenForgeHub={() => setIsCommunityLibraryOpen(true)}
            onOpenUnitOpCreator={() => setIsUnitOpCreatorOpen(true)}
            onOpenSaveModal={() => setIsSaveModalOpen(true)}
            onOpenGuestModal={() => setIsGuestModalOpen(true)}
            onImportFile={handleImportFile}
            onOpenAccountModal={openAccountModal}
            onOpenCloudProjects={() => setIsCloudProjectsModalOpen(true)}
            onCheckForUpdates={() => updater.checkForUpdates(true)}
            isCheckingUpdates={updater.isChecking}
            hasUpdateAvailable={updater.hasUpdate}
          />

          {/* Main Interactive Studio Canvas */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
            <ProcessCanvas
              graph={project.graph}
              onGraphChange={handleGraphChange}
              onDesignUnitOp={() => setIsUnitOpCreatorOpen(true)}
              isDockCollapsed={isDockCollapsed}
              onToggleDockCollapse={() => setIsDockCollapsed((prev) => !prev)}
            />
          </div>
        </>
      )}

      {/* Update banner, on every screen (the desktop app opens on the portal,
          not the studio). It hides itself outside the desktop app. */}
      <UpdateNotificationBanner
        status={updater.status}
        updateInfo={updater.updateInfo}
        statusMessage={updater.statusMessage}
        onDismiss={updater.dismissNotification}
        onCheckForUpdates={() => updater.checkForUpdates(true)}
        onRestartAndApply={updater.restartAndApplyUpdate}
        onHardReload={updater.hardReloadApp}
      />

      <McpArrivalNotice arrival={mcpBridge.lastArrival} onDismiss={mcpBridge.dismiss} />


      {/* Modals */}
      <AiModelModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onConfigChanged={(cfg) => setAiConfig(cfg)}
      />

      <StudioEntryGateModal
        isOpen={isEntryGateOpen}
        onClose={() => setIsEntryGateOpen(false)}
        onOpenAccountModal={() => {
          setIsEntryGateOpen(false);
          openAccountModal();
        }}
        onContinueGuest={handleContinueGuest}
      />

      <GuestAcknowledgementModal
        isOpen={isGuestModalOpen}
        onClose={() => setIsGuestModalOpen(false)}
        onExportFile={() => downloadProjectFile(project)}
        onOpenAccountModal={openAccountModal}
      />

      <SaveProjectModal
        isOpen={isSaveModalOpen}
        project={project}
        onClose={() => setIsSaveModalOpen(false)}
        onSaveLocal={handleSaveLocal}
        onDownloadFile={handleDownloadFile}
        onSaveCloud={handleSaveCloud}
      />

      {isUnitOpCreatorOpen && (
        <div
          role="dialog"
          aria-label="Unit Operation Creator"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsUnitOpCreatorOpen(false);
          }}
        >
          <div
            style={{
              width: 'min(760px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '10px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
            }}
          >
            <UnitOpCreator
              route={assistantRoute}
              onChooseAssistant={() => setIsAiModalOpen(true)}
              onPropose={handleProposeUnitOp}
              onAccept={handleAcceptUnitOpContract}
              onClose={() => setIsUnitOpCreatorOpen(false)}
            />
          </div>
        </div>
      )}

      <CommunityUnitOpLibraryModal
        isOpen={isCommunityLibraryOpen}
        onClose={() => setIsCommunityLibraryOpen(false)}
        onInsertNode={handleInsertCommunityNode}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={closeAccountModal}
        onOpenCloudProjects={() => {
          closeAccountModal();
          setIsCloudProjectsModalOpen(true);
        }}
      />

      <CloudProjectsModal
        isOpen={isCloudProjectsModalOpen}
        onClose={() => setIsCloudProjectsModalOpen(false)}
        onSelectProject={handleSelectCloudProjectAndLaunch}
        onUploadLocalFile={async (file) => {
          await handleUploadLocalFile(file);
          setViewMode('studio');
        }}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AccountProvider>
        <StudioErrorBoundary>
          <AppInner />
        </StudioErrorBoundary>
      </AccountProvider>
    </ThemeProvider>
  );
};

export default App;
