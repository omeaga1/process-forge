import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { EVAPORATOR_CONTRACT, createStandardUnitOp, findStandardUnitOp, type ProcessGraph } from '@process-forge/protocol';
import { runAgent, type AgentMessage, type AgentEvent } from '../ai/agent/agentLoop.js';
import type { AgentHost } from '../ai/agent/agentTools.js';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) },
  configurable: true
});

const unit = (id: string, name: string) => ({ ...createStandardUnitOp(findStandardUnitOp(id)!), id: name.toLowerCase(), name });

function hostWith(graph: ProcessGraph): AgentHost & { graph: ProcessGraph; commits: number } {
  const h = {
    graph,
    commits: 0,
    getGraph: () => h.graph,
    commit: (next: ProcessGraph) => {
      h.graph = next;
      h.commits++;
    }
  };
  return h;
}

/** A scripted model: each step returns the next reply; it sees the tool results in the history. */
function scripted(steps: ((history: AgentMessage[]) => { content: string | null; tool_calls?: any[] })[]) {
  let i = 0;
  return async (messages: AgentMessage[]) => steps[Math.min(i++, steps.length - 1)]!(messages);
}
const call = (id: string, name: string, args: unknown) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const lastTool = (m: AgentMessage[]) => JSON.parse((m.at(-1) as { content: string }).content);

const creds = { provider: 'openrouter', modelId: 'test' } as const;

describe('In-app assistant', () => {
  beforeEach(() => store.clear());

  it('reads and simulates without asking, and changes the flowsheet only when approved', async () => {
    const host = hostWith({ id: 'g', name: 'Line', version: '1', metadata: {}, nodes: [unit('feed', 'Feed'), unit('pump', 'P-101')], edges: [] } as unknown as ProcessGraph);
    const asked: string[] = [];
    const events: AgentEvent[] = [];
    let sawFlowsheet: any;
    const answer = await runAgent({
      creds,
      history: [{ role: 'user', content: 'pipe the feed into the pump' }],
      host,
      onEvent: (e) => events.push(e),
      approve: async (req) => {
        asked.push(req.summary);
        return true;
      },
      complete: scripted([
        () => ({ content: null, tool_calls: [call('1', 'get_open_flowsheet', {}), call('2', 'simulate_process_line', { durationMinutes: 5 })] }),
        (m) => {
          sawFlowsheet = JSON.parse((m.find((x) => x.role === 'tool' && x.tool_call_id === '1') as { content: string }).content);
          return { content: null, tool_calls: [call('3', 'add_stream', { from: 'Feed', to: 'P-101' })] };
        },
        () => ({ content: 'Piped the feed into P-101.' })
      ])
    });
    assert.strictEqual(answer, 'Piped the feed into P-101.');
    assert.deepStrictEqual(sawFlowsheet.units.map((u: any) => u.name), ['Feed', 'P-101']);
    assert.deepStrictEqual(asked, ['Pipe Feed into P-101'], 'only the change asked for approval');
    assert.strictEqual(host.graph.edges.length, 1);
    assert.strictEqual(host.commits, 1);
    assert.ok(events.some((e) => e.type === 'tool' && e.name === 'simulate_process_line' && e.status === 'done'));
  });

  it('a declined change leaves the flowsheet as it was, and the model is told', async () => {
    const host = hostWith({ id: 'g', name: 'Line', version: '1', metadata: {}, nodes: [unit('pump', 'P-101')], edges: [] } as unknown as ProcessGraph);
    let told: any;
    await runAgent({
      creds,
      history: [{ role: 'user', content: 'remove the pump' }],
      host,
      onEvent: () => {},
      approve: async () => false,
      complete: scripted([
        () => ({ content: null, tool_calls: [call('1', 'remove_unit', { unit: 'P-101' })] }),
        (m) => {
          told = lastTool(m);
          return { content: 'OK, I left it.' };
        }
      ])
    });
    assert.strictEqual(host.graph.nodes.length, 1);
    assert.strictEqual(host.commits, 0);
    assert.strictEqual(told.declined, true);
  });

  it('designs a unit: the engine checks it, and it is placed only once accepted', async () => {
    const host = hostWith({ id: 'g', name: 'Line', version: '1', metadata: {}, nodes: [unit('feed', 'Juice')], edges: [] } as unknown as ProcessGraph);
    const broken = { ...EVAPORATOR_CONTRACT, derived: [...EVAPORATOR_CONTRACT.derived, { name: 'bad', label: 'Bad', unit: '-', expr: 'nope * 2' }] };
    const verdicts: string[] = [];
    await runAgent({
      creds,
      history: [{ role: 'user', content: 'design an evaporator after the juice feed' }],
      host,
      onEvent: () => {},
      approve: async () => true,
      complete: scripted([
        () => ({ content: null, tool_calls: [call('1', 'design_unit_op', { description: 'single effect evaporator', targetUnit: 'Juice' })] }),
        (m) => {
          assert.ok(String(lastTool(m).brief).includes('UnitOpContract'));
          return { content: null, tool_calls: [call('2', 'validate_unit_op', { contract: broken })] };
        },
        (m) => {
          verdicts.push(lastTool(m).verdict);
          return { content: null, tool_calls: [call('3', 'add_unit_op_to_flowsheet', { contract: broken })] };
        },
        (m) => {
          assert.strictEqual(lastTool(m).added, false, 'a rejected design is not placed');
          return { content: null, tool_calls: [call('4', 'validate_unit_op', { contract: EVAPORATOR_CONTRACT })] };
        },
        (m) => {
          verdicts.push(lastTool(m).verdict);
          return { content: null, tool_calls: [call('5', 'add_unit_op_to_flowsheet', { contract: EVAPORATOR_CONTRACT, connectFrom: 'Juice' })] };
        },
        () => ({ content: 'Placed the evaporator.' })
      ])
    });
    assert.deepStrictEqual(verdicts, ['REJECTED', 'ACCEPTED']);
    assert.strictEqual(host.graph.nodes.length, 2);
    assert.strictEqual(host.graph.edges.length, 1, 'piped from the juice feed');
    assert.ok(store.get('pf_my_unit_ops')?.includes(EVAPORATOR_CONTRACT.id), 'kept in My unit ops');
  });

  it('reports a tool that does not exist, and bad arguments, back to the model', async () => {
    const host = hostWith({ id: 'g', name: 'Line', version: '1', metadata: {}, nodes: [], edges: [] } as unknown as ProcessGraph);
    const results: any[] = [];
    await runAgent({
      creds,
      history: [{ role: 'user', content: 'x' }],
      host,
      onEvent: () => {},
      approve: async () => true,
      complete: scripted([
        () => ({ content: null, tool_calls: [call('1', 'launch_rockets', {}), { id: '2', type: 'function', function: { name: 'add_stream', arguments: '{nope' } }] }),
        (m) => {
          results.push(...m.filter((x) => x.role === 'tool').map((x) => JSON.parse((x as { content: string }).content)));
          return { content: 'done' };
        }
      ])
    });
    assert.match(results[0].error, /No tool/);
    assert.match(results[1].error, /not valid JSON/);
  });
});
