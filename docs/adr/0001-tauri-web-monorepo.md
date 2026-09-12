# ADR-0001: Hybrid Desktop (Tauri v2) & Web Monorepo

* **Status:** Accepted
* **Date:** 2026-09-12
* **Deciders:** Lead Systems Architect, Orchestration Engineer

## Context
Previous attempts at building process simulation platforms on purely cloud-hosted stacks (such as Vercel + Supabase) faced severe customer pushback:
1. Users rejected pasting sensitive API keys into web forms due to fear of cloud logging and credential theft.
2. Proprietary factory line recipes could not be stored in unvetted multi-tenant cloud databases.
3. Conversely, forcing a local-only CLI tool eliminated real-time team collaboration.

## Decision
We adopt a **Tauri v2 + React/Next.js monorepo** managed via pnpm workspaces and Turborepo.
- **Desktop Distribution:** Tauri v2 produces native, lightweight (<15MB) single-click installers (`.msi` / `.exe` for Windows, `.dmg` for macOS). It stores API keys exclusively inside the OS credential store (Windows DPAPI / macOS Keychain), dispatching inference over direct client-side TLS.
- **Web Distribution:** The exact same core packages (`protocol`, `simulation-core`, `theme`, `canvas-ui`) compile for web deployment for collaborative teams using enterprise ZDR gateways.

## Consequences
### Positive
- Zero cloud exfiltration of API credentials in desktop mode.
- Single codebase shared between native desktop and collaborative web app.
- Extremely fast local startup without Electron's 200MB memory footprint.

### Trade-offs
- Requires native build tooling (Rust toolchain, MSVC on Windows, WebKitGTK on Linux) in CI.
