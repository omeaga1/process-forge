import { OPENROUTER_CHAT_URL, openRouterErrorMessage, openRouterHeaders, type LlmCredentials } from '../llmClient.js';
import { AGENT_TOOLS, findAgentTool, type AgentHost, type AgentTool } from './agentTools.js';
import { offlineDecider, type SourcedDecisionProvider } from './jevProvider.js';

/**
 * The in-app assistant's loop: the model answers or calls tools, the tools run
 * against the open flowsheet, their results go back, until it answers. Tools
 * that change the flowsheet wait for the engineer's approval of that call; a
 * declined call is reported to the model as declined, and nothing changes.
 *
 * Uses OpenAI-style tool calling, which OpenRouter speaks for every model that
 * supports tools, and OpenAI keys directly.
 */

export const AGENT_PROVIDERS: LlmCredentials['provider'][] = ['openrouter', 'openai'];
export const supportsAgent = (creds: LlmCredentials | null | undefined): boolean => Boolean(creds && AGENT_PROVIDERS.includes(creds.provider));

export const AGENT_SYSTEM_PROMPT = `You are the assistant inside ProcessForge, a process simulation studio. You work on the flowsheet the engineer has open, with the same tools ProcessForge gives MCP clients.

How to work:
1. Look first: get_open_flowsheet. Simulate (simulate_process_line) or try what-ifs (compare_scenarios) freely; they change nothing.
2. Build with standard equipment first (list_standard_unit_ops, add_standard_unit_op); then the community library (search_community_unit_ops, add_community_unit_op; listings are unreviewed, say so).
3. For equipment neither has, design it: design_unit_op gives the brief and a designChecklist of what a complete design of this unit includes (energy balance, outlets, components...); write a UnitOpContract that covers it; validate_unit_op until the engine ACCEPTS it; then add_unit_op_to_flowsheet. validate_unit_op also returns completeness warnings: fix each one, or tell the engineer why it does not apply. Never claim a design works because you believe it does: the engine's verdict decides.
4. Every change to the flowsheet (adding, piping, changing settings, removing) is shown to the engineer to approve before it happens. Propose the change with the tool call itself, one clear step at a time. If they decline, do not retry the same change; ask what they want instead.
5. After changes, simulate again and report what moved, with numbers.

Units: liquid in gal/min and gallons, items per minute, temperatures in °C, duty in kW. Be concise and plain; say what you did and what you found.`;

export type AgentMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type AgentEvent =
  | { type: 'tool'; id: string; name: string; summary: string; access: AgentTool['access']; status: 'running' | 'done' | 'failed' | 'declined'; detail?: string; decidedBy?: string }
  | { type: 'text'; text: string };

export interface ApprovalRequest {
  id: string;
  tool: string;
  summary: string;
  args: Record<string, unknown>;
}

export interface AgentRunOptions {
  creds: LlmCredentials;
  /** The conversation so far, without the system prompt. Appended to in place. */
  history: AgentMessage[];
  host: AgentHost;
  onEvent: (e: AgentEvent) => void;
  /** Resolves true when the engineer approves this change. */
  approve: (req: ApprovalRequest) => Promise<boolean>;
  signal?: AbortSignal;
  /** Answers the design questions: Jev through OpenRouter, or offline heuristics. */
  decider?: SourcedDecisionProvider;
  /** Test seam: the chat endpoint call. */
  complete?: (messages: AgentMessage[]) => Promise<{ content: string | null; tool_calls?: ToolCall[] }>;
  maxSteps?: number;
}

const toolSchemas = AGENT_TOOLS.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));

/** Tool results can be large (a design brief); models need the start more than the tail. */
const MAX_RESULT_CHARS = 60000;

