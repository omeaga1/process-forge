# @process-forge/mcp-server

A Model Context Protocol (MCP) server for ProcessForge.

It gives an MCP client (Claude, Antigravity, OpenAI Codex, Cursor, VS Code, Gemini CLI and others) tools
to design and validate unit-op contracts, run simulations, and, when the
ProcessForge desktop app is open, add unit ops to the open flowsheet. The
server does no model inference itself: your MCP client is the model.

## Tools

| Tool | What it does |
| :--- | :--- |
| `design_unit_op` | Returns what a model needs to write a unit-op contract: the format, the expression rules, the drawing rules and a worked example. The client writes the contract. |
| `validate_unit_op` | Checks a contract through the engine's gates: schema, every expression resolves, every ERROR constraint holds, and the drawing gives every port a nozzle. Returns the failures to fix. Accepts parameter overrides to test another operating point. |
| `get_open_flowsheet` | Reads the flowsheet open in ProcessForge Desktop on this computer. |
| `add_unit_op_to_flowsheet` | Validates a contract and adds it to the flowsheet open in ProcessForge Desktop, drawn from its contract with pipes attaching at its nozzles. |
| `add_stream` | Pipes one unit into another on the open flowsheet (by unit id, name or tag), choosing ports that fit: liquid to liquid, items to items. |
| `update_unit` | Changes a unit's settings (dotted names for nested ones) or its name on the open flowsheet, and returns old and new values. Needs ProcessForge Desktop 0.1.33 or later. |
| `remove_unit` | Removes a unit and its streams from the open flowsheet (undoable in the app). Marked destructive, so clients ask first. Needs 0.1.33 or later. |
| `remove_stream` | Removes one stream, by id or by the units at its ends. Needs 0.1.33 or later. |
| `list_standard_unit_ops` | Lists the equipment that ships with ProcessForge (the app's Standard palette), with ports and default settings, and the Feed, Product, Byproduct and Waste arrows that mark where material enters and leaves a flowsheet. |
| `add_standard_unit_op` | Places a standard unit or a feed/outlet arrow on the open flowsheet, with any settings changed, and optionally pipes it in (`connectFrom`, `connectTo`). Only Product outlets count as the line's output. Needs ProcessForge Desktop 0.1.30 or later. |
| `search_community_unit_ops` | Searches the community library of unit ops people have published from the app. Public and read-only; listings are not reviewed by ProcessForge. |
| `add_community_unit_op` | Places a community listing on the open flowsheet as its author published it, and optionally pipes it in. Needs ProcessForge Desktop 0.1.30 or later. |
| `simulate_process_line` | Runs the discrete-event simulation. Returns throughput, scrap, per-unit states, liquid levels, temperatures and heat duty, and the bottleneck. |
| `compare_scenarios` | What-if runs: the line as it is, then with unit settings changed, on the same seed, with the change in output and where the bottleneck moves. Changes nothing on the flowsheet. |
| `diagnose_bottlenecks` | Instant static check: port and flow-dimension errors, the capacity bottleneck, and fixed recommendations (for example, add an accumulation conveyor). |
| `list_digital_twin_templates` | Lists the built-in example lines (a paint canning line and a beverage bottling line). |
| `query_unit_subagent` | Returns preset configuration values and inspector controls for a standard machine type. Rotary fillers and labelers have presets; other types get a generic response. No model is called. |
| `package_unit_op` | Wraps a node in a JSON bundle with author, category, tags and metadata, for sharing. |
| `forge_equipment_drawing` | Picks one of the template drawings (column, reactor, exchanger, pump, cyclone, spray, sphere, drum or a generic vessel) by keyword-matching the description, and fills in a few parameters such as tray count and agitator type. Returns SVG geometry and nozzle positions. When the match is a tie it says so, and a second call can name the family. |

`simulate_process_line`, `diagnose_bottlenecks` and `compare_scenarios` work on
the flowsheet open in ProcessForge Desktop when you pass no `graph` or
`templateName`. Without the app they use a demo line and say so in `source`.

Every tool has a title and read-only/write annotations, so clients can ask
before a tool changes the flowsheet. Results come back as JSON text and as
structured content.

## Prompts and resources

The server also sends clients a short workflow guide (MCP `instructions`), and
offers:

- **Prompts** (slash commands in most clients): `debottleneck-line`,
  `design-unit-op` and `build-line`.
- **Resources**: the workflow guide, the standard equipment catalog, the
  unit-op contract guide, the open flowsheet and each built-in template.

## Designing a unit op from your MCP client

1. Open ProcessForge Desktop (0.1.18 or later) and the flowsheet you are working on.
2. In your MCP client, describe the equipment, e.g. "a rotary drum dryer for wet road salt, counter-current hot air".
3. The client calls `design_unit_op`, writes the contract (its physics and its drawing), and calls `validate_unit_op` until the engine accepts it.
4. It calls `add_unit_op_to_flowsheet`. The unit appears on your canvas, drawn as designed, with a nozzle for each stream. It then calls `add_stream` to pipe it to the units it connects to, or you pipe it up yourself.

Without the desktop app running, step 4 tells the client so, and it can give you the contract JSON to paste into **Design a unit op** instead.

The desktop app accepts these requests only from this computer: it listens on 127.0.0.1 with a random token it writes to its data folder, readable only by your user account, and it validates every contract again before adding it.

## Configuration

Any MCP client that can start a local (stdio) server works. The server runs
on your machine with Node.js 20 or later; `npx` fetches it on first use.

### Claude Desktop (one click)
Download [process-forge.mcpb](https://github.com/omeaga1/process-forge/releases/latest/download/process-forge.mcpb)
and open it. Claude Desktop shows ProcessForge and its tools; click Install. It
needs no Node.js install: Claude Desktop runs the bundled server itself.

The extension is built by `pnpm --filter @process-forge/mcp-server run pack:mcpb`
(one bundled file, manifest generated from the server's own tool list, checked
with `@anthropic-ai/mcpb`) and attached to every GitHub release.

### Claude Desktop (manual)
Add this to `claude_desktop_config.json` (Settings, Developer, Edit Config), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "process-forge": {
      "command": "npx",
      "args": ["-y", "@process-forge/mcp-server"]
    }
  }
}
```

### Claude Code
```bash
claude mcp add process-forge -- npx -y @process-forge/mcp-server
```

### Antigravity
Agent panel, **⋯**, **MCP Servers**, **Manage MCP Servers**, **View raw
config**. Add the same `mcpServers` entry as for Claude Desktop, save, then
**Refresh**.

### OpenAI Codex (CLI and IDE extension)
```bash
codex mcp add process-forge -- npx -y @process-forge/mcp-server
```

Or in `~/.codex/config.toml`:

```toml
[mcp_servers.process-forge]
command = "npx"
args = ["-y", "@process-forge/mcp-server"]
```

ChatGPT connectors need a remote (HTTPS) server, which this is not; use Codex
for OpenAI models.

### Cursor and Windsurf
The same `mcpServers` entry as Claude Desktop, in `~/.cursor/mcp.json`
(Settings, MCP) or `~/.codeium/windsurf/mcp_config.json`.

### VS Code (GitHub Copilot agent mode)
```bash
code --add-mcp "{\"name\":\"process-forge\",\"command\":\"npx\",\"args\":[\"-y\",\"@process-forge/mcp-server\"]}"
```

### Gemini CLI
```bash
gemini mcp add process-forge npx -y @process-forge/mcp-server
```

### Windows
If a client cannot start `npx`, use `"command": "cmd"` with
`"args": ["/c", "npx", "-y", "@process-forge/mcp-server"]`.

The app shows all of these, with copy buttons, under **AI model → MCP client**.

### From a checkout
```bash
pnpm install && pnpm run build
pnpm --filter @process-forge/mcp-server run bundle
node packages/mcp-server/bundle/cli.js
```

## Privacy

The server runs locally as a subprocess of your MCP client. It needs no API
key and sends nothing to ProcessForge. What your MCP client sends to its own
model provider is up to that client.

## Publishing

The published package is a single file, `bundle/cli.js`, with the engine
packages inlined (they are not on npm); only `@modelcontextprotocol/sdk` and
`zod` are dependencies. `prepublishOnly` builds, bundles, and runs
`scripts/smoke.mjs`, which starts the bundle as an MCP client would and
checks that it lists its tools. CI runs the same smoke test.

```bash
cd packages/mcp-server
npm publish
```

You must be signed in to npm (`npm login`) with publish rights to the
`@process-forge` scope.
