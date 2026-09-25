import React, { useState, useCallback, useEffect } from 'react';
import {
  ProcessCanvas,
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
  type ProcessNode,
  type ProcessEdge
} from '@process-forge/protocol';
import { HeaderBar } from './components/HeaderBar.js';
import { GuestAcknowledgementModal } from './components/GuestAcknowledgementModal.js';
import { StudioEntryGateModal } from './components/StudioEntryGateModal.js';
import { initialViewMode, homeViewMode, isDesktopRuntime } from './runtime/desktop.js';
import { contractToProcessNode } from './unitop/contractToNode.js';
import { saveUnitOp } from '@process-forge/canvas-ui';
import { SaveProjectModal } from './components/SaveProjectModal.js';
import { UpdateNotificationBanner } from './components/UpdateNotificationBanner.js';
import { AccountModal } from './components/AccountModal.js';
import { ProjectBrowser, useProjectBrowserShortcut } from './components/ProjectBrowser.js';
import { findTemplate, uniqueName } from './projects/templates.js';
import { StudioErrorBoundary } from './components/StudioErrorBoundary.js';
import { LandingPageHub } from './components/LandingPageHub.js';
import { ProductLandingPage } from './components/ProductLandingPage.js';
import { AccountProvider, useAccount } from './auth/useAccount.js';
import { saveProjectToCloud } from './storage/cloudStorageAdapter.js';
import { hasCloudSession } from './auth/accountManager.js';
import type { CloudSaveStatus } from './components/HeaderBar.js';
import { useAppUpdater } from './hooks/useAppUpdater.js';
import { useMcpBridge } from './hooks/useMcpBridge.js';
import { McpArrivalNotice } from './components/McpArrivalNotice.js';
import {
  saveLocalProject,
  loadCurrentLocalProject,
  downloadProjectFile,
  readProjectFromFile,
  listLocalProjects
} from './storage/localStorageAdapter.js';

