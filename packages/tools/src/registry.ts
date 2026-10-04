import {
  DESIGN_QUESTIONS,
  EQUIPMENT_CATEGORIES,
  EXAMPLE_LINES,
  STANDARD_EQUIPMENT_CATALOG,
  UnitOpContractSchema,
  checkDesignCompleteness,
  designChecklist,
  designStateOf,
  executeDesignUnitOp,
  executeValidateUnitOp,
  findStandardUnitOp,
  resolveUnit,
  type ProcessGraph
} from '@process-forge/protocol';
import { addCommunityUnitOp, addStandardUnitOp, COMMUNITY_CATEGORIES, listStandardUnitOps, portsOf, searchCommunityUnitOps } from './catalog.js';
import { resolveGraph, type ResolvedGraph } from './graphSource.js';
import type { DecisionSource, Surface, ToolHost } from './host.js';
import { compareScenarios, diagnoseBottlenecks, simulateLine } from './line.js';

/**
 * Every tool a model can call, defined once. The MCP server lists these to
 * MCP clients; the in-app assistant offers the same ones to the model it
 * runs. A host (host.ts) only says how to reach the flowsheet.
 *
 * `access`: READ tools change nothing and run freely; WRITE tools change the
 * flowsheet (in the app, each waits for the engineer's approval).
 */

type Json = Record<string, any>;

export interface ForgeTool {
  name: string;
  title: string;
  description: string;
  /** JSON Schema for the arguments. */
  inputSchema: Json;
  access: 'read' | 'write';
  /** Removes something: confirm with the engineer. */
  destructive?: boolean;
  /**
   * For MCP clients' readOnlyHint, when it differs from access: publish_unit_op
   * changes nothing itself (the engineer decides in a dialog, so the app asks no
   * approval) but it is not a read either.
   */
  readOnly?: boolean;
  /** Reaches past this computer (the community library). */
  openWorld?: boolean;
  idempotent?: boolean;
  /**
   * Takes `graph` / `templateName` (an MCP client can run it on a line it
   * passes or an example line); in the app it always works on the open
   * flowsheet.
   */
  graphSource?: boolean;
  /** One line for the approval card and the activity list. */
  summarize(args: Json, graph: ProcessGraph): string;
  run(args: Json, host: ToolHost): Promise<unknown>;
}

const unit = (description = 'A unit on the flowsheet: its id, name or tag (e.g. P-101).') => ({ type: 'string', description });
const position = {
  type: 'object',
  description: 'Optional canvas position { x, y }. By default it goes to the right of the flowsheet.',
  properties: { x: { type: 'number' }, y: { type: 'number' } }
};
const connect = {
  connectFrom: unit('Optional: a unit (id, name or tag) to pipe into the new one, as add_stream would.'),
  connectTo: unit('Optional: a unit to pipe the new one into.')
};

const nameOf = (graph: ProcessGraph, ref: unknown): string => {
  const n = typeof ref === 'string' ? resolveUnit(graph, ref) : null;
  return n && typeof n !== 'string' ? n.name : String(ref ?? '?');
};

/** Who decided a design's checklist or warnings, for the model and the engineer. */
const decidedBy = (d: DecisionSource) => (d.lastSource.by === 'jev' ? 'Jev (decision model)' : `offline heuristics${d.lastSource.reason ? ` (${d.lastSource.reason})` : ''}`);

/** Where the graph came from, on the front of a result. */
const withSource = (r: ResolvedGraph, result: object) => ({ source: r.source, ...(r.note ? { sourceNote: r.note } : {}), ...result });

const graphOf = (args: Json, host: ToolHost) => resolveGraph(host.surface === 'mcp' ? args : {}, host.readOpen);

