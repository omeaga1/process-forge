# ProcessForge

ProcessForge is a flowsheet editor and simulator for process and manufacturing
lines. You place standard unit operations, connect them with streams, and run a
discrete-event simulation to see throughput, bottlenecks and OEE. When the unit
you need does not exist, an AI model writes it as a contract that the engine
checks before it can join the flowsheet.

It runs as a desktop app (Windows, macOS, Linux) and as the same studio in the
browser.

Licence: [Apache-2.0](LICENSE)

## Features

- **Flowsheet canvas.** Standard unit operations: pumps, tanks, reactors, heat
  exchangers, separators, fillers, conveyors, labelers, palletizers and more.
  Units are drawn as equipment, and pipes attach at nozzles you can place.
- **Custom unit ops as contracts.** A contract declares parameters, derived
  values (in a restricted expression language), constraints (ERROR or WARNING),
  a behavior mode (discrete cycle or continuous rate) and a drawing with one
  nozzle per port. The engine checks it through four gates before it can be
  used: schema, references resolve, physical constraints hold, and the drawing
  gives every port a nozzle.
- **AI writes contracts, the engine judges them.** Use your own model inside
  the app, or drive ProcessForge from an MCP client (see below).
- **Simulation.** A TypeScript discrete-event engine reports throughput,
  busy/blocked/starved time per unit, the bottleneck and OEE. Continuous units
  are evaluated at steady state. Runs are seeded and reproducible.
- **Projects.** Save to a local `.pfg.json` file without an account. With
  optional Google sign-in, save projects to the cloud and publish unit ops to
  the community library.

## Install

- **Desktop:** download the installer for your platform from
  [GitHub Releases](https://github.com/omeaga1/process-forge/releases/latest).
  The app checks for updates on launch. The Windows installer is not
  code-signed yet, so SmartScreen will warn on first run.
- **Web:** open <https://process-forge.pages.dev>.

## Using AI

There are two ways to have a model design unit ops.

**In the app.** Open the AI settings and pick one:

- your own API key for Claude, OpenAI or Gemini;
- OpenRouter, by signing in with your OpenRouter account;
- a local Ollama server (default `http://localhost:11434`), which needs no key.

On desktop, keys are stored in the OS keychain. In the browser, they are stored
in the browser's local storage. The app sends them only to the provider you
chose.

**From an MCP client** (Claude Desktop, Cursor, and others). Add the MCP server
to the client's configuration:

```json
{
  "mcpServers": {
    "process-forge": {
      "command": "npx",
      "args": ["-y", "@process-forge/mcp-server"]
    }
  }
}
```

The client then has tools to design and validate a unit op contract. If the
desktop app is open, the client can also read the open flowsheet and add a
validated unit op to it. The desktop app accepts these requests only on
`127.0.0.1` with a token it creates at each launch. See
[packages/mcp-server/README.md](packages/mcp-server/README.md) for the tool
list.

## Repository layout

pnpm workspace with Turborepo.

```
apps/
  desktop/                 Tauri v2 shell: keychain, updater, OAuth loopback, MCP bridge
  web/                     The studio (Vite + React); also bundled into the desktop app
packages/
  protocol/                Schemas, graph validation, unit-op contracts and their checks
  simulation-core/         Discrete-event simulation engine
  canvas-ui/               Flowsheet canvas (React Flow), unit-op creator, AI clients
  mcp-server/              MCP server published as @process-forge/mcp-server
  community-library-api/   Cloudflare Worker + D1: sign-in, cloud projects, community library
  theme/                   "Osaka Jade" design tokens
tooling/
  typescript-config/       Shared tsconfig
docs/                      Architecture notes, ADRs, guides, ops runbooks
```

## Development

Requirements: Node.js 22 (see `.node-version`) and pnpm 10.

```bash
git clone https://github.com/omeaga1/process-forge.git
cd process-forge
pnpm install
pnpm run build       # builds every package in dependency order
pnpm run test
pnpm run typecheck
```

Run the web studio:

```bash
pnpm --filter @process-forge/web dev
```

The desktop app also needs Rust and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS
(MSVC build tools and WebView2 on Windows, Xcode command line tools on macOS,
WebKitGTK on Linux). Then:

```bash
pnpm --filter @process-forge/desktop tauri dev
```

Release and deployment steps are in [docs/ops](docs/ops).

## Contributing

Issues and pull requests are welcome at
<https://github.com/omeaga1/process-forge>. Please run `pnpm run build` and
`pnpm run test` before opening a pull request. The [docs](docs/README.md)
explain how the pieces fit together.

## Licence

[Apache License 2.0](LICENSE).
