# ADR-0010: One tool registry for MCP clients and the in-app assistant

* **Status:** Accepted
* **Date:** 2026-10-04
* **Deciders:** maintainer

## Context

ProcessForge offers the same work to a model in two places: an MCP client
(Claude Desktop and others) through `@process-forge/mcp-server`, and the
in-app assistant on the engineer's OpenRouter sign-in. Each had its own copy
of the tools: names, descriptions, argument schemas, result shapes and the
logic in between. They drifted (different simulate results, design checks in
the app only), and every new tool had to be written twice. The example lines
were duplicated the same way, in the MCP server and in the canvas.

## Decision

Define every tool once, in `@process-forge/tools` (`packages/tools`):

- `FORGE_TOOLS` gives each tool's name, title, description, JSON Schema,
  access (`read` runs freely, `write` changes the flowsheet), and its `run`.
- A **host** (`ToolHost`) says only how to reach the flowsheet: read the open
  one, place a unit, pipe two units, edit, ask to publish, decide design
  checks.
  - The MCP server's host is the desktop bridge
    (`mcp-server/src/tools/desktopBridge.ts`), with the offline decision rules.
  - The studio's host is the canvas itself
    (`canvas-ui/src/ai/agent/agentTools.ts`); each write waits for the
    engineer's approval, and design checks use Jev when it is on.
- MCP-only tools (drawing templates, presets, packaging, example-line list)
  stay in the MCP server.
- The example lines live once, in `protocol/src/templates/exampleLines.ts`.

## Consequences

- A model gets the same tools, rules and answers in Claude Desktop and in the
  app. MCP clients now also get the design checklist and completeness
  warnings.
- A new tool is written once; both surfaces get it.
- The engine runs headless in the MCP server; the desktop bridge is needed
  only to read and change the open flowsheet.
