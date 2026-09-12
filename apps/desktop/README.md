# @process-forge/desktop

The native desktop distribution shell for **ProcessForge**, built with **Tauri v2** and Rust.

---

## Architectural Highlights

1. **Lightweight Native Binary (<20MB):** Uses the OS webview rather than an embedded Chromium instance, reducing memory consumption by 85% compared to Electron.
2. **Zero Raw API Keys (OS Keychain Integration):** All enterprise OAuth tokens, SSO keys, and session identities are stored directly in the OS-native vault via `keyring-rs`:
   - **Windows:** DPAPI & Windows Credential Manager
   - **macOS:** Apple Keychain
   - **Linux:** Secret Service API / FreeDesktop `libsecret`
3. **100% Offline & Air-Gapped Operation:** All physical flow calculations and discrete queue events are executed on-device by the embedded WebAssembly/Rust engine. Zero telemetry egress is required.

---

## Development

```bash
# Start frontend and Tauri development window
pnpm --filter @process-forge/desktop tauri dev
```

## Production Packaging

```bash
# Build standalone native installer (.exe / .msi on Windows, .dmg on macOS, .AppImage on Linux)
pnpm --filter @process-forge/desktop tauri build
```
