# Osaka Jade design system

"Osaka Jade" is the default theme, with dark and light variants. It is based
on the Omarchy Linux theme
([Justikun/omarchy-osaka-jade-theme](https://github.com/Justikun/omarchy-osaka-jade-theme))
and the Neovim theme it builds on
([ribru17/bamboo.nvim](https://github.com/ribru17/bamboo.nvim)). The tokens
are defined in `packages/theme/src/palette.ts` and `tokens.ts`; see
[ADR-0003](../adr/0003-osaka-jade-theme.md).

## Palette

| Token | Dark | Light | Used for |
| :--- | :--- | :--- | :--- |
| `background.base` | `#111c18` | `#f8f7f0` | Application background |
| `background.canvas` | `#11221c` | `#f2f0e4` | Canvas background |
| `background.surface` | `#16241f` | `#ffffff` | Node containers and property cards |
| `background.surfaceElevated` | `#1d2f28` | `#ebe9dc` | Drawers, modals, toolbars |
| `background.surfaceHover` | `#243a32` | `#e3e0d0` | Hover state |
| `background.surfaceActive` | `#2d473e` | `#dcd8c4` | Active state |
| `background.selectedBg` | `#364538` | `#e4e8dc` | Selected row or item |
| `border.subtle` | `#1c2d26` | `#e3e0d2` | Minor separators |
| `border.default` | `#253c33` | `#cfccba` | Card and node outline |
| `border.strong` | `#38584b` | `#a8a592` | Strong dividers |
| `border.glow` | `#71cead` | `#1e7e58` | Selected node glow |
| `border.division` | `#81b8a8` | `#629c89` | Telemetry panel outlines |
| `text.primary` | `#f6f5dd` | `#1e2922` | Body and heading text |
| `text.secondary` | `#c1c497` | `#45574c` | Secondary text |
| `text.muted` | `#53685b` | `#7a8c80` | Hints, units, timestamps |
| `text.accent` | `#71cead` | `#1e7e58` | Inline highlights |
| `text.gold` | `#deb266` | `#b47818` | Highlighted metrics |
| `jade.500` | `#549e6a` | `#239468` | Primary accent |
| `jade.glow` | `#2dd5b7` | `#10b981` | Glow indicator |
| `status.busy` | `#549e6a` | `#1b7a54` | Unit running |
| `status.starved` | `#8cd3cb` | `#0284c7` | Starved: waiting for upstream |
| `status.blocked` | `#e5c736` | `#d97706` | Blocked: downstream full |
| `status.failed` | `#ff5345` | `#dc2626` | Failed |
| `status.idle` | `#53685b` | `#64748b` | Idle |
| `streams.continuousFluid` | `#2dd5b7` | `#0d9488` | Fluid stream |
| `streams.discreteContainer` | `#8cd3cb` | `#0284c7` | Container stream |
| `streams.backpressureBlocked` | `#e5c736` | `#d97706` | Blocked stream |

## Unit state colours

- Busy: jade. Starved: cyan. Blocked: amber. Failed: red. Idle: slate.
- A blocked unit's status indicator has an amber glow
  (`0 0 10px rgba(229, 199, 54, 0.6)` dark, `0 0 10px rgba(217, 119, 6, 0.4)`
  light), and blocked streams are drawn in amber, so the upstream side of a
  bottleneck stands out.
- The Sun/Moon button in the header bar switches between dark and light.
