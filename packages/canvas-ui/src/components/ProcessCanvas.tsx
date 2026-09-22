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
import { Layers, Play, Pause, RotateCcw, AlertTriangle, Plus } from 'lucide-react';

import { validateProcessGraph, type ProcessGraph, type ProcessNode, type ProcessEdge } from '@process-forge/protocol';
import { SimulationEngine, type SimulationResult, type NodeTelemetrySnapshot } from '@process-forge/simulation-core';

import { IndustrialNode } from './nodes/IndustrialNode.js';
import { AnimatedStreamEdge } from './edges/AnimatedStreamEdge.js';
import { MasterOrchestratorDock } from './dock/MasterOrchestratorDock.js';
import { UnitOpPopOutStudio } from './studio/UnitOpPopOutStudio.js';
import { CommunityUnitOpLibraryModal } from './marketplace/CommunityUnitOpLibraryModal.js';
import { CommunityLibraryService } from '../marketplace/communityLibraryClient.js';
import { EquipmentPaletteModal } from './palette/EquipmentPaletteModal.js';
import { createDefaultProcessNode } from '../utils/nodeFactory.js';
import { MobileFieldView } from './mobile/MobileFieldView.js';
import { useMobileViewport } from '../hooks/useMobileViewport.js';
import { useTheme } from '../hooks/useTheme.js';
import { SHERWIN_WILLIAMS_PAINT_LINE } from '../templates/sherwinWilliamsPaintLine.js';
import type { CanvasNodeData, CanvasEdgeData, PlantTelemetryState } from '../types.js';
import { draftingRadius } from '@process-forge/theme';

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
  isDockCollapsed?: boolean;
  onToggleDockCollapse?: () => void;
}

