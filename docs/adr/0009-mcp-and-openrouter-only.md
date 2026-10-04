# ADR-0009: MCP clients and OpenRouter are the only AI paths

* **Status:** Accepted. Supersedes the "What happened" part of ADR-0005 item 1
  (own provider keys and local Ollama).
* **Date:** 2026-10-04
* **Deciders:** maintainer

## Context

The app could reach a model five ways inside it: a Claude, OpenAI or Gemini API
key, a local Ollama server, or OpenRouter sign-in. Each had its own request
shape, error messages, stored key, keychain entry and CSP host, and the AI
model dialog had to explain all of them. The in-app assistant (tool calling)
ran only on OpenRouter and OpenAI, and Jev only on OpenRouter, so the other
options were second-class: they could chat but not work on the flowsheet.

OpenRouter reaches the same Claude, GPT and Gemini models, and open-weight
ones, with one sign-in and one OpenAI-compatible API. People who already pay
for Claude, ChatGPT or Gemini use them through an MCP client, at no extra cost.

## Decision

ProcessForge uses AI in exactly two ways:

1. **An MCP client** (Claude Desktop, Cursor, Codex, ...) running the
   ProcessForge MCP server. Unchanged by this ADR.
2. **OpenRouter sign-in inside the app.** All in-app model calls (chat, the
   assistant, the unit-op author, Jev) go to `openrouter.ai`.

Direct Claude, OpenAI and Gemini API keys and local Ollama are removed: their
clients, settings, dialog options and CSP hosts.

## Migration

Settings saved by an earlier version for a removed provider read as "not
configured". At startup, and when the AI model dialog opens,
`migrateRemovedProviders()` deletes the stale keys (local storage, and the OS
keychain on desktop, best-effort), keeps any OpenRouter key saved alongside,
and leaves a notice that the dialog shows once: direct API keys are no longer
supported; sign in with OpenRouter or use an MCP client.

## Consequences

- One request shape and one set of error messages for in-app AI.
- `connect-src` lists `openrouter.ai` as the only model host.
- Fully offline AI (Ollama) is gone. The simulator itself still works offline,
  as does adding standard equipment from plain requests.
- Using a model through OpenRouter costs OpenRouter's price for that model,
  which is the provider's price; there is no option to pay a provider directly
  inside the app.
