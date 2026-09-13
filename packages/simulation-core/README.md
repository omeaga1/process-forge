# @process-forge/simulation-core

Deterministic discrete-event and continuous flow simulation engine for industrial manufacturing twin lines.

---

## Quick Usage

```typescript
import { simulateProcess } from '@process-forge/simulation-core';
import type { ProcessGraph } from '@process-forge/protocol';

// Run 30 minutes of simulated factory production
const results = simulateProcess(paintLineGraph, 30);

console.log(`Units Packaged: ${results.totalUnitsPackaged}`);
console.log(`Average Rate: ${results.averageLineThroughputUnitsPerMin} cans/min`);
console.log(`Wall clock time: ${results.wallClockExecutionTimeMs} ms`);

// Machine OEE Metrics
const fillerOee = results.nodeReports['filler-1'];
console.log(`Filler Availability: ${fillerOee.availabilityPercentage}%`);
console.log(`Filler Blocked Time: ${fillerOee.blockedTimeSeconds}s`);
```

---

## Performance
- **Speed:** Executes >10,000x faster than real-time (>30 minutes of factory runtime evaluated in <10 milliseconds).
- **Conserved:** Full fluid volumetric tracking and discrete container counts with zero numerical drift.

---

## Documentation
For mathematical derivations and event scheduling logic, see [docs/architecture/04-simulation-math.md](../../docs/architecture/04-simulation-math.md).
