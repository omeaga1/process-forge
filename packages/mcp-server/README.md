# @process-forge/mcp-server

The official **Model Context Protocol (MCP)** server for **ProcessForge**.

This package turns frontier AI models (such as Claude Desktop, Gemini CLI, Cursor, and ChatGPT) into **domain-specialized software engineers** for industrial manufacturing and process simulation.

---

## Capabilities & Registered Tools

| Tool Name | Purpose |
| :--- | :--- |
| `simulate_process_line` | Runs high-precision deterministic discrete-event & continuous simulations; calculates cycle times, throughput (ppm), OEE metrics, and identifies line bottlenecks. |
| `diagnose_bottlenecks` | Audits process flow graph topology, detects continuous/discrete port mismatches, audits conservation of mass/volume, and pinpoints backpressure accumulation. |
| `query_unit_subagent` | Consults with the unit-level Sub-Agent acting as a software engineer for a machine (e.g. Rotary Filler, Reactor, Labeler), synthesizing dynamic parameters and Generative UI schemas. |
| `package_unit_op` | Packages validated Unit-Ops and their Sub-Agents into Obsidian-style `.pfu` plugin bundles ready for ForgeHub sharing. |
| `forge_equipment_drawing` | **Built.** Selects a 2D CAD equipment drawing from a fixed template library by keyword-matching the description against known equipment families, returning SVG geometry, nozzle placements, and internals. A few parameters (tray count, agitator type, bottom head style) are interpolated from the description; unmatched descriptions return a generic vertical vessel. |
| `design_unit_op` | Returns the brief a model needs to write a unit operation contract: the format, the expression rules, the drawing rules, and a worked example. The model (your MCP client) writes the contract. |
| `validate_unit_op` | The engine checks a contract: schema, every expression resolves, every ERROR constraint holds, and the drawing gives every port a nozzle. Returns the failures to fix. |
| `get_open_flowsheet` | Reads the flowsheet open in ProcessForge Desktop on this computer. |
| `add_unit_op_to_flowsheet` | Validates a contract and adds it to the flowsheet open in ProcessForge Desktop, drawn from its contract with pipes attaching at its nozzles. |
| `list_digital_twin_templates` | Lists all available pre-configured digital twins (e.g. Sherwin-Williams paint canning line, beverage bottling line). |

---

## Designing a unit op from your MCP client

1. Open ProcessForge Desktop (0.1.18 or later) and the flowsheet you are working on.
2. In your MCP client, describe the equipment, e.g. "a rotary drum dryer for wet road salt, counter-current hot air".
3. The client calls `design_unit_op`, writes the contract (its physics and its drawing), and calls `validate_unit_op` until the engine accepts it.
4. It calls `add_unit_op_to_flowsheet`. The unit appears on your canvas, drawn as designed, with a nozzle for each stream. Pipe it up like any other unit.

Without the desktop app running, step 4 tells the client so, and it can give you the contract JSON to paste into **Design a unit op** instead.

The desktop app accepts these requests only from this computer: it listens on 127.0.0.1 with a random token it writes to its data folder, readable only by your user account, and it validates every contract again before adding it.

## Configuration

Any MCP client that can start a local (stdio) server works. The server runs
on your machine with Node.js 20 or later; `npx` fetches it on first use.

### Claude Desktop
Add this to `claude_desktop_config.json`, then restart Claude Desktop:

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

### Cursor, Gemini CLI and other clients
Point the client at the command `npx -y @process-forge/mcp-server`. For example:

```bash
gemini mcp add process-forge npx -y @process-forge/mcp-server
```

### From a checkout
```bash
pnpm install && pnpm run build
pnpm --filter @process-forge/mcp-server run bundle
node packages/mcp-server/bundle/cli.js
```

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

The `@process-forge` scope must exist on npm first (a free organization at
npmjs.com/org/create), and you must be signed in (`npm login`).

### Zero Raw API Keys
ProcessForge runs its deterministic mathematical solvers locally inside Node.js/Wasm. You never need to supply raw API keys or send proprietary plant parameters to external third-party cloud servers.
