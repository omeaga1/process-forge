import {
  EQUIPMENT_CATEGORIES,
  STANDARD_EQUIPMENT_CATALOG,
  ProcessNodeSchema,
  UnitOpContractSchema,
  addStreamToGraph,
  applyFlowsheetEdit,
  contractToProcessNode,
  createStandardUnitOp,
  executeDesignUnitOp,
  executeValidateUnitOp,
  findStandardUnitOp,
  planStream,
  resolveUnit,
  validateProcessGraph,
  type FlowsheetEdit,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { simulateProcess } from '@process-forge/simulation-core';
import { CommunityLibraryService } from '../../marketplace/communityLibraryClient.js';
import { saveUnitOp } from '../../library/savedUnitOps.js';

/**
 * The in-app assistant's tools: the MCP server's toolset, run against the
 * flowsheet open in the studio instead of over the desktop bridge. Same names
 * and the same rules (protocol/connect.ts, protocol/edit.ts, the catalog, the
 * engine's validation), so a model behaves the same here as in Claude Desktop.
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

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  access: ToolAccess;
  /** One line for the approval card and the activity list. */
  summarize(args: Record<string, any>, graph: ProcessGraph): string;
  run(args: Record<string, any>, host: AgentHost): Promise<unknown> | unknown;
}

const nameOf = (graph: ProcessGraph, ref: unknown): string => {
  const n = typeof ref === 'string' ? resolveUnit(graph, ref) : null;
  return n && typeof n !== 'string' ? n.name : String(ref ?? '?');
};

const ports = (node: ProcessNode) => ({
  inlets: node.inputs.map((p) => ({ id: p.id, name: p.name, carries: p.flowDimension === 'DISCRETE_CONTAINER' ? 'items' : 'liquid' })),
  outlets: node.outputs.map((p) => ({ id: p.id, name: p.name, carries: p.flowDimension === 'DISCRETE_CONTAINER' ? 'items' : 'liquid' }))
});

/** To the right of everything on the canvas, level with its middle (as the MCP bridge places units). */
function placeNextTo(graph: ProcessGraph): { x: number; y: number } {
  if (graph.nodes.length === 0) return { x: 200, y: 200 };
  const xs = graph.nodes.map((n) => n.position.x);
  const ys = graph.nodes.map((n) => n.position.y);
  return { x: Math.max(...xs) + 320, y: Math.round(ys.reduce((a, b) => a + b, 0) / ys.length) };
}

