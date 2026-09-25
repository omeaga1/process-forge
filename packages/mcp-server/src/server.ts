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

import { executeSimulateLine } from './tools/simulateLine.js';
import { executeDiagnoseBottlenecks } from './tools/diagnoseBottlenecks.js';
import { executeQueryUnitSubAgent } from './tools/queryUnitSubAgent.js';
import { executePackageUnitOp } from './tools/packageUnitOp.js';
import { executeForgeEquipmentDrawing } from './tools/forgeEquipmentDrawing.js';
import { executeDesignUnitOp } from './tools/designUnitOp.js';
import { executeValidateUnitOp } from './tools/validateUnitOp.js';
import { executeAddUnitOpToFlowsheet, executeGetOpenFlowsheet, executeAddStream, executeFlowsheetEdit } from './tools/desktopBridge.js';
import { executeListStandardUnitOps, executeAddStandardUnitOp } from './tools/standardUnitOps.js';
import { executeSearchCommunityUnitOps, executeAddCommunityUnitOp } from './tools/communityLibrary.js';
import { executeCompareScenarios } from './tools/compareScenarios.js';
import { resolveGraph, type ResolvedGraph } from './tools/graphSource.js';
import { AVAILABLE_TEMPLATES } from './templates.js';
import { PROMPTS, renderPrompt } from './prompts.js';

export const SERVER_VERSION = '0.5.0';

/**
 * Sent to every client at connect time (the MCP `instructions` field), so a
 * model that has never seen ProcessForge knows which tool comes first.
 */
export const SERVER_INSTRUCTIONS = `ProcessForge designs and simulates process and packaging lines (reactors, tanks, pumps, heat exchangers, fillers, conveyors, labelers, palletizers). The simulation engine is deterministic: every number it returns is computed, not guessed, so quote its results rather than estimating.

Typical workflow:
1. Read the line. get_open_flowsheet returns what the engineer has open in ProcessForge Desktop. simulate_process_line, diagnose_bottlenecks and compare_scenarios use that open flowsheet automatically when you pass no graph or templateName; if the app is not running they fall back to a demo line and say so in "source".
2. Find the limit. diagnose_bottlenecks is instant (static capacities); simulate_process_line runs the line over time (throughput, starved/blocked time, OEE, liquid levels, temperatures, heat duty).
3. Test changes before making them. compare_scenarios runs the same line with settings changed (e.g. a bigger pump, a second filler nozzle count, a larger reactor jacket) and reports the difference. Nothing on the flowsheet changes.
4. Build. Prefer standard equipment: list_standard_unit_ops, then add_standard_unit_op. Next, search_community_unit_ops / add_community_unit_op (community listings are unreviewed; say so). Only for equipment neither has, design one: design_unit_op gives the brief, you write a UnitOpContract, validate_unit_op checks it, add_unit_op_to_flowsheet places it. Connect units with add_stream (by id, name or tag like P-101). Change an existing unit with update_unit; remove_unit and remove_stream delete, so confirm with the engineer first.
5. Re-simulate after changes and report what moved.

Units: liquid in gal/min and gallons, items per minute, temperatures in °C, duty in kW. Tools that change the flowsheet need ProcessForge Desktop running on this computer; every other tool works without it.`;

type Json = Record<string, unknown>;

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run: (args: Json) => Promise<unknown> | unknown;
}

const templateNames = Object.keys(AVAILABLE_TEMPLATES);

const graphSourceProps = {
  graph: { type: 'object', description: 'A ProcessGraph to use. Omit to use the flowsheet open in ProcessForge Desktop.' },
  templateName: { type: 'string', enum: templateNames, description: 'A built-in line to use instead (see list_digital_twin_templates).' }
};

const position = {
  type: 'object',
  description: 'Optional canvas position { x, y }. By default it goes to the right of the flowsheet.',
  properties: { x: { type: 'number' }, y: { type: 'number' } }
};

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

/** Where the graph came from, on the front of a result. */
const withSource = (r: ResolvedGraph, result: object) => ({
  source: r.source,
  ...(r.note ? { sourceNote: r.note } : {}),
  ...result
});

