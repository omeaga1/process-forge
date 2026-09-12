# ADR-0002: Decoupling Deterministic Simulation from LLM Inference

* **Status:** Accepted
* **Date:** 2026-09-12
* **Deciders:** Lead Systems Architect, Orchestration Engineer

## Context
Industrial process simulations must be physically rigorous, mathematically conserved ($\sum \text{Mass}_{in} = \sum \text{Mass}_{out}$), and capable of running millions of event ticks across 24-hour manufacturing shifts in seconds. Large Language Models are probabilistic token predictors that hallucinate values, accumulate floating-point drift, and take hundreds of milliseconds per token generation.

## Decision
We strictly decouple the role of AI from the execution of simulation math:
1. **AI Role:** Generative synthesis, natural language translation, machine configuration parameter estimation, CopilotKit dynamic UI generation, and root-cause bottleneck diagnosis.
2. **Engine Role:** A high-speed, deterministic **Discrete-Event Simulation (DES) & Continuous Flow Engine** ([`@process-forge/simulation-core`](../../packages/simulation-core/README.md)) running natively in Rust/Wasm and strict TypeScript.

## Consequences
### Positive
- Simulation runs at >10,000x real-time speed (<10ms for a 30-minute factory run).
- 100% deterministic reproducibility with fixed random seeds.
- Zero risk of hallucinated calculus or violated conservation laws.

### Trade-offs
- Machine types must have well-defined configuration contracts in `@process-forge/protocol`.
