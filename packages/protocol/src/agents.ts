import { z } from 'zod';
import { ProcessNodeSchema, NodeKindSchema } from './nodes.js';

export const AgentRoleSchema = z.enum([
  'MASTER_ORCHESTRATOR',
  'UNIT_OP_SPECIALIST',
  'BOTTLENECK_DIAGNOSTICIAN',
  'MASS_BALANCE_AUDITOR'
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const NeighborhoodContextSchema = z.object({
  currentNodeId: z.string(),
  upstreamNodes: z.array(ProcessNodeSchema),
  downstreamNodes: z.array(ProcessNodeSchema),
  expectedInletRate: z.number().optional(),
  expectedOutletRate: z.number().optional(),
  fluidViscosityCentipoise: z.number().optional()
});
export type NeighborhoodContext = z.infer<typeof NeighborhoodContextSchema>;

export const UnitOpSubAgentStateSchema = z.object({
  subAgentId: z.string(),
  nodeId: z.string(),
  kind: NodeKindSchema,
  status: z.enum(['UNCONFIGURED', 'CONFIGURING', 'SYNCHRONIZED', 'ERROR']),
  lastProposedParameters: z.record(z.unknown()).optional(),
  validationErrors: z.array(z.string()).default([])
});
export type UnitOpSubAgentState = z.infer<typeof UnitOpSubAgentStateSchema>;

/**
 * Generative UI Action: Renders dynamic machine parameter controls inside the inspector drawer.
 * Utilized by CopilotKit's `useCopilotAction` or CoAgents generative UI renderer.
 */
export const GenerativeInspectorWidgetSchema = z.object({
  widgetType: z.enum([
    'ROTARY_FILLER_INSPECTOR',
    'BATCH_REACTOR_INSPECTOR',
    'CONVEYOR_INSPECTOR',
    'LABELER_INSPECTOR',
    'BOTTLENECK_ALERT_PANEL'
  ]),
  nodeId: z.string(),
  title: z.string(),
  interactiveControls: z.array(
    z.object({
      fieldKey: z.string(),
      label: z.string(),
      type: z.enum(['SLIDER', 'NUMBER_INPUT', 'TOGGLE', 'SELECT']),
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
      options: z.array(z.string()).optional(),
      currentValue: z.union([z.number(), z.string(), z.boolean()])
    })
  ),
  physicalValidationBadges: z.array(
    z.object({
      label: z.string(),
      status: z.enum(['PASS', 'WARN', 'FAIL']),
      detail: z.string()
    })
  )
});
export type GenerativeInspectorWidget = z.infer<typeof GenerativeInspectorWidgetSchema>;

/**
 * Human-In-The-Loop (HITL) Graph Reconfiguration Proposal
 * Emitted when an agent detects an imbalance (e.g. adding a surge tank or expanding nozzles).
 */
export const GraphProposalSchema = z.object({
  proposalId: z.string(),
  originatingAgent: z.string(),
  summary: z.string(),
  rationale: z.string(),
  diff: z.object({
    addedNodes: z.array(ProcessNodeSchema).default([]),
    modifiedNodes: z.array(ProcessNodeSchema).default([]),
    deletedNodeIds: z.array(z.string()).default([])
  }),
  userApprovalState: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING')
});
export type GraphProposal = z.infer<typeof GraphProposalSchema>;
