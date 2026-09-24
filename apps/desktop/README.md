# @process-forge/desktop

The ProcessForge desktop app: a Tauri v2 shell around the `apps/web` build.
The studio code is the same as on the web; this package adds native pieces in
Rust (`src-tauri/src`):

- **Keychain** (`main.rs`): `save_secure_token`, `get_secure_token` and
  `delete_secure_token` store secrets such as model API keys in the OS
  credential store (Windows Credential Manager, macOS Keychain, Linux Secret
  Service) using the `keyring` crate.
- **Updater** (`main.rs`): `check_for_updates` and `install_and_restart_update`
  use `tauri-plugin-updater` against the `latest.json` published with each
  GitHub release.
- **OAuth loopback** (`oauth_loopback.rs`): Google and OpenRouter sign-in open
  the system browser and receive the redirect on a one-shot listener on
  `127.0.0.1`.
- **MCP bridge** (`mcp_bridge.rs`): a listener on `127.0.0.1` with a
  per-launch token, so the MCP server can read the open flowsheet and add unit
  ops to it. See [packages/mcp-server/README.md](../../packages/mcp-server/README.md).

The window's Content-Security-Policy is `app.security.csp` in
`src-tauri/tauri.conf.json`.

## Development

Requires Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
for your OS.

```bash
# from the repository root
pnpm install
pnpm run build
pnpm --filter @process-forge/desktop tauri dev   # starts the web dev server and the app window
```

## Building installers

The installer bundles `apps/web/dist`, so build the web app first:

```bash
pnpm --filter @process-forge/web build
pnpm --filter @process-forge/desktop tauri build
```

Releases are built by CI when a `v*` tag is pushed. See
[docs/ops/desktop-releases.md](../../docs/ops/desktop-releases.md).
