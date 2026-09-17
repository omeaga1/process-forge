# Phase 0 — Baseline: does it even run

**Date:** 2026-09-17
**Commit:** 9b567f6 (`main`, clean tree)
**Environment:** Windows 11, Node v24.19.0, pnpm 10.5.0 (via corepack), turbo 2.10.12

No code was changed. This records observed state only.

## Result summary

| Step | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | **PASS** — 244 packages, 31s, lockfile honored |
| `pnpm build` | 0 | **PASS** — 10/10 tasks, 35s |
| `pnpm typecheck` | 0 | **PASS** — 15/15 tasks, 18s |
| `pnpm test` | 0 | **PASS** — 19/19 tasks, 10s, 0 failures |
| `pnpm lint` | 0 | **PASS** — 15/15 tasks, 2s |
| `pnpm run verify:scaffolds` | 0 | **PASS** — 99 files scanned, 0 violations |

The repo builds and is fully green. Nothing is broken; nothing is skipped in the
sense of erroring out. The findings below are about what "green" is worth here.

## Environment note (not a repo defect)

`pnpm` was not on PATH; `corepack enable` requires admin on this machine
(EPERM on `C:\Program Files\nodejs`). Turbo shells out to `pnpm` by name and
fails with `Unable to find package manager binary` when only the `corepack pnpm`
shim exists. Resolved by placing a `pnpm` shim in `~/.local/bin`. Anyone
reproducing this on Windows without admin will hit the same wall — worth a
README line.

pnpm skipped postinstall scripts for `esbuild`, `sharp`, and `workerd` under its
default policy. Nothing in the audited steps needed them, but `deploy:web`
(wrangler/workerd) and any `sharp` image path are untested as a result.

## Finding 0.1 — Test coverage is inversely proportional to importance

19 green task exits are 19 *process exit codes*, not 19 tests. Actual assertions:

| Package | Assertions | Test LOC |
|---|---:|---:|
| canvas-ui | 52 | 877 |
| web | 32 | 799 |
| protocol | 21 | 611 |
| theme | 13 | 189 |
| mcp-server | 9 | 146 |
| scaffold-registry | 3 | 130 |
| **simulation-core** | **2** | **163** |

`simulation-core` is the package CLAUDE.md calls "the good part" and the only
component the audit plan says is worth defending. It has **two** tests:

1. `dequeues elements in strict ascending timestamp order` (priority queue)
2. `executes a 30-minute simulation with high performance and realistic
   bottleneck dynamics` (one end-to-end run)

508 lines of discrete-event engine are covered by a single integration test.
Every question Phase 2 asks — tie-breaking at identical timestamps, state-time
accounting summing to elapsed, the IDLE/starvedTime case, buffer backpressure,
run-to-run determinism — is **unasked by the current suite**. Meanwhile the UI
theme package has 13.

## Finding 0.2 — Two packages have placeholder test scripts

- `@process-forge/community-library-api` → `echo "Community Library API tests passed"`
- `@process-forge/docs-landing` → `echo "Docs landing tests passed"`

These exit 0 and turbo counts them as successful tasks. They assert nothing. The
string "tests passed" is printed by a package with no tests. Note this is exactly
the failure mode the scaffold-registry gate is supposed to catch and does not —
see Finding 0.4.

`@process-forge/desktop` and `@process-forge/typescript-config` have no `test`
script at all (legitimate for the latter).

## Finding 0.3 — Test globs are shell-dependent

Every real test script is `node --test dist/__tests__/**/*.test.js`. This relies
on the shell expanding `**`. It worked here. Under a shell that does not expand
`**` the glob passes through literally, matches nothing, and `node --test` exits
0 having run zero tests — silently green. Tests also run against `dist/`, so a
stale or partial build yields a pass over old code.

## Finding 0.4 — The anti-laziness gate reports its own vacuity

```
[Anti-Laziness Guard] Files scanned: 99
[Anti-Laziness Guard] Active registered scaffolds: 0
[PASS] zero untracked placeholders found.
```

Confirms the known trap in CLAUDE.md. It scanned 99 files, found zero registered
scaffolds, and passed — in a tree containing two `echo "tests passed"` scripts
and the `queryUnitSubAgent` constant table. It detects forbidden *strings*, and
there are none. This is Phase 4's problem and the finding is now reproduced.

## Correction to CLAUDE.md's premises

CLAUDE.md states "One commit of history — the entire codebase was generated in a
single pass by Gemini." The repo has **61 commits** dated 2026-09-12 to
2026-09-16, with incremental messages (Tauri `frontendDist` path fixes, minisign
updater pubkey, Google auth origin handling, CI workflow repairs). This is
iterated work, not one generated pass. The remaining premises in CLAUDE.md should
be treated as unverified until Phase 1 checks them.

## Conclusion

Phase 0's question was "does it even run." It does — cleanly, on the first try,
across build, typecheck, test, lint, and the scaffold gate. That is a genuinely
better starting position than the audit plan anticipated.

The green is thinner than it looks. Coverage is concentrated in the UI and
absent from the engine, two packages fake their test step, and the placeholder
gate passes by construction. No blockers for Phase 1.
