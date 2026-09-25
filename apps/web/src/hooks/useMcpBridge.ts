import { useCallback, useEffect, useRef, useState } from 'react';
import {
  executeValidateUnitOp,
  UnitOpContractSchema,
  planStream,
  addStreamToGraph,
  applyFlowsheetEdit,
  type FlowsheetEdit,
  ProcessNodeSchema,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type StreamRequest
} from '@process-forge/protocol';
import { isTauriEnvironment, invokeTauriCommand } from '../components/UpdateNotificationBanner.js';
import { contractToProcessNode } from '../unitop/contractToNode.js';
import { saveUnitOp } from '@process-forge/canvas-ui';

/**
 * The app's half of the MCP bridge (apps/desktop/src-tauri/src/mcp_bridge.rs).
 *
 * An MCP client on this computer can send a unit op with
 * add_unit_op_to_flowsheet. The desktop shell queues it; this hook picks it
 * up, has the engine validate it again, adds it to the open flowsheet, and
 * reports what happened so the MCP client can tell the engineer. It also
 * shares the open flowsheet, for get_open_flowsheet.
 *
 * Desktop only: in a browser there is no shell and nothing to poll.
 */

const POLL_MS = 1000;

/** Fired on window for every unit op an MCP client adds: { name, nodeId, at }. */
export const MCP_ACTIVITY_EVENT = 'pf-mcp-activity';

/** A request from an MCP client. Older shells send unit ops without a kind. */
type PendingRequest =
  | { id: string; kind?: 'unit-op'; request: { contract: unknown; position?: { x: number; y: number } } }
  | { id: string; kind: 'stream'; request: StreamRequest }
  /** A whole unit, built by the MCP server: a standard one, a feed or outlet, or one from the community library. */
  | { id: string; kind: 'node'; request: { node: unknown; position?: { x: number; y: number }; source?: string } }
  /** A change to what is on the flowsheet: settings, a rename, a removal. */
  | { id: string; kind: 'edit'; request: FlowsheetEdit };

/** To the right of everything on the canvas, level with the flowsheet's middle. */
function placeNextTo(graph: ProcessGraph): { x: number; y: number } {
  if (graph.nodes.length === 0) return { x: 200, y: 200 };
  const xs = graph.nodes.map((n) => n.position.x);
  const ys = graph.nodes.map((n) => n.position.y);
  return { x: Math.max(...xs) + 320, y: Math.round(ys.reduce((a, b) => a + b, 0) / ys.length) };
}

export interface BridgeArrival {
  name: string;
  at: number;
}