export const ProcessCanvas: React.FC<ProcessCanvasProps> = ({
  initialViewMode = 'auto',
  onViewModeChange,
  graph: externalGraph,
  onGraphChange,
  isDockCollapsed: externalIsDockCollapsed,
  onToggleDockCollapse: externalOnToggleDockCollapse
}) => {
  const { palette, canvasTokens } = useTheme();
  const OsakaJadePalette = palette;
  const { isMobile, viewMode } = useMobileViewport();
  const [internalDockCollapsed, setInternalDockCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 960;
  });

  const isDockCollapsed = externalIsDockCollapsed ?? internalDockCollapsed;
  const handleToggleDock = externalOnToggleDockCollapse ?? (() => setInternalDockCollapsed((prev) => !prev));

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
  const [isEquipmentPaletteOpen, setIsEquipmentPaletteOpen] = useState(false);
  const [popOutNodeId, setPopOutNodeId] = useState<string | null>(null);

  const handleAddNode = useCallback(
    (newNode: ProcessNode) => {
      setGraph((prev) => {
        const nextGraph = {
          ...prev,
          nodes: [...prev.nodes, newNode]
        };
        onGraphChange?.(nextGraph);
        return nextGraph;
      });
      // Immediately select and open the Unit-Op Pop-Out Studio Drawer!
      setPopOutNodeId(newNode.id);
    },
    [onGraphChange]
  );

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
    activeBottleneck: null,
    diagnostics: [],
    bottlenecks: validateProcessGraph(graph).bottlenecks
  }));

  const animTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * The engine's own result, and a playhead into the telemetry it recorded.
   *
   * Playback replays what the engine computed. It previously animated a random
   * walk -- `Math.floor(Math.random() * 3) + 2` units per tick with a rate
   * pinned to `35 * simSpeed` -- which overwrote the real result within one
   * interval and drifted further from it every tick. Per-node values were
   * constants keyed to one demo graph's node ids, so every other flowsheet
   * displayed another line's numbers.
   *
   * Nothing on this canvas is invented now: every figure comes from
   * SimulationResult.
   */
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [playheadIndex, setPlayheadIndex] = useState(0);

  /** Distinct sample times in the recorded telemetry, ascending. */
  const sampleTimes = useMemo(() => {
    if (!simResult) return [] as number[];
    return [...new Set(simResult.telemetryLog.map((t) => t.timeSeconds))].sort((a, b) => a - b);
  }, [simResult]);

  /** Every node's recorded state at the current playhead. */
  const snapshotByNode = useMemo(() => {
    const map = new Map<string, NodeTelemetrySnapshot>();
    if (!simResult || sampleTimes.length === 0) return map;
    const t = sampleTimes[Math.min(playheadIndex, sampleTimes.length - 1)];
    for (const entry of simResult.telemetryLog) {
      if (entry.timeSeconds === t) map.set(entry.nodeId, entry);
    }
    return map;
  }, [simResult, sampleTimes, playheadIndex]);

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
        bufferLevel: 0,
        instantaneousRate: 0,
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
            state: snapshotByNode.get(pNode.id)?.state ?? 'IDLE',
            unitsProduced: snapshotByNode.get(pNode.id)?.unitsProduced ?? 0,
            unitsScrapped: snapshotByNode.get(pNode.id)?.unitsScrapped ?? 0,
            bufferLevel: snapshotByNode.get(pNode.id)?.bufferLevel ?? 0,
            instantaneousRate: snapshotByNode.get(pNode.id)?.instantaneousRatePerMin ?? 0,
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
          // Blocked upstream is a real state the engine reports, not a
          // decoration pinned to one demo edge.
          isBackpressureBlocked: snapshotByNode.get(pEdge.sourceNodeId)?.state === 'BLOCKED',
          activeFlowRate: snapshotByNode.get(pEdge.sourceNodeId)?.instantaneousRatePerMin ?? 0
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
            state: snapshotByNode.get(pNode.id)?.state ?? 'IDLE',
            unitsProduced: snapshotByNode.get(pNode.id)?.unitsProduced ?? 0,
            unitsScrapped: snapshotByNode.get(pNode.id)?.unitsScrapped ?? 0,
            bufferLevel: snapshotByNode.get(pNode.id)?.bufferLevel ?? 0,
            instantaneousRate: snapshotByNode.get(pNode.id)?.instantaneousRatePerMin ?? 0
          }
        };
      })
    );

    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        data: {
          ...e.data,
          isBackpressureBlocked:
            snapshotByNode.get((e.data as CanvasEdgeData).processEdge.sourceNodeId)?.state ===
            'BLOCKED',
          activeFlowRate:
            snapshotByNode.get((e.data as CanvasEdgeData).processEdge.sourceNodeId)
              ?.instantaneousRatePerMin ?? 0
        }
      }))
    );
  }, [snapshotByNode, isRunning]);

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

  const [simSpeed, setSimSpeed] = useState<number>(1);

  // Keyboard shortcut: Spacebar to toggle simulation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (e.code === 'Space' && activeTag !== 'input' && activeTag !== 'textarea') {
        e.preventDefault();
        handleToggleSimulation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, graph]);

  // Simulation execution loop
  useEffect(() => {
    if (isRunning) {
      const intervalMs = Math.max(200, Math.round(1000 / simSpeed));
      // Advance the playhead through the engine's recorded samples. simSpeed
      // changes how fast the recording is replayed; it does not change the
      // numbers, because the run already happened.
      animTimerRef.current = setInterval(() => {
        setPlayheadIndex((i) => (sampleTimes.length === 0 ? 0 : Math.min(i + 1, sampleTimes.length - 1)));
      }, intervalMs);
    } else {
      if (animTimerRef.current) {
        clearInterval(animTimerRef.current);
      }
    }
    return () => {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
    };
  }, [isRunning, simSpeed]);

  const handleToggleSimulation = () => {
    if (!isRunning) {
      // Execute the deterministic engine
      const sim = new SimulationEngine(graph);
      const res = sim.run(30); // 30 minutes
      const validation = validateProcessGraph(graph);
      setSimResult(res);
      setPlayheadIndex(0);

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
      activeBottleneck: null,
      diagnostics: [],
      bottlenecks: validateProcessGraph(graph).bottlenecks
    });
    setSimResult(null);
    setPlayheadIndex(0);
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
      <div style={{ flex: 1, position: 'relative', height: '100%', minWidth: 0, minHeight: 0 }}>
        {/* Floating Top Precision CAD Simulation & Telemetry Bar */}
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 10px',
            borderRadius: draftingRadius.soft,
            backgroundColor: OsakaJadePalette.background.surfaceElevated,
            // A ruled instrument band. The run state is carried by the rule
            // colour, which is information; a glow would only be decoration.
            border: `1px solid ${isRunning ? OsakaJadePalette.jade[500] : OsakaJadePalette.border.default}`,
            transition: 'border-color 0.15s ease',
            pointerEvents: 'auto',
            maxWidth: '92vw'
          }}
        >
          {/* Play / Pause Action Button */}
          <button
            onClick={handleToggleSimulation}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: draftingRadius.soft,
              backgroundColor: isRunning ? OsakaJadePalette.status.blocked : OsakaJadePalette.jade[500],
              color: OsakaJadePalette.text.inverse,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease'
            }}
            title="Press Spacebar to toggle simulation"
          >
            {isRunning ? <Pause size={13} /> : <Play size={13} />}
            <span>{isRunning ? 'Pause Simulation' : 'Run Simulation'}</span>
          </button>

          {/* Add UnitOp Action Button */}
          <button
            onClick={() => setIsEquipmentPaletteOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 11px',
              borderRadius: draftingRadius.soft,
              backgroundColor: OsakaJadePalette.background.surface,
              color: OsakaJadePalette.jade[300],
              border: `1px solid ${OsakaJadePalette.border.strong}`,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Open Equipment Palette to add Pumps, Tanks, Reactors, Fillers, etc."
          >
            <Plus size={13} color={OsakaJadePalette.jade[400]} />
            <span>Add UnitOp</span>
          </button>

          {/* Reset Action Button */}
          <button
            onClick={handleResetSimulation}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: draftingRadius.soft,
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.secondary,
              cursor: 'pointer'
            }}
            title="Reset Simulation Time and Counters"
          >
            <RotateCcw size={12} />
          </button>

          <div style={{ width: 1, height: 16, backgroundColor: OsakaJadePalette.border.subtle }} />

          {/* Speed Multiplier Segmented Control */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              backgroundColor: OsakaJadePalette.background.surface,
              padding: 2,
              borderRadius: draftingRadius.soft,
              border: `1px solid ${OsakaJadePalette.border.subtle}`
            }}
          >
            {[1, 2, 5].map((speed) => (
              <button
                key={speed}
                onClick={() => setSimSpeed(speed)}
                style={{
                  padding: '3px 7px',
                  borderRadius: draftingRadius.soft,
                  fontSize: 10,
                  fontWeight: 700,
                  border: 'none',
                  backgroundColor: simSpeed === speed ? OsakaJadePalette.jade.muted : 'transparent',
                  color: simSpeed === speed ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.muted,
                  cursor: 'pointer'
                }}
              >
                {speed}x
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 16, backgroundColor: OsakaJadePalette.border.subtle }} />

          {/* Real-time Status Badge & Telemetry */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                color: isRunning ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.muted,
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '0.04em'
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 0,
                  backgroundColor: isRunning ? OsakaJadePalette.jade[400] : 'transparent',
                  border: `1px solid ${isRunning ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted}`
                }}
              />
              {isRunning ? 'RUNNING' : 'STANDBY'}
            </span>

            <span style={{ color: OsakaJadePalette.text.muted }}>|</span>

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span style={{ color: OsakaJadePalette.text.muted, fontSize: 10, fontWeight: 600 }}>RATE</span>
              <span style={{ color: OsakaJadePalette.text.primary, fontFamily: 'monospace', fontWeight: 600 }}>
                {Math.round(telemetry.averageRatePerMin)} CPM
              </span>
            </span>

            <span style={{ color: OsakaJadePalette.text.muted }}>|</span>

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span style={{ color: OsakaJadePalette.text.muted, fontSize: 10, fontWeight: 600 }}>UNITS</span>
              <span style={{ color: OsakaJadePalette.text.primary, fontFamily: 'monospace', fontWeight: 600 }}>
                {telemetry.totalPackaged}
              </span>
            </span>

            {telemetry.activeBottleneck && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  color: OsakaJadePalette.status.blocked,
                  padding: '2px 7px',
                  borderRadius: draftingRadius.soft,
                  fontSize: 10,
                  fontWeight: 700,
                  border: '1px solid rgba(245, 158, 11, 0.3)'
                }}
              >
                <AlertTriangle size={11} />
                <span>{telemetry.activeBottleneck.replace(/-/g, ' ')}</span>
              </span>
            )}
          </div>
        </div>

        {/* Empty Canvas Call-to-Action for Blank Flowsheets */}
        {nodes.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 5,
              width: 440,
              maxWidth: 'calc(100% - 32px)',
              backgroundColor: `${OsakaJadePalette.background.surfaceElevated}f2`,
              backdropFilter: 'blur(16px)',
              border: `1px solid ${OsakaJadePalette.border.glow}`,
              borderRadius: draftingRadius.soft,
              padding: 24,
              // Kept deliberately. A dialog genuinely floats above the sheet;
              // this is the one place elevation is not decoration.
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: draftingRadius.soft,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: `1px solid ${OsakaJadePalette.jade[600]}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: OsakaJadePalette.jade.glow
              }}
            >
              <Layers size={22} />
            </div>

            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                Flowsheet Canvas Blank
              </div>
              <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, marginTop: 4, lineHeight: 1.4 }}>
                Add your first unit operation to initialize the model. Clicking any placed unit opens its dedicated Unit-Op Sub-Agent.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 8, marginTop: 6 }}>
              <button
                onClick={() => handleAddNode(createDefaultProcessNode('PUMP', { flowRateGpm: 100 }))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: draftingRadius.soft,
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.jade[600]}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Plus size={14} color={OsakaJadePalette.jade.glow} />
                  <span>Centrifugal Pump (100 GPM)</span>
                </span>
                <span style={{ fontSize: 11, color: OsakaJadePalette.jade.glow, fontWeight: 700 }}>+ Add</span>
              </button>

              <button
                onClick={() => handleAddNode(createDefaultProcessNode('SURGE_TANK'))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: draftingRadius.soft,
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Plus size={14} color={OsakaJadePalette.jade.glow} />
                  <span>Surge / Storage Tank (1,000 Gal)</span>
                </span>
                <span style={{ fontSize: 11, color: OsakaJadePalette.text.muted }}>+ Add</span>
              </button>

              <button
                onClick={() => handleAddNode(createDefaultProcessNode('BATCH_REACTOR'))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: draftingRadius.soft,
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Plus size={14} color={OsakaJadePalette.jade.glow} />
                  <span>Jacketed Batch Reactor (800 Gal)</span>
                </span>
                <span style={{ fontSize: 11, color: OsakaJadePalette.text.muted }}>+ Add</span>
              </button>

              <button
                onClick={() => setIsEquipmentPaletteOpen(true)}
                style={{
                  marginTop: 4,
                  padding: '7px 10px',
                  borderRadius: draftingRadius.soft,
                  backgroundColor: 'transparent',
                  border: `1px dashed ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.secondary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Browse All Industrial Equipment (Palette) →
              </button>
            </div>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_event, n) => setPopOutNodeId(n.id)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2.0}
        >
          <Background color={canvasTokens.gridLineColor} gap={20} size={1} />
          <Controls
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: draftingRadius.soft,
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
        isCollapsed={isDockCollapsed}
        onToggleCollapse={handleToggleDock}
        onToggleSimulation={handleToggleSimulation}
        onResetSimulation={handleResetSimulation}
        onOpenForgeHub={() => setIsForgeHubOpen(true)}
        onBroadcastContext={() => {}}
        onAddNode={handleAddNode}
        onOpenPopOutStudio={(nodeId) => setPopOutNodeId(nodeId)}
      />

      {/* Double-Click Unit-Op Pop-Out Studio Drawer */}
      <UnitOpPopOutStudio
        node={popOutNode}
        isOpen={popOutNodeId !== null}
        onClose={() => setPopOutNodeId(null)}
        onUpdateConfig={handleUpdateNodeConfig}
        onUpdateDressing={handleUpdateNodeDressing}
        onPublishToForgeHub={async (n) => {
          const res = await CommunityLibraryService.publishUnitOp(n, {
            name: n.name,
            category: n.kind === 'BATCH_REACTOR' ? 'FLUID_PROCESSING' : 'PACKAGING',
            description: `Community-engineered Unit-Op: ${n.name}`
          });
          alert(res.message);
        }}
      />

      {/* In-App Community UnitOp Library Modal */}
      <CommunityUnitOpLibraryModal
        isOpen={isForgeHubOpen}
        onClose={() => setIsForgeHubOpen(false)}
        onInsertNode={handleInsertNodeFromForgeHub}
      />

      {/* Industrial Equipment Palette Modal */}
      <EquipmentPaletteModal
        isOpen={isEquipmentPaletteOpen}
        onClose={() => setIsEquipmentPaletteOpen(false)}
        onInsertNode={handleAddNode}
      />

      {/* Floating Toggle Button for Touch / Mobile Users to Return to Field View */}
      {isMobile && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches && (
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
