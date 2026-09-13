# @process-forge/canvas-ui

Interactive Osaka Jade React Flow canvas, Master Orchestrator dock, and Unit-Op pop-out machine studio for ProcessForge.

---

## Features
- **Osaka Jade Theme Integration:** Deep mineral slate surfaces (`#0c1214`), active imperial jade glows (`#10b981`), and animated continuous/discrete stream wires.
- **Custom Industrial Node Cards:** Real-time state badges (`Operating`, `Blocked`, `Starved`, `Jammed`), telemetry counters, and port handles.
- **Double-Click Pop-Out Machine Studio:** Double-clicking any unit opens a dedicated side drawer with its **Unit-Op Forge interface**, parameter controls, boundary context, and `[Publish to ForgeHub]` button.
- **Environment & Unit-Op Dock:** System-level flowsheet status, whole-plant throughput tracking, bottleneck analysis, and playback controls (`[Play]`, `[Pause]`, `[Reset]`).
- **ForgeHub In-App Marketplace Modal:** Search, filter, and 1-click insert community-engineered Unit-Op plugins directly into the active flowsheet.

---

## Quick Usage

```tsx
import React from 'react';
import { ProcessCanvas } from '@process-forge/canvas-ui';

export function App() {
  return <ProcessCanvas />;
}
```
