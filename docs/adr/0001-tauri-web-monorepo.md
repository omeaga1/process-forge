# ADR-0001: Tauri v2 desktop app and web studio in one monorepo

* **Status:** Accepted
* **Date:** 2026-09-12
* **Deciders:** maintainer

## Context

Engineers need to work on flowsheets that may be confidential, and some will
not paste API keys into a web page. Others want to try the tool in a browser
without installing anything. Maintaining two separate codebases for these
cases is not practical for a small project.

## Decision

Use a pnpm + Turborepo monorepo with a Tauri v2 desktop shell and a Vite/React
web app.

- The studio lives in `apps/web`. The desktop app bundles the same build.
- Shared code lives in packages: `protocol`, `simulation-core`, `canvas-ui`,
  `theme`.
- On desktop, secrets are stored in the OS keychain through a Rust command.
  Model requests go directly from the app to the provider.

## Consequences

- One codebase serves both desktop and web.
- Tauri uses the OS webview, so the installer does not ship a browser engine.
- CI and contributors building the desktop app need native tooling (Rust, MSVC
  on Windows, WebKitGTK on Linux).
- A fix reaches desktop users only when a new desktop release is tagged (see
  [docs/ops/desktop-releases.md](../ops/desktop-releases.md)).
