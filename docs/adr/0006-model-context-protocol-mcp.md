# ADR-0006: Model Context Protocol (MCP) Server Architecture

* **Status:** Accepted
* **Date:** 2026-09-12
* **Deciders:** Lead Systems Architect, Orchestration Engineer, Platform Product Lead

## Context
Industrial domain engineers frequently use frontier reasoning models across diverse desktop and terminal environments—including **Claude Desktop**, **Google Gemini CLI**, **Cursor**, and **ChatGPT**.

Rather than forcing users to operate exclusively inside our web interface or re-enter proprietary manufacturing line data into multiple web portals, users requested a way for external AI clients to connect directly to ProcessForge as an authoritative **domain software engineer and simulation engine**.

Furthermore, users explicitly demanded:
1. **The AI must act as a software and domain engineer for engineers who do not code**, helping them construct, configure, and debug physical unit operations.
2. **Zero Raw API Keys:** Third-party cloud providers must not receive proprietary plant parameters, and users should not have to manage API keys.
3. **Open Standards:** The protocol must be an open, audited industry standard supported across multiple AI ecosystems.

## Decision
We implement `@process-forge/mcp-server` adhering to Anthropic's open **Model Context Protocol (MCP)** specification:

### 1. Stdio Local Transport
- The MCP server operates as a local subprocess communicating via standard input/output (`stdio`).
- All simulation calculus runs in Node.js/Wasm on the user's workstation.
- External AI clients query tools locally; proprietary manufacturing parameters never egress to external databases.

### 2. Six Core Engineering Tools
1. `simulate_process_line`: Runs high-precision discrete-event and continuous mass balance simulations, returning cycle times, throughput, and machine bottleneck metrics.
2. `diagnose_bottlenecks`: Audits process graph topology, detects continuous/discrete port mismatches, and pinpoints backpressure accumulation.
3. `query_unit_subagent`: Serves as the machine-level specialist software engineer, synthesizing dynamic Generative UI controls, physical parameters, and MTBF/MTTR failure distributions.
4. `package_unit_op`: Packages validated Unit-Ops and Sub-Agents into Obsidian-style `.pfu` community bundles for ForgeHub.
5. `forge_equipment_drawing`: Synthesizes parametric 2D CAD engineering drawings with ASME nozzle schedules, internals, and animated SVG components using Drawing-with-Thought.
6. `list_digital_twin_templates`: Lists pre-configured digital twins (e.g. Sherwin-Williams paint canning line, beverage bottling line).

### 3. Cross-Platform Compatibility
- Standard configuration snippets are provided for **Claude Desktop** (`claude_desktop_config.json`), **Gemini CLI** (`gemini mcp add`), and **Cursor**.

## Consequences
### Positive
- Allows engineers to leverage their existing Claude/Gemini subscriptions with zero additional token fees.
- Solidifies ProcessForge's position as an open, interoperable industrial simulation backbone rather than a closed proprietary silo.
- Preserves complete data privacy for confidential plant parameters.

### Negative
- Requires maintaining MCP tool definitions synchronized with the `@process-forge/protocol` and `@process-forge/simulation-core` packages.
