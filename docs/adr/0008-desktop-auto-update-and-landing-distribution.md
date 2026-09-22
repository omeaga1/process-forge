# ADR-0008: Desktop Auto-Update Protocol & GitHub Pages Showcase Distribution

* **Status:** Accepted
* **Date:** 2026-09-12
* **Deciders:** Lead Systems Architect, Platform Product Lead, Security Engineer

## Context
ProcessForge is distributed as both a browser-based Web Studio and a native desktop application (Windows, macOS, Linux). To deliver a seamless user experience while maintaining a $0 cloud footprint and strict privacy guarantees:
1. **Public Showcase & Distribution Portal:** Prospective users, plant managers, and engineers need a dedicated landing page to learn about the platform, inspect the multi-agent architecture, view the paint canning case study, and download native installers or launch the guest web studio.
2. **Zero Cloud Hosting Cost:** Hosting must remain completely free, reputable, and open-source without reliance on commercial proprietary proxies or services like Vercel.
3. **Desktop Auto-Update & User Notification:** Native desktop users (Windows `.msi`/`.exe`, macOS `.dmg`, Linux `.AppImage`) must be proactively notified when new versions or security patches are released on GitHub, with one-click in-app updating and zero intrusive forced restarts.

## Decision
We implement a zero-cost, open-source distribution and auto-update architecture:

### 1. Showcase Landing Page (`apps/docs-landing`)

> **Correction (2026-09-22): superseded. `apps/docs-landing` has been removed and
> the GitHub Pages site taken down.**
>
> This ADR was internally inconsistent as accepted: section 1 specified
> `apps/docs-landing` as the showcase landing page, while section 2 stated that
> GitHub Pages had been "deprecated and removed". Neither half was true in
> practice -- both sites were live and diverging, and the GitHub Pages deploy was
> last updated 2026-09-16 while `apps/web` moved on.
>
> There is now exactly ONE landing page: the `apps/web` landing view served from
> Cloudflare Pages at `https://process-forge.pages.dev/`. The features listed
> below (OS detection for installers, guest-mode launch, MCP configuration
> snippets) belong to that page, wherever they are not yet implemented there.
>
> ProcessForge is desktop-first. The landing page is a demo and download surface
> for the WEB build only; the desktop shell never renders it. See
> `apps/web/src/runtime/desktop.ts`.
- Built using Vite, React 19, and the Osaka Jade design system.
- Implements client OS detection (`navigator.userAgent` / `navigator.platform`) to automatically highlight the user's native installer:
  - **Windows:** 64-bit MSI Installer (`.msi`) & Standalone Portable Executable (`.exe`).
  - **macOS:** Universal Apple Silicon & Intel Disk Image (`.dmg`).
  - **Linux:** x86_64 AppImage (`.AppImage`) & Debian package (`.deb`).
- Embeds a 1-click **Launch Web Studio (Guest Mode)** action enabling zero-login trial simulations.
- Provides copy-paste configuration snippets for Claude Desktop and Gemini CLI stdio MCP integration.

### 2. Cloudflare Pages Deployment
- Deploys the unified interactive Web Studio (`apps/web`) directly to **Cloudflare Pages** at `https://process-forge.pages.dev/`.
- Provides edge CDN delivery across 300+ Anycast cities with zero subpath routing collisions, full HTTP/3 support, and unlimited free bandwidth.
- Co-located with the Cloudflare Workers / D1 Community Flowsheet Library backend (`https://process-forge-community-library.vprescenzi.workers.dev`).
- Deprecated and removed legacy GitHub Pages (`https://omeaga1.github.io/process-forge/`) to prevent duplicate site confusion and subpath routing issues.

### 3. Tauri v2 Desktop Auto-Updater Handshake
- Configured in `apps/desktop/src-tauri/tauri.conf.json` using the `tauri-plugin-updater` plugin.
- Endpoints check GitHub Releases CDN: `https://github.com/omeaga1/process-forge/releases/latest/download/latest.json`.
- The Rust shell exposes a `check_for_updates` command returning structured `UpdateInfo`:
  - `current_version`: Running application semver.
  - `latest_version`: Available release semver.
  - `should_update`: Boolean indicating whether an upgrade is recommended.
  - `release_notes`: Changelog summary from the GitHub release.
  - `release_url`: Official GitHub release download mirror.
- An in-app floating banner (`UpdateNotificationBanner.tsx`) renders in Osaka Jade styling when a newer version is detected, offering one-click download & update or dismiss.

## Consequences
### Positive
- $0 cloud infrastructure cost utilizing GitHub Pages and GitHub Releases CDN.
- Zero Vercel dependencies or vendor lock-in.
- High-trust distribution: all downloads and updates originate from verified GitHub Actions CI workflows.
- Immediate update visibility for desktop users without disruption or mandatory forced reboots.

### Negative
- Initial cold checks on slower internet connections depend on GitHub Releases availability; handled gracefully with non-blocking async checks and offline fallbacks.
