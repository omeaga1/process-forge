import React, { useState, useCallback } from 'react';
import { ProcessCanvas, SHERWIN_WILLIAMS_PAINT_LINE } from '@process-forge/canvas-ui';
import type { ProcessGraph } from '@process-forge/protocol';
import { HeaderBar } from './components/HeaderBar.js';
import { McpModal } from './components/McpModal.js';

export const App: React.FC = () => {
  const [templateKey, setTemplateKey] = useState<string>('sherwin-williams-paint-line');
  const [isMcpModalOpen, setIsMcpModalOpen] = useState<boolean>(false);

  const handleSelectTemplate = useCallback((key: string) => {
    setTemplateKey(key);
  }, []);

  const handleExportGraph = useCallback(() => {
    const graphData: ProcessGraph = SHERWIN_WILLIAMS_PAINT_LINE;
    const blob = new Blob([JSON.stringify(graphData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${graphData.id || 'process-twin'}.pfg.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Top Application Navigation */}
      <HeaderBar
        currentTemplate={templateKey}
        onSelectTemplate={handleSelectTemplate}
        onOpenMcpModal={() => setIsMcpModalOpen(true)}
        onOpenForgeHub={() => {
          // ProcessCanvas has the in-canvas ForgeHub button, or this can trigger canvas modal
        }}
        onExportGraph={handleExportGraph}
      />

      {/* Main Interactive Studio Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ProcessCanvas />
      </div>

      {/* Model Context Protocol Integration Modal */}
      <McpModal isOpen={isMcpModalOpen} onClose={() => setIsMcpModalOpen(false)} />
    </div>
  );
};

export default App;
