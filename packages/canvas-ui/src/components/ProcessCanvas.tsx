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
  type Connection,
  type IsValidConnection,
  ConnectionLineType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Layers, Play, Pause, RotateCcw, AlertTriangle, Plus, Sparkles, Undo2, Redo2, Trash2, Copy, SquarePen } from 'lucide-react';

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
  /**
   * Opens the Unit Op Creator: design a unit operation that does not exist
   * yet. This is the product's main path, so it leads the toolbar and the
   * empty canvas; the stock list is the secondary option.
   */
  onDesignUnitOp?: () => void;
  isDockCollapsed?: boolean;
  onToggleDockCollapse?: () => void;
  /**
   * Identifies the open project. When it changes, undo history starts over,
   * so undo never reaches back into a different project.
   */
  historyKey?: string;
}

/** Undo steps kept. */
const HISTORY_LIMIT = 100;
/** Edits to the same thing this close together are one undo step (typing, sliders). */
const COALESCE_MS = 1000;

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/** What actually feeds a unit and what it feeds, read from the flowsheet. */
function neighbourContext(graph: ProcessGraph, nodeId: string): { upstreamContext?: string; downstreamContext?: string } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const describe = (ids: string[]) => ids.map((id) => byId.get(id)?.name ?? id).join(', ');
  const up = graph.edges.filter((e) => e.targetNodeId === nodeId).map((e) => e.sourceNodeId);
  const down = graph.edges.filter((e) => e.sourceNodeId === nodeId).map((e) => e.targetNodeId);
  return {
    ...(up.length ? { upstreamContext: describe(up) } : {}),
    ...(down.length ? { downstreamContext: describe(down) } : {})
  };
}

/** Every toolbar button: one height, one type size, never wrapping. */
const toolbarButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: draftingRadius.soft,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  flexShrink: 0,
  cursor: 'pointer',
  transition: 'background-color 0.15s ease'
};

