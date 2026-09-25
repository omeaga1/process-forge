import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ProcessNodeSchema } from '@process-forge/protocol';
import { createDefaultProcessNode } from '../utils/nodeFactory.js';
import { parseUnitOpToolCall } from '../ai/aiDispatch.js';
import { STANDARD_EQUIPMENT_CATALOG } from '../components/palette/EquipmentPaletteModal.js';

describe('Equipment Factory & Node Generation', () => {
  it('creates a validated Centrifugal Pump node complying with ProcessNodeSchema', () => {
    const pump = createDefaultProcessNode('PUMP', {
      name: 'Feed Water Pump P-001',
      flowRateGpm: 120
    });

    assert.strictEqual(pump.kind, 'PUMP');
    assert.strictEqual(pump.name, 'Feed Water Pump P-001');
    assert.strictEqual(pump.inputs.length, 1);
    assert.strictEqual(pump.outputs.length, 1);
    assert.strictEqual(pump.inputs[0]?.type, 'FLUID_INPUT');
    assert.strictEqual(pump.outputs[0]?.type, 'FLUID_OUTPUT');

    const cfg = pump.config as Record<string, unknown>;
    assert.strictEqual(cfg.designFlowRateGpm, 120);
    assert.strictEqual(typeof cfg.motorHorsepower, 'number');

    // Validate with zod schema
    const validation = ProcessNodeSchema.safeParse(pump);
    assert.strictEqual(validation.success, true);
  });

  it('creates validated nodes for all major industrial kinds', () => {
    const kinds = [
      'PUMP',
      'SURGE_TANK',
      'BATCH_REACTOR',
      'HEAT_EXCHANGER',
      'SEPARATOR',
      'ROTARY_FILLER',
      'CONVEYOR',
      'LABELER',
      'PALLETIZER'
    ] as const;

    for (const kind of kinds) {
      const node = createDefaultProcessNode(kind);
      assert.strictEqual(node.kind, kind);
      assert.ok(node.id.length > 0);
      assert.ok(node.name.length > 0);
      assert.ok(node.assignedSubAgentId?.startsWith('subagent-'));

      const validation = ProcessNodeSchema.safeParse(node);
      assert.strictEqual(validation.success, true, `Validation failed for kind ${kind}: ${validation.error}`);
    }
  });

  it('verifies the standard catalog: 9 unit operations and the 4 feed and outlet arrows', () => {
    assert.strictEqual(STANDARD_EQUIPMENT_CATALOG.filter((item) => item.kind !== 'TERMINAL').length, 9);
    assert.deepStrictEqual(
      STANDARD_EQUIPMENT_CATALOG.filter((item) => item.kind === 'TERMINAL').map((item) => item.terminalRole),
      ['feed', 'product', 'byproduct', 'waste']
    );
    assert.strictEqual(new Set(STANDARD_EQUIPMENT_CATALOG.map((item) => item.id)).size, STANDARD_EQUIPMENT_CATALOG.length, 'ids are unique');
    const pumpItem = STANDARD_EQUIPMENT_CATALOG.find((item) => item.kind === 'PUMP');
    assert.ok(pumpItem);
    assert.strictEqual(pumpItem?.category, 'FLUID_PROCESSING');
    assert.strictEqual(pumpItem?.defaultFlowGpm, 100);
  });
});

describe('Master Orchestrator Tool Calling & Action Execution', () => {
  it('parses explicit JSON tool call blocks and creates the ProcessNode', async () => {
    const rawResponse = `Here are the preliminary calculations for your pump.

\`\`\`json:tool_call
{
  "action": "ADD_UNIT_OP",
  "kind": "PUMP",
  "name": "Centrifugal Pump P-003",
  "flowRateGpm": 100
}
\`\`\`

The pump has been prepared with suction and discharge connections.`;

    const { cleanText, createdNode } = await parseUnitOpToolCall(rawResponse, 'add a pump');

    assert.ok(createdNode);
    assert.strictEqual(createdNode.kind, 'PUMP');
    assert.strictEqual(createdNode.name, 'Centrifugal Pump P-003');
    const cfg = createdNode.config as Record<string, unknown>;
    assert.strictEqual(cfg.designFlowRateGpm, 100);

    // Ensure raw json block is removed from cleanText
    assert.strictEqual(cleanText.includes('```json:tool_call'), false);
    assert.strictEqual(cleanText.includes('Here are the preliminary calculations'), true);
  });

  it('heuristic fallback: detects pump creation intent from user prompt', async () => {
    const userPrompt = 'pump, pumping 100 GPM of water, 3, no connections for now. just input and output';
    const rawResponse = '### Flowsheet Update Summary\n**Unit Operation Added:** Centrifugal Pump (`P-003`)';

    const { createdNode } = await parseUnitOpToolCall(rawResponse, userPrompt);

    assert.ok(createdNode);
    assert.strictEqual(createdNode.kind, 'PUMP');
    const cfg = createdNode.config as Record<string, unknown>;
    assert.strictEqual(cfg.designFlowRateGpm, 100);
  });

  it('heuristic fallback: detects reactor creation intent', async () => {
    const userPrompt = 'Please add a new batch reactor with 50 gpm discharge rate';
    const rawResponse = 'I have designed a jacketed CSTR batch reactor for your line.';

    const { createdNode } = await parseUnitOpToolCall(rawResponse, userPrompt);

    assert.ok(createdNode);
    assert.strictEqual(createdNode.kind, 'BATCH_REACTOR');
  });

  it('does not trigger node creation when user is simply asking questions', async () => {
    const userPrompt = 'What is the current bottleneck of my plant?';
    const rawResponse = 'The current active bottleneck is the High-Speed Rotary Labeler operating at 35 CPM.';

    const { createdNode } = await parseUnitOpToolCall(rawResponse, userPrompt);

    assert.strictEqual(createdNode, undefined);
  });
});