async function chatCompletion(creds: LlmCredentials, messages: AgentMessage[], signal?: AbortSignal) {
  const openrouter = creds.provider === 'openrouter';
  const key = openrouter ? creds.openrouterApiKey : creds.openaiApiKey;
  if (!key?.trim()) throw new Error(openrouter ? 'Sign in with OpenRouter first (AI model settings).' : 'Add your OpenAI API key first (AI model settings).');
  const res = await fetch(openrouter ? OPENROUTER_CHAT_URL : 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: openrouter ? openRouterHeaders(key) : { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: creds.modelId, messages, tools: toolSchemas, tool_choice: 'auto' }),
    ...(signal ? { signal } : {})
  });
  const data = (await res.json().catch(() => ({}))) as { choices?: { message?: { content: string | null; tool_calls?: ToolCall[] } }[]; error?: { message?: string } };
  if (!res.ok) {
    const detail = data.error?.message;
    if (/tool|function/i.test(detail ?? '')) throw new Error(`This model cannot use tools${detail ? ` (${detail})` : ''}. Choose another model in the AI model settings, e.g. Claude or GPT.`);
    throw new Error(openrouter ? openRouterErrorMessage(res.status, detail) : detail || `OpenAI error (HTTP ${res.status}).`);
  }
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('The model sent back nothing.');
  return message;
}

/** Runs the assistant until it answers. Resolves to its final text. */
export async function runAgent(opts: AgentRunOptions): Promise<string> {
  const { history, host, onEvent, approve } = opts;
  const complete = opts.complete ?? ((m: AgentMessage[]) => chatCompletion(opts.creds, m, opts.signal));
  const maxSteps = opts.maxSteps ?? 24;
  for (let step = 0; step < maxSteps; step++) {
    if (opts.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    const reply = await complete([{ role: 'system', content: AGENT_SYSTEM_PROMPT }, ...history]);
    const calls = reply.tool_calls ?? [];
    history.push({ role: 'assistant', content: reply.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });
    if (reply.content && calls.length) onEvent({ type: 'text', text: reply.content });
    if (calls.length === 0) return reply.content ?? '';

    for (const call of calls) {
      const tool = findAgentTool(call.function.name);
      let args: Record<string, any> = {};
      let result: unknown;
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        result = { error: 'The arguments were not valid JSON.' };
      }
      if (!tool) result = { error: `No tool "${call.function.name}".` };
      if (tool && result === undefined) {
        const summary = safeSummary(tool, args, host);
        if (tool.access === 'write' && !(await approve({ id: call.id, tool: tool.name, summary, args }))) {
          onEvent({ type: 'tool', id: call.id, name: tool.name, summary, access: tool.access, status: 'declined' });
          result = { declined: true, message: 'The engineer declined this change; nothing changed. Do not retry it; ask what they want instead.' };
        } else {
          onEvent({ type: 'tool', id: call.id, name: tool.name, summary, access: tool.access, status: 'running' });
          try {
            result = await tool.run(args, host, { decider: opts.decider ?? offlineDecider('no decision model') });
            const failed = isFailure(result);
            const decided = decidedByOf(result);
            onEvent({ type: 'tool', id: call.id, name: tool.name, summary, access: tool.access, status: failed ? 'failed' : 'done', ...(failed ? { detail: failed } : {}), ...(decided ? { decidedBy: decided } : {}) });
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) };
            onEvent({ type: 'tool', id: call.id, name: tool.name, summary, access: tool.access, status: 'failed', detail: (result as { error: string }).error });
          }
        }
      }
      const text = JSON.stringify(result ?? null);
      history.push({ role: 'tool', tool_call_id: call.id, content: text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… (truncated)` : text });
    }
  }
  return 'I stopped after many steps without finishing. Tell me how you want to continue.';
}

function safeSummary(tool: AgentTool, args: Record<string, any>, host: AgentHost): string {
  try {
    return tool.summarize(args, host.getGraph());
  } catch {
    return tool.name;
  }
}

/** Who decided a design checklist or completeness warnings in a result, if it has them. */
function decidedByOf(result: unknown): string | undefined {
  const r = (result ?? {}) as { designChecklist?: { decidedBy?: string }; completeness?: { decidedBy?: string } };
  return r.designChecklist?.decidedBy ?? r.completeness?.decidedBy;
}

/** A tool result that reports it did not do its job: its error, for the activity list. */
function isFailure(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (typeof r.error === 'string') return r.error;
  if (r.verdict === 'REJECTED') return 'The engine rejected the design; revising.';
  return null;
}