export const TOOLS: ToolDef[] = [
  {
    name: 'simulate_process_line',
    title: 'Simulate the line',
    description:
      'Runs the deterministic simulation of a line over time and returns throughput, units finished and scrapped, per-unit starved and blocked time, liquid gallons and levels, temperatures and heat duty, and the bottleneck with advice. Uses the flowsheet open in ProcessForge Desktop unless you pass graph or templateName ("source" in the result says which). Liquid carries a temperature: a heat exchanger with targetTemperatureCelsius moves the flow toward it within its dutyKw, and a batch reactor with jacketDutyKw heats each batch to its fluid.temperatureCelsius before reacting, which lengthens the batch.',
    inputSchema: {
      type: 'object',
      properties: {
        ...graphSourceProps,
        durationMinutes: { type: 'number', description: 'Simulated time in minutes (default 30). Use 120 or more for lines with batch reactors.' }
      }
    },
    annotations: READ,
    run: async (args) => {
      const r = await resolveGraph(args as never);
      return withSource(r, executeSimulateLine({ graph: r.graph, durationMinutes: args.durationMinutes as number | undefined }));
    }
  },
  {
    name: 'diagnose_bottlenecks',
    title: 'Find the bottleneck',
    description:
      'Instant static check of a line: port mismatches (liquid piped into an items inlet and the like), each unit\'s capacity, the bottleneck and what to change. Uses the flowsheet open in ProcessForge Desktop unless you pass graph or templateName.',
    inputSchema: { type: 'object', properties: graphSourceProps },
    annotations: READ,
    run: async (args) => {
      const r = await resolveGraph(args as never);
      return withSource(r, executeDiagnoseBottlenecks({ graph: r.graph }));
    }
  },
  {
    name: 'compare_scenarios',
    title: 'Compare what-if scenarios',
    description:
      'What-if analysis: simulates the line as it is, then once per scenario with some unit settings changed, all on the same random seed, and reports throughput, liquid output, the bottleneck and whether it moved, against the baseline. Nothing on the flowsheet changes, so use it before recommending or making a change. Name units by id, name or tag; settings by the names get_open_flowsheet or list_standard_unit_ops show (dotted names reach nested settings, e.g. "fluid.temperatureCelsius"). Uses the open flowsheet unless you pass graph or templateName.',
    inputSchema: {
      type: 'object',
      properties: {
        ...graphSourceProps,
        scenarios: {
          type: 'array',
          description: 'Up to 8 scenarios, e.g. [{ "name": "Bigger pump", "changes": [{ "unit": "P-102", "parameters": { "designFlowRateGpm": 80 } }] }].',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              changes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    unit: { type: 'string', description: 'Unit id, name or tag.' },
                    parameters: { type: 'object', description: 'Settings to set on it.' }
                  },
                  required: ['unit', 'parameters']
                }
              }
            },
            required: ['changes']
          }
        },
        durationMinutes: { type: 'number', description: 'Simulated minutes per run (default 60).' }
      },
      required: ['scenarios']
    },
    annotations: READ,
    run: async (args) => {
      const r = await resolveGraph(args as never);
      return withSource(r, executeCompareScenarios(r.graph, args as never));
    }
  },
  {
    name: 'get_open_flowsheet',
    title: 'Read the open flowsheet',
    description:
      "Reads the flowsheet open in the ProcessForge desktop app on this computer: its units with their settings and ports, and the streams between them. Start here when the engineer talks about \"my line\". Requires ProcessForge Desktop to be running.",
    inputSchema: { type: 'object', properties: {} },
    annotations: READ,
    run: () => executeGetOpenFlowsheet()
  },
  {
    name: 'list_standard_unit_ops',
    title: 'List standard equipment',
    description:
      "Lists the equipment that ships with ProcessForge (the app's Standard palette): pumps, tanks, batch reactors, heat exchangers, separators, fillers, conveyors, labelers, palletizers, and the Feed, Product, Byproduct and Waste arrows that mark where material enters and leaves a flowsheet. Each comes with its ports (liquid or items) and its settings with default values. Use these before designing a new unit op: a standard unit is already modelled by the simulation.",
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Optional words to filter by, such as "tank" or "waste".' } } },
    annotations: READ,
    run: (args) => executeListStandardUnitOps(args as never)
  },
  {
    name: 'add_standard_unit_op',
    title: 'Add standard equipment',
    description:
      "Places a standard unit, or a feed, product, byproduct or waste arrow, on the flowsheet open in the ProcessForge desktop app, with its default settings unless you change them, and optionally pipes it in. Feeds supply what the line takes (or up to supplyRate); only Product outlets count as the line's output; Byproduct and Waste are totalled apart. A feed or outlet takes on the kind (liquid or items) of the unit it is piped to. Requires ProcessForge Desktop 0.1.30 or later to be running.",
    inputSchema: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: 'Catalog id from list_standard_unit_ops: pump, surge-tank, batch-reactor, heat-exchanger, separator, rotary-filler, conveyor, labeler, palletizer, feed, product, byproduct, waste.' },
        name: { type: 'string', description: 'Optional name, e.g. "Transfer Pump P-102". A tag like P-102 lets add_stream find it.' },
        parameters: { type: 'object', description: 'Optional settings to change, by the names list_standard_unit_ops gives, e.g. { "designFlowRateGpm": 80 }.' },
        material: { type: 'string', description: 'Feeds and outlets: what the stream is, e.g. "Latex base" or "Rejected cans".' },
        supplyRate: { type: 'number', description: 'Feeds: the most it supplies, gal/min for liquid or items/min. Omit or 0 to supply whatever the line takes.' },
        composition: {
          type: 'object',
          description: 'Liquid feeds, tanks and reactors: what the liquid is made of, as mass fractions by component, e.g. { "water": 0.88, "sugar": 0.12 }. Designed units read them as inlet.x.<name>, react them and separate them.'
        },
        carries: { type: 'string', enum: ['liquid', 'items'], description: 'Feeds and outlets: optional; by default it matches the first unit it is piped to.' },
        connectFrom: { type: 'string', description: 'Optional: a unit (id, name or tag) to pipe into the new one, as add_stream would.' },
        connectTo: { type: 'string', description: 'Optional: a unit to pipe the new one into.' },
        position
      },
      required: ['unit']
    },
    annotations: WRITE,
    run: (args) => executeAddStandardUnitOp(args as never)
  },
  {
    name: 'add_stream',
    title: 'Pipe two units together',
    description:
      'Pipes one unit into another on the flowsheet open in the ProcessForge desktop app: a stream from an outlet of "from" to an inlet of "to". Name units by id, name or tag (from get_open_flowsheet). Ports are optional: by default the first free outlet and inlet that fit are used. A stream carries liquid or whole items, and the app refuses one that joins the two, a unit to itself, or a duplicate, and says why. The line simulation follows the pipes, so this is how a new unit joins the line. Requires ProcessForge Desktop to be running.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'The unit the stream leaves: id, name, or tag (e.g. ST-200).' },
        to: { type: 'string', description: 'The unit the stream enters.' },
        fromPort: { type: 'string', description: 'Optional outlet on "from", by port id or name.' },
        toPort: { type: 'string', description: 'Optional inlet on "to", by port id or name.' }
      },
      required: ['from', 'to']
    },
    annotations: WRITE,
    run: (args) => executeAddStream(args as never)
  },
  {
    name: 'update_unit',
    title: 'Change a unit\'s settings',
    description:
      'Changes settings of one unit on the flowsheet open in ProcessForge Desktop, or renames it. Name the unit by id, name or tag; settings by the names get_open_flowsheet shows (dotted names reach nested ones, e.g. "fluid.temperatureCelsius"). A number stays a number. Returns each change with its old and new value. Test a change with compare_scenarios first when its effect matters. Requires ProcessForge Desktop 0.1.33 or later.',
    inputSchema: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: 'The unit: id, name or tag (e.g. P-102).' },
        parameters: { type: 'object', description: 'Settings to set, e.g. { "designFlowRateGpm": 80 }.' },
        name: { type: 'string', description: 'Optional new name. Keep a tag like P-102 in it so add_stream can find it.' }
      },
      required: ['unit']
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: (args) => executeFlowsheetEdit({ op: 'update-unit', ...(args as { unit: string }) })
  },
  {
    name: 'remove_unit',
    title: 'Remove a unit',
    description:
      'Removes one unit, and every stream to or from it, from the flowsheet open in ProcessForge Desktop. The engineer can undo it in the app, but confirm with them before removing anything they did not ask to remove. Requires ProcessForge Desktop 0.1.33 or later.',
    inputSchema: {
      type: 'object',
      properties: { unit: { type: 'string', description: 'The unit: id, name or tag.' } },
      required: ['unit']
    },
    annotations: { ...WRITE, destructiveHint: true },
    run: (args) => executeFlowsheetEdit({ op: 'remove-unit', unit: String(args.unit ?? '') })
  },
  {
    name: 'remove_stream',
    title: 'Remove a stream',
    description:
      'Removes one stream (pipe or conveyor link) from the flowsheet open in ProcessForge Desktop: by its id, or by the units at its ends. The units stay. Requires ProcessForge Desktop 0.1.33 or later.',
    inputSchema: {
      type: 'object',
      properties: {
        stream: { type: 'string', description: 'The stream id, from get_open_flowsheet.' },
        from: { type: 'string', description: 'Or: the unit it leaves (id, name or tag)...' },
        to: { type: 'string', description: '...and the unit it enters.' }
      }
    },
    annotations: { ...WRITE, destructiveHint: true },
    run: (args) => executeFlowsheetEdit({ op: 'remove-stream', ...(args as object) })
  },
  {
    name: 'search_community_unit_ops',
    title: 'Search the community library',
    description:
      'Searches the ProcessForge community library: unit ops other engineers have published from the app, such as OEM fillers, case packers and mixers. Public and read-only. Listings are what their authors wrote; ProcessForge does not review or certify them, so say so when you suggest one.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to search names, descriptions and tags for. Omit to list everything.' },
        category: { type: 'string', enum: ['PACKAGING', 'FLUID_PROCESSING', 'MATERIAL_HANDLING', 'QUALITY'] }
      }
    },
    annotations: { ...READ, openWorldHint: true },
    run: (args) => executeSearchCommunityUnitOps(args as never)
  },
  {
    name: 'add_community_unit_op',
    title: 'Add a community unit',
    description:
      'Places a unit from the community library (by its id from search_community_unit_ops) on the flowsheet open in the ProcessForge desktop app, as its author published it, and optionally pipes it in. Requires ProcessForge Desktop 0.1.30 or later to be running.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The listing id, e.g. plugin-serac-10-filler.' },
        name: { type: 'string', description: 'Optional name for it on this flowsheet.' },
        connectFrom: { type: 'string', description: 'Optional: a unit (id, name or tag) to pipe into the new one, as add_stream would.' },
        connectTo: { type: 'string', description: 'Optional: a unit to pipe the new one into.' },
        position
      },
      required: ['id']
    },
    annotations: { ...WRITE, openWorldHint: true },
    run: (args) => executeAddCommunityUnitOp(args as never)
  },
  {
    name: 'design_unit_op',
    title: 'Brief for designing a unit op',
    description:
      'Returns everything needed to author a UnitOpContract for a unit operation described in natural language: the target schema, the restricted expression grammar and its complete function list, the names the engine supplies at evaluation time, a complete worked example, and the upstream and downstream stream conditions that constrain the design (from the graph you pass, or else the flowsheet open in ProcessForge Desktop). This tool performs no model inference of its own; you are the model. Author the contract from this brief, then submit it to validate_unit_op.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'The description of the unit operation in the engineer\'s own words (e.g. "a water-cooled belt where molten wax is poured on, solidifies, and is scraped off at the end").'
        },
        graph: { type: 'object', description: 'Optional ProcessGraph this unit op will join. Omit to use the open flowsheet, if any.' },
        targetNodeId: { type: 'string', description: 'Optional id of the node being designed or replaced within the graph.' },
        preferredMode: { type: 'string', enum: ['DISCRETE_CYCLE', 'CONTINUOUS_RATE', 'BATCH'], description: 'Optional expected behavior mode.' }
      },
      required: ['description']
    },
    annotations: READ,
    run: async (args) => {
      if (args.graph) return executeDesignUnitOp(args as never);
      // Context from the open flowsheet when there is one; never the demo line.
      const r = await resolveGraph({});
      return executeDesignUnitOp({ ...(args as Json), ...(r.source === 'open-flowsheet' ? { graph: r.graph } : {}) } as never);
    }
  },
  {
    name: 'validate_unit_op',
    title: 'Check a unit op design',
    description:
      "Checks a proposed UnitOpContract and returns the engine's verdict: schema conformance; every expression parses and every name resolves; every ERROR constraint holds at the contract's own parameter values; and the drawing works (every port has one nozzle on the drawing, every shape lies inside the viewBox). Returns ACCEPTED or REJECTED with the specific failures and what to change.",
    inputSchema: {
      type: 'object',
      properties: {
        contract: { type: 'object', description: 'The candidate UnitOpContract to check.' },
        parameterOverrides: {
          type: 'object',
          description: 'Optional parameter overrides, for asking whether the design holds at a different operating point (e.g. { "beltSpeedMPerMin": 20 }).'
        }
      },
      required: ['contract']
    },
    annotations: READ,
    run: (args) => executeValidateUnitOp(args as never)
  },
  {
    name: 'add_unit_op_to_flowsheet',
    title: 'Add a designed unit op',
    description:
      'Adds a unit operation you designed to the flowsheet open in the ProcessForge desktop app on this computer. The contract is validated here first (same gates as validate_unit_op) and again by the app; a rejected contract is not sent. The unit appears on the canvas with its own drawing and its pipes attached at the nozzles you drew. Requires ProcessForge Desktop to be running.',
    inputSchema: {
      type: 'object',
      properties: {
        contract: { type: 'object', description: 'An accepted UnitOpContract, including its drawing.' },
        position
      },
      required: ['contract']
    },
    annotations: WRITE,
    run: (args) => executeAddUnitOpToFlowsheet(args as never)
  },
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
      templates: Object.entries(AVAILABLE_TEMPLATES).map(([key, graph]) => ({
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

/** Resources: reference material a client can attach without a tool call. */
const RESOURCES = [
  { uri: 'processforge://guide/workflow', name: 'workflow', title: 'How to use ProcessForge', mimeType: 'text/markdown', description: 'Which tool to use when.' },
  { uri: 'processforge://catalog/standard', name: 'standard-catalog', title: 'Standard equipment', mimeType: 'application/json', description: 'Every standard unit with its ports and default settings.' },
  { uri: 'processforge://guide/unit-op-contract', name: 'unit-op-contract', title: 'Unit op contract guide', mimeType: 'application/json', description: 'Schema, expression grammar and a worked example for designing a unit op.' },
  { uri: 'processforge://flowsheet/open', name: 'open-flowsheet', title: 'Open flowsheet', mimeType: 'application/json', description: 'The flowsheet open in ProcessForge Desktop, when it is running.' },
  ...templateNames.map((key) => ({
    uri: `processforge://templates/${key}`,
    name: key,
    title: AVAILABLE_TEMPLATES[key]!.name,
    mimeType: 'application/json',
    description: 'A built-in example line, as a ProcessGraph.'
  }))
];

async function readResource(uri: string): Promise<{ mimeType: string; text: string }> {
  const json = (v: unknown) => ({ mimeType: 'application/json', text: JSON.stringify(v, null, 2) });
  if (uri === 'processforge://guide/workflow') return { mimeType: 'text/markdown', text: SERVER_INSTRUCTIONS };
  if (uri === 'processforge://catalog/standard') return json(executeListStandardUnitOps({}));
  if (uri === 'processforge://guide/unit-op-contract') return json(executeDesignUnitOp({ description: 'Any unit operation' } as never));
  if (uri === 'processforge://flowsheet/open') return json(await executeGetOpenFlowsheet());
  const t = uri.match(/^processforge:\/\/templates\/(.+)$/);
  if (t && AVAILABLE_TEMPLATES[t[1]!]) return json(AVAILABLE_TEMPLATES[t[1]!]);
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
