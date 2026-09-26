import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createProcessForgeMcpServer, SERVER_INSTRUCTIONS, TOOLS, SERVER_VERSION } from '../server.js';
import { resolveGraph } from '../tools/graphSource.js';
import { executeCompareScenarios, applyScenario } from '../tools/compareScenarios.js';
import { SHERWIN_WILLIAMS_PAINT_LINE } from '../templates.js';
import pkg from '../../package.json' with { type: 'json' };

async function connected() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createProcessForgeMcpServer();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe('What any MCP client sees', () => {
  it('gets the workflow as server instructions, and the package version', async () => {
    const client = await connected();
    assert.equal(client.getInstructions(), SERVER_INSTRUCTIONS);
    assert.match(SERVER_INSTRUCTIONS, /compare_scenarios/);
    assert.equal(client.getServerVersion()?.version, SERVER_VERSION);
    assert.equal(SERVER_VERSION, pkg.version, 'server.ts and package.json agree');
  });

  it('every tool has a title and says whether it changes anything', async () => {
    const client = await connected();
    const { tools } = await client.listTools();
    assert.equal(tools.length, TOOLS.length);
    for (const t of tools) {
      assert.ok(t.title, `${t.name} has a title`);
      assert.equal(typeof t.annotations?.readOnlyHint, 'boolean', `${t.name} says if it is read-only`);
    }
    const writes = tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name).sort();
    assert.deepEqual(writes, [
      'add_community_unit_op',
      'add_standard_unit_op',
      'add_stream',
      'add_unit_op_to_flowsheet',
      'publish_unit_op',
      'remove_stream',
      'remove_unit',
      'update_unit'
    ]);
    const destructive = tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name).sort();
    assert.deepEqual(destructive, ['remove_stream', 'remove_unit'], 'only the removals delete');
  });

  it('returns structured content alongside the text', async () => {
    const client = await connected();
    const r = await client.callTool({ name: 'diagnose_bottlenecks', arguments: { templateName: 'sherwin-williams-paint-line' } });
    const s = r.structuredContent as Record<string, unknown>;
    assert.equal(s.bottleneckNodeId, 'reactor-101');
    assert.equal(s.source, 'template');
    assert.deepEqual(JSON.parse((r.content as { text: string }[])[0]!.text), s);
  });

  it('offers prompts that name the tools to use, and insists on required arguments', async () => {
    const client = await connected();
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name).sort(), ['build-line', 'debottleneck-line', 'design-unit-op']);
    const p = await client.getPrompt({ name: 'debottleneck-line', arguments: { goal: '40 cans/min' } });
    const text = (p.messages[0]!.content as { text: string }).text;
    assert.match(text, /40 cans\/min/);
    assert.match(text, /compare_scenarios/);
    await assert.rejects(client.getPrompt({ name: 'design-unit-op', arguments: {} }), /needs "description"/);
  });

  it('serves the guide, the catalog and the templates as resources', async () => {
    const client = await connected();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    assert.ok(uris.includes('processforge://catalog/standard'));
    assert.ok(uris.includes('processforge://templates/sherwin-williams-paint-line'));
    const t = await client.readResource({ uri: 'processforge://templates/sherwin-williams-paint-line' });
    assert.equal(JSON.parse((t.contents[0] as { text: string }).text).id, SHERWIN_WILLIAMS_PAINT_LINE.id);
    const guide = await client.readResource({ uri: 'processforge://guide/workflow' });
    assert.equal((guide.contents[0] as { text: string }).text, SERVER_INSTRUCTIONS);
  });

  it('reports a tool that threw as an error, with its message', async () => {
    const client = await connected();
    const r = await client.callTool({ name: 'simulate_process_line', arguments: { templateName: 'no-such-line' } });
    assert.equal(r.isError, true);
    assert.match((r.content as { text: string }[])[0]!.text, /No template "no-such-line"/);
  });
});

