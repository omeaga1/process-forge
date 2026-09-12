# ProcessForge Documentation Hub

Welcome to the **ProcessForge** documentation. This knowledge base is structured using the **Diátaxis Framework** (Tutorials, How-To Guides, Technical Reference, and Architectural Explanations) alongside **Architecture Decision Records (ADRs)** to provide transparent, human-readable technical documentation.

---

## 🧭 Documentation Map

### 1. Architecture & Mental Models (Explanation)
Understand the foundational engineering design and trade-offs behind ProcessForge:
* [**01: System Overview**](architecture/01-system-overview.md) — The end-to-end topology, monorepo packages, and runtime dataflow.
* [**02: Trust, Security & Credentials**](architecture/02-trust-and-security.md) — Solving the "Vercel + Supabase wrapper" stigma via native OS vaults, enterprise ZDR gateways, and on-prem deployments.
* [**03: Agentic Orchestration & CopilotKit**](architecture/03-agentic-orchestration.md) — Master Orchestrator, dynamically spawned Unit-Op sub-agents, and Generative UI drawers.
* [**04: Simulation Math & Deterministic Core**](architecture/04-simulation-math.md) — Continuous flow conservation, discrete-event queues, cycle time formulas, and OEE analytics.
* [**05: Osaka Jade Design System**](architecture/05-osaka-jade-design.md) — Palette science, visual tokens, and aesthetic cues inspired by the Omarchy Linux desktop.

---

### 2. Architecture Decision Records (ADRs)
Historical log of foundational engineering decisions, their context, and consequences:
* [**ADR-0001: Tauri v2 + React Monorepo**](adr/0001-tauri-web-monorepo.md) — Unifying native desktop installers with web collaboration.
* [**ADR-0002: Deterministic Simulation vs. LLM Math**](adr/0002-deterministic-sim-vs-llm.md) — Decoupling probabilistic AI compilation from deterministic calculus.
* [**ADR-0003: Osaka Jade Default Theme**](adr/0003-osaka-jade-theme.md) — Adopting a deep mineral slate and luminous jade aesthetic.
* [**ADR-0004: Anti-Laziness Protocol & Scaffold Manifest**](adr/0004-anti-laziness-registry.md) — Zero-tolerance AST enforcement for placeholders and temporary scaffolding.

---

### 3. How-To Guides (Practical Recipes)
Step-by-step solutions to concrete engineering workflows:
* [**Diagnosing Plant Bottlenecks**](guides/diagnosing-bottlenecks.md) — Pinpointing buffer backpressure, machine starvation, and throughput throttling.

---

### 4. Technical Reference (Specifications)
Authoritative contracts, schemas, and API documentation:
* [**Protocol Schemas & Machine Configs**](reference/protocol-schemas.md) — Zod schemas for nodes, ports, streams, and agent messages.

---

## 📦 Package Guides
Each workspace package includes an in-depth README for localized development:
* [`@process-forge/protocol`](../packages/protocol/README.md) — Data contracts, physical units, and validation.
* [`@process-forge/simulation-core`](../packages/simulation-core/README.md) — High-speed discrete-event and continuous simulation engine.
* [`@process-forge/theme`](../packages/theme/README.md) — Osaka Jade palette, CSS variables, and Tailwind preset.
* [`@process-forge/scaffold-registry`](../packages/scaffold-registry/README.md) — Anti-laziness manifest, AST scanner, and CLI.