export function useMcpBridge(
  projectName: string,
  graph: ProcessGraph,
  insertNode: (node: ProcessNode) => void,
  insertEdge: (edge: ProcessEdge) => void,
  replaceGraph: (graph: ProcessGraph) => void
): { lastArrival: BridgeArrival | null; dismiss: () => void } {
  const [lastArrival, setLastArrival] = useState<BridgeArrival | null>(null);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const insertRef = useRef(insertNode);
  insertRef.current = insertNode;
  const insertEdgeRef = useRef(insertEdge);
  insertEdgeRef.current = insertEdge;
  const replaceRef = useRef(replaceGraph);
  replaceRef.current = replaceGraph;

  // Share the open flowsheet, a moment after it stops changing.
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    const t = window.setTimeout(() => {
      invokeTauriCommand('bridge_set_flowsheet', { flowsheet: { projectName, graph } }).catch(() => {
        // An older shell without the bridge: nothing to share with.
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [projectName, graph]);

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let stopped = false;
    let timer = 0;

    // What each request changed, before React re-renders: a unit and a stream
    // to it can arrive in the same poll.
    const applyLocally = (change: { node?: ProcessNode; edge?: ProcessEdge }) => {
      const g = graphRef.current;
      const withNode = change.node ? { ...g, nodes: [...g.nodes, change.node] } : g;
      graphRef.current = change.edge ? addStreamToGraph(withNode, change.edge) : withNode;
    };

    const handleStream = (request: StreamRequest) => {
      const plan = planStream(graphRef.current, request);
      if (!plan.ok) return { added: false, error: plan.error, ...(plan.hint ? { hint: plan.hint } : {}) };
      insertEdgeRef.current(plan.edge);
      applyLocally({ edge: plan.edge });
      window.dispatchEvent(
        new CustomEvent(MCP_ACTIVITY_EVENT, {
          detail: { name: `Stream: ${plan.from.name} → ${plan.to.name}`, nodeId: plan.to.id, at: Date.now() }
        })
      );
      return {
        added: true,
        edgeId: plan.edge.id,
        from: plan.from,
        to: plan.to,
        carries: plan.carries,
        message: `Piped ${plan.from.name} (${plan.from.port}) into ${plan.to.name} (${plan.to.port}); it carries ${plan.carries}.`
      };
    };

    const handleNode = (request: { node: unknown; position?: { x: number; y: number }; source?: string }) => {
      const parsed = ProcessNodeSchema.safeParse(request.node);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return { added: false, error: `Not a unit ProcessForge can place: ${issue?.path.join('.') || 'node'}: ${issue?.message ?? 'invalid'}.` };
      }
      const g = graphRef.current;
      // A fresh id if it would clash, so a second pump is a second pump.
      const clash = g.nodes.some((n) => n.id === parsed.data.id);
      const node: ProcessNode = {
        ...parsed.data,
        id: clash ? `${parsed.data.id}-${Date.now().toString(36)}` : parsed.data.id,
        position: request.position ?? placeNextTo(g)
      };
      insertRef.current(node);
      applyLocally({ node });
      setLastArrival({ name: node.name, at: Date.now() });
      window.dispatchEvent(new CustomEvent(MCP_ACTIVITY_EVENT, { detail: { name: node.name, nodeId: node.id, at: Date.now() } }));
      return {
        added: true,
        nodeId: node.id,
        name: node.name,
        kind: node.kind,
        inlets: node.inputs.map((p) => ({ id: p.id, name: p.name, carries: p.flowDimension === 'DISCRETE_CONTAINER' ? 'items' : 'liquid' })),
        outlets: node.outputs.map((p) => ({ id: p.id, name: p.name, carries: p.flowDimension === 'DISCRETE_CONTAINER' ? 'items' : 'liquid' })),
        message: `Added "${node.name}" to the flowsheet "${projectName}". Pipe it in with add_stream (its id is ${node.id}).`
      };
    };

    // Same rules as the what-if tool (protocol/edit.ts); a rejected edit changes nothing.
    const handleEdit = (request: FlowsheetEdit) => {
      const r = applyFlowsheetEdit(graphRef.current, request);
      if (!r.ok) return { changed: false, error: r.error };
      replaceRef.current(r.graph);
      graphRef.current = r.graph;
      window.dispatchEvent(
        new CustomEvent(MCP_ACTIVITY_EVENT, {
          detail: { name: r.message.replace(/\.$/, ''), nodeId: request.op === 'update-unit' ? r.unit?.id : undefined, at: Date.now() }
        })
      );
      return {
        changed: true,
        message: `${r.message} Undo is on the canvas.`,
        ...(r.unit ? { unit: r.unit } : {}),
        ...(r.changes ? { changes: r.changes } : {}),
        ...(r.removedStreams ? { removedStreams: r.removedStreams } : {}),
        ...(r.warnings ? { warnings: r.warnings } : {})
      };
    };

    const handle = async (item: PendingRequest) => {
      if (item.kind === 'stream') return handleStream(item.request);
      if (item.kind === 'edit') return handleEdit(item.request);
      if (item.kind === 'node') return handleNode(item.request);
      const verdict = executeValidateUnitOp({ contract: item.request.contract });
      if (verdict.verdict !== 'ACCEPTED') {
        return {
          added: false,
          verdict: verdict.verdict,
          gates: verdict.gates,
          revisionGuidance: verdict.revisionGuidance
        };
      }
      const contract = UnitOpContractSchema.parse(item.request.contract);
      const node = contractToProcessNode(contract, { position: item.request.position ?? placeNextTo(graphRef.current) });
      insertRef.current(node);
      applyLocally({ node });
      saveUnitOp(contract, 'mcp');
      setLastArrival({ name: contract.name, at: Date.now() });
      // The assistant panel lists what the MCP client has done.
      window.dispatchEvent(new CustomEvent(MCP_ACTIVITY_EVENT, { detail: { name: contract.name, nodeId: node.id, at: Date.now() } }));
      return {
        added: true,
        nodeId: node.id,
        name: contract.name,
        ports: [...node.inputs, ...node.outputs].map((p) => p.id),
        message: `Added "${contract.name}" to the flowsheet "${projectName}". Pipe it in with add_stream (its id is ${node.id}), or on the canvas; its nozzles are where the drawing put them.`
      };
    };

    const tick = async () => {
      try {
        const items = await invokeTauriCommand<PendingRequest[]>('bridge_take_pending');
        for (const item of items) {
          let result: unknown;
          try {
            result = await handle(item);
          } catch (e) {
            result = { added: false, error: (e as Error).message };
          }
          await invokeTauriCommand('bridge_report', { id: item.id, result });
        }
      } catch {
        // No bridge in this shell (older version, or it failed to start): stop asking.
        stopped = true;
      }
      if (!stopped) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
    // projectName only feeds the message; the loop itself runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback(() => setLastArrival(null), []);
  return { lastArrival, dismiss };
}
