import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';

import { EXAMPLE_LINES, findExampleLine } from '@process-forge/protocol';
import { FORGE_TOOLS, inputSchemaFor, listStandardUnitOps, type ForgeTool } from '@process-forge/tools';
import { executeQueryUnitSubAgent } from './tools/queryUnitSubAgent.js';
import { executePackageUnitOp } from './tools/packageUnitOp.js';
import { executeForgeEquipmentDrawing } from './tools/forgeEquipmentDrawing.js';
import { executeDesignUnitOp } from './tools/designUnitOp.js';
import { bridgeHost, executeGetOpenFlowsheet } from './tools/desktopBridge.js';
import { PROMPTS, renderPrompt } from './prompts.js';

export const SERVER_VERSION = '0.8.0';

/**
 * Sent to every client at connect time (the MCP `instructions` field), so a
 * model that has never seen ProcessForge knows which tool comes first.
 */
export const SERVER_INSTRUCTIONS = `ProcessForge designs and simulates process and packaging lines (reactors, tanks, pumps, heat exchangers, fillers, conveyors, labelers, palletizers). The simulation engine is deterministic: every number it returns is computed, not guessed, so quote its results rather than estimating.

Typical workflow:
1. Read the line. get_open_flowsheet returns what the engineer has open in ProcessForge Desktop. simulate_process_line, diagnose_bottlenecks and compare_scenarios use that open flowsheet automatically when you pass no graph or templateName; if the app is not running they fall back to a demo line and say so in "source".
2. Find the limit. diagnose_bottlenecks is instant (static capacities); simulate_process_line runs the line over time (throughput, starved/blocked time, OEE, liquid levels, temperatures, heat duty).
3. Test changes before making them. compare_scenarios runs the same line with settings changed (e.g. a bigger pump, a second filler nozzle count, a larger reactor jacket) and reports the difference. Nothing on the flowsheet changes.
4. Build. Prefer standard equipment: list_standard_unit_ops, then add_standard_unit_op. Next, search_community_unit_ops / add_community_unit_op (community listings are unreviewed; say so). Only for equipment neither has, design one: design_unit_op gives the brief, you write a UnitOpContract, validate_unit_op checks it, add_unit_op_to_flowsheet places it. Connect units with add_stream (by id, name or tag like P-101). Change an existing unit with update_unit; remove_unit and remove_stream delete, so confirm with the engineer first. To share a unit with others, publish_unit_op opens the publish dialog in the app for the engineer to confirm.
5. Re-simulate after changes and report what moved.

Units: liquid in gal/min and gallons (with kg alongside), items per minute, temperatures in °C, duty in kW. Every unit, standard or designed, runs on a contract the engine checks, units included. Tools that change the flowsheet need ProcessForge Desktop running on this computer; every other tool works without it.`;

type Json = Record<string, unknown>;

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run: (args: Json) => Promise<unknown> | unknown;
}

/**
 * How a shared tool reads to an MCP client: where the flowsheet comes from,
 * and that changing it needs the desktop app.
 */
function describeForMcp(t: ForgeTool): string {
  if (t.graphSource && t.name !== 'design_unit_op') {
    return `${t.description} Uses the flowsheet open in ProcessForge Desktop unless you pass graph or templateName ("source" in the result says which).`;
  }
  if (t.access === 'write' || t.name === 'publish_unit_op' || t.name === 'get_open_flowsheet' || t.name === 'list_flowsheets') return `${t.description} Requires ProcessForge Desktop to be running.`;
  return t.description;
}

