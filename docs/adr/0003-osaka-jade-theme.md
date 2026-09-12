# ADR-0003: Default Theme Specification — "Osaka Jade"

* **Status:** Accepted
* **Date:** 2026-09-12
* **Deciders:** Lead Systems Architect, Design Lead

## Context
Process simulation tools require high visual clarity to track simultaneous conveyor movements, backpressure blocking, and fluid flow without overwhelming the operator. The user requested a default visual theme modeled after the "Osaka Jade" style found in the Omarchy Linux distribution.

## Decision
We establish **"Osaka Jade"** as the default system theme across all ProcessForge clients.
- Defined in a dedicated package: [`@process-forge/theme`](../../packages/theme/README.md).
- Base colors: Deep mineral obsidian slate surfaces (`#0c1214`, `#0f171a`, `#152024`).
- Accent colors: Luminous Imperial Jade (`#10b981`), Neon Teal-Jade glow (`#2dd4bf`), Spring Jade (`#34d399`).
- Status mappings: Operating (Jade Green), Starved (Ice Cyan), Blocked (Amber Gold), Failed (Crimson Rose).

## Consequences
### Positive
- Striking, professional identity that immediately differentiates ProcessForge from generic white-label SaaS wrappers.
- High visual contrast prevents eye strain during extended simulation analysis.
- Consistent color meaning across node states, telemetry charts, and wire animations.
