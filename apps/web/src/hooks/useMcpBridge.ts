import { useCallback, useEffect, useRef, useState } from 'react';
import {
  executeValidateUnitOp,
  UnitOpContractSchema,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { isTauriEnvironment, invokeTauriCommand } from '../components/UpdateNotificationBanner.js';
import { contractToProcessNode } from '../unitop/contractToNode.js';

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

interface PendingUnitOp {
  id: string;
  request: { contract: unknown; position?: { x: number; y: number } };
}

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
  insertNode: (node: ProcessNode) => void
): { lastArrival: BridgeArrival | null; dismiss: () => void } {
  const [lastArrival, setLastArrival] = useState<BridgeArrival | null>(null);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const insertRef = useRef(insertNode);
  insertRef.current = insertNode;

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

    const handle = async (item: PendingUnitOp) => {
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
      setLastArrival({ name: contract.name, at: Date.now() });
      // The assistant panel lists what the MCP client has done.
      window.dispatchEvent(new CustomEvent(MCP_ACTIVITY_EVENT, { detail: { name: contract.name, nodeId: node.id, at: Date.now() } }));
      return {
        added: true,
        nodeId: node.id,
        name: contract.name,
        ports: [...node.inputs, ...node.outputs].map((p) => p.id),
        message: `Added "${contract.name}" to the flowsheet "${projectName}". Pipe it up on the canvas; its nozzles are where the drawing put them.`
      };
    };

    const tick = async () => {
      try {
        const items = await invokeTauriCommand<PendingUnitOp[]>('bridge_take_pending');
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