const AppInner: React.FC = () => {
  const updater = useAppUpdater();
  const assistantRoute = useAssistantRoute();
  const { isAccountModalOpen, accountModalTab, openAccountModal, closeAccountModal, isAuthenticated, user } = useAccount();
  const [isEntryGateOpen, setIsEntryGateOpen] = useState<boolean>(false);
  const [isProjectBrowserOpen, setIsProjectBrowserOpen] = useState<boolean>(false);
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

  /**
   * A new project, blank or from a template. The one that was open is already
   * saved on this device (every edit is), so nothing is lost.
   */
  const handleNewProject = useCallback((key: string) => {
    const template = findTemplate(key);
    const taken = listLocalProjects().map((p) => p.name);
    const created = createSimulationProject(
      uniqueName(key === 'blank' ? 'Untitled flowsheet' : template.name, taken),
      structuredClone(template.graph),
      { description: key === 'blank' ? '' : template.description, isGuest: !isAuthenticated }
    );
    setProject(created);
    saveLocalProject(created);
    setIsProjectBrowserOpen(false);
    setViewMode('studio');
  }, [isAuthenticated]);

  const handleOpenProject = useCallback((loaded: SimulationProject) => {
    setProject(loaded);
    saveLocalProject(loaded);
    setIsProjectBrowserOpen(false);
    setViewMode('studio');
  }, []);

  const handleRenameCurrent = useCallback((name: string) => {
    setProject((prev) => ({ ...prev, name, updatedAt: new Date().toISOString() }));
  }, []);

  // The first time the studio opens with no AI set up, ask once how to use
  // it, rather than leaving people to find the AI model button.
  const [isAiFirstRun, setIsAiFirstRun] = useState(false);
  useEffect(() => {
    if (viewMode !== 'studio' || assistantRoute !== 'none') return;
    try {
      if (localStorage.getItem('pf_ai_setup_asked')) return;
      localStorage.setItem('pf_ai_setup_asked', new Date().toISOString());
    } catch {
      return;
    }
    setIsAiFirstRun(true);
    setIsAiModalOpen(true);
  }, [viewMode, assistantRoute]);

  const openProjectBrowser = useCallback(() => setIsProjectBrowserOpen(true), []);
  useProjectBrowserShortcut(openProjectBrowser, viewMode === 'studio');

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
    if (result.synced) {
      setCloudSaved({ projectId: updated.id, graph: updated.graph, at: Date.now() });
      setCloudSaveState({ saving: false });
    }
    return { synced: result.synced, message: result.message };
  }, [project]);

  // What the cloud holds: the graph last uploaded, so the header can say
  // whether there are changes since.
  const [cloudSaved, setCloudSaved] = useState<{ projectId: string; graph: ProcessGraph; at: number } | null>(null);
  const [cloudSaveState, setCloudSaveState] = useState<{ saving: boolean; error?: string }>({ saving: false });

  const handleQuickCloudSave = useCallback(async () => {
    if (!hasCloudSession(user)) {
      // Cloud copies are for Google accounts.
      openAccountModal('google');
      return;
    }
    const snapshot: SimulationProject = { ...project, isGuestProject: false, updatedAt: new Date().toISOString() };
    setCloudSaveState({ saving: true });
    const result = await saveProjectToCloud(snapshot);
    if (result.synced) {
      setCloudSaved({ projectId: snapshot.id, graph: project.graph, at: Date.now() });
      setCloudSaveState({ saving: false });
    } else {
      setCloudSaveState({ saving: false, error: result.message });
    }
  }, [project, user, openAccountModal]);

  const cloudSaveStatus: CloudSaveStatus = !hasCloudSession(user)
    ? { kind: 'signed-out' }
    : cloudSaveState.saving
      ? { kind: 'saving' }
      : cloudSaveState.error
        ? { kind: 'error', message: cloudSaveState.error }
        : cloudSaved && cloudSaved.projectId === project.id && cloudSaved.graph === project.graph
          ? { kind: 'saved', at: cloudSaved.at }
          : { kind: 'unsaved' };

  // Ctrl+S saves to the cloud (the copy on this device saves itself on every edit).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (viewMode === 'studio') void handleQuickCloudSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleQuickCloudSave, viewMode]);

  const handleImportFile = useCallback(async (file: File) => {
    try {
      const imported = await readProjectFromFile(file);
      handleOpenProject(imported);
    } catch (err: any) {
      alert(`That file could not be opened: ${err?.message || String(err)}`);
    }
  }, [handleOpenProject]);

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
  // A stream from an MCP client's add_stream (checked by planStream first).
  const handleInsertEdge = useCallback((edge: ProcessEdge) => {
    setProject((prev) => ({
      ...prev,
      graph: { ...prev.graph, edges: [...prev.graph.edges, edge] },
      updatedAt: new Date().toISOString()
    }));
  }, []);
  const mcpBridge = useMcpBridge(project.name, project.graph, handleInsertCommunityNode, handleInsertEdge);

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
        'Set up AI to have it design this: sign in with OpenRouter under AI model, or ask Claude Desktop over MCP. Or paste a contract below.'
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
      // Kept in My unit ops, so it can be placed again in any project.
      saveUnitOp(contract, 'designed');
      setIsUnitOpCreatorOpen(false);
    },
    [handleInsertCommunityNode]
  );

  const handleEnterStudioWithBlankCanvas = useCallback((asGuest: boolean = false) => {
    const blank = createSimulationProject('Custom Process Flow', BLANK_LINE, {
      description: 'Clean slate industrial process flowsheet',
      isGuest: asGuest
    });
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
          onNewProject={handleNewProject}
          onOpenProject={handleOpenProject}
          onImportFile={handleImportFile}
          onRenameCurrent={handleRenameCurrent}
          onOpenStudio={handleOpenStudio}
          onOpenForgeHub={() => setIsCommunityLibraryOpen(true)}
          onOpenAiModal={() => setIsAiModalOpen(true)}
          onOpenAccountModal={openAccountModal}
        />
      ) : (
        <>
          {/* Top Application Navigation */}
          <HeaderBar
            projectName={project.name}
            onOpenProjects={openProjectBrowser}
            onRenameProject={handleRenameCurrent}
            // "Guest" means not signed in now, not "this project was started signed out".
            isGuestMode={!isAuthenticated}
            activeAiProvider={aiConfig.provider}
            onNavigateHome={handleOpenPortal}
            onOpenAiModal={() => setIsAiModalOpen(true)}
            onOpenForgeHub={() => setIsCommunityLibraryOpen(true)}
            onOpenSaveModal={() => setIsSaveModalOpen(true)}
            cloudSaveStatus={cloudSaveStatus}
            onQuickCloudSave={() => void handleQuickCloudSave()}
            onOpenGuestModal={() => setIsGuestModalOpen(true)}
            onImportFile={handleImportFile}
            onOpenAccountModal={openAccountModal}
            onCheckForUpdates={() => updater.checkForUpdates(true)}
            isCheckingUpdates={updater.isChecking}
            hasUpdateAvailable={updater.hasUpdate}
          />

          {/* Main Interactive Studio Canvas */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
            <ProcessCanvas
              graph={project.graph}
              onGraphChange={handleGraphChange}
              historyKey={project.id}
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
        firstRun={isAiFirstRun}
        onClose={() => {
          setIsAiModalOpen(false);
          setIsAiFirstRun(false);
        }}
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
        initialTab={accountModalTab}
        onClose={closeAccountModal}
        onOpenCloudProjects={() => {
          closeAccountModal();
          setIsProjectBrowserOpen(true);
        }}
      />

      <ProjectBrowser
        variant="modal"
        isOpen={isProjectBrowserOpen}
        onClose={() => setIsProjectBrowserOpen(false)}
        currentProject={project}
        onOpenProject={handleOpenProject}
        onNewProject={handleNewProject}
        onImportFile={(file) => void handleImportFile(file)}
        onRenameCurrent={handleRenameCurrent}
        onSignIn={() => openAccountModal('google')}
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
