# How-To Guide: Diagnosing Plant Bottlenecks

## Goal
Identify which machine in an industrial line is capping overall plant throughput, determine if upstream machines are experiencing backpressure blocking, and formulate an optimization strategy.

---

## 1. Recognizing Bottleneck Symptoms

ProcessForge categorizes machine states during simulation into four distinct operating conditions:

| State | Canvas Visual (Osaka Jade) | Meaning |
| :--- | :--- | :--- |
| **`BUSY`** | Imperial Jade (`#10b981`) | Machine is actively operating at its rated capacity. |
| **`STARVED`** | Ice Cyan (`#38bdf8`) | Machine is idle because upstream units cannot supply material fast enough. |
| **`BLOCKED`** | Amber Gold (`#f59e0b`) | Machine has completed its cycle but cannot discharge because the downstream buffer is full. |
| **`FAILED`** | Crimson Rose (`#f43f5e`) | Machine is stopped due to an unscheduled breakdown or jam. |

> [!TIP]
> **The Golden Rule of Bottlenecks:**  
> The true bottleneck machine will have **near 100% utilization / busy time**, while machines upstream of it will show high **Blocked Time**, and machines downstream will show high **Starved Time**.

---

## 2. Using the Automated Bottleneck Engine

You can programmatically validate bottlenecks using `@process-forge/protocol`:

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

Once identified, ask the Master Orchestrator or the unit sub-agent to propose solutions:
1. **Add an Accumulator Buffer:** Insert a surge conveyor or accumulation table between the filler and the labeler to absorb cycle variances.
2. **Increase Head Count:** Prompt the sub-agent to increase rotary filler nozzle count (e.g. from 8 to 12 nozzles).
3. **Dual-Line Split:** Split the discrete stream into two parallel labeling machines.