describe('Which flowsheet a tool uses', () => {
  const down = async () => ({ success: false, error: 'not running' });

  it('the graph it was given, then a template', async () => {
    assert.equal((await resolveGraph({ graph: SHERWIN_WILLIAMS_PAINT_LINE }, down)).source, 'graph');
    assert.equal((await resolveGraph({ templateName: 'beverage-bottling-line' }, down)).source, 'template');
  });

  it('the open flowsheet when the app is running', async () => {
    const open = async () => ({ success: true, flowsheet: { projectName: 'Plant 2', graph: SHERWIN_WILLIAMS_PAINT_LINE } });
    const r = await resolveGraph({}, open);
    assert.equal(r.source, 'open-flowsheet');
    assert.match(r.note!, /Plant 2/);
  });

  it('otherwise the demo, and says it is not the engineer\'s line', async () => {
    const r = await resolveGraph({}, down);
    assert.equal(r.source, 'demo');
    assert.match(r.note!, /not the engineer's/);
  });
});

describe('compare_scenarios', () => {
  it('a shorter reaction lifts a reactor-limited line; nothing else changes', () => {
    const before = JSON.stringify(SHERWIN_WILLIAMS_PAINT_LINE);
    const r = executeCompareScenarios(SHERWIN_WILLIAMS_PAINT_LINE, {
      durationMinutes: 180,
      scenarios: [
        { name: 'Faster reaction', changes: [{ unit: 'reactor-101', parameters: { reactionDurationMinutes: 20 } }] },
        { name: 'Faster labeler only', changes: [{ unit: 'labeler-500', parameters: { maxSpeedUnitsPerMinute: 60 } }] }
      ]
    });
    const [faster, labeler] = r.scenarios;
    assert.ok(faster!.unitsPerMinute > r.baseline.unitsPerMinute, `${faster!.unitsPerMinute} vs ${r.baseline.unitsPerMinute}`);
    assert.ok(faster!.unitsPerMinuteChangePercent! > 10);
    assert.equal(faster!.applied[0]!.from, 45);
    assert.equal(labeler!.applied.length, 1);
    assert.equal(labeler!.warnings, undefined);
    // Speeding up a unit that is not the limit buys little.
    assert.ok(Math.abs(labeler!.unitsPerMinuteChangePercent ?? 0) < 3, `labeler ${labeler!.unitsPerMinuteChangePercent}`);
    assert.equal(JSON.stringify(SHERWIN_WILLIAMS_PAINT_LINE), before, 'the input graph is untouched');
    assert.match(r.summary, /Best: Faster reaction/);
  });

  it('finds units by tag or name, reaches nested settings, and warns about what it cannot find', () => {
    const { graph, applied, warnings } = applyScenario(SHERWIN_WILLIAMS_PAINT_LINE, {
      changes: [
        { unit: 'B-101', parameters: { 'fluid.temperatureCelsius': 80 } },
        { unit: 'Nonexistent Mixer', parameters: { x: 1 } }
      ]
    });
    const reactor = graph.nodes.find((n) => n.id === 'reactor-101')!;
    assert.equal((reactor.config as { fluid: { temperatureCelsius: number } }).fluid.temperatureCelsius, 80);
    assert.equal(applied.length, 1);
    assert.match(warnings[0]!, /No unit "Nonexistent Mixer"/);
    const original = SHERWIN_WILLIAMS_PAINT_LINE.nodes.find((n) => n.id === 'reactor-101')!;
    assert.notEqual((original.config as { fluid: { temperatureCelsius: number } }).fluid.temperatureCelsius, 80);
  });
});

describe('compare_scenarios: designed units', () => {
  it('tunes a designed unit by its contract parameters', async () => {
    const { EVAPORATOR_CONTRACT } = await import('@process-forge/protocol');
    const evap = { id: 'evap', name: 'Evaporator E-301', kind: 'CUSTOM_UNIT_OP', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: { contract: EVAPORATOR_CONTRACT } };
    const g = { id: 'g', name: 'g', version: '1.0.0', metadata: {}, nodes: [evap], edges: [] } as never;
    const r = executeCompareScenarios(g, {
      durationMinutes: 5,
      scenarios: [
        { name: 'Less steam', changes: [{ unit: 'E-301', parameters: { steamDutyKw: 1200 } }] },
        { name: 'Too little', changes: [{ unit: 'E-301', parameters: { steamDutyKw: 100 } }] }
      ]
    });
    assert.equal(r.scenarios[0]!.applied[0]!.designParameter, true);
    assert.equal(r.scenarios[0]!.warnings, undefined);
    assert.equal(r.scenarios[1]!.applied.length, 0, 'a change that breaks the design is not applied');
    assert.match(r.scenarios[1]!.warnings![0]!, /fail its checks/);
  });
});
