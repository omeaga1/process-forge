# @process-forge/protocol

Shared types and checks for ProcessForge. Every other package depends on it.

- **Schemas** (Zod): nodes and their configurations, ports, streams, process
  graphs, saved projects (`src/nodes.ts`, `streams.ts`, `graph.ts`,
  `storage.ts`).
- **Graph validation:** `validateProcessGraph` checks edges and port flow
  dimensions and estimates the capacity bottleneck.
- **Unit conversions:** `UnitConverters` (`src/units.ts`).
- **Unit-op contracts** (`src/unitop`): the contract and drawing schemas, the
  restricted expression language, the evaluator, and `executeValidateUnitOp`,
  which reviews a contract through the schema, reference, physics and drawing
  gates.
- **Equipment drawings** (`src/cad`): the template drawing library.
- **Decisions** (`src/decisions`): the decision-layer interface, heuristic
  provider and fixtures from [Plan 0001](../../docs/plans/0001-jev-decision-layer.md).

## Usage

```typescript
import { UnitConverters, validateProcessGraph, executeValidateUnitOp } from '@process-forge/protocol';

UnitConverters.volumetricRateToDiscreteUnitsPerMin(50, 1.0); // 50 cans/min from 50 gal/min
UnitConverters.calculateRequiredCycleSeconds(40, 10);        // 15 s per cycle for 40 cans/min on 10 nozzles

const result = validateProcessGraph(graph);
if (!result.valid) console.error(result.diagnostics);
console.log(result.bottlenecks.bottleneckNodeId);

const review = executeValidateUnitOp({ contract });
console.log(review.verdict); // 'ACCEPTED' or 'REJECTED'
```

Schema details: [docs/reference/protocol-schemas.md](../../docs/reference/protocol-schemas.md).
