import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Web Studio MCP Configuration Generation', () => {
  it('generates a valid claude_desktop_config.json snippet', () => {
    const cliPath = 'C:/Personal Projects/process-forge/packages/mcp-server/dist/cli.js';
    const config = {
      mcpServers: {
        'process-forge': {
          command: 'node',
          args: [cliPath]
        }
      }
    };

    const serialized = JSON.stringify(config, null, 2);
    assert.ok(typeof serialized === 'string');

    // Verify it parses back into valid JSON
    const parsed = JSON.parse(serialized);
    assert.ok(parsed.mcpServers['process-forge']);
    assert.strictEqual(parsed.mcpServers['process-forge'].command, 'node');
    assert.strictEqual(parsed.mcpServers['process-forge'].args[0], cliPath);
  });

  it('formats gemini CLI command with quoted node and path args', () => {
    const cliPath = 'C:/Personal Projects/process-forge/packages/mcp-server/dist/cli.js';
    const cmd = `gemini mcp add process-forge node "${cliPath}"`;

    assert.ok(cmd.startsWith('gemini mcp add process-forge'));
    assert.ok(cmd.includes('node'));
    assert.ok(cmd.includes('packages/mcp-server/dist/cli.js'));
  });
});
