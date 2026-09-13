import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Layers } from 'lucide-react';

import { OsakaJadePalette } from '@process-forge/theme';
import { validateProcessGraph, type ProcessGraph, type ProcessNode, type ProcessEdge } from '@process-forge/protocol';
import { SimulationEngine } from '@process-forge/simulation-core';

import { IndustrialNode } from './nodes/IndustrialNode.js';
import { AnimatedStreamEdge } from './edges/AnimatedStreamEdge.js';
import { MasterOrchestratorDock } from './dock/MasterOrchestratorDock.js';
import { UnitOpPopOutStudio } from './studio/UnitOpPopOutStudio.js';
import { ForgeHubModal } from './marketplace/ForgeHubModal.js';
import { MobileFieldView } from './mobile/MobileFieldView.js';
import { useMobileViewport } from '../hooks/useMobileViewport.js';
import { SHERWIN_WILLIAMS_PAINT_LINE } from '../templates/sherwinWilliamsPaintLine.js';
import type { CanvasNodeData, CanvasEdgeData, PlantTelemetryState } from '../types.js';

const nodeTypes = {
  industrialNode: IndustrialNode
};

const edgeTypes = {
  animatedStreamEdge: AnimatedStreamEdge
};

export interface ProcessCanvasProps {
  initialViewMode?: 'field' | 'canvas' | 'auto';
  onViewModeChange?: (mode: 'field' | 'canvas') => void;
  graph?: ProcessGraph;
  onGraphChange?: (updatedGraph: ProcessGraph) => void;
}

