# ProcessForge documentation

## Architecture

- [System overview](architecture/01-system-overview.md): the packages, how a
  flowsheet is built, how AI-written unit ops are checked, and how a run works.
- [Trust and security](architecture/02-trust-and-security.md): where API keys
  are stored, the Content-Security-Policy, and cloud sign-in.
- [Simulation math](architecture/04-simulation-math.md): the balances, cycle
  times and OEE formulas the engine uses.
- [Osaka Jade design](architecture/05-osaka-jade-design.md): the colour tokens
  for dark and light themes and what the status colours mean.

## Architecture decision records

Records of decisions at the time they were made. Some have been superseded;
each says so at the top.

- [ADR-0001](adr/0001-tauri-web-monorepo.md): Tauri v2 desktop app and web
  studio in one monorepo.
- [ADR-0002](adr/0002-deterministic-sim-vs-llm.md): AI writes configuration;
  a deterministic engine does the math.
- [ADR-0003](adr/0003-osaka-jade-theme.md): Osaka Jade as the default theme.
- [ADR-0005](adr/0005-zero-raw-keys-and-agent-driven-packages.md): no raw API
  keys (superseded).
- [ADR-0006](adr/0006-model-context-protocol-mcp.md): an MCP server so
  external AI clients can use ProcessForge.
- [ADR-0007](adr/0007-whole-simulation-storage-and-guest-mode.md): the
  project file format and guest mode.
- [ADR-0008](adr/0008-desktop-auto-update-and-landing-distribution.md):
  desktop auto-update and web hosting.

ADR-0004 was removed along with the tooling it described.

## Plans

Proposals that are not decisions yet.

- [Plan 0001](plans/0001-jev-decision-layer.md): a decision layer for the
  keyword-matching branch points in the AI pipeline. The heuristic layer is
  built; the Jev provider is shelved.

## Guides

- [Diagnosing bottlenecks](guides/diagnosing-bottlenecks.md): reading
  busy/blocked/starved time to find the unit that limits a line.

## Reference

- [Protocol schemas](reference/protocol-schemas.md): machine configurations,
  port dimensions and stream types in `@process-forge/protocol`.

## Operations (maintainer runbooks)

- [Cloud API](ops/cloud-api.md): the Cloudflare Worker and D1 database, auth
  routes, secrets and deployment.
- [Cloudflare Pages](ops/cloudflare-pages.md): how the web studio is built and
  deployed.
- [Desktop releases](ops/desktop-releases.md): tagging a release, updater
  signing, and Windows code signing.

## Package READMEs

- [`@process-forge/protocol`](../packages/protocol/README.md)
- [`@process-forge/simulation-core`](../packages/simulation-core/README.md)
- [`@process-forge/canvas-ui`](../packages/canvas-ui/README.md)
- [`@process-forge/mcp-server`](../packages/mcp-server/README.md)
- [`@process-forge/theme`](../packages/theme/README.md)
- [`@process-forge/desktop`](../apps/desktop/README.md)
