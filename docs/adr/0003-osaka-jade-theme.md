# ADR-0003: "Osaka Jade" as the default theme, with dark and light variants

* **Status:** Accepted (amended 2026-09-14 to add the light variant)
* **Date:** 2026-09-12
* **Deciders:** maintainer

## Context

A flowsheet shows many units at once, and their states (running, starved,
blocked, failed) need to be distinguishable at a glance. The project needed
one palette used consistently by the canvas, the dock and the charts.

## Decision

Adopt "Osaka Jade" as the default theme, based on the Omarchy Linux theme
([Justikun/omarchy-osaka-jade-theme](https://github.com/Justikun/omarchy-osaka-jade-theme))
and the Neovim theme it builds on ([ribru17/bamboo.nvim](https://github.com/ribru17/bamboo.nvim)).

- Tokens live in [`@process-forge/theme`](../../packages/theme/README.md).
- Dark variant: dark green-slate surfaces (`#111c18`, `#11221c`, `#16241f`),
  pale text (`#f6f5dd`, `#c1c497`), jade and mint accents (`#549e6a`,
  `#71cead`, `#2dd5b7`).
- Light variant: ivory surfaces (`#f8f7f0`, `#f2f0e4`, `#ffffff`), dark text
  (`#1e2922`), jade accent (`#239468`).
- Status colours: busy (jade), starved (cyan), blocked (amber), failed (red),
  idle (slate).
- The theme switches through `[data-theme="dark"|"light"]` CSS custom
  properties and a toggle in the header bar.

## Consequences

- One set of colour meanings across nodes, streams and charts.
- `OsakaJadePalette` remains as an alias for the dark palette so older imports
  keep working.
