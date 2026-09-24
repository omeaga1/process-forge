# ADR-0005: No raw API keys; shareable unit-op packages

* **Status:** Superseded — the app now accepts the user's own API keys and
  OpenRouter sign-in; keys are stored in the OS keychain on desktop.
* **Date:** 2026-09-12
* **Deciders:** maintainer

## What this ADR decided (historical)

1. **No raw API keys.** Users would sign in with an account instead of pasting
   provider keys, and model usage would be routed through a hosted gateway. A
   local Ollama mode would cover offline use.
2. **Built-in physics.** The desktop app would include its calculations with no
   Python or other runtime for the user to install.
3. **Shareable unit ops.** Custom unit ops would be packaged as bundles that
   others can import.
4. **Capability packages.** A unit op's assistant would recommend optional
   calculation packages (`@forge/pkg-*`).

## What happened

- Item 1 was not built. No hosted model gateway exists. The app instead takes
  the user's own key for Claude, OpenAI or Gemini, OpenRouter sign-in, or a
  local Ollama server. On desktop, keys are stored in the OS keychain; in the
  browser, in local storage. See
  [architecture/02-trust-and-security.md](../architecture/02-trust-and-security.md).
- Item 2 holds: the simulation engine is TypeScript that runs inside the app.
- Item 3 became the community library: signed-in users publish unit ops to the
  Cloudflare Worker in `packages/community-library-api`, and anyone can browse
  and insert them. The MCP tool `package_unit_op` produces a JSON bundle for a
  node.
- Item 4 was not built. `@forge/pkg-*` names appear only as suggestion strings
  in MCP tool output; no such packages exist.
