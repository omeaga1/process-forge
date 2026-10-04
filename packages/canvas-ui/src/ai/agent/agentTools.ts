import {
  addStreamToGraph,
  applyFlowsheetEdit,
  contractToProcessNode,
  planStream,
  resolveUnit,
  type FlowsheetEdit,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { FORGE_TOOLS, inputSchemaFor, portsOf, type AddUnitOptions, type ForgeTool, type ToolHost } from '@process-forge/tools';
import { communityApiUrl } from '../../marketplace/communityLibraryClient.js';
import { saveUnitOp } from '../../library/savedUnitOps.js';
import type { SourcedDecisionProvider } from './jevProvider.js';

/**
 * The in-app assistant's tools: the same tools an MCP client gets, from the
 * one registry in @process-forge/tools, run against the flowsheet open in the
 * studio instead of over the desktop bridge. Same names, same rules, same
 * answers, so a model behaves the same here as in Claude Desktop.
 *
 * `access` decides what needs the engineer: READ tools change nothing (reading,
 * simulating, what-ifs, checking a design) and run freely; WRITE tools change
 * the flowsheet and run only after the engineer approves that call.
 */

export interface AgentHost {
  /** The flowsheet as it is now. */
  getGraph(): ProcessGraph;
  /** Replaces the flowsheet (undoable on the canvas). */
  commit(next: ProcessGraph): void;
  /** Opens the publish dialog for a unit, filled in; the engineer decides there. */
  requestPublish?(nodeId: string, suggestion: { description?: string; category?: string; tags?: string[] }): void;
}

export type ToolAccess = 'read' | 'write';

/** What a tool can use besides the flowsheet: the decision model for design checks. */
export interface AgentContext {
  decider: SourcedDecisionProvider;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  access: ToolAccess;
  /** One line for the approval card and the activity list. */
  summarize(args: Record<string, any>, graph: ProcessGraph): string;
  run(args: Record<string, any>, host: AgentHost, ctx: AgentContext): Promise<unknown> | unknown;
}

/** To the right of everything on the canvas, level with its middle (as the MCP bridge places units). */
function placeNextTo(graph: ProcessGraph): { x: number; y: number } {
  if (graph.nodes.length === 0) return { x: 200, y: 200 };
  const xs = graph.nodes.map((n) => n.position.x);
  const ys = graph.nodes.map((n) => n.position.y);
  return { x: Math.max(...xs) + 320, y: Math.round(ys.reduce((a, b) => a + b, 0) / ys.length) };
}

/** Adds a unit, and pipes it in when asked, in one change. */
function place(host: AgentHost, node: ProcessNode, options: AddUnitOptions) {
  let g = host.getGraph();
  const clash = g.nodes.some((n) => n.id === node.id);
  const placed: ProcessNode = { ...node, id: clash ? `${node.id}-${Date.now().toString(36)}` : node.id, position: options.position ?? placeNextTo(g) };
  g = { ...g, nodes: [...g.nodes, placed] };
  const piped: string[] = [];
  const problems: string[] = [];
  for (const [from, to] of [
    [options.connectFrom, placed.id],
    [placed.id, options.connectTo]
  ] as const) {
    if (!from || !to) continue;
    const plan = planStream(g, { from, to });
    if (plan.ok) {
      g = addStreamToGraph(g, plan.edge);
      piped.push(`${plan.from.name} → ${plan.to.name} (${plan.carries})`);
    } else problems.push(plan.error);
  }
  host.commit(g);
  return {
    success: true,
    added: true,
    nodeId: placed.id,
    name: placed.name,
    ...portsOf(placed),
    ...(piped.length ? { piped } : {}),
    ...(problems.length ? { notPiped: problems } : {})
  };
}

function edit(host: AgentHost, e: FlowsheetEdit) {
  const r = applyFlowsheetEdit(host.getGraph(), e);
  if (!r.ok) return { success: false, changed: false, error: r.error };
  host.commit(r.graph);
  return { success: true, changed: true, message: r.message, ...(r.changes ? { changes: r.changes } : {}), ...(r.warnings ? { warnings: r.warnings } : {}) };
}

/** The studio as a host for the shared tools: the canvas's own flowsheet, changed in place. */
export function studioHost(host: AgentHost, ctx: AgentContext): ToolHost {
  return {
    surface: 'studio',
    readOpen: async () => ({ graph: host.getGraph() }),
    addUnit: async (node, options) => place(host, node, options),
    addDesignedUnit: async (contract, options) => {
      saveUnitOp(contract, 'designed');
      return place(host, contractToProcessNode(contract), options);
    },
    addStream: async (s) => {
      const plan = planStream(host.getGraph(), s);
      if (!plan.ok) return { success: false, added: false, error: plan.error, ...(plan.hint ? { hint: plan.hint } : {}) };
      host.commit(addStreamToGraph(host.getGraph(), plan.edge));
      return { success: true, added: true, from: plan.from, to: plan.to, carries: plan.carries };
    },
    edit: async (e) => edit(host, e),
    requestPublish: async (request) => {
      const found = resolveUnit(host.getGraph(), request.unit);
      if (typeof found === 'string') return { success: false, requested: false, error: found };
      if (!host.requestPublish) return { success: false, requested: false, error: 'Publishing is not available here.' };
      host.requestPublish(found.id, {
        ...(request.description ? { description: request.description } : {}),
        ...(request.category ? { category: request.category } : {}),
        ...(request.tags ? { tags: request.tags } : {})
      });
      return { success: true, requested: true, published: false, message: `The publish dialog for "${found.name}" is open; the engineer decides there.` };
    },
    decider: ctx.decider,
    communityApiBase: communityApiUrl('')
  };
}

const asAgentTool = (t: ForgeTool): AgentTool => ({
  name: t.name,
  description: t.description,
  parameters: inputSchemaFor(t, 'studio'),
  access: t.access,
  summarize: (args, graph) => t.summarize(args, graph),
  run: (args, host, ctx) => t.run(args, studioHost(host, ctx))
});

export const AGENT_TOOLS: AgentTool[] = FORGE_TOOLS.map(asAgentTool);

export const findAgentTool = (name: string): AgentTool | undefined => AGENT_TOOLS.find((t) => t.name === name);
