import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
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
import { executeAddUnitOpToFlowsheet, executeGetOpenFlowsheet, executeAddStream } from './tools/desktopBridge.js';
import { executeListStandardUnitOps, executeAddStandardUnitOp } from './tools/standardUnitOps.js';
import { executeSearchCommunityUnitOps, executeAddCommunityUnitOp } from './tools/communityLibrary.js';
import { AVAILABLE_TEMPLATES } from './templates.js';

export function createProcessForgeMcpServer(): Server {
  const server = new Server(
    {
      name: 'process-forge-mcp',
      version: '0.4.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'simulate_process_line',
          description:
            'Runs a deterministic discrete-event simulation of a manufacturing line. Returns production throughput, scrap rates, machine states, and line bottleneck analysis. Liquid carries a temperature: a heat exchanger with targetTemperatureCelsius moves the flow toward it within its dutyKw, and a batch reactor with jacketDutyKw heats each batch to its fluid.temperatureCelsius before reacting, which lengthens the batch. Each liquid unit reports its temperatures, and exchangers and reactors report the heat they moved.',
          inputSchema: {
            type: 'object',
            properties: {
              templateName: {
                type: 'string',
                enum: Object.keys(AVAILABLE_TEMPLATES),
                description: 'Pre-configured digital twin line (e.g. "sherwin-williams-paint-line", "beverage-bottling-line").'
              },
              durationMinutes: {
                type: 'number',
                description: 'Simulation run duration in minutes (default: 30 minutes).'
              },
              graph: {
                type: 'object',
                description: 'Custom ProcessGraph definition if not using a predefined template.'
              }
            }
          }
        },
        {
          name: 'diagnose_bottlenecks',
          description:
            'Checks a flowsheet for continuous/discrete port mismatches and finds its bottlenecks and where queues build up.',
          inputSchema: {
            type: 'object',
            properties: {
              templateName: {
                type: 'string',
                enum: Object.keys(AVAILABLE_TEMPLATES),
                description: 'Pre-configured digital twin line to audit.'
              },
              graph: {
                type: 'object',
                description: 'Custom ProcessGraph to audit.'
              }
            }
          }
        },
        {
          name: 'query_unit_subagent',
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
              unitName: {
                type: 'string',
                description: 'Display name or identifier of the unit operation (e.g. "RF-300 Rotary Filler").'
              },
              inquiry: {
                type: 'string',
                description: 'Engineering request or physical process modification requirement.'
              },
              currentConfig: {
                type: 'object',
                description: 'Current machine configuration object.'
              },
              upstreamContext: {
                type: 'object',
                properties: {
                  flowRateGpm: { type: 'number' },
                  viscosityCentipoise: { type: 'number' },
                  densityGPerCm3: { type: 'number' },
                  lineSpeedPpm: { type: 'number' }
                },
                description: 'Boundary parameters provided from upstream units or Master Orchestrator.'
              }
            },
            required: ['machineType', 'unitName', 'inquiry']
          }
        },
        {
          name: 'package_unit_op',
          description:
            'Packages a unit op (its node definition and metadata) into a .pfu bundle for the community library or local import.',
          inputSchema: {
            type: 'object',
            properties: {
              node: {
                type: 'object',
                description: 'The complete ProcessNode schema.'
              },
              author: {
                type: 'string',
                description: 'Author name or organization.'
              },
              description: {
                type: 'string',
                description: 'Engineering description of the machine operation.'
              },
              category: {
                type: 'string',
                enum: ['FILLING', 'REACTION', 'PACKAGING', 'SEPARATION', 'CONVEYANCE', 'MATERIAL_HANDLING']
              },
              tags: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['node', 'author', 'description', 'category']
          }
        },
        {
          name: 'forge_equipment_drawing',
          description:
            'Picks a template equipment drawing (SVG, viewBox, nozzles, internals) from a fixed library of nine families by matching keywords in the description. For a unit op you are designing, draw it in the contract instead (see design_unit_op). Templates are pre-authored, with a few parameters (tray count, agitator type, bottom head style) interpolated from the description; unmatched descriptions return a generic vertical vessel.',
          inputSchema: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Physical equipment description (e.g. "Distillation column with 8 sieve trays and overhead reflux condenser", "Jacketed CSTR with Rushton turbine").'
              },
              machineType: {
                type: 'string',
                description: 'Optional equipment classification or node kind.'
              },
              unitName: {
                type: 'string',
                description: 'Unit operation name or tag.'
              },
              includeNozzles: {
                type: 'boolean',
                description: 'Whether to calculate perimeter nozzle placement coordinates (default: true).'
              },
              templateFamily: {
                type: 'string',
                enum: ['column', 'reactor', 'exchanger', 'pump', 'cyclone', 'spray', 'sphere', 'drum', 'generic'],
                description:
                  'Draw this template family instead of choosing one from the description. Use it when a previous call returned routing.decided = false and you know which of routing.alternatives the engineer meant.'
              }
            },
            required: ['description']
          }
        },
        {
          name: 'design_unit_op',
          description:
            'Returns everything needed to author a UnitOpContract for a unit operation described in natural language: the target schema, the restricted expression grammar and its complete function list, the names the engine supplies at evaluation time, a complete worked example, and -- when a graph is supplied -- the upstream and downstream stream conditions that constrain the design. This tool performs no model inference of its own; the calling client is the model. Author the contract from this brief, then submit it to validate_unit_op.',
          inputSchema: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'The description of the unit operation in the engineer\'s own words (e.g. "a water-cooled belt where molten wax is poured on, solidifies, and is scraped off at the end").'
              },
              graph: {
                type: 'object',
                description: 'Optional ProcessGraph this unit op will join, used to report surrounding stream conditions.'
              },
              targetNodeId: {
                type: 'string',
                description: 'Optional id of the node being designed or replaced within `graph`.'
              },
              preferredMode: {
                type: 'string',
                enum: ['DISCRETE_CYCLE', 'CONTINUOUS_RATE'],
                description: 'Optional expected behavior mode.'
              }
            },
            required: ['description']
          }
        },
        {
          name: 'validate_unit_op',
          description:
            "Checks a proposed UnitOpContract and returns the engine's verdict: schema conformance; every expression parses and every name resolves; every ERROR constraint holds at the contract's own parameter values; and the drawing works (every port has one nozzle on the drawing, every shape lies inside the viewBox). Returns ACCEPTED or REJECTED with the specific failures and what to change.",
          inputSchema: {
            type: 'object',
            properties: {
              contract: {
                type: 'object',
                description: 'The candidate UnitOpContract to check.'
              },
              parameterOverrides: {
                type: 'object',
                description: 'Optional parameter overrides, for asking whether the design holds at a different operating point (e.g. { "beltSpeedMPerMin": 20 }).'
              }
            },
            required: ['contract']
          }
        },
        {
          name: 'get_open_flowsheet',
          description:
            "Reads the flowsheet open in the ProcessForge desktop app on this computer: its units, their ports, and the streams between them. Use it to design a unit op that fits the engineer's actual process, and pass it as `graph` to design_unit_op. Requires ProcessForge Desktop to be running.",
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'add_unit_op_to_flowsheet',
          description:
            'Adds a unit operation to the flowsheet open in the ProcessForge desktop app on this computer. The contract is validated here first (same gates as validate_unit_op) and again by the app; a rejected contract is not sent. The unit appears on the canvas with its own drawing and its pipes attached at the nozzles you drew. Requires ProcessForge Desktop to be running.',
          inputSchema: {
            type: 'object',
            properties: {
              contract: { type: 'object', description: 'An accepted UnitOpContract, including its drawing.' },
              position: {
                type: 'object',
                description: 'Optional canvas position { x, y }. By default the unit is placed to the right of the existing flowsheet.',
                properties: { x: { type: 'number' }, y: { type: 'number' } }
              }
            },
            required: ['contract']
          }
        },
        {
          name: 'add_stream',
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
          }
        },
        {
          name: 'list_standard_unit_ops',
          description:
            'Lists the equipment that ships with ProcessForge (the app\'s Standard palette): pumps, tanks, batch reactors, heat exchangers, separators, fillers, conveyors, labelers, palletizers, and the Feed, Product, Byproduct and Waste arrows that mark where material enters and leaves a flowsheet. Each comes with its ports (liquid or items) and its settings with default values. Use these before designing a new unit op: a standard unit is already modelled by the simulation.',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Optional words to filter by, such as "tank" or "waste".' } }
          }
        },
        {
          name: 'add_standard_unit_op',
          description:
            'Places a standard unit, or a feed, product, byproduct or waste arrow, on the flowsheet open in the ProcessForge desktop app, with its default settings unless you change them, and optionally pipes it in. Feeds supply what the line takes (or up to supplyRate); only Product outlets count as the line\'s output; Byproduct and Waste are totalled apart. A feed or outlet takes on the kind (liquid or items) of the unit it is piped to. Requires ProcessForge Desktop 0.1.30 or later to be running.',
          inputSchema: {
            type: 'object',
            properties: {
              unit: { type: 'string', description: 'Catalog id from list_standard_unit_ops: pump, surge-tank, batch-reactor, heat-exchanger, separator, rotary-filler, conveyor, labeler, palletizer, feed, product, byproduct, waste.' },
              name: { type: 'string', description: 'Optional name, e.g. "Transfer Pump P-102". A tag like P-102 lets add_stream find it.' },
              parameters: { type: 'object', description: 'Optional settings to change, by the names list_standard_unit_ops gives, e.g. { "designFlowRateGpm": 80 }.' },
              material: { type: 'string', description: 'Feeds and outlets: what the stream is, e.g. "Latex base" or "Rejected cans".' },
              supplyRate: { type: 'number', description: 'Feeds: the most it supplies, gal/min for liquid or items/min. Omit or 0 to supply whatever the line takes.' },
              carries: { type: 'string', enum: ['liquid', 'items'], description: 'Feeds and outlets: optional; by default it matches the first unit it is piped to.' },
              connectFrom: { type: 'string', description: 'Optional: a unit (id, name or tag) to pipe into the new one, as add_stream would.' },
              connectTo: { type: 'string', description: 'Optional: a unit to pipe the new one into.' },
              position: {
                type: 'object',
                description: 'Optional canvas position { x, y }. By default it goes to the right of the flowsheet.',
                properties: { x: { type: 'number' }, y: { type: 'number' } }
              }
            },
            required: ['unit']
          }
        },
        {
          name: 'search_community_unit_ops',
          description:
            'Searches the ProcessForge community library: unit ops other engineers have published from the app, such as OEM fillers, case packers and mixers. Public and read-only. Listings are what their authors wrote; ProcessForge does not review or certify them, so say so when you suggest one.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Words to search names, descriptions and tags for. Omit to list everything.' },
              category: { type: 'string', enum: ['PACKAGING', 'FLUID_PROCESSING', 'MATERIAL_HANDLING', 'QUALITY'] }
            }
          }
        },
        {
          name: 'add_community_unit_op',
          description:
            'Places a unit from the community library (by its id from search_community_unit_ops) on the flowsheet open in the ProcessForge desktop app, as its author published it, and optionally pipes it in. Requires ProcessForge Desktop 0.1.30 or later to be running.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The listing id, e.g. plugin-serac-10-filler.' },
              name: { type: 'string', description: 'Optional name for it on this flowsheet.' },
              connectFrom: { type: 'string', description: 'Optional: a unit (id, name or tag) to pipe into the new one, as add_stream would.' },
              connectTo: { type: 'string', description: 'Optional: a unit to pipe the new one into.' },
              position: {
                type: 'object',
                description: 'Optional canvas position { x, y }. By default it goes to the right of the flowsheet.',
                properties: { x: { type: 'number' }, y: { type: 'number' } }
              }
            },
            required: ['id']
          }
        },
        {
          name: 'list_digital_twin_templates',
          description: 'Lists all available pre-configured digital twin manufacturing lines in ProcessForge.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'simulate_process_line': {
          const result = executeSimulateLine((args as unknown) || {});
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'diagnose_bottlenecks': {
          const result = executeDiagnoseBottlenecks((args as unknown) || {});
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'query_unit_subagent': {
          const result = executeQueryUnitSubAgent(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'design_unit_op': {
          const result = executeDesignUnitOp(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'get_open_flowsheet': {
          const result = await executeGetOpenFlowsheet();
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'add_unit_op_to_flowsheet': {
          const result = await executeAddUnitOpToFlowsheet(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'add_stream': {
          const result = await executeAddStream(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'list_standard_unit_ops': {
          const result = executeListStandardUnitOps((args as any) || {});
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'add_standard_unit_op': {
          const result = await executeAddStandardUnitOp(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'search_community_unit_ops': {
          const result = await executeSearchCommunityUnitOps((args as any) || {});
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'add_community_unit_op': {
          const result = await executeAddCommunityUnitOp(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'validate_unit_op': {
          const result = executeValidateUnitOp(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'package_unit_op': {
          const result = executePackageUnitOp(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'forge_equipment_drawing': {
          const result = executeForgeEquipmentDrawing((args as unknown) as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'list_digital_twin_templates': {
          const templates = Object.entries(AVAILABLE_TEMPLATES).map(([key, graph]) => ({
            templateKey: key,
            name: graph.name,
            facility: graph.metadata?.facility,
            productLine: graph.metadata?.productLine,
            nodesCount: graph.nodes.length,
            edgesCount: graph.edges.length
          }));

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(templates, null, 2)
              }
            ]
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (err: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `ProcessForge MCP Error: ${err?.message || String(err)}`
          }
        ]
      };
    }
  });

  return server;
}

export async function runServer(): Promise<void> {
  const server = createProcessForgeMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ProcessForge MCP Server running on stdio');
}