/** The tools every surface shares (@process-forge/tools), on the desktop app over the bridge. */
const SHARED: ToolDef[] = FORGE_TOOLS.map((t) => ({
  name: t.name,
  title: t.title,
  description: describeForMcp(t),
  inputSchema: inputSchemaFor(t, 'mcp'),
  annotations: {
    readOnlyHint: t.readOnly ?? t.access === 'read',
    destructiveHint: Boolean(t.destructive),
    idempotentHint: Boolean(t.idempotent),
    openWorldHint: Boolean(t.openWorld)
  },
  run: (args) => t.run(args, bridgeHost)
}));

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/** Tools only an MCP client gets: drawing templates, presets, packaging and the example lines. */
const MCP_ONLY: ToolDef[] = [
  {
    name: 'forge_equipment_drawing',
    title: 'Template equipment drawing',
    description:
      'Picks a template equipment drawing (SVG, viewBox, nozzles, internals) from a fixed library of nine families by matching keywords in the description. For a unit op you are designing, draw it in the contract instead (see design_unit_op). Templates are pre-authored, with a few parameters (tray count, agitator type, bottom head style) interpolated from the description; unmatched descriptions return a generic vertical vessel.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Physical equipment description (e.g. "Distillation column with 8 sieve trays and overhead reflux condenser", "Jacketed CSTR with Rushton turbine").'
        },
        machineType: { type: 'string', description: 'Optional equipment classification or node kind.' },
        unitName: { type: 'string', description: 'Unit operation name or tag.' },
        includeNozzles: { type: 'boolean', description: 'Whether to calculate perimeter nozzle placement coordinates (default: true).' },
        templateFamily: {
          type: 'string',
          enum: ['column', 'reactor', 'exchanger', 'pump', 'cyclone', 'spray', 'sphere', 'drum', 'generic'],
          description:
            'Draw this template family instead of choosing one from the description. Use it when a previous call returned routing.decided = false and you know which of routing.alternatives the engineer meant.'
        }
      },
      required: ['description']
    },
    annotations: READ,
    run: (args) => executeForgeEquipmentDrawing(args as never)
  },
  {
    name: 'query_unit_subagent',
    title: 'Preset controls for a unit type',
    description:
      'Returns preset parameter controls and a starting configuration for a standard unit type (rotary filler, labeler, reactor, and so on). It uses fixed presets, not a model; to design a new unit, use design_unit_op.',
    inputSchema: {
      type: 'object',
      properties: {
        machineType: {
          type: 'string',
          enum: ['BATCH_REACTOR', 'SURGE_TANK', 'ROTARY_FILLER', 'CONVEYOR', 'LABELER', 'PALLETIZER', 'CUSTOM'],
          description: 'The physical kind of machine.'
        },
        unitName: { type: 'string', description: 'Display name or identifier of the unit operation (e.g. "RF-300 Rotary Filler").' },
        inquiry: { type: 'string', description: 'Engineering request or physical process modification requirement.' },
        currentConfig: { type: 'object', description: 'Current machine configuration object.' },
        upstreamContext: {
          type: 'object',
          properties: {
            flowRateGpm: { type: 'number' },
            viscosityCentipoise: { type: 'number' },
            densityGPerCm3: { type: 'number' },
            lineSpeedPpm: { type: 'number' }
          },
          description: 'Boundary parameters provided from upstream units.'
        }
      },
      required: ['machineType', 'unitName', 'inquiry']
    },
    annotations: READ,
    run: (args) => executeQueryUnitSubAgent(args as never)
  },
  {
    name: 'package_unit_op',
    title: 'Package a unit op',
    description:
      'Packages a unit op (its node definition and metadata) into a .pfu bundle for the community library or local import. It returns the bundle; it does not publish it.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'object', description: 'The complete ProcessNode schema.' },
        author: { type: 'string', description: 'Author name or organization.' },
        description: { type: 'string', description: 'Engineering description of the machine operation.' },
        category: { type: 'string', enum: ['FILLING', 'REACTION', 'PACKAGING', 'SEPARATION', 'CONVEYANCE', 'MATERIAL_HANDLING'] },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['node', 'author', 'description', 'category']
    },
    annotations: READ,
    run: (args) => executePackageUnitOp(args as never)
  },
  {
    name: 'list_digital_twin_templates',
    title: 'List example lines',
    description: 'Lists the built-in example lines, by the templateName the other tools take.',
    inputSchema: { type: 'object', properties: {} },
    annotations: READ,
    run: () => ({
      templates: Object.entries(EXAMPLE_LINES).map(([key, graph]) => ({
        templateKey: key,
        name: graph.name,
        facility: graph.metadata?.facility,
        productLine: graph.metadata?.productLine,
        nodesCount: graph.nodes.length,
        edgesCount: graph.edges.length
      }))
    })
  }
];

