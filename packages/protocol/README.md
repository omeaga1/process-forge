# @process-forge/protocol

Authoritative domain entities, physical unit conversions, topological graph validation, and multi-agent CopilotKit schemas for ProcessForge.

---

## Installation
```bash
# Internal workspace dependency
pnpm add @process-forge/protocol --filter <your-package>
```

---

## Quick Usage

### Physical Unit Conversions
```typescript
import { UnitConverters } from '@process-forge/protocol';

// Calculate can throughput from fluid flow
const cansPerMin = UnitConverters.volumetricRateToDiscreteUnitsPerMin(50, 1.0);
console.log(cansPerMin); // 50 cans/min

// Calculate cycle dwell time
const cycleSeconds = UnitConverters.calculateRequiredCycleSeconds(40, 10);
console.log(cycleSeconds); // 15 seconds per cycle
```

### Graph Validation & Bottleneck Analysis
```typescript
import { validateProcessGraph, ProcessGraph } from '@process-forge/protocol';

const result = validateProcessGraph(myGraph);
if (!result.valid) {
  console.error('Validation errors:', result.diagnostics);
} else {
  console.log('Bottleneck Node:', result.bottlenecks.bottleneckNodeId);
}
```

---

## Documentation
For detailed schema specifications, see [docs/reference/protocol-schemas.md](../../docs/reference/protocol-schemas.md).