export const ProcessCanvas: React.FC<ProcessCanvasProps> = ({
  initialViewMode = 'auto',
  onViewModeChange,
  graph: externalGraph,
  onGraphChange
}) => {
  const { isMobile, viewMode } = useMobileViewport();
  const [userModeOverride, setUserModeOverride] = useState<'field' | 'canvas' | null>(
    initialViewMode !== 'auto' ? initialViewMode : null
  );

  const activeMode = userModeOverride ?? (initialViewMode !== 'auto' ? initialViewMode : viewMode);

  useEffect(() => {
    onViewModeChange?.(activeMode);
  }, [activeMode, onViewModeChange]);

  const [graph, setGraph] = useState<ProcessGraph>(externalGraph || SHERWIN_WILLIAMS_PAINT_LINE);
  const [isRunning, setIsRunning] = useState(false);
  const [isForgeHubOpen, setIsForgeHubOpen] = useState(false);
  const [popOutNodeId, setPopOutNodeId] = useState<string | null>(null);

  // Sync external graph changes (from project import, template switcher, etc.)
  useEffect(() => {
    if (externalGraph) {
      setGraph(externalGraph);
    }
  }, [externalGraph]);

  const [telemetry, setTelemetry] = useState<PlantTelemetryState>(() => ({
    simulatedTimeSeconds: 0,
    totalPackaged: 0,
    totalScrapped: 0,
    averageRatePerMin: 0,
    activeBottleneck: 'labeler-500',
    diagnostics: [],
    bottlenecks: validateProcessGraph(graph).bottlenecks
  }));

  const animTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [nodes, setNodes] = useState<Node[]>(() =>
    graph.nodes.map((pNode) => ({
      id: pNode.id,
      type: 'industrialNode',
      position: pNode.position,
      data: {
        processNode: pNode,
        state: 'IDLE',
        unitsProduced: 0,
        unitsScrapped: 0,
        bufferLevel: pNode.id === 'conveyor-400' ? 38 : 0,
        instantaneousRate: pNode.id === 'labeler-500' ? 35 : 45,
        activeSubAgentId: pNode.assignedSubAgentId || `subagent-${pNode.id}`,
        subAgentChatHistory: [],
        onOpenPopOutStudio: (id: string) => setPopOutNodeId(id)
      } satisfies CanvasNodeData
    }))
  );

  const [edges, setEdges] = useState<Edge[]>(() =>
    graph.edges.map((pEdge) => ({
      id: pEdge.id,
      source: pEdge.sourceNodeId,
      target: pEdge.targetNodeId,
      sourceHandle: pEdge.sourcePortId,
      targetHandle: pEdge.targetPortId,
      type: 'animatedStreamEdge',
      data: {
        processEdge: pEdge,
        isBackpressureBlocked: false,
        activeFlowRate: 45
      } satisfies CanvasEdgeData
    }))
  );

  // When graph structure changes, reconstruct nodes/edges while preserving any user-dragged positions
  useEffect(() => {
    setNodes((existingNodes) =>
      graph.nodes.map((pNode) => {
        const existing = existingNodes.find((n) => n.id === pNode.id);
        const position = existing ? existing.position : pNode.position;
        return {
          id: pNode.id,
          type: 'industrialNode',
          position,
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
        };
      })
    );

    setEdges(
      graph.edges.map((pEdge) => ({
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
      }))
    );
  }, [graph]);

  // When telemetry or isRunning changes, update node/edge data in-place without resetting user coordinates
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const pNode = (n.data as CanvasNodeData).processNode;
        return {
          ...n,
          data: {
            ...n.data,
            state: isRunning
              ? pNode.id === 'rotary-filler-300'
                ? 'BLOCKED'
                : pNode.id === 'labeler-500'
                  ? 'BUSY'
                  : 'IDLE'
              : 'IDLE',
            unitsProduced: pNode.id === 'rotary-filler-300' ? telemetry.totalPackaged + 40 : telemetry.totalPackaged
          }
        };
      })
    );

    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        data: {
          ...e.data,
          isBackpressureBlocked: isRunning && e.id === 'e-filler-conveyor'
        }
      }))
    );
  }, [telemetry.totalPackaged, isRunning]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => {
        const updated = applyNodeChanges(changes, nds);
        const positionChanges = changes.filter((c) => c.type === 'position' && (c as any).position);
        if (positionChanges.length > 0) {
          setGraph((prev) => {
            const nextNodes = prev.nodes.map((pn) => {
              const matched = updated.find((un) => un.id === pn.id);
              return matched ? { ...pn, position: matched.position } : pn;
            });
            const nextGraph = { ...prev, nodes: nextNodes };
            onGraphChange?.(nextGraph);
            return nextGraph;
          });
        }
        return updated;
      });
    },
    [onGraphChange]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const newEdge: ProcessEdge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        sourcePortId: connection.sourceHandle || 'out-1',
        targetPortId: connection.targetHandle || 'in-1',
        stream: {
          type: 'CONTINUOUS_FLUID',
          designFlowRateGpm: 45,
          operatingPressurePsi: 30,
          pipeDiameterInches: 2.0,
          fluid: {
            name: 'Process Fluid',
            densityGPerCm3: 1.0,
            viscosityCentipoise: 1.0,
            temperatureCelsius: 20
          }
        }
      };
      setGraph((prev) => {
        const nextGraph = {
          ...prev,
          edges: [...prev.edges, newEdge]
        };
        onGraphChange?.(nextGraph);
        return nextGraph;
      });
    },
    [onGraphChange]
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
    setGraph((prev) => {
      const nextGraph = {
        ...prev,
        nodes: [...prev.nodes, newNode]
      };
      onGraphChange?.(nextGraph);
      return nextGraph;
    });
  };

  const handleUpdateNodeConfig = (nodeId: string, newConfig: Record<string, unknown>) => {
    setGraph((prev) => {
      const nextGraph = {
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, config: newConfig as ProcessNode['config'] } : n))
      };
      onGraphChange?.(nextGraph);
      return nextGraph;
    });
  };

  const handleUpdateNodeDressing = (nodeId: string, updatedDressing: any) => {
    setGraph((prev) => {
      const nextGraph = {
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, dressing: updatedDressing } : n))
      };
      onGraphChange?.(nextGraph);
      return nextGraph;
    });
  };

  const popOutNode = useMemo(() => {
    return graph.nodes.find((n) => n.id === popOutNodeId) || null;
  }, [graph.nodes, popOutNodeId]);

  if (activeMode === 'field') {
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <MobileFieldView
          graph={graph}
          telemetry={telemetry}
          isRunning={isRunning}
          onToggleSimulation={handleToggleSimulation}
          onResetSimulation={handleResetSimulation}
          onSwitchToCanvas={() => setUserModeOverride('canvas')}
          onUpdateNodeConfig={handleUpdateNodeConfig}
          onUpdateNodeDressing={handleUpdateNodeDressing}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: OsakaJadePalette.background.canvas,
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Center Interactive Flow Canvas */}
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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

      {/* Floating Toggle Button for Mobile Users to Return to Field View */}
      {isMobile && (
        <button
          onClick={() => setUserModeOverride('field')}
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            zIndex: 100,
            padding: '10px 16px',
            borderRadius: 24,
            backgroundColor: OsakaJadePalette.jade[500],
            color: OsakaJadePalette.text.inverse,
            border: `1px solid ${OsakaJadePalette.jade.glow}`,
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: `0 4px 20px rgba(0, 0, 0, 0.6), 0 0 12px ${OsakaJadePalette.jade.glow}66`,
            cursor: 'pointer'
          }}
        >
          <Layers size={14} />
          <span>Field View</span>
        </button>
      )}
    </div>
  );
};