/** The open flowsheet, compactly: units with their settings (contract parameters) and ports, and streams. */
function flowsheetSummary(graph: ProcessGraph, projectName?: string) {
  return {
    name: graph.name,
    ...(projectName ? { projectName } : {}),
    units: graph.nodes.map((n) => {
      const config = n.config as Record<string, unknown>;
      const contract = config.contract as { parameters: { name: string; value: number; unit: string }[] } | undefined;
      const settings = contract
        ? Object.fromEntries(contract.parameters.map((p) => [p.name, `${p.value} ${p.unit}`]))
        : Object.fromEntries(Object.entries(config).filter(([, v]) => typeof v === 'number' || typeof v === 'string'));
      return { id: n.id, name: n.name, kind: n.kind, ...(contract ? { designed: true } : {}), settings, ...portsOf(n) };
    }),
    streams: graph.edges.map((e) => ({ id: e.id, from: nameOf(graph, e.sourceNodeId), to: nameOf(graph, e.targetNodeId), carries: e.stream.type === 'CONTINUOUS_FLUID' ? 'liquid' : 'items' }))
  };
}

export const FORGE_TOOLS: ForgeTool[] = [
  // ── Reading the line
  {
    name: 'get_open_flowsheet',
    title: 'Read the open flowsheet',
    access: 'read',
    idempotent: true,
    description:
      'Reads the flowsheet the engineer has open: every unit with its id, kind, settings (for a unit running on its own contract, its parameters) and ports, and every stream. Start here when the engineer talks about "my line".',
    inputSchema: { type: 'object', properties: {} },
    summarize: () => 'Read the flowsheet',
    run: async (_a, host) => {
      const open = await host.readOpen();
      if ('error' in open) return { success: false, error: open.error };
      return { success: true, flowsheet: flowsheetSummary(open.graph, open.projectName), graph: host.surface === 'mcp' ? open.graph : undefined };
    }
  },
  {
    name: 'simulate_process_line',
    title: 'Simulate the line',
    access: 'read',
    idempotent: true,
    graphSource: true,
    description:
      'Runs the deterministic simulation of the line over time and returns throughput, units finished and scrapped, each unit\'s busy, starved, blocked and broken-down time, liquid in gallons and kg, temperatures, heat duty, constraints a unit\'s contract broke at the conditions it actually saw, and the bottleneck with advice. Nothing on the flowsheet changes.',
    inputSchema: {
      type: 'object',
      properties: {
        durationMinutes: { type: 'number', description: 'Simulated time in minutes (default 30, at most 1440). Use 120 or more for lines with batch units.' },
        seed: { type: 'number', description: 'Optional: replay a run with this seed.' }
      }
    },
    summarize: (a) => `Simulate ${a.durationMinutes ?? 30} min`,
    run: async (a, host) => {
      const r = await graphOf(a, host);
      return withSource(r, simulateLine(r.graph, Number(a.durationMinutes) || undefined, typeof a.seed === 'number' ? a.seed : undefined));
    }
  },
  {
    name: 'diagnose_bottlenecks',
    title: 'Find the bottleneck',
    access: 'read',
    idempotent: true,
    graphSource: true,
    description: "Instant static check of the line: port mismatches (liquid piped into an items inlet and the like), each unit's capacity, the bottleneck and what to change.",
    inputSchema: { type: 'object', properties: {} },
    summarize: () => 'Find the bottleneck',
    run: async (a, host) => {
      const r = await graphOf(a, host);
      return withSource(r, diagnoseBottlenecks(r.graph));
    }
  },
  {
    name: 'compare_scenarios',
    title: 'Compare what-if scenarios',
    access: 'read',
    idempotent: true,
    graphSource: true,
    description:
      'What-if analysis: simulates the line as it is, then once per scenario with some unit settings changed, all on the same random seed, and reports throughput, liquid output, the bottleneck and whether it moved, against the baseline. Nothing on the flowsheet changes, so use it before recommending or making a change. Name units by id, name or tag; settings by the names get_open_flowsheet or list_standard_unit_ops show (dotted names reach nested settings, e.g. "fluid.temperatureCelsius"); for a unit with its own contract, its parameters by name (a change that breaks the design is reported in warnings and not applied).',
    inputSchema: {
      type: 'object',
      properties: {
        scenarios: {
          type: 'array',
          description: 'Up to 8 scenarios, e.g. [{ "name": "Bigger pump", "changes": [{ "unit": "P-102", "parameters": { "designFlowRateGpm": 80 } }] }].',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              changes: {
                type: 'array',
                items: { type: 'object', properties: { unit: unit(), parameters: { type: 'object', description: 'Settings to set on it.' } }, required: ['unit', 'parameters'] }
              }
            },
            required: ['changes']
          }
        },
        durationMinutes: { type: 'number', description: 'Simulated minutes per run (default 60).' }
      },
      required: ['scenarios']
    },
    summarize: (a) => `Compare ${Array.isArray(a.scenarios) ? a.scenarios.length : 0} what-if scenario(s)`,
    run: async (a, host) => {
      const r = await graphOf(a, host);
      return withSource(r, compareScenarios(r.graph, a as never));
    }
  },

  // ── Finding equipment
  {
    name: 'list_standard_unit_ops',
    title: 'List standard equipment',
    access: 'read',
    idempotent: true,
    description:
      "Lists the equipment that ships with ProcessForge (the app's Standard palette), by category: feeds & outlets, transfer & storage, heat transfer, reaction, separation, and packaging & items. Each comes with its ports (liquid or items), its settings with default values and units, and how the simulation models it. Every unit runs on a contract: tune it with update_unit, or use it as the starting point for design_unit_op. Use these before designing a new unit.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional words to filter by, such as "tank" or "waste".' },
        category: { type: 'string', enum: EQUIPMENT_CATEGORIES.map((c) => c.id), description: 'Optional: one category only.' }
      }
    },
    summarize: (a) => `List standard equipment${a.query ? `: "${a.query}"` : ''}`,
    run: async (a) => listStandardUnitOps(a)
  },
  {
    name: 'search_community_unit_ops',
    title: 'Search the community library',
    access: 'read',
    idempotent: true,
    openWorld: true,
    description:
      'Searches the ProcessForge community library: unit ops other engineers have published from the app. Public and read-only. Listings are what their authors wrote; ProcessForge does not review or certify them, so say so when you suggest one.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to search names, descriptions and tags for. Omit to list everything.' },
        category: { type: 'string', enum: [...COMMUNITY_CATEGORIES] }
      }
    },
    summarize: (a) => `Search the community library${a.query ? `: "${a.query}"` : ''}`,
    run: async (a, host) => searchCommunityUnitOps(a, host.communityApiBase)
  },

  // ── Designing a unit
  {
    name: 'design_unit_op',
    title: 'Brief for designing a unit op',
    access: 'read',
    idempotent: true,
    graphSource: true,
    description:
      "Returns everything needed to author a UnitOpContract for a unit operation described in plain words: the schema, the expression language and its functions, the names the engine supplies, worked examples, the stream conditions at the unit's place in the open flowsheet, and a checklist of what a complete design of this unit carries. You are the model: write the contract from this brief, check it with validate_unit_op, fix what fails, then place it with add_unit_op_to_flowsheet.",
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What the unit is and does, in the engineer\'s words (e.g. "a water-cooled belt where molten wax is poured on, solidifies, and is scraped off").' },
        targetUnit: unit('Optional: a unit on the flowsheet it will connect to or replace, for the design stream.'),
        preferredMode: { type: 'string', enum: ['DISCRETE_CYCLE', 'CONTINUOUS_RATE', 'BATCH', 'STORAGE'], description: 'Optional expected behavior mode.' }
      },
      required: ['description']
    },
    summarize: (a) => `Get the design brief: ${String(a.description ?? '').slice(0, 60)}`,
    run: async (a, host) => {
      // Context from the line it was given, else the open flowsheet; never the demo line.
      const given = host.surface === 'mcp' && (a.graph || a.templateName) ? await graphOf(a, host) : null;
      const open = given ?? (await host.readOpen());
      const graph = 'graph' in open ? open.graph : undefined;
      const targetRef = a.targetUnit ?? a.targetNodeId;
      const target = graph && targetRef ? resolveUnit(graph, String(targetRef)) : null;
      const brief = executeDesignUnitOp({
        description: String(a.description ?? ''),
        ...(graph ? { graph } : {}),
        ...(target && typeof target !== 'string' ? { targetNodeId: target.id } : {}),
        ...(a.preferredMode ? { preferredMode: a.preferredMode } : {})
      });
      const profile = await host.decider.ask({ message: String(a.description ?? '') }, DESIGN_QUESTIONS);
      return { ...brief, designChecklist: { decidedBy: decidedBy(host.decider), include: designChecklist(profile) } };
    }
  },
  {
    name: 'validate_unit_op',
    title: 'Check a unit op design',
    access: 'read',
    idempotent: true,
    description:
      "The engine's verdict on a proposed UnitOpContract: schema; every expression parses, every name resolves and the units agree; every ERROR constraint holds at its own parameter values; and the drawing works (every port has a nozzle, every shape lies inside the viewBox). Returns ACCEPTED or REJECTED with the failures and what to change, plus completeness warnings: what a unit like this usually carries that the design leaves out.",
    inputSchema: {
      type: 'object',
      properties: {
        contract: { type: 'object', description: 'The candidate UnitOpContract.' },
        parameterOverrides: { type: 'object', description: 'Optional parameter overrides, to ask whether the design holds at another operating point (e.g. { "beltSpeedMPerMin": 20 }).' }
      },
      required: ['contract']
    },
    summarize: (a) => `Check the design "${a.contract?.name ?? 'unit'}" with the engine`,
    run: async (a, host) => {
      const verdict = executeValidateUnitOp({ contract: a.contract, ...(a.parameterOverrides ? { parameterOverrides: a.parameterOverrides } : {}) });
      const parsed = UnitOpContractSchema.safeParse(a.contract);
      if (!parsed.success) return verdict;
      // Consistency is the engine's verdict; completeness is a judgment about
      // what the unit is, so it comes back as warnings to address or explain.
      const profile = await host.decider.ask(designStateOf(parsed.data), DESIGN_QUESTIONS);
      return { ...verdict, completeness: { decidedBy: decidedBy(host.decider), warnings: checkDesignCompleteness(parsed.data, profile) } };
    }
  },

  // ── Changing the flowsheet
  {
    name: 'add_standard_unit_op',
    title: 'Add standard equipment',
    access: 'write',
    description:
      "Places a standard unit, or a feed, product, byproduct or waste arrow, on the open flowsheet, with its default settings unless you change them, and optionally pipes it in. Feeds supply what the line takes (or up to supplyRate); only Product outlets count as the line's output; Byproduct and Waste are totalled apart. A feed or outlet takes on the kind (liquid or items) of the unit it is piped to.",
    inputSchema: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: `Catalog id from list_standard_unit_ops: ${STANDARD_EQUIPMENT_CATALOG.map((i) => i.id).join(', ')}.` },
        name: { type: 'string', description: 'Optional name, e.g. "Transfer Pump P-102". A tag like P-102 lets add_stream find it.' },
        parameters: { type: 'object', description: 'Optional settings to change, by the names list_standard_unit_ops gives, e.g. { "designFlowRateGpm": 80 }.' },
        material: { type: 'string', description: 'Feeds and outlets: what the stream is, e.g. "Latex base" or "Rejected cans".' },
        supplyRate: { type: 'number', description: 'Feeds: the most it supplies, gal/min for liquid or items/min. Omit or 0 to supply whatever the line takes.' },
        composition: { type: 'object', description: 'Liquid feeds, tanks and reactors: mass fractions by component, e.g. { "water": 0.88, "sugar": 0.12 }.' },
        carries: { type: 'string', enum: ['liquid', 'items'], description: 'Feeds and outlets: optional; by default it matches the first unit it is piped to.' },
        ...connect,
        position
      },
      required: ['unit']
    },
    summarize: (a) =>
      `Add ${a.name ? `"${a.name}"` : `a ${findStandardUnitOp(String(a.unit ?? ''))?.title ?? a.unit}`}${a.connectFrom ? `, fed from ${a.connectFrom}` : ''}${a.connectTo ? `, into ${a.connectTo}` : ''}`,
    run: (a, host) => addStandardUnitOp(a as never, host)
  },
  {
    name: 'add_unit_op_to_flowsheet',
    title: 'Add a designed unit op',
    access: 'write',
    description:
      'Places a unit you designed (a UnitOpContract the engine ACCEPTED, with its drawing) on the open flowsheet, optionally piped in, and keeps it in My unit ops. It is validated first (the same gates as validate_unit_op); a rejected contract is not placed.',
    inputSchema: {
      type: 'object',
      properties: { contract: { type: 'object', description: 'An accepted UnitOpContract, including its drawing.' }, ...connect, position },
      required: ['contract']
    },
    summarize: (a) => `Add the designed unit "${a.contract?.name ?? 'unit'}"${a.connectFrom ? `, fed from ${a.connectFrom}` : ''}${a.connectTo ? `, into ${a.connectTo}` : ''}`,
    run: async (a, host) => {
      const verdict = executeValidateUnitOp({ contract: a.contract });
      if (verdict.verdict !== 'ACCEPTED') {
        return {
          success: false,
          added: false,
          verdict: verdict.verdict,
          gates: verdict.gates,
          revisionGuidance: verdict.revisionGuidance,
          nextStep: 'Fix the contract and call add_unit_op_to_flowsheet again (or validate_unit_op first).'
        };
      }
      const result = await host.addDesignedUnit(UnitOpContractSchema.parse(a.contract), {
        ...(a.position ? { position: a.position } : {}),
        ...(a.connectFrom ? { connectFrom: String(a.connectFrom) } : {}),
        ...(a.connectTo ? { connectTo: String(a.connectTo) } : {})
      });
      return { ...result, ...(verdict.gates.drawing.warnings.length ? { drawingWarnings: verdict.gates.drawing.warnings } : {}) };
    }
  },
  {
    name: 'add_community_unit_op',
    title: 'Add a community unit',
    access: 'write',
    openWorld: true,
    description: 'Places a unit from the community library (by its id from search_community_unit_ops) on the open flowsheet, as its author published it, and optionally pipes it in.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The listing id.' }, name: { type: 'string', description: 'Optional name for it on this flowsheet.' }, ...connect, position },
      required: ['id']
    },
    summarize: (a) => `Add the community unit ${a.id}`,
    run: (a, host) => addCommunityUnitOp(a as never, host)
  },
  {
    name: 'add_stream',
    title: 'Pipe two units together',
    access: 'write',
    description:
      'Pipes one unit into another on the open flowsheet: a stream from an outlet of "from" to an inlet of "to". Name units by id, name or tag. Ports are optional: by default the first free outlet and inlet that fit. A stream carries liquid or whole items, and one that joins the two, a unit to itself, or a duplicate is refused with the reason. The simulation follows the pipes, so this is how a new unit joins the line.',
    inputSchema: {
      type: 'object',
      properties: {
        from: unit('The unit the stream leaves: id, name, or tag (e.g. ST-200).'),
        to: unit('The unit the stream enters.'),
        fromPort: { type: 'string', description: 'Optional outlet on "from", by port id or name.' },
        toPort: { type: 'string', description: 'Optional inlet on "to", by port id or name.' }
      },
      required: ['from', 'to']
    },
    summarize: (a, g) => `Pipe ${nameOf(g, a.from)} into ${nameOf(g, a.to)}`,
    run: async (a, host) => {
      if (typeof a?.from !== 'string' || typeof a?.to !== 'string') {
        return { success: false, added: false, error: 'Give "from" and "to": a unit id, name or tag each. get_open_flowsheet lists them.' };
      }
      return host.addStream({ from: a.from, to: a.to, ...(a.fromPort ? { fromPort: String(a.fromPort) } : {}), ...(a.toPort ? { toPort: String(a.toPort) } : {}) });
    }
  },
  {
    name: 'update_unit',
    title: "Change a unit's settings",
    access: 'write',
    idempotent: true,
    description:
      "Changes settings of one unit on the open flowsheet, or renames it. Name the unit by id, name or tag; settings by the names get_open_flowsheet shows (dotted names reach nested ones, e.g. \"fluid.temperatureCelsius\"). For a unit with its own contract, a name that matches one of its parameters sets that parameter: it must lie in its declared range, and the change is refused if the design would then fail validate_unit_op. Returns each change with its old and new value. Test a change with compare_scenarios first when its effect matters.",
    inputSchema: {
      type: 'object',
      properties: {
        unit: unit(),
        parameters: { type: 'object', description: 'Settings to set, e.g. { "designFlowRateGpm": 80 }.' },
        name: { type: 'string', description: 'Optional new name. Keep a tag like P-102 in it so add_stream can find it.' }
      },
      required: ['unit']
    },
    summarize: (a, g) =>
      `Change ${nameOf(g, a.unit)}: ${[...Object.entries(a.parameters ?? {}).map(([k, v]) => `${k} → ${JSON.stringify(v)}`), ...(a.name ? [`rename to "${a.name}"`] : [])].join(', ')}`,
    run: (a, host) => host.edit({ op: 'update-unit', unit: String(a.unit ?? ''), ...(a.parameters ? { parameters: a.parameters } : {}), ...(a.name ? { name: String(a.name) } : {}) })
  },
  {
    name: 'remove_unit',
    title: 'Remove a unit',
    access: 'write',
    destructive: true,
    description: 'Removes one unit, and every stream to or from it, from the open flowsheet. The engineer can undo it, but confirm with them before removing anything they did not ask to remove.',
    inputSchema: { type: 'object', properties: { unit: unit() }, required: ['unit'] },
    summarize: (a, g) => `Remove ${nameOf(g, a.unit)} and its streams`,
    run: (a, host) => host.edit({ op: 'remove-unit', unit: String(a.unit ?? '') })
  },
  {
    name: 'remove_stream',
    title: 'Remove a stream',
    access: 'write',
    destructive: true,
    description: 'Removes one stream (a pipe or conveyor link) from the open flowsheet: by its id, or by the units at its ends. The units stay.',
    inputSchema: {
      type: 'object',
      properties: {
        stream: { type: 'string', description: 'The stream id, from get_open_flowsheet.' },
        from: unit('Or: the unit it leaves (id, name or tag)...'),
        to: unit('...and the unit it enters.')
      }
    },
    summarize: (a, g) => (a.stream ? `Remove stream ${a.stream}` : `Remove the stream ${nameOf(g, a.from)} → ${nameOf(g, a.to)}`),
    run: (a, host) => host.edit({ op: 'remove-stream', ...(a.stream ? { stream: String(a.stream) } : {}), ...(a.from ? { from: String(a.from) } : {}), ...(a.to ? { to: String(a.to) } : {}) })
  },
  {
    name: 'publish_unit_op',
    title: 'Ask to publish a unit',
    // It opens a dialog; the engineer publishes, or not, there.
    access: 'read',
    readOnly: false,
    openWorld: true,
    description:
      'Asks the engineer to publish a unit from the open flowsheet to the ProcessForge community library: it opens the publish dialog, filled in with the description, category and tags you suggest. Nothing is published unless the engineer reviews it and clicks Publish (signed in with Google). A designed unit is checked by the engine first. Only when the engineer wants to share the unit.',
    inputSchema: {
      type: 'object',
      properties: {
        unit: unit(),
        description: { type: 'string', description: 'What it is, what it models and what it assumes, for other engineers.' },
        category: { type: 'string', enum: [...COMMUNITY_CATEGORIES] },
        tags: { type: 'array', items: { type: 'string' } },
        releaseNotes: { type: 'string', description: 'For a new version: what changed.' }
      },
      required: ['unit']
    },
    summarize: (a, g) => `Open the publish dialog for ${nameOf(g, a.unit)}`,
    run: async (a, host) => {
      if (typeof a?.unit !== 'string' || !a.unit.trim()) return { success: false, requested: false, error: 'Give "unit": the id, name or tag of a unit on the open flowsheet.' };
      return host.requestPublish(a as never);
    }
  }
];

export const findForgeTool = (name: string): ForgeTool | undefined => FORGE_TOOLS.find((t) => t.name === name);

/** The arguments an MCP client can add to a graphSource tool. */
export const GRAPH_SOURCE_PROPERTIES = {
  graph: { type: 'object', description: 'A ProcessGraph to use. Omit to use the flowsheet open in ProcessForge Desktop.' },
  templateName: { type: 'string', enum: Object.keys(EXAMPLE_LINES), description: 'An example line to use instead (see list_digital_twin_templates).' }
};

/** A tool's argument schema as a surface offers it. */
export function inputSchemaFor(tool: ForgeTool, surface: Surface): Json {
  if (surface !== 'mcp' || !tool.graphSource) return tool.inputSchema;
  return { ...tool.inputSchema, properties: { ...GRAPH_SOURCE_PROPERTIES, ...(tool.inputSchema.properties ?? {}) } };
}
