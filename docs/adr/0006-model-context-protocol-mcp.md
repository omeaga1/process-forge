# ADR-0006: An MCP server so external AI clients can use ProcessForge

* **Status:** Accepted
* **Date:** 2026-09-12 (tool list updated as tools were added)
* **Deciders:** maintainer

## Context

Many engineers already use an AI client such as Claude Desktop or Cursor. If
ProcessForge exposes its engine as tools, those clients can design and check
unit ops using the subscription the engineer already has, without ProcessForge
calling a model itself.

## Decision

Ship `@process-forge/mcp-server`, a Model Context Protocol server.

- **Transport:** stdio. The client starts the server as a local subprocess
  (`npx -y @process-forge/mcp-server`). The engine code runs in that Node.js
  process.
- **The client is the model.** The server performs no model inference of its
  own. Tools return data, rules and verdicts; the client does the writing.
- **Tools:** simulation and analysis (`simulate_process_line`,
  `diagnose_bottlenecks`, `list_digital_twin_templates`), unit-op design
  (`design_unit_op`, `validate_unit_op`), and older helpers
  (`query_unit_subagent`, `package_unit_op`, `forge_equipment_drawing`). See
  [packages/mcp-server/README.md](../../packages/mcp-server/README.md) for what
  each one does.
- **Desktop bridge:** `get_open_flowsheet` and `add_unit_op_to_flowsheet` talk
  to a running desktop app over `127.0.0.1`, authenticated with a per-launch
  token the app writes to its data folder.

## Consequences

- Works with any client that can start a stdio MCP server.
- Tool definitions must be kept in step with `@process-forge/protocol` and
  `@process-forge/simulation-core`.
- The published package bundles the workspace packages into one file, because
  those packages are not on npm.
