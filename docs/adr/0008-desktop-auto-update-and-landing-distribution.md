# ADR-0008: Desktop auto-update and web hosting

* **Status:** Accepted. The GitHub Pages site and `apps/docs-landing` described
  in the original version are superseded by Cloudflare Pages (see below).
* **Date:** 2026-09-12 (amended 2026-09-22)
* **Deciders:** maintainer

## Context

ProcessForge ships as a desktop app and a web studio. Hosting should cost
nothing, downloads should come from the project's own CI, and desktop users
should find out when a new version is available.

## Decision

### 1. Web hosting: Cloudflare Pages

- `apps/web` is deployed to Cloudflare Pages at <https://process-forge.pages.dev/>,
  built by GitHub Actions. See [docs/ops/cloudflare-pages.md](../ops/cloudflare-pages.md).
- The same deployment serves the landing page. It detects the visitor's OS,
  links the matching installer from the latest GitHub release, offers the web
  studio, and shows the MCP client configuration.
- The desktop app never shows the landing page (see `apps/web/src/runtime/desktop.ts`).

*Superseded:* the original ADR specified a separate landing site
(`apps/docs-landing`) on GitHub Pages. Both sites ran for a while and drifted
apart. `apps/docs-landing` was removed and the GitHub Pages site taken down on
2026-09-22.

### 2. Desktop installers: GitHub Releases

Tagging `v*` runs `release-desktop.yml`, which builds Windows, macOS and Linux
installers and publishes them with a `latest.json` update manifest that
carries the update signatures. See
[docs/ops/desktop-releases.md](../ops/desktop-releases.md).

### 3. Auto-update

- `tauri-plugin-updater` polls
  `https://github.com/omeaga1/process-forge/releases/latest/download/latest.json`.
- The Rust command `check_for_updates` returns `current_version`,
  `latest_version`, `should_update`, `release_notes` and `release_url`;
  `install_and_restart_update` installs the update.
- `UpdateNotificationBanner.tsx` shows a banner when an update is available.
  The user chooses when to install; nothing restarts on its own.

## Consequences

- No hosting cost beyond the free Cloudflare and GitHub tiers.
- Update checks depend on GitHub being reachable. A failed background check is
  silent; a manual check reports the error.
- A fix reaches desktop users only after a new tag.
