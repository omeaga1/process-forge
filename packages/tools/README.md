# @process-forge/tools

Every tool a model can call on ProcessForge, defined once: read and simulate
the line, compare what-ifs, find equipment, design and check a unit op, and
change the flowsheet. The MCP server offers them to MCP clients; the in-app
assistant offers the same ones to the model it runs.

A host (`ToolHost`, `src/host.ts`) says how to reach the flowsheet; the tools
do the rest. See [ADR-0010](../../docs/adr/0010-one-tool-registry.md).

```typescript
import { FORGE_TOOLS, inputSchemaFor } from '@process-forge/tools';

for (const tool of FORGE_TOOLS) {
  console.log(tool.name, tool.access, inputSchemaFor(tool, 'mcp'));
}
const result = await FORGE_TOOLS.find((t) => t.name === 'simulate_process_line')!.run({ durationMinutes: 60 }, host);
```