export const TOOLS: ToolDef[] = [...SHARED, ...MCP_ONLY];

const templateNames = Object.keys(EXAMPLE_LINES);

/** Resources: reference material a client can attach without a tool call. */
const RESOURCES = [
  { uri: 'processforge://guide/workflow', name: 'workflow', title: 'How to use ProcessForge', mimeType: 'text/markdown', description: 'Which tool to use when.' },
  { uri: 'processforge://catalog/standard', name: 'standard-catalog', title: 'Standard equipment', mimeType: 'application/json', description: 'Every standard unit with its ports and default settings.' },
  { uri: 'processforge://guide/unit-op-contract', name: 'unit-op-contract', title: 'Unit op contract guide', mimeType: 'application/json', description: 'Schema, expression grammar and a worked example for designing a unit op.' },
  { uri: 'processforge://flowsheet/open', name: 'open-flowsheet', title: 'Open flowsheet', mimeType: 'application/json', description: 'The flowsheet open in ProcessForge Desktop, when it is running.' },
  ...templateNames.map((key) => ({
    uri: `processforge://templates/${key}`,
    name: key,
    title: EXAMPLE_LINES[key]!.name,
    mimeType: 'application/json',
    description: 'A built-in example line, as a ProcessGraph.'
  }))
];

async function readResource(uri: string): Promise<{ mimeType: string; text: string }> {
  const json = (v: unknown) => ({ mimeType: 'application/json', text: JSON.stringify(v, null, 2) });
  if (uri === 'processforge://guide/workflow') return { mimeType: 'text/markdown', text: SERVER_INSTRUCTIONS };
  if (uri === 'processforge://catalog/standard') return json(listStandardUnitOps({}));
  if (uri === 'processforge://guide/unit-op-contract') return json(executeDesignUnitOp({ description: 'Any unit operation' } as never));
  if (uri === 'processforge://flowsheet/open') return json(await executeGetOpenFlowsheet());
  const t = uri.match(/^processforge:\/\/templates\/(.+)$/);
  const line = t ? findExampleLine(t[1]!) : undefined;
  if (line) return json(line);
  throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`);
}

/**
 * A result as text (for every client) and as structured content (for clients
 * that read it). A result that says success: false (a REJECTED design, a
 * refused pipe, the app not running) is still an answer, with its reason in
 * it; only a tool that threw is an MCP error.
 */
export function toolResult(result: unknown) {
  const structured = result && typeof result === 'object' && !Array.isArray(result) ? (result as Json) : { result };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: structured
  };
}

export async function callTool(name: string, args: Json = {}) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  try {
    return toolResult(await tool.run(args ?? {}));
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `ProcessForge: ${(err as Error)?.message || String(err)}` }]
    };
  }
}

export function createProcessForgeMcpServer(): Server {
  const server = new Server(
    { name: 'process-forge-mcp', title: 'ProcessForge', version: SERVER_VERSION },
    {
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: SERVER_INSTRUCTIONS
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
      name,
      title,
      description,
      inputSchema,
      annotations: { title, ...annotations }
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callTool(request.params.name, (request.params.arguments ?? {}) as Json)
  );

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPTS.map(({ name, title, description, arguments: a }) => ({ name, title, description, arguments: a }))
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const rendered = renderPrompt(request.params.name, (request.params.arguments ?? {}) as Record<string, string>);
    if (!rendered) throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${request.params.name}`);
    return rendered;
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { mimeType, text } = await readResource(request.params.uri);
    return { contents: [{ uri: request.params.uri, mimeType, text }] };
  });

  return server;
}

export async function runServer(): Promise<void> {
  const server = createProcessForgeMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ProcessForge MCP Server running on stdio');
}
