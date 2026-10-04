# Trust and security

This page describes how ProcessForge handles the OpenRouter key, flowsheet
data and cloud accounts.

## Model access

AI reaches ProcessForge in two ways only ([ADR-0009](../adr/0009-mcp-and-openrouter-only.md)):
an MCP client the user runs (it holds its own credentials; ProcessForge never
sees them), or an OpenRouter sign-in inside the app. The app holds one secret,
the OpenRouter key.

- **Desktop:** secrets are stored in the OS keychain (Windows Credential
  Manager, macOS Keychain, Linux Secret Service) through the Rust `keyring`
  crate, under the service prefix `com.processforge.studio:`. The Rust
  commands are `save_secure_token`, `get_secure_token` and
  `delete_secure_token`. Secrets are not written to local storage on desktop.
- **Browser:** there is no keychain, so the key is stored in the browser's
  local storage for the site. Anything that can run script on the page could
  read it; the Content-Security-Policy below limits where it could be sent.
- **OpenRouter sign-in** uses OpenRouter's OAuth PKCE flow and ends with an
  API key issued to ProcessForge for that user. The user can see, limit and
  revoke it in their OpenRouter settings. On desktop the flow returns to a
  loopback port (`openrouter_loopback_sign_in`); on the web it uses a popup.
- **Sign out** in the AI model dialog deletes the key from this device. Keys
  left by an earlier version for a removed provider (Claude, OpenAI, Gemini)
  are deleted at startup by `migrateRemovedProviders()`.

Model requests go directly from the app to OpenRouter, which forwards them to
the model's provider. ProcessForge has no server that proxies model traffic.

## Content-Security-Policy

The web build's policy is in `apps/web/public/_headers`; the desktop policy is
`app.security.csp` in `apps/desktop/src-tauri/tauri.conf.json`. Both set
`connect-src` to an allow-list, so the browser refuses requests to any other
host:

- `openrouter.ai`, the only model host;
- on desktop, any localhost port (the OAuth loopback and the dev server);
- the cloud API worker and `api.github.com` (release lookup);
- Google Identity Services, on the web only.

Images are limited to the app itself, `data:` URLs and Google profile images,
because an image URL can also carry data out. If a new service is added, it
must be added to both policies.

## Flowsheet data

- Without an account, projects stay on the user's machine: browser storage or
  a `.pfg.json` file.
- When a model is used in the app, the prompt (including the relevant
  flowsheet context) goes to OpenRouter, and from there to that model's
  provider, under the user's own OpenRouter account.
- The MCP server runs as a local process started by the MCP client. It sends
  nothing to ProcessForge.

## MCP bridge (desktop)

The desktop app runs a small HTTP listener so MCP clients can read the open
flowsheet and add unit ops (`apps/desktop/src-tauri/src/mcp_bridge.rs`):

- it listens on `127.0.0.1` only, on a port the OS picks;
- every request must carry a random token generated at each launch;
- the port and token are written to `mcp-bridge.json` in the app data
  directory, readable only by the current user, and removed on exit;
- requests with an `Origin` header are refused and the `Host` header must be
  the loopback address, so a web page cannot reach it;
- the app validates every contract again before adding it.

## Cloud accounts

Cloud features (saved projects, publishing to the community library) need a
Google sign-in. The Cloudflare Worker in `packages/community-library-api`
(`src/auth.ts`):

- verifies the Google ID token itself: RS256 signature against Google's
  published keys, issuer, audience (one of the project's client IDs) and
  expiry;
- then issues its own session token, valid for 30 days and HMAC-signed with a
  secret only the worker holds;
- takes the project owner from that session token on every project route, so
  a user can only read, write or delete their own projects.

On desktop, Google sign-in uses the installed-app flow: the system browser, a
one-shot listener on `127.0.0.1`, and PKCE. The worker does the code exchange,
so the desktop client secret is not shipped in the installer.

Email/password accounts are local profiles stored in the browser. They are
never sent to a server and cannot use the cloud.

The route list, configuration and deployment steps are in
[docs/ops/cloud-api.md](../ops/cloud-api.md).
