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
import { AVAILABLE_TEMPLATES } from './templates.js';

export function createProcessForgeMcpServer(): Server {
  const server = new Server(
    {
      name: 'process-forge-mcp',
      version: '0.1.0'
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
            'Executes a high-precision deterministic discrete-event and continuous flow simulation of an industrial manufacturing line. Returns production throughput, scrap rates, machine states, and line bottleneck analysis.',
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
            'Audits process flow topology, detects continuous/discrete port mismatches, audits conservation of mass/volume, and pinpoints line bottlenecks and queue accumulations.',
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
            'Consults with the dedicated machine-level Sub-Agent acting as a software and domain engineer for a specific Unit Operation (e.g. Rotary Filler, Reactor, Labeler). Synthesizes machine parameters and dynamic Generative UI controls.',
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
            'Packages a validated Unit-Op and its Sub-Agent into an Obsidian-style .pfu plugin bundle ready for distribution on the Community UnitOp Library or local import.',
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
            'Selects an ISA-5.1 compliant CAD equipment vector drawing (SVG geometry, viewBox, nozzles, internals, and aspect ratio) from a fixed template library, matching a natural language engineering description against known equipment families by keyword. Templates are pre-authored, with a few parameters (tray count, agitator type, bottom head style) interpolated from the description; unmatched descriptions return a generic vertical vessel.',
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
              }
            },
            required: ['description']
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
