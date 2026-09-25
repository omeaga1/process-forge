/**
 * How to add the ProcessForge MCP server to each client that can run a local
 * (stdio) server. Shown in AI model -> MCP client, one tab per client; the
 * server README says the same (packages/mcp-server/README.md).
 */

export const MCP_PACKAGE = '@process-forge/mcp-server';
const ARGS = ['-y', MCP_PACKAGE];

export interface McpClientSetup {
  id: string;
  label: string;
  /** Where the snippet goes, or what to run it in. */
  where: string;
  /** A command to run, or a config file's contents. */
  kind: 'command' | 'config';
  /** File name for a config snippet. */
  file?: string;
  snippet: string;
  note?: string;
}

const json = (v: unknown) => JSON.stringify(v, null, 2);
const mcpServers = json({ mcpServers: { 'process-forge': { command: 'npx', args: ARGS } } });

export const MCP_CLIENTS: McpClientSetup[] = [
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    where: 'Settings → Developer → Edit Config, then restart Claude Desktop. (Or use the one-click extension above.)',
    kind: 'config',
    file: 'claude_desktop_config.json',
    snippet: mcpServers
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    where: 'Run in a terminal. Add --scope user to have it in every project.',
    kind: 'command',
    snippet: `claude mcp add process-forge -- npx ${ARGS.join(' ')}`
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    where: 'Agent panel → ⋯ → MCP Servers → Manage MCP Servers → View raw config. Save, then Refresh.',
    kind: 'config',
    file: 'mcp_config.json',
    snippet: mcpServers
  },
  {
    id: 'codex',
    label: 'OpenAI Codex',
    where: 'Run in a terminal (Codex CLI and the Codex IDE extension share it).',
    kind: 'command',
    snippet: `codex mcp add process-forge -- npx ${ARGS.join(' ')}`,
    note: 'Or add it to ~/.codex/config.toml: [mcp_servers.process-forge] with command = "npx" and args = ["-y", "@process-forge/mcp-server"]. ChatGPT itself only connects to remote servers, so use Codex for OpenAI models.'
  },
  {
    id: 'cursor',
    label: 'Cursor',
    where: 'Settings → MCP → Add new global MCP server (opens ~/.cursor/mcp.json).',
    kind: 'config',
    file: 'mcp.json',
    snippet: mcpServers
  },
  {
    id: 'vscode',
    label: 'VS Code',
    where: 'For GitHub Copilot agent mode: run in a terminal, or add to .vscode/mcp.json under "servers".',
    kind: 'command',
    snippet: `code --add-mcp "{\\"name\\":\\"process-forge\\",\\"command\\":\\"npx\\",\\"args\\":[\\"-y\\",\\"${MCP_PACKAGE}\\"]}"`
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    where: 'Cascade → MCP servers → Manage → View raw config (~/.codeium/windsurf/mcp_config.json).',
    kind: 'config',
    file: 'mcp_config.json',
    snippet: mcpServers
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    where: 'Run in a terminal.',
    kind: 'command',
    snippet: `gemini mcp add process-forge npx ${ARGS.join(' ')}`
  }
];

/** The same, for a client that cannot find npx on Windows. */
export const WINDOWS_NPX_NOTE =
  'On Windows, if a client says it cannot start npx, use "command": "cmd" with "args": ["/c", "npx", "-y", "@process-forge/mcp-server"]. Every client needs Node.js 20 or later, except Claude Desktop with the one-click extension.';