/** Adds a unit, and pipes it in when asked, in one change. */
function place(host: AgentHost, node: ProcessNode, args: { connectFrom?: string; connectTo?: string }) {
  let g = host.getGraph();
  const clash = g.nodes.some((n) => n.id === node.id);
  const placed: ProcessNode = { ...node, id: clash ? `${node.id}-${Date.now().toString(36)}` : node.id, position: placeNextTo(g) };
  g = { ...g, nodes: [...g.nodes, placed] };
  const piped: string[] = [];
  const problems: string[] = [];
  for (const [from, to] of [
    [args.connectFrom, placed.id],
    [placed.id, args.connectTo]
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
    added: true,
    nodeId: placed.id,
    name: placed.name,
    ...ports(placed),
    ...(piped.length ? { piped } : {}),
    ...(problems.length ? { notPiped: problems } : {})
  };
}

function flowsheetSummary(graph: ProcessGraph) {
  return {
    name: graph.name,
    units: graph.nodes.map((n) => {
      const config = n.config as Record<string, unknown>;
      const contract = config.contract as { parameters: { name: string; value: number; unit: string }[] } | undefined;
      const settings = contract
        ? Object.fromEntries(contract.parameters.map((p) => [p.name, `${p.value} ${p.unit}`]))
        : Object.fromEntries(Object.entries(config).filter(([, v]) => typeof v === 'number' || typeof v === 'string'));
      return { id: n.id, name: n.name, kind: n.kind, ...(contract ? { designed: true } : {}), settings, ...ports(n) };
    }),
    streams: graph.edges.map((e) => ({
      id: e.id,
      from: nameOf(graph, e.sourceNodeId),
      to: nameOf(graph, e.targetNodeId),
      carries: e.stream.type === 'CONTINUOUS_FLUID' ? 'liquid' : 'items'
    }))
  };
}

function simulate(graph: ProcessGraph, minutes: number, seed?: number) {
  const r = simulateProcess(graph, minutes, seed !== undefined ? { seed } : {});
  const bottleneckId = validateProcessGraph(graph).bottlenecks.bottleneckNodeId;
  const units = graph.nodes
    .filter((n) => n.kind !== 'TERMINAL')
    .map((n) => {
      const rep = r.nodeReports[n.id];
      const t = rep?.totalTimeSeconds || 1;
      return {
        name: n.name,
        busyPct: Math.round(((rep?.busyTimeSeconds ?? 0) / t) * 100),
        starvedPct: Math.round(((rep?.starvedTimeSeconds ?? 0) / t) * 100),
        blockedPct: Math.round(((rep?.blockedTimeSeconds ?? 0) / t) * 100),
        ...(rep?.unitsProduced ? { produced: rep.unitsProduced } : {}),
        ...(rep?.fluid ? { gallonsOut: Math.round(rep.fluid.deliveredGallons), temperatureC: Math.round(rep.fluid.temperatureC * 10) / 10 } : {}),
        ...(rep?.heat?.energyKwh ? { energyKwh: Math.round(rep.heat.energyKwh) } : {}),
        ...(rep?.designedUnit?.brokenConstraints?.length ? { brokenConstraints: rep.designedUnit.brokenConstraints.map((b) => `${b.message} (${Math.round(b.seconds)} s)`) } : {})
      };
    });
  return {
    minutes,
    seed: r.seed,
    itemsPerMinute: Math.round(r.averageLineThroughputUnitsPerMin * 100) / 100,
    itemsMade: r.totalUnitsPackaged,
    itemsScrapped: r.totalUnitsScrapped,
    liquidDeliveredGallons: Math.round(r.totalFluidDeliveredGallons),
    staticBottleneck: bottleneckId ? nameOf(graph, bottleneckId) : null,
    outlets: r.terminals.filter((t) => t.role !== 'feed').map((t) => ({ name: t.name, role: t.role, gallons: Math.round(t.gallons), items: t.units, ...(t.componentsKg ? { componentsKg: t.componentsKg } : {}) })),
    units
  };
}

const unitRef = { type: 'string', description: 'A unit on the flowsheet: its id, name or tag (e.g. P-101).' };

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'get_open_flowsheet',
    access: 'read',
    description: 'The flowsheet open in the studio: every unit with its id, kind, settings (a designed unit: its parameters) and ports, and every stream. Call this first.',
    parameters: { type: 'object', properties: {} },
    summarize: () => 'Read the flowsheet',
    run: (_a, host) => flowsheetSummary(host.getGraph())
  },
  {
    name: 'simulate_process_line',
    access: 'read',
    description: 'Runs the simulation on the open flowsheet (nothing on it changes): throughput, liquid delivered, what reached each outlet, and each unit busy / starved / blocked, energy and broken design constraints.',
    parameters: { type: 'object', properties: { durationMinutes: { type: 'number', description: 'Simulated minutes, default 30.' } } },
    summarize: (a) => `Simulate ${a.durationMinutes ?? 30} min`,
    run: (a, host) => simulate(host.getGraph(), Math.min(Math.max(Number(a.durationMinutes) || 30, 1), 24 * 60))
  },
  {
    name: 'compare_scenarios',
    access: 'read',
    description:
      'What-if: simulates the flowsheet as it is, then once per scenario with some settings changed, on the same random seed, and reports each against the baseline. Nothing on the flowsheet changes. Settings by the names get_open_flowsheet shows; a designed unit by its parameter names.',
    parameters: {
      type: 'object',
      properties: {
        durationMinutes: { type: 'number' },
        scenarios: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              changes: { type: 'array', items: { type: 'object', properties: { unit: unitRef, parameters: { type: 'object' } }, required: ['unit', 'parameters'] } }
            },
            required: ['name', 'changes']
          }
        }
      },
      required: ['scenarios']
    },
    summarize: (a) => `Compare ${Array.isArray(a.scenarios) ? a.scenarios.length : 0} what-if scenario(s)`,
    run: (a, host) => {
      const base = host.getGraph();
      const minutes = Math.min(Math.max(Number(a.durationMinutes) || 30, 1), 24 * 60);
      const baseline = simulate(base, minutes);
      const scenarios = (Array.isArray(a.scenarios) ? a.scenarios : []).slice(0, 8).map((s: any) => {
        let g = base;
        const warnings: string[] = [];
        for (const c of Array.isArray(s.changes) ? s.changes : []) {
          const r = applyFlowsheetEdit(g, { op: 'update-unit', unit: String(c.unit), parameters: c.parameters ?? {} });
          if (r.ok) g = r.graph;
          else warnings.push(r.error);
        }
        const run = simulate(g, minutes, baseline.seed);
        return {
          name: String(s.name ?? 'Scenario'),
          itemsPerMinute: run.itemsPerMinute,
          liquidDeliveredGallons: run.liquidDeliveredGallons,
          staticBottleneck: run.staticBottleneck,
          vsBaseline: { itemsPerMinute: Math.round((run.itemsPerMinute - baseline.itemsPerMinute) * 100) / 100, liquidGallons: run.liquidDeliveredGallons - baseline.liquidDeliveredGallons },
          ...(warnings.length ? { notApplied: warnings } : {})
        };
      });
      return { baseline: { itemsPerMinute: baseline.itemsPerMinute, liquidDeliveredGallons: baseline.liquidDeliveredGallons, staticBottleneck: baseline.staticBottleneck }, scenarios };
    }
  },
  {
    name: 'list_standard_unit_ops',
    access: 'read',
    description: 'The standard equipment that ships with ProcessForge, by category, with ports, default settings and how each is simulated. Prefer these before designing a unit.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        category: { type: 'string', enum: EQUIPMENT_CATEGORIES.map((c) => c.id) }
      }
    },
    summarize: (a) => `List standard equipment${a.query ? `: "${a.query}"` : ''}`,
    run: (a) => {
      const q = String(a.query ?? '').toLowerCase();
      return STANDARD_EQUIPMENT_CATALOG.filter(
        (i) => (!a.category || i.category === a.category) && (!q || `${i.id} ${i.title} ${i.subtitle} ${i.tags.join(' ')}`.toLowerCase().includes(q))
      ).map((i) => {
        const sample = createStandardUnitOp(i);
        return {
          unit: i.id,
          title: i.title,
          category: i.category,
          howItIsSimulated: i.model,
          ...(i.contract ? { designed: true, parameters: i.contract.parameters.map((p) => `${p.name} = ${p.value} ${p.unit}`) } : {}),
          ...ports(sample)
        };
      });
    }
  },
  {
    name: 'search_community_unit_ops',
    access: 'read',
    description: 'Searches the community library: unit ops other engineers published. Listings are unreviewed; say so.',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
    summarize: (a) => `Search the community library${a.query ? `: "${a.query}"` : ''}`,
    run: async (a) => {
      const { items, isLiveApi } = await CommunityLibraryService.fetchUnitOps(String(a.query ?? ''));
      if (!isLiveApi) return { error: 'The community library could not be reached.' };
      return { note: 'Written by their authors; ProcessForge does not review listings.', units: items.slice(0, 15).map((i) => ({ id: i.id, name: i.name, author: i.author, description: i.description, engineChecked: i.engineChecked })) };
    }
  },
  {
    name: 'design_unit_op',
    access: 'read',
    description:
      'The brief for designing a unit operation the catalog does not have: the UnitOpContract format, the expression language, worked examples and the design stream at the unit\'s place in the flowsheet. Write a contract from it, check it with validate_unit_op, fix what fails, then place it with add_unit_op_to_flowsheet.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What the unit is and does, in the engineer\'s words.' },
        targetUnit: { ...unitRef, description: 'Optional: a unit it will connect to, for the design stream.' },
        preferredMode: { type: 'string', enum: ['DISCRETE_CYCLE', 'CONTINUOUS_RATE', 'BATCH'] }
      },
      required: ['description']
    },
    summarize: (a) => `Get the design brief: ${String(a.description ?? '').slice(0, 60)}`,
    run: (a, host) => {
      const g = host.getGraph();
      const target = a.targetUnit ? resolveUnit(g, String(a.targetUnit)) : null;
      return executeDesignUnitOp({
        description: String(a.description ?? ''),
        graph: g,
        ...(target && typeof target !== 'string' ? { targetNodeId: target.id } : {}),
        ...(a.preferredMode ? { preferredMode: a.preferredMode } : {})
      });
    }
  },
  {
    name: 'validate_unit_op',
    access: 'read',
    description: 'The engine\'s verdict on a UnitOpContract: schema, references, physics (constraints evaluated) and drawing. Revise against the failures until ACCEPTED.',
    parameters: { type: 'object', properties: { contract: { type: 'object' }, parameterOverrides: { type: 'object' } }, required: ['contract'] },
    summarize: (a) => `Check the design "${a.contract?.name ?? 'unit'}" with the engine`,
    run: (a) => executeValidateUnitOp({ contract: a.contract, ...(a.parameterOverrides ? { parameterOverrides: a.parameterOverrides } : {}) })
  },

  // ── Changes to the flowsheet: each waits for the engineer's approval
  {
    name: 'add_standard_unit_op',
    access: 'write',
    description: 'Places a standard unit (or a feed, product, byproduct or waste arrow) on the flowsheet, with any settings changed, optionally piped from / to existing units.',
    parameters: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: `Catalog id: ${STANDARD_EQUIPMENT_CATALOG.map((i) => i.id).join(', ')}.` },
        name: { type: 'string' },
        parameters: { type: 'object' },
        material: { type: 'string' },
        supplyRate: { type: 'number' },
        composition: { type: 'object' },
        connectFrom: unitRef,
        connectTo: unitRef
      },
      required: ['unit']
    },
    summarize: (a) => `Add ${a.name ? `"${a.name}"` : `a ${findStandardUnitOp(String(a.unit ?? ''))?.title ?? a.unit}`}${a.connectFrom ? `, fed from ${a.connectFrom}` : ''}${a.connectTo ? `, into ${a.connectTo}` : ''}`,
    run: (a, host) => {
      const item = findStandardUnitOp(String(a.unit ?? ''));
      if (!item) return { added: false, error: `No standard unit "${a.unit}". Units: ${STANDARD_EQUIPMENT_CATALOG.map((i) => i.id).join(', ')}.` };
      const node = createStandardUnitOp(item, {
        ...(a.name ? { name: String(a.name) } : {}),
        ...(a.parameters ? { parameters: a.parameters } : {}),
        ...(a.material ? { material: String(a.material) } : {}),
        ...(typeof a.supplyRate === 'number' ? { supplyRate: a.supplyRate } : {}),
        ...(a.composition ? { composition: a.composition } : {})
      });
      return place(host, node, a);
    }
  },
  {
    name: 'add_unit_op_to_flowsheet',
    access: 'write',
    description: 'Places a designed unit (a UnitOpContract the engine ACCEPTED) on the flowsheet, optionally piped in, and keeps it in My unit ops.',
    parameters: { type: 'object', properties: { contract: { type: 'object' }, connectFrom: unitRef, connectTo: unitRef }, required: ['contract'] },
    summarize: (a) => `Add the designed unit "${a.contract?.name ?? 'unit'}"${a.connectFrom ? `, fed from ${a.connectFrom}` : ''}${a.connectTo ? `, into ${a.connectTo}` : ''}`,
    run: (a, host) => {
      const verdict = executeValidateUnitOp({ contract: a.contract });
      if (verdict.verdict !== 'ACCEPTED') return { added: false, error: 'The engine does not accept this design yet; fix it with validate_unit_op first.', gates: verdict.gates };
      const contract = UnitOpContractSchema.parse(a.contract);
      saveUnitOp(contract, 'designed');
      return place(host, contractToProcessNode(contract), a);
    }
  },
  {
    name: 'add_community_unit_op',
    access: 'write',
    description: 'Places a community listing (by id from search_community_unit_ops) on the flowsheet, as its author published it.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, connectFrom: unitRef, connectTo: unitRef }, required: ['id'] },
    summarize: (a) => `Add the community unit ${a.id}`,
    run: async (a, host) => {
      const node = await CommunityLibraryService.fetchUnitOpTemplate(String(a.id ?? ''));
      const parsed = node ? ProcessNodeSchema.safeParse(node) : null;
      if (!parsed?.success) return { added: false, error: `Listing "${a.id}" could not be fetched or is not a unit ProcessForge can place.` };
      return place(host, { ...parsed.data, id: `community-${Date.now().toString(36)}` }, a);
    }
  },
  {
    name: 'add_stream',
    access: 'write',
    description: 'Pipes one unit into another (liquid or items, by the ports). Ports are optional: by default the first free ones that fit.',
    parameters: { type: 'object', properties: { from: unitRef, to: unitRef, fromPort: { type: 'string' }, toPort: { type: 'string' } }, required: ['from', 'to'] },
    summarize: (a, g) => `Pipe ${nameOf(g, a.from)} into ${nameOf(g, a.to)}`,
    run: (a, host) => {
      const plan = planStream(host.getGraph(), { from: String(a.from), to: String(a.to), ...(a.fromPort ? { fromPort: String(a.fromPort) } : {}), ...(a.toPort ? { toPort: String(a.toPort) } : {}) });
      if (!plan.ok) return { added: false, error: plan.error, ...(plan.hint ? { hint: plan.hint } : {}) };
      host.commit(addStreamToGraph(host.getGraph(), plan.edge));
      return { added: true, from: plan.from, to: plan.to, carries: plan.carries };
    }
  },
  {
    name: 'update_unit',
    access: 'write',
    description: 'Changes a unit\'s settings (a designed unit: its parameters, re-checked by the engine) or renames it.',
    parameters: { type: 'object', properties: { unit: unitRef, parameters: { type: 'object' }, name: { type: 'string' } }, required: ['unit'] },
    summarize: (a, g) =>
      `Change ${nameOf(g, a.unit)}: ${[
        ...Object.entries(a.parameters ?? {}).map(([k, v]) => `${k} → ${JSON.stringify(v)}`),
        ...(a.name ? [`rename to "${a.name}"`] : [])
      ].join(', ')}`,
    run: (a, host) => edit(host, { op: 'update-unit', unit: String(a.unit), ...(a.parameters ? { parameters: a.parameters } : {}), ...(a.name ? { name: String(a.name) } : {}) })
  },
  {
    name: 'remove_unit',
    access: 'write',
    description: 'Removes a unit and the streams connected to it.',
    parameters: { type: 'object', properties: { unit: unitRef }, required: ['unit'] },
    summarize: (a, g) => `Remove ${nameOf(g, a.unit)} and its streams`,
    run: (a, host) => edit(host, { op: 'remove-unit', unit: String(a.unit) })
  },
  {
    name: 'remove_stream',
    access: 'write',
    description: 'Removes a stream, by its id or by the units at its ends.',
    parameters: { type: 'object', properties: { stream: { type: 'string' }, from: unitRef, to: unitRef } },
    summarize: (a, g) => (a.stream ? `Remove stream ${a.stream}` : `Remove the stream ${nameOf(g, a.from)} → ${nameOf(g, a.to)}`),
    run: (a, host) =>
      edit(host, { op: 'remove-stream', ...(a.stream ? { stream: String(a.stream) } : {}), ...(a.from ? { from: String(a.from) } : {}), ...(a.to ? { to: String(a.to) } : {}) })
  },
  {
    name: 'publish_unit_op',
    access: 'read',
    description: 'Opens the publish dialog for a unit, filled in with your suggestions. Nothing is published unless the engineer clicks Publish there. Only when the engineer wants to share it.',
    parameters: {
      type: 'object',
      properties: { unit: unitRef, description: { type: 'string' }, category: { type: 'string', enum: ['PACKAGING', 'FLUID_PROCESSING', 'MATERIAL_HANDLING', 'QUALITY'] }, tags: { type: 'array', items: { type: 'string' } } },
      required: ['unit']
    },
    summarize: (a, g) => `Open the publish dialog for ${nameOf(g, a.unit)}`,
    run: (a, host) => {
      const found = resolveUnit(host.getGraph(), String(a.unit ?? ''));
      if (typeof found === 'string') return { requested: false, error: found };
      if (!host.requestPublish) return { requested: false, error: 'Publishing is not available here.' };
      host.requestPublish(found.id, { ...(a.description ? { description: a.description } : {}), ...(a.category ? { category: a.category } : {}), ...(a.tags ? { tags: a.tags } : {}) });
      return { requested: true, published: false, message: `The publish dialog for "${found.name}" is open; the engineer decides there.` };
    }
  }
];

function edit(host: AgentHost, e: FlowsheetEdit) {
  const r = applyFlowsheetEdit(host.getGraph(), e);
  if (!r.ok) return { changed: false, error: r.error };
  host.commit(r.graph);
  return { changed: true, message: r.message, ...(r.changes ? { changes: r.changes } : {}), ...(r.warnings ? { warnings: r.warnings } : {}) };
}

export const findAgentTool = (name: string): AgentTool | undefined => AGENT_TOOLS.find((t) => t.name === name);
