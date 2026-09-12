# ADR-0005: Zero Raw API Keys, ForgeHub Plugins & Agent-Driven Packages

* **Status:** Accepted
* **Date:** 2026-09-12
* **Deciders:** Lead Systems Architect, Orchestration Engineer, Platform Product Lead

## Context
Initial platform discovery revealed critical usability and trust requirements:
1. **Raw API Keys are a Barrier to Adoption:** Requiring industrial plant engineers to go to developer consoles, generate `sk-...` API keys, and paste them into forms causes severe hesitation and feels like a hobbyist wrapper.
2. **CHEMCAD-Style Desktop Power:** Users want a self-contained desktop suite that already includes physical/chemical models out of the box without requiring manual Python, pip, or compiler installations.
3. **Community Extensibility:** Users should be able to create custom Unit-Ops with their Sub-Agents and publish them as shareable plugins.
4. **Intelligent Capability Selection:** When adding a community machine, non-specialist users should not have to guess which thermodynamic models are needed; the machine's Sub-Agent should proactively recommend and resolve the necessary calculation packages.

## Decision
We establish four foundational platform specifications:

### 1. Zero Raw API Keys (OAuth & Enterprise SSO)
- Users authenticate via **OAuth 2.0 PKCE** using standard accounts (Google, Microsoft, GitHub). Frontier model inference quotas are tied to the user's subscription and routed via enterprise ZDR gateways.
- Enterprise plants authenticate via **Azure Entra ID / AWS IAM Identity Center**, billing inference directly to the corporate cloud commitment.
- Air-gapped factory networks switch to **1-Click Local Offline Mode (Ollama)** with zero login and zero network egress.

### 2. Built-in Desktop Physics (CHEMCAD-Style Power)
- Universal mass/energy balances, fluid dynamics, discrete container indexing, and queuing logic are compiled directly into the application binary.
- 100% offline-capable out of the box with zero Python or environment setup required from the user.

### 3. ForgeHub Plugin Marketplace (`.pfu`)
- Unit-Ops and their Sub-Agents are packaged into self-contained bundles containing:
  - Machine specs & OEM metadata.
  - Sub-Agent brain & diagnostic rules.
  - CopilotKit Generative UI inspector components.
  - Deterministic simulation transfer functions.

### 4. Agent-Driven Capability Packages (`@forge/pkg-*`)
- Sub-agents inspect unit operations and recommend modular calculation packages (e.g. `@forge/pkg-thermo-vle`, `@forge/pkg-rheology`, `@forge/pkg-discrete-packaging`) with one-click installation.

## Consequences
### Positive
- Completely removes the friction of API keys and developer consoles.
- Preserves universal ease of use while unlocking advanced chemical and discrete math.
- Fosters a self-reinforcing community ecosystem of reusable OEM machinery.
