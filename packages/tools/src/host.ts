import type { DecisionProvider, FlowsheetEdit, ProcessGraph, ProcessNode, UnitOpContract } from '@process-forge/protocol';

/**
 * Where the tools run. The tools themselves (what each one is called, what it
 * takes, what it checks and what it returns) are defined once, in this
 * package; a host only says how to reach the flowsheet.
 *
 *   - The MCP server's host reaches the flowsheet open in ProcessForge
 *     Desktop over the local bridge (mcp-server/src/tools/desktopBridge.ts).
 *   - The in-app assistant's host is the studio's own canvas, and every change
 *     waits for the engineer's approval first (canvas-ui/src/ai/agent).
 *
 * So a model gets the same tools, the same rules and the same answers in
 * Claude Desktop and inside ProcessForge.
 */

/** Which host a tool is running under: an MCP client, or the in-app assistant. */
export type Surface = 'mcp' | 'studio';

export interface AddUnitOptions {
  /** Optional canvas position; by default to the right of the flowsheet. */
  position?: { x: number; y: number };
  /** Pipe this unit (id, name or tag) into the new one. */
  connectFrom?: string;
  /** Pipe the new unit into this one. */
  connectTo?: string;
}

export interface StreamRequest {
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
}

export interface PublishRequest {
  unit: string;
  description?: string;
  category?: 'PACKAGING' | 'FLUID_PROCESSING' | 'MATERIAL_HANDLING' | 'QUALITY';
  tags?: string[];
  releaseNotes?: string;
}

/**
 * Managing the engineer's flowsheets (projects): listing them, starting one,
 * opening one, and naming and saving the open one. Every flowsheet is kept on
 * this computer as it changes; `cloud` also uploads it to the engineer's
 * account.
 */
export type ProjectRequest =
  | { op: 'list' }
  | { op: 'new'; name?: string; description?: string; template?: string }
  | { op: 'open'; flowsheet: string }
  | { op: 'save'; name?: string; description?: string; cloud?: boolean };

/** A decision model, and who answered the last question (Jev, or the offline rules). */
export interface DecisionSource extends DecisionProvider {
  lastSource: { by: 'jev' | 'offline'; reason?: string };
}

/** A result a host hands back: a plain object, with `success` and an `error` when it failed. */
export type HostResult = Record<string, unknown>;

export interface ToolHost {
  surface: Surface;
  /** The flowsheet the engineer has open, or why there is none. */
  readOpen(): Promise<{ graph: ProcessGraph; projectName?: string } | { error: string }>;
  /** Places a whole unit (standard, community, or a designed one already accepted) and pipes it in when asked. */
  addUnit(node: ProcessNode, options: AddUnitOptions, source: 'standard' | 'community'): Promise<HostResult>;
  /** Places a designed unit the engine has accepted, and keeps it in My unit ops. */
  addDesignedUnit(contract: UnitOpContract, options: AddUnitOptions): Promise<HostResult>;
  addStream(stream: StreamRequest): Promise<HostResult>;
  /** Changes or removes a unit, or removes a stream (protocol/edit.ts rules). */
  edit(edit: FlowsheetEdit): Promise<HostResult>;
  /** Opens the publish dialog for the engineer; nothing is published from a tool. */
  requestPublish(request: PublishRequest): Promise<HostResult>;
  /** Lists, starts, opens, names and saves flowsheets. Absent where the host cannot (the result says so). */
  project?(request: ProjectRequest): Promise<HostResult>;
  /** Who decides what a complete design of a unit carries. */
  decider: DecisionSource;
  /** The community library's API, e.g. https://.../api. */
  communityApiBase: string;
}