export const ProcessCanvas: React.FC<ProcessCanvasProps> = ({
  initialViewMode = 'auto',
  onViewModeChange,
  graph: externalGraph,
  onGraphChange,
  onDesignUnitOp,
  isDockCollapsed: externalIsDockCollapsed,
  onToggleDockCollapse: externalOnToggleDockCollapse,
  historyKey
}) => {
  const { palette, canvasTokens, font } = useTheme();
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
  // Every edit goes through updateGraph, which calls onGraphChange outside
  // setGraph's updater (a parent setState inside it would run during a child's
  // render, and twice under StrictMode).
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const commitGraph = useCallback(
    (next: ProcessGraph) => {
      graphRef.current = next;
      setGraph(next);
      onGraphChange?.(next);
    },
    [onGraphChange]
  );

  // Undo history: whole flowsheets, which are small. `coalesce` names what an
  // edit touches, so a run of keystrokes or a slider drag is one step.
  const historyRef = useRef<{ past: ProcessGraph[]; future: ProcessGraph[]; lastKey?: string | undefined; lastAt: number }>({
    past: [],
    future: [],
    lastAt: 0
  });
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });
  const syncHistorySize = () =>
    setHistorySize({ past: historyRef.current.past.length, future: historyRef.current.future.length });
  const pushHistory = (prev: ProcessGraph, coalesce?: string) => {
    const h = historyRef.current;
    const now = Date.now();
    const merge = coalesce !== undefined && h.lastKey === coalesce && now - h.lastAt < COALESCE_MS;
    if (!merge) {
      h.past.push(prev);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
    }
    h.future = [];
    h.lastKey = coalesce;
    h.lastAt = now;
    syncHistorySize();
  };

  const updateGraph = useCallback(
    (fn: (prev: ProcessGraph) => ProcessGraph, opts?: { coalesce?: string }) => {
      const prev = graphRef.current;
      const next = fn(prev);
      if (next === prev) return;
      pushHistory(prev, opts?.coalesce);
      commitGraph(next);
    },
    [commitGraph]
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(graphRef.current);
    h.lastKey = undefined;
    syncHistorySize();
    commitGraph(prev);
  }, [commitGraph]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(graphRef.current);
    h.lastKey = undefined;
    syncHistorySize();
    commitGraph(next);
  }, [commitGraph]);
  const [isRunning, setIsRunning] = useState(false);
  const [isForgeHubOpen, setIsForgeHubOpen] = useState(false);
  const [isEquipmentPaletteOpen, setIsEquipmentPaletteOpen] = useState(false);
  const [popOutNodeId, setPopOutNodeId] = useState<string | null>(null);

  const handleAddNode = useCallback(
    (newNode: ProcessNode) => {
      updateGraph((prev) => {
        const nextGraph = {
          ...prev,
          nodes: [...prev.nodes, newNode]
        };
        return nextGraph;
      });
      // Immediately select and open the Unit-Op Pop-Out Studio Drawer!
      setPopOutNodeId(newNode.id);
    },
    [updateGraph]
  );

  // Sync external graph changes (from project import, template switcher, etc.)
  // A graph from outside that is not the one this canvas just sent up: an MCP
  // client adding a unit, or an import. Undoable, like any other edit; a
  // different project (historyKey) starts a fresh history instead.
  const lastHistoryKey = useRef(historyKey);
  useEffect(() => {
    if (!externalGraph || externalGraph === graphRef.current) return;
    if (lastHistoryKey.current !== historyKey) {
      lastHistoryKey.current = historyKey;
      historyRef.current = { past: [], future: [], lastAt: 0 };
      syncHistorySize();
    } else {
      pushHistory(graphRef.current);
    }
    graphRef.current = externalGraph;
    setGraph(externalGraph);
  }, [externalGraph, historyKey]);

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
   * Playback replays the telemetry the engine recorded; every figure on the
   * canvas comes from SimulationResult.
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
        // Nothing flows until the simulation says so; pipes animate on flow.
        activeFlowRate: 0
      } satisfies CanvasEdgeData
    }))
  );

  // When graph structure changes, reconstruct nodes/edges while preserving any user-dragged positions
  useEffect(() => {
    setNodes((existingNodes) =>
      graph.nodes.map((pNode) => {
        const existing = existingNodes.find((n) => n.id === pNode.id);
        return {
          id: pNode.id,
          type: 'industrialNode',
          // The flowsheet's position, so undoing a move moves the unit back.
          position: pNode.position,
          selected: existing?.selected ?? false,
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

    setEdges((existingEdges) =>
      graph.edges.map((pEdge) => ({
        id: pEdge.id,
        selected: existingEdges.find((e) => e.id === pEdge.id)?.selected ?? false,
        source: pEdge.sourceNodeId,
        target: pEdge.targetNodeId,
        sourceHandle: pEdge.sourcePortId,
        targetHandle: pEdge.targetPortId,
        type: 'animatedStreamEdge',
        data: {
          processEdge: pEdge,
          // Blocked upstream, as the engine reports it.
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
      setNodes((nds) => applyNodeChanges(changes, nds));

      // Was: only position changes reached the flowsheet. Deleting a node hid
      // it on screen but left it in the saved project and the simulation,
      // and it came back on the next rebuild.
      const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
      const moved = new Map<string, { x: number; y: number }>();
      for (const c of changes) {
        if (c.type !== 'position' || !c.position || c.dragging) continue;
        // A click without a drag reports the same position: not an edit,
        // and not an undo step.
        const was = graphRef.current.nodes.find((n) => n.id === c.id)?.position;
        if (was && was.x === c.position.x && was.y === c.position.y) continue;
        moved.set(c.id, c.position);
      }
      if (removed.size === 0 && moved.size === 0) return;
      updateGraph((prev) => ({
        ...prev,
        nodes: prev.nodes
          .filter((n) => !removed.has(n.id))
          .map((n) => (moved.has(n.id) ? { ...n, position: moved.get(n.id)! } : n)),
        // A stream to or from a deleted unit goes with it.
        edges: prev.edges.filter((e) => !removed.has(e.sourceNodeId) && !removed.has(e.targetNodeId))
      }));
    },
    [updateGraph]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
      const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
      if (removed.size === 0) return;
      updateGraph((prev) => ({ ...prev, edges: prev.edges.filter((e) => !removed.has(e.id)) }));
    },
    [updateGraph]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      // The stream type follows the port it leaves from (fluid or containers).
      const sourceNode = graphRef.current.nodes.find((n) => n.id === connection.source);
      const sourcePort =
        sourceNode?.outputs.find((p) => p.id === connection.sourceHandle) ?? sourceNode?.outputs[0];
      const discrete = String(sourcePort?.flowDimension ?? '').startsWith('DISCRETE');
      const newEdge: ProcessEdge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        sourcePortId: connection.sourceHandle || 'out-1',
        targetPortId: connection.targetHandle || 'in-1',
        stream: discrete
          ? {
              type: 'DISCRETE_CONTAINER_STREAM',
              targetPiecesPerMinute: 40,
              containerVolumeGallons: 1,
              containerType: 'CAN_1_GAL'
            }
          : {
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
      updateGraph((prev) => {
        const nextGraph = {
          ...prev,
          edges: [...prev.edges, newEdge]
        };
        return nextGraph;
      });
    },
    [updateGraph]
  );

  const [simSpeed, setSimSpeed] = useState<number>(1);

  // Toolbar labels give way to icons (with tooltips) when the canvas is narrow.
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const [compactToolbar, setCompactToolbar] = useState(false);
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setCompactToolbar((entry?.contentRect.width ?? 1200) < 1060));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Removes units (with their streams) and streams, as one undo step. */
  const deleteElements = useCallback(
    (nodeIds: string[], edgeIds: string[] = []) => {
      if (nodeIds.length === 0 && edgeIds.length === 0) return;
      const nodeSet = new Set(nodeIds);
      const edgeSet = new Set(edgeIds);
      updateGraph((prev) => ({
        ...prev,
        nodes: prev.nodes.filter((n) => !nodeSet.has(n.id)),
        edges: prev.edges.filter(
          (e) => !edgeSet.has(e.id) && !nodeSet.has(e.sourceNodeId) && !nodeSet.has(e.targetNodeId)
        )
      }));
      setPopOutNodeId((open) => (open && nodeSet.has(open) ? null : open));
    },
    [updateGraph]
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const src = graphRef.current.nodes.find((n) => n.id === nodeId);
      if (!src) return;
      const { assignedSubAgentId: _agent, ...rest } = structuredClone(src);
      const copy: ProcessNode = {
        ...rest,
        id: `${src.kind.toLowerCase()}-${Date.now().toString(36)}`,
        // "Pump (copy)" copied again is "Pump (copy)", not "Pump (copy) (copy)".
        name: `${src.name.replace(/ \(copy\)$/, '')} (copy)`,
        position: { x: src.position.x + 220, y: src.position.y + 40 }
      };
      updateGraph((prev) => ({ ...prev, nodes: [...prev.nodes, copy] }));
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
      setPopOutNodeId(copy.id);
    },
    [updateGraph]
  );

  const selectedNodeIds = useMemo(() => nodes.filter((n) => n.selected).map((n) => n.id), [nodes]);
  const selectedEdgeIds = useMemo(() => edges.filter((e) => e.selected).map((e) => e.id), [edges]);
  const hasSelection = selectedNodeIds.length + selectedEdgeIds.length > 0;
  const deleteSelection = useCallback(
    () => deleteElements(selectedNodeIds, selectedEdgeIds),
    [deleteElements, selectedNodeIds, selectedEdgeIds]
  );

  // Right-click menu on a unit or a stream.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; kind: 'node' | 'edge'; id: string } | null>(null);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  // Editing shortcuts: undo, redo, delete, duplicate. Left alone while typing,
  // so a text box keeps its own undo and Backspace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (mod && key === 'd') {
        const target = selectedNodeIds[0] ?? popOutNodeId;
        if (target) {
          e.preventDefault();
          duplicateNode(target);
        }
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && hasSelection) {
        e.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, duplicateNode, deleteSelection, hasSelection, selectedNodeIds, popOutNodeId]);

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
    updateGraph((prev) => {
      const nextGraph = {
        ...prev,
        nodes: [...prev.nodes, newNode]
      };
      return nextGraph;
    });
  };

  const handleUpdateNodeConfig = (nodeId: string, newConfig: Record<string, unknown>) => {
    updateGraph((prev) => {
      const nextGraph = {
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, config: newConfig as ProcessNode['config'] } : n))
      };
      return nextGraph;
    }, { coalesce: `config:${nodeId}` });
  };

  /**
   * A pipe runs from an outlet nozzle to an inlet nozzle of another unit, and
   * carries one kind of stream: fluid cannot be piped into a conveyor. The
   * handles already make outlets sources and inlets targets; this also stops
   * duplicate pipes and loops back into the same unit.
   */
  const isValidConnection: IsValidConnection = useCallback((c) => {
    if (!c.source || !c.target || c.source === c.target) return false;
    const g = graphRef.current;
    const from = g.nodes.find((n) => n.id === c.source)?.outputs.find((p) => p.id === c.sourceHandle);
    const to = g.nodes.find((n) => n.id === c.target)?.inputs.find((p) => p.id === c.targetHandle);
    if (!from || !to) return false;
    const discrete = (d: string) => d === 'DISCRETE_CONTAINER';
    if (discrete(from.flowDimension) !== discrete(to.flowDimension)) return false;
    return !g.edges.some(
      (e) =>
        e.sourceNodeId === c.source &&
        e.targetNodeId === c.target &&
        e.sourcePortId === c.sourceHandle &&
        e.targetPortId === c.targetHandle
    );
  }, []);

  /** The nozzle editor adds and removes ports along with nozzles. */
  const handleUpdateNodeShape = (
    nodeId: string,
    shape: { dressing: ProcessNode['dressing']; inputs: ProcessNode['inputs']; outputs: ProcessNode['outputs'] }
  ) => {
    updateGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId ? { ...n, dressing: shape.dressing, inputs: shape.inputs, outputs: shape.outputs } : n
      )
    }));
  };

  const handleUpdateNodeDressing = (nodeId: string, updatedDressing: any) => {
    updateGraph((prev) => {
      const nextGraph = {
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, dressing: updatedDressing } : n))
      };
      return nextGraph;
    }, { coalesce: `dressing:${nodeId}` });
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
      <div ref={canvasAreaRef} style={{ flex: 1, position: 'relative', height: '100%', minWidth: 0, minHeight: 0 }}>
        {/* Simulation toolbar. Centred by a full-width row rather than
            left: 50% + translate, which gives an absolutely positioned box only
            half the canvas to lay out in and made every label wrap. */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            zIndex: 10,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}
        >
          <div
            role="toolbar"
            aria-label="Simulation"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 6,
              borderRadius: draftingRadius.soft,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              // The run state is carried by the rule colour.
              border: `1px solid ${isRunning ? OsakaJadePalette.jade[500] : OsakaJadePalette.border.default}`,
              transition: 'border-color 0.15s ease',
              pointerEvents: 'auto',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              overflowX: 'auto'
            }}
          >
            <button
              type="button"
              onClick={handleToggleSimulation}
              title={`${isRunning ? 'Pause' : 'Run'} the simulation (Space)`}
              style={{
                ...toolbarButton,
                backgroundColor: isRunning ? OsakaJadePalette.status.blocked : OsakaJadePalette.jade[500],
                color: OsakaJadePalette.text.inverse,
                border: 'none',
                fontWeight: 700
              }}
            >
              {isRunning ? <Pause size={15} /> : <Play size={15} />}
              {!compactToolbar && <span>{isRunning ? 'Pause' : 'Run'}</span>}
            </button>

            {onDesignUnitOp && (
              <button
                type="button"
                onClick={onDesignUnitOp}
                title="Design a unit op: describe equipment that has no model yet; your AI model writes it and the engine checks the physics"
                style={{
                  ...toolbarButton,
                  backgroundColor: OsakaJadePalette.jade[600],
                  color: OsakaJadePalette.text.inverse,
                  border: `1px solid ${OsakaJadePalette.jade[500]}`,
                  fontWeight: 700
                }}
              >
                <Sparkles size={15} />
                {!compactToolbar && <span>Design unit op</span>}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsEquipmentPaletteOpen(true)}
              title="Add standard equipment: pumps, tanks, reactors, fillers, conveyors"
              style={{
                ...toolbarButton,
                backgroundColor: OsakaJadePalette.background.surface,
                color: OsakaJadePalette.text.primary,
                border: `1px solid ${OsakaJadePalette.border.strong}`
              }}
            >
              <Plus size={15} color={OsakaJadePalette.jade[400]} />
              {!compactToolbar && <span>Add equipment</span>}
            </button>

            <button
              type="button"
              onClick={handleResetSimulation}
              title="Reset the simulation clock and counters"
              aria-label="Reset simulation"
              style={{
                ...toolbarButton,
                width: 32,
                padding: 0,
                justifyContent: 'center',
                backgroundColor: OsakaJadePalette.background.surface,
                color: OsakaJadePalette.text.secondary,
                border: `1px solid ${OsakaJadePalette.border.default}`
              }}
            >
              <RotateCcw size={14} />
            </button>

            <div style={{ width: 1, height: 20, backgroundColor: OsakaJadePalette.border.subtle, flexShrink: 0 }} />

            {[
              { label: 'Undo', hint: 'Undo (Ctrl+Z)', icon: <Undo2 size={15} />, onClick: undo, enabled: historySize.past > 0 },
              { label: 'Redo', hint: 'Redo (Ctrl+Y)', icon: <Redo2 size={15} />, onClick: redo, enabled: historySize.future > 0 },
              {
                label: 'Delete',
                hint: hasSelection
                  ? 'Delete the selected units and streams (Delete)'
                  : 'Select a unit or a stream to delete it (Delete)',
                icon: <Trash2 size={15} />,
                onClick: deleteSelection,
                enabled: hasSelection
              }
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={b.onClick}
                disabled={!b.enabled}
                title={b.hint}
                aria-label={b.label}
                style={{
                  ...toolbarButton,
                  width: 32,
                  padding: 0,
                  justifyContent: 'center',
                  backgroundColor: OsakaJadePalette.background.surface,
                  color: b.enabled ? OsakaJadePalette.text.primary : OsakaJadePalette.text.muted,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  opacity: b.enabled ? 1 : 0.45,
                  cursor: b.enabled ? 'pointer' : 'default'
                }}
              >
                {b.icon}
              </button>
            ))}

            <div style={{ width: 1, height: 20, backgroundColor: OsakaJadePalette.border.subtle, flexShrink: 0 }} />

            {/* Playback speed */}
            <div
              role="group"
              aria-label="Playback speed"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                height: 32,
                boxSizing: 'border-box',
                padding: 2,
                borderRadius: draftingRadius.soft,
                backgroundColor: OsakaJadePalette.background.surface,
                border: `1px solid ${OsakaJadePalette.border.subtle}`,
                flexShrink: 0
              }}
            >
              {[1, 2, 5].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => setSimSpeed(speed)}
                  aria-pressed={simSpeed === speed}
                  style={{
                    height: 26,
                    minWidth: 30,
                    padding: '0 6px',
                    borderRadius: draftingRadius.soft,
                    fontSize: 12,
                    fontWeight: 700,
                    border: 'none',
                    backgroundColor: simSpeed === speed ? OsakaJadePalette.jade.muted : 'transparent',
                    color: simSpeed === speed ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.muted,
                    cursor: 'pointer'
                  }}
                >
                  {speed}×
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 20, backgroundColor: OsakaJadePalette.border.subtle, flexShrink: 0 }} />

            {/* Readout */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, padding: '0 4px', flexShrink: 0 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 600,
                  color: isRunning ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.muted
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: isRunning ? OsakaJadePalette.jade[400] : 'transparent',
                    border: `1.5px solid ${isRunning ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted}`
                  }}
                />
                {isRunning ? 'Running' : 'Stopped'}
              </span>
              <span title="Average output rate" style={{ fontFamily: font.mono, color: OsakaJadePalette.text.primary }}>
                {Math.round(telemetry.averageRatePerMin)}
                <span style={{ color: OsakaJadePalette.text.muted }}>/min</span>
              </span>
              <span title="Units finished" style={{ fontFamily: font.mono, color: OsakaJadePalette.text.primary }}>
                {telemetry.totalPackaged.toLocaleString()}
                <span style={{ color: OsakaJadePalette.text.muted }}> units</span>
              </span>
              {telemetry.activeBottleneck && (
                <span
                  title="The unit limiting the line"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 24,
                    padding: '0 8px',
                    borderRadius: draftingRadius.soft,
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    color: OsakaJadePalette.status.blocked,
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    fontWeight: 600
                  }}
                >
                  <AlertTriangle size={13} />
                  <span>
                    {compactToolbar ? '' : 'Bottleneck: '}
                    {graph.nodes.find((n) => n.id === telemetry.activeBottleneck)?.name ??
                      telemetry.activeBottleneck.replace(/-/g, ' ')}
                  </span>
                </span>
              )}
            </div>
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
                Start your flowsheet
              </div>
              <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, marginTop: 4, lineHeight: 1.4 }}>
                Design a unit operation that does not exist yet: describe it, your AI model writes it, and the engine checks the physics. Or start from standard equipment.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 8, marginTop: 6 }}>
              {onDesignUnitOp && (
                <button
            onClick={onDesignUnitOp}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              borderRadius: draftingRadius.soft,
              backgroundColor: OsakaJadePalette.jade[600],
              color: OsakaJadePalette.text.inverse,
              border: `1px solid ${OsakaJadePalette.jade[500]}`,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              justifyContent: 'center',
              padding: '10px 12px'
            }}
            title="Describe equipment that has no model yet. Your AI model writes it as a contract; the engine checks the physics."
          >
            <Sparkles size={13} />
            <span>Design a unit operation</span>
          </button>
              )}
              <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted, marginTop: 4 }}>Or start from standard equipment</div>
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
                All standard equipment →
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
          isValidConnection={isValidConnection}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={{ stroke: OsakaJadePalette.jade[300], strokeWidth: 2, strokeDasharray: '6 4' }}
          connectionRadius={28}
          onNodeClick={(_event, n) => setPopOutNodeId(n.id)}
          // Delete is handled above, so a unit and its streams go as one
          // undo step (React Flow would report them as two changes).
          deleteKeyCode={null}
          onNodeContextMenu={(event, n) => {
            event.preventDefault();
            setNodes((nds) => nds.map((x) => ({ ...x, selected: x.id === n.id })));
            setContextMenu({ x: event.clientX, y: event.clientY, kind: 'node', id: n.id });
          }}
          onEdgeContextMenu={(event, e) => {
            event.preventDefault();
            setEdges((eds) => eds.map((x) => ({ ...x, selected: x.id === e.id })));
            setContextMenu({ x: event.clientX, y: event.clientY, kind: 'edge', id: e.id });
          }}
          onPaneClick={() => setContextMenu(null)}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            setContextMenu(null);
          }}
          onMoveStart={() => setContextMenu(null)}
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

        {contextMenu && (
          <>
            <div
              onClick={() => setContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu(null);
              }}
              style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            />
            <div
              role="menu"
              style={{
                position: 'fixed',
                left: Math.min(contextMenu.x, window.innerWidth - 200),
                top: Math.min(contextMenu.y, window.innerHeight - 140),
                zIndex: 41,
                minWidth: 184,
                padding: 4,
                borderRadius: draftingRadius.soft,
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
                fontFamily: font.sans
              }}
            >
              {(contextMenu.kind === 'node'
                ? [
                    { label: 'Open in studio', shortcut: '', icon: <SquarePen size={14} />, danger: false, run: () => setPopOutNodeId(contextMenu.id) },
                    { label: 'Duplicate', shortcut: 'Ctrl+D', icon: <Copy size={14} />, danger: false, run: () => duplicateNode(contextMenu.id) },
                    { label: 'Delete unit', shortcut: 'Del', icon: <Trash2 size={14} />, danger: true, run: () => deleteElements([contextMenu.id]) }
                  ]
                : [
                    { label: 'Delete stream', shortcut: 'Del', icon: <Trash2 size={14} />, danger: true, run: () => deleteElements([], [contextMenu.id]) }
                  ]
              ).map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setContextMenu(null);
                    item.run();
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = OsakaJadePalette.background.surface)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    height: 32,
                    padding: '0 10px',
                    border: 'none',
                    borderRadius: draftingRadius.soft,
                    backgroundColor: 'transparent',
                    color: item.danger ? '#dc2626' : OsakaJadePalette.text.primary,
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  {item.icon}
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.shortcut && <span style={{ fontSize: 11, color: OsakaJadePalette.text.muted }}>{item.shortcut}</span>}
                </button>
              ))}
            </div>
          </>
        )}
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
        {...(popOutNode ? neighbourContext(graph, popOutNode.id) : {})}
        isOpen={popOutNodeId !== null}
        onClose={() => setPopOutNodeId(null)}
        onDelete={(id) => deleteElements([id])}
        onDuplicate={duplicateNode}
        onUpdateConfig={handleUpdateNodeConfig}
        onUpdateDressing={handleUpdateNodeDressing}
        onUpdateShape={handleUpdateNodeShape}
        connectedPortIds={
          popOutNode
            ? new Set(
                graph.edges.flatMap((e) => [
                  ...(e.sourceNodeId === popOutNode.id ? [e.sourcePortId] : []),
                  ...(e.targetNodeId === popOutNode.id ? [e.targetPortId] : [])
                ])
              )
            : undefined
        }
        onPublishToForgeHub={async (n) => {
          // Category from what the unit handles, not "reactor, else packaging";
          // description from the contract when the unit has one.
          const contract = (n.config as { contract?: { description?: string } }).contract;
          const ports = [...n.inputs, ...n.outputs].map((p) => String(p.flowDimension));
          const category =
            n.kind === 'CONVEYOR' || n.kind === 'PALLETIZER'
              ? 'MATERIAL_HANDLING'
              : n.kind === 'ROTARY_FILLER' || n.kind === 'LABELER'
                ? 'PACKAGING'
                : ports.some((d) => d.startsWith('CONTINUOUS'))
                  ? 'FLUID_PROCESSING'
                  : 'MATERIAL_HANDLING';
          const res = await CommunityLibraryService.publishUnitOp(n, {
            name: n.name,
            category,
            description: contract?.description || `${n.name} (${n.kind.replace(/_/g, ' ').toLowerCase()})`
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
        {...(onDesignUnitOp
          ? {
              onDesignNew: () => {
                setIsEquipmentPaletteOpen(false);
                onDesignUnitOp();
              }
            }
          : {})}
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
