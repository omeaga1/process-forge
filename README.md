# ProcessForge

> **Next-Generation Industrial Process Simulation Platform**  
> Continuous-Discrete Hybrid Simulation • Hierarchical Multi-Agent Orchestration • Enterprise Trust & Zero-Knowledge Security

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Target Repo](https://img.shields.io/badge/GitHub-omeaga1%2Fprocess--forge-181717.svg?logo=github)](https://github.com/omeaga1/process-forge)
[![Architecture](https://img.shields.io/badge/Architecture-Tauri_v2_%2B_Web_Monorepo-orange.svg)]()
[![Anti--Laziness](https://img.shields.io/badge/Scaffold_Policy-Zero_Untracked_Placeholders-success.svg)]()

---

## 1. Overview & Vision

**ProcessForge** is a modern industrial process simulation and digital twin platform designed for real-world manufacturing and assembly lines (such as paint manufacturing, packaging lines, batch reactors, automated filling and labeling stations, and palletizers).

Unlike legacy chemical-only simulators that are computationally impenetrable or weekend AI wrappers that compromise enterprise trust, ProcessForge decouples **probabilistic generative AI** from **deterministic simulation physics**:

1. **Deterministic Core Engine:** Discrete-Event Simulation (DES) combined with Continuous Flow mass/volumetric balances, capable of executing at >10,000x real-time speed.
2. **Hierarchical Agent Layer (CopilotKit + CoAgents):** A **Master Orchestrator** maintains plant-wide flow conservation, while dynamically spawned **Unit-Op Sub-Agents** configure specific machines, build dynamic generative UI parameter drawers, and diagnose bottlenecks.
3. **Enterprise Trust & Credential Isolation:** Eliminates the "Vercel + Supabase wrapper" stigma through native OS credential vaults (DPAPI/Keychain) in our desktop client, Enterprise Zero-Data-Retention (ZDR) gateways, and full self-hostable on-premises deployment capabilities.

---

## 2. Architecture & Monorepo Topology

ProcessForge is structured as a pnpm + Turborepo monorepo:

```
process-forge/
├── apps/
│   ├── desktop/               # Native desktop app shell powered by Tauri v2
│   ├── web/                   # Collaborative cloud web application
│   └── docs-landing/          # Product landing page & one-click installer downloads
├── packages/
│   ├── protocol/              # @process-forge/protocol: Shared schemas, units, and contracts
│   ├── simulation-core/       # @process-forge/simulation-core: Discrete-event & continuous engine
│   ├── canvas-ui/             # @process-forge/canvas-ui: React Flow canvas & generative inspectors
│   ├── agent-orchestrator/    # @process-forge/agent-orchestrator: LangGraph + CopilotKit agents
│   └── scaffold-registry/     # @process-forge/scaffold-registry: Anti-laziness enforcement & CLI
├── tooling/
│   ├── typescript-config/     # Strict shared TSConfig
│   └── eslint-config/         # Strict AST & linting rules
├── .github/workflows/         # CI/CD (anti-laziness verification, simulation tests, Tauri release)
└── scaffold-manifest.json     # Authoritative tracking manifest for temporary scaffolding
```

---

## 3. Trust & Security Matrix

| Model Tier | Target Audience | Secret / Credential Storage | Network Routing |
| :--- | :--- | :--- | :--- |
| **Desktop Native Vault (BYOK)** | Security-conscious engineers, private plant models | Windows DPAPI / macOS Keychain via Tauri secure storage | Direct client-to-provider TLS; **zero keys or prompt data touch our servers** |
| **Enterprise SaaS Gateway** | Collaborative teams, cloud users | AWS KMS / HashiCorp Vault (Envelope Encryption) | Azure OpenAI / AWS Bedrock under signed **Zero Data Retention (ZDR)** agreements |
| **Self-Hosted / Air-Gapped** | Industrial plants, defense, high-security facilities | Customer internal vault / environment secrets | Fully local inside private VPC; compatible with vLLM / Ollama |

---

## 4. Multi-Agent Hierarchy & CopilotKit Mechanics

```
                  ┌────────────────────────────────────────────────┐
                  │          Interactive Canvas UI (React)         │
                  │    CopilotKit Chat • Dynamic Property Drawers  │
                  └───────────────────────┬────────────────────────┘
                                          │
                                          ▼
                  ┌────────────────────────────────────────────────┐
                  │       Master Orchestrator Agent (Plant Lead)    │
                  │  Global Mass/Energy Balance • Stream Continuity │
                  └───────────┬──────────────────────┬─────────────┘
                              │                      │
                 ┌────────────┴──────────┐ ┌─────────┴───────────┐
                 ▼                       ▼ ▼                     ▼
        ┌──────────────────┐   ┌──────────────────┐    ┌──────────────────┐
        │ Batch Reactor    │   │ 10-Nozzle Filler │    │ Automated        │
        │ Sub-Agent        │   │ Sub-Agent        │    │ Labeler Sub-Agent│
        └────────┬─────────┘   └────────┬─────────┘    └────────┬─────────┘
                 │                      │                       │
                 └──────────────────────┼───────────────────────┘
                                        ▼
                  ┌────────────────────────────────────────────────┐
                  │   Deterministic Simulation Engine (Rust/Wasm)   │
                  │ Event Queue • Rate Balance • Bottleneck Solver │
                  └────────────────────────────────────────────────┘
```

- **Generative UI (`useCopilotAction`):** Unit-Op sub-agents dynamically render custom sliders, nozzle matrices, and validation alerts inside the property drawer.
- **Physical Validation Gates:** Before committing a configuration to the active simulation graph, agents must pass contract validation rules defined in `@process-forge/protocol`.

---

## 5. Anti-Laziness Protocol

ProcessForge enforces a strict zero-tolerance policy against dangling placeholders, empty stubs, or unhandled `TODO` comments.
- All temporary scaffolding must be registered in `scaffold-manifest.json` with an explicit **Removal Condition** and **Blocked Milestone**.
- CI executes `pnpm run verify:scaffolds` via `@process-forge/scaffold-registry`. Any untracked placeholder immediately fails the build.

---

## 6. Getting Started

### Prerequisites
- Node.js >= 20 (v22+ recommended)
- pnpm >= 10 (`npm install -g pnpm` or `npx pnpm`)
- Rust toolchain (for native simulation core & Tauri v2 desktop builds)

### Installation
```bash
# Clone the repository
git clone https://github.com/omeaga1/process-forge.git
cd process-forge

# Install workspace dependencies
pnpm install

# Verify scaffolding manifest & zero untracked placeholders
pnpm run verify:scaffolds

# Build all packages
pnpm run build

# Run unit and simulation tests
pnpm run test
```

---

## 7. License

Licensed under the [Apache License, Version 2.0](LICENSE).
