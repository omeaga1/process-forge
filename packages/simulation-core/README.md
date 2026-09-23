# @process-forge/simulation-core

The ProcessForge discrete-event simulation engine, in TypeScript. It runs a
`ProcessGraph` from `@process-forge/protocol` for a given duration and reports
throughput, per-unit busy/blocked/starved time and OEE.

## Usage

```typescript
import { simulateProcess } from '@process-forge/simulation-core';
import type { ProcessGraph } from '@process-forge/protocol';

// Run 30 simulated minutes. Pass { seed } to reproduce an earlier run.
const results = simulateProcess(paintLineGraph, 30);

console.log(`Units packaged: ${results.totalUnitsPackaged}`);
console.log(`Average rate: ${results.averageLineThroughputUnitsPerMin} units/min`);
console.log(`Seed: ${results.seed}`);

const filler = results.nodeReports['filler-1'];
console.log(`Filler availability: ${filler.availabilityPercentage}%`);
console.log(`Filler blocked time: ${filler.blockedTimeSeconds}s`);
```

## What it simulates

- Built-in handlers for rotary fillers, conveyors, labelers and palletizers.
- Nodes that carry a unit-op contract with `DISCRETE_CYCLE` behavior.
- Blocking when downstream buffers are full, starving when nothing arrives.
- Seeded randomness for rejects, so the same seed gives the same result.

It does not integrate fluid levels over time or simulate breakdowns. See
[docs/architecture/04-simulation-math.md](../../docs/architecture/04-simulation-math.md)
for the formulas and limits.
