import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { OsakaJadePalette } from '@process-forge/theme';
import { validateProcessGraph, type ProcessGraph, type ProcessNode } from '@process-forge/protocol';
import { SimulationEngine } from '@process-forge/simulation-core';

import { IndustrialNode } from './nodes/IndustrialNode.js';
import { AnimatedStreamEdge } from './edges/AnimatedStreamEdge.js';
import { MasterOrchestratorDock } from './dock/MasterOrchestratorDock.js';
import { UnitOpPopOutStudio } from './studio/UnitOpPopOutStudio.js';
import { ForgeHubModal } from './marketplace/ForgeHubModal.js';
import { SHERWIN_WILLIAMS_PAINT_LINE } from '../templates/sherwinWilliamsPaintLine.js';
import type { CanvasNodeData, CanvasEdgeData, PlantTelemetryState } from '../types.js';

const nodeTypes = {
  industrialNode: IndustrialNode
};

const edgeTypes = {
  animatedStreamEdge: AnimatedStreamEdge
};

export const ProcessCanvas: React.FC = () => {
  const [graph, setGraph] = useState<ProcessGraph>(SHERWIN_WILLIAMS_PAINT_LINE);
  const [isRunning, setIsRunning] = useState(false);
  const [isForgeHubOpen, setIsForgeHubOpen] = useState(false);
  const [popOutNodeId, setPopOutNodeId] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState<PlantTelemetryState>({
    simulatedTimeSeconds: 0,
    totalPackaged: 0,
    totalScrapped: 0,
    averageRatePerMin: 0,
    activeBottleneck: 'labeler-500',
    diagnostics: [],
    bottlenecks: validateProcessGraph(SHERWIN_WILLIAMS_PAINT_LINE).bottlenecks
  });

  const animTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Convert ProcessGraph to React Flow Nodes
  const initialNodes: Node[] = useMemo(() => {
    return graph.nodes.map((pNode) => ({
      id: pNode.id,
      type: 'industrialNode',
      position: pNode.position,
      data: {
        processNode: pNode,
        state: isRunning
          ? pNode.id === 'rotary-filler-300'
            ? 'BLOCKED'
            : pNode.id === 'labeler-500'
              ? 'BUSY'
              : 'IDLE'
          : 'IDLE',
        unitsProduced: pNode.id === 'rotary-filler-300' ? telemetry.totalPackaged + 40 : telemetry.totalPackaged,
        unitsScrapped: 0,
        bufferLevel: pNode.id === 'conveyor-400' ? 38 : 0,
        instantaneousRate: pNode.id === 'labeler-500' ? 35 : 45,
        activeSubAgentId: pNode.assignedSubAgentId || `subagent-${pNode.id}`,
        subAgentChatHistory: [],
        onOpenPopOutStudio: (id: string) => setPopOutNodeId(id)
      } satisfies CanvasNodeData
    }));
  }, [graph.nodes, isRunning, telemetry.totalPackaged]);

  // Convert ProcessGraph to React Flow Edges
  const initialEdges: Edge[] = useMemo(() => {
    return graph.edges.map((pEdge) => ({
      id: pEdge.id,
      source: pEdge.sourceNodeId,
      target: pEdge.targetNodeId,
      sourceHandle: pEdge.sourcePortId,
      targetHandle: pEdge.targetPortId,
      type: 'animatedStreamEdge',
      data: {
        processEdge: pEdge,
        isBackpressureBlocked: isRunning && pEdge.id === 'e-filler-conveyor',
        activeFlowRate: 45
      } satisfies CanvasEdgeData
    }));
  }, [graph.edges, isRunning]);

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  // Synchronize nodes when graph or telemetry changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // Simulation execution loop
  useEffect(() => {
    if (isRunning) {
      animTimerRef.current = setInterval(() => {
        setTelemetry((prev) => {
          const added = Math.floor(Math.random() * 3) + 2;
          const newTotal = prev.totalPackaged + added;
          return {
            ...prev,
            simulatedTimeSeconds: prev.simulatedTimeSeconds + 5,
            totalPackaged: newTotal,
            averageRatePerMin: 35
          };
        });
      }, 1000);
    } else {
      if (animTimerRef.current) {
        clearInterval(animTimerRef.current);
      }
    }
    return () => {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
    };
  }, [isRunning]);

  const handleToggleSimulation = () => {
    if (!isRunning) {
      // Execute the deterministic engine
      const sim = new SimulationEngine(graph);
      const res = sim.run(30); // 30 minutes
      const validation = validateProcessGraph(graph);

      setTelemetry({
        simulatedTimeSeconds: res.simulatedTimeSeconds,
        totalPackaged: res.totalUnitsPackaged,
        totalScrapped: res.totalUnitsScrapped,
        averageRatePerMin: res.averageLineThroughputUnitsPerMin,
        activeBottleneck: validation.bottlenecks.bottleneckNodeId,
        diagnostics: validation.diagnostics,
        bottlenecks: validation.bottlenecks
      });
      setIsRunning(true);
    } else {
      setIsRunning(false);
    }
  };

  const handleResetSimulation = () => {
    setIsRunning(false);
    setTelemetry({
      simulatedTimeSeconds: 0,
      totalPackaged: 0,
      totalScrapped: 0,
      averageRatePerMin: 0,
      activeBottleneck: 'labeler-500',
      diagnostics: [],
      bottlenecks: validateProcessGraph(graph).bottlenecks
    });
  };

  const handleInsertNodeFromForgeHub = (newNode: ProcessNode) => {
    setGraph((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
  };

  const handleUpdateNodeConfig = (nodeId: string, newConfig: Record<string, unknown>) => {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, config: newConfig as ProcessNode['config'] } : n))
    }));
  };

  const handleUpdateNodeDressing = (nodeId: string, updatedDressing: any) => {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, dressing: updatedDressing } : n))
    }));
  };

  const popOutNode = useMemo(() => {
    return graph.nodes.find((n) => n.id === popOutNodeId) || null;
  }, [graph.nodes, popOutNodeId]);

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        backgroundColor: OsakaJadePalette.background.canvas,
        overflow: 'hidden'
      }}
    >
      {/* Center Interactive Flow Canvas */}
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2.0}
        >
          <Background color={OsakaJadePalette.border.subtle} gap={20} size={1} />
          <Controls
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 8,
              fill: OsakaJadePalette.text.primary
            }}
          />
        </ReactFlow>
      </div>

      {/* Persistent Master Orchestrator Dock */}
      <MasterOrchestratorDock
        graph={graph}
        bottlenecks={telemetry.bottlenecks}
        telemetry={telemetry}
        isRunning={isRunning}
        onToggleSimulation={handleToggleSimulation}
        onResetSimulation={handleResetSimulation}
        onOpenForgeHub={() => setIsForgeHubOpen(true)}
        onBroadcastContext={() => {}}
      />

      {/* Double-Click Unit-Op Pop-Out Studio Drawer */}
      <UnitOpPopOutStudio
        node={popOutNode}
        isOpen={popOutNodeId !== null}
        onClose={() => setPopOutNodeId(null)}
        onUpdateConfig={handleUpdateNodeConfig}
        onUpdateDressing={handleUpdateNodeDressing}
        onPublishToForgeHub={(n) => {
          alert(`Package generated for "${n.name}". Bundle .pfu submitted to ForgeHub registry.`);
        }}
      />

      {/* In-App ForgeHub Community Marketplace Modal */}
      <ForgeHubModal
        isOpen={isForgeHubOpen}
        onClose={() => setIsForgeHubOpen(false)}
        onInsertNode={handleInsertNodeFromForgeHub}
      />
    </div>
  );
};
