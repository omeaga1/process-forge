# ADR-0003: Visual Design System Specification — "Osaka Jade" (Dual Dark & Light)

* **Status:** Accepted (Amended)
* **Date:** 2026-09-12 (Updated: 2026-09-14)
* **Deciders:** Lead Systems Architect, Design Lead

## Context
Process simulation tools require high visual clarity to track simultaneous conveyor movements, backpressure blocking, and fluid flow without overwhelming the operator. The user requested a visual theme distilled directly from the official "Osaka Jade" theme found in the Omarchy Linux desktop distribution ([Justikun/omarchy-osaka-jade-theme](https://github.com/Justikun/omarchy-osaka-jade-theme)) and its upstream Neovim bamboo core ([ribru17/bamboo.nvim](https://github.com/ribru17/bamboo.nvim)), with both dark and light modes.

## Decision
We establish **"Osaka Jade"** as the default system theme across all ProcessForge clients, providing cohesive **Dark** and **Light** variants:
- Defined in a dedicated package: [`@process-forge/theme`](../../packages/theme/README.md).
- **Dark Variant (Midnight Rice / Obsidian Forest)**: Deep obsidian forest surfaces (`#111c18`, `#11221c`, `#16241f`) paired with bamboo sage text (`#c1c497`), Hyprland active border mint (`#71cead`), and vibrant cyan accents (`#2dd5b7`).
- **Light Variant (Bamboo Ivory / Osaka Day)**: Warm bamboo ivory rice-paper backgrounds (`#f8f7f0`, `#f2f0e4`, `#ffffff`) with deep forest pine charcoal text (`#1e2922`) and rich imperial jade accents (`#239468`).
- **Status Mappings**: Operating (Jade Green), Starved (Ice Cyan), Blocked (Amber Gold), Failed (Vermilion Coral / Crimson), Idle (Cool Slate).
- **Dynamic Theme Switching**: Supported via `[data-theme="dark"|"light"]` CSS custom properties and client-side toggle in `HeaderBar`.

## Consequences
### Positive
- Striking, professional identity distilled from the authentic Omarchy Linux desktop rice aesthetic.
- High visual contrast prevents eye strain during extended simulation runs in both nighttime (Dark) and bright daytime (Light) industrial plant environments.
- Consistent color semantics across node states, telemetry charts, and stream wire animations.
- Backwards compatible with existing consumers via aliased exports.
