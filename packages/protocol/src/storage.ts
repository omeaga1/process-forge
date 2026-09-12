import { z } from 'zod';
import { ProcessGraphSchema, type ProcessGraph } from './graph.js';

export const ChatSenderSchema = z.enum(['USER', 'SUB_AGENT', 'ORCHESTRATOR', 'SYSTEM']);
export type ChatSender = z.infer<typeof ChatSenderSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  sender: ChatSenderSchema,
  text: z.string(),
  timestampIso: z.string(),
  metadata: z.record(z.unknown()).optional()
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SimulationProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
  schemaVersion: z.string().default('1.0.0'),
  graph: ProcessGraphSchema,
  subAgentHistories: z.record(z.array(ChatMessageSchema)).default({}),
  orchestratorHistory: z.array(ChatMessageSchema).default([]),
  cachedRunMetrics: z.record(z.unknown()).optional(),
  isGuestProject: z.boolean().default(true)
});
export type SimulationProject = z.infer<typeof SimulationProjectSchema>;

/**
 * Serializes an entire simulation project into a portable .pfg.json bundle string.
 */
export function exportSimulationProject(project: SimulationProject): string {
  // Validate before serializing
  const validated = SimulationProjectSchema.parse(project);
  return JSON.stringify(validated, null, 2);
}

/**
 * Parses and validates an uploaded or restored simulation project bundle.
 * Throws ZodError if the project schema is invalid or corrupted.
 */
export function importSimulationProject(rawJson: string): SimulationProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err: any) {
    throw new Error(`Failed to parse project JSON: ${err?.message || String(err)}`);
  }
  return SimulationProjectSchema.parse(parsed);
}

/**
 * Factory helper to construct a new SimulationProject wrapper around a ProcessGraph.
 */
export function createSimulationProject(
  name: string,
  graph: ProcessGraph,
  options?: {
    description?: string;
    isGuest?: boolean;
  }
): SimulationProject {
  const now = new Date().toISOString();
  return {
    id: `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    description: options?.description ?? '',
    createdAt: now,
    updatedAt: now,
    schemaVersion: '1.0.0',
    graph,
    subAgentHistories: {},
    orchestratorHistory: [],
    isGuestProject: options?.isGuest ?? true
  };
}
