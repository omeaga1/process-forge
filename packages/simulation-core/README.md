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

- Every unit runs on a unit-op contract: its own, or, for a built-in kind
  (pump, tank, reactor, filler, labeler...), the one built from its config.
  There is no handler per kind of equipment.
- Items as discrete events: cycles, queues, kits, blocking when downstream is
  full, starving when nothing arrives.
- Liquid on a mass basis, stepped each second in the same event loop: tanks,
  batches and pass-throughs, with temperature and composition carried by mass.
- Breakdowns on any unit, cycle-time variation and per-item rejects, from
  seeded random streams, so the same seed gives the same result.
- `describeUnit`: what a unit does, generated from the same contract and rules
  the run uses.

See [docs/architecture/04-simulation-math.md](../../docs/architecture/04-simulation-math.md)
for the formulas and limits.
