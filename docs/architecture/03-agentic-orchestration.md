# Architecture: Agentic Orchestration & CopilotKit

## 1. The Multi-Agent Philosophy

In industrial engineering, no single machine exists in isolation:
- A **Batch Reactor** outputs continuous gallons per hour.
- A **Surge Tank** absorbs peak discharges and dampens flow oscillations.
- A **Filling Machine** converts continuous gallons into discrete 1-gallon cans.
- A **Labeling Station** processes discrete cans, but will jam if cans arrive faster than its optical scanner cycle.

If a single monolithic agent attempts to reason about the entire plant at the micro-level, it suffers context degradation and produces physically incompatible parameters. ProcessForge solves this using **Hierarchical Multi-Agent Orchestration**:

```
                          ┌───────────────────────────┐
                          │    Master Orchestrator    │
                          │   Plant Flow Supervisor   │
                          └─────────────┬─────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│ Reactor Sub-Agent    │     │ Filler Sub-Agent     │     │ Labeler Sub-Agent    │
│ Fluid Mass Balance   │     │ Nozzle Matrix & Cam  │     │ Optical Scan & Reject│
└──────────────────────┘     └──────────────────────┘     └──────────────────────┘
```

---

## 2. Agent Roles & Responsibilities

### Master Orchestrator ("Plant Flow Supervisor")
- **Scope:** Entire plant graph topology.
- **Responsibilities:**
  1. Verifies overall volumetric and mass flow conservation ($\sum Q_{in} = \sum Q_{out}$).
  2. Broadcasts neighborhood context (upstream rates, fluid viscosity, line speed constraints) to newly spawned unit agents.
  3. Detects system-level bottlenecks and triggers Human-In-The-Loop (HITL) graph reconfiguration proposals.

### Unit-Op Sub-Agents ("Machine Specialists")
- **Scope:** Single machine node and its immediate input/output ports.
- **Responsibilities:**
  1. Configures internal mechanics (e.g. nozzle counts, cycle dwell times, belt velocity).
  2. Synthesizes generative UI parameter controls via CopilotKit.
  3. Diagnoses localized failures (e.g. why reject rates spiked on the labeling chute).

---

## 3. CopilotKit & Generative UI Integration

ProcessForge leverages **CopilotKit** and **CoAgents** to create bidirectional interaction between the AI and the React canvas:

### Generative Parameter Drawers (`useCopilotAction`)
When a user selects a machine or prompts an agent to customize it, the sub-agent does not reply with plain markdown text. It executes a registered CopilotKit action that renders a custom interactive React component directly inside the canvas inspector:

```typescript
// Sub-Agent emits structured generative widget
{
  widgetType: "ROTARY_FILLER_INSPECTOR",
  nodeId: "filler-01",
  title: "10-Nozzle Rotary Can Filler Inspector",
  interactiveControls: [
    { fieldKey: "nozzleCount", label: "Active Nozzles", type: "SLIDER", min: 1, max: 24, currentValue: 10 },
    { fieldKey: "fillTimeSeconds", label: "Fill Dwell Time", type: "NUMBER_INPUT", currentValue: 10.5 }
  ],
  physicalValidationBadges: [
    { label: "Mass Balance", status: "PASS", detail: "45 gpm matches 45 cans/min feed" }
  ]
}
```

### Human-in-the-Loop (HITL) Graph Proposals
When an agent detects a plant bottleneck (e.g. the filler produces 50 cans/min but the downstream labeler can only process 35 cans/min), it does not silently mutate the user's diagram. It emits a **Graph Proposal Diff**:
- Highlights the bottleneck node in Amber Gold.
- Renders an interactive visual diff modal proposing an accumulator buffer or a secondary labeling head.
- Requires explicit user approval before applying changes to the active graph.
