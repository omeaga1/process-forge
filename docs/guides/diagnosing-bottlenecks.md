# Guide: diagnosing bottlenecks

How to find the machine that limits a line's throughput, and what to change.

---

## 1. Recognizing Bottleneck Symptoms

The simulation attributes each machine's time to one of these states (plus IDLE):

| State | Colour | Meaning |
| :--- | :--- | :--- |
| **`BUSY`** | Jade (`#549e6a` dark) | Machine is running a cycle. |
| **`STARVED`** | Cyan (`#8cd3cb` dark) | Machine is idle because upstream units cannot supply material fast enough. |
| **`BLOCKED`** | Amber (`#e5c736` dark) | Machine has completed its cycle but cannot discharge because the downstream buffer is full. |
| **`FAILED`** | Red (`#ff5345` dark) | Machine is stopped by a breakdown, for a machine whose settings give a mean time between failures and a mean time to repair. |

> [!TIP]
> The bottleneck is the machine that is busy almost all the time. Machines
> upstream of it show high **blocked** time, and machines downstream show high
> **starved** time. Each unit's `nodeReports` entry in the simulation result
> has `busyTimeSeconds`, `blockedTimeSeconds` and `starvedTimeSeconds`.

---

## 2. Estimating the bottleneck without a run

`validateProcessGraph` in `@process-forge/protocol` estimates each filler, labeler and palletizer's capacity and names the lowest:

```typescript
import { validateProcessGraph } from '@process-forge/protocol';

const result = validateProcessGraph(myPlantGraph);

if (result.bottlenecks.bottleneckNodeId) {
  console.log(`Bottleneck Machine: ${result.bottlenecks.bottleneckNodeId}`);
  console.log(`Max Line Speed: ${result.bottlenecks.maximumSystemThroughputUnitsPerMin} cans/min`);
  console.log('Machine Utilizations:', result.bottlenecks.utilizationByNode);
}
```

---

## 3. Resolving the Bottleneck

Common fixes (you can also ask the assistant in the Engineer Studio dock for suggestions):
1. **Add an Accumulator Buffer:** Insert a surge conveyor or accumulation table between the filler and the labeler to absorb cycle variances.
2. **Increase head count:** raise the rotary filler nozzle count (e.g. from 8 to 12 nozzles).
3. **Dual-Line Split:** Split the discrete stream into two parallel labeling machines.
