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
| `list_digital_twin_templates` | Lists all available pre-configured digital twins (e.g. Sherwin-Williams paint canning line, beverage bottling line). |

---

## Configuration

### Claude Desktop Setup
Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "process-forge": {
      "command": "node",
      "args": ["<path-to-process-forge>/packages/mcp-server/dist/cli.js"]
    }
  }
}
```

### Gemini CLI Setup
```bash
gemini mcp add process-forge node <path-to-process-forge>/packages/mcp-server/dist/cli.js
```

### Zero Raw API Keys
ProcessForge runs its deterministic mathematical solvers locally inside Node.js/Wasm. You never need to supply raw API keys or send proprietary plant parameters to external third-party cloud servers.
