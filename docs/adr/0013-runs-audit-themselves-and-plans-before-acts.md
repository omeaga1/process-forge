# ADR-0013: Runs audit themselves; multi-step changes are planned, then applied

* **Status:** Accepted
* **Date:** 2026-10-15
* **Deciders:** maintainer

## Context

A survey of the tools that put an AI model in front of a process simulator
(Reflux on Aspen Plus, DWSIM's assistant and MCP server, the AVEVA Process
Simulation agent of Liang, Groll & Sin, arXiv 2601.11650; CRAFTS on IDAES)
keeps finding the same failures. Models report a run that did not converge,
or broke a constraint, as a result. They do arithmetic on results and get it
wrong. They write to a variable that cannot be set and believe it took. They
make one change of a multi-step edit, fail at the next, and leave the model
half built.

ProcessForge's engine already did all the arithmetic. But a run's verdict on
itself was spread through its numbers. Writes to unknown settings were stored
and ignored. A five-unit build was five separate writes that could stop
anywhere.

The tools that work best answer each failure with a mechanism, not with
instructions:

- Reflux keeps "convergence failures stay failures", reads every change back
  before reporting it, and asks for one review gate tied to a plan
  fingerprint.
- CRAFTS puts deterministic gates between typed stages.
- Aspen and DWSIM report a heat and mass balance on every run.

## Decision

1. **Every run audits itself** (`simulation-core/src/balance.ts`,
   `tools/src/audit.ts`):
   - The engine closes its own mass balance, overall and per component with
     reactions booked. It also checks each heating, cooling or phase-changing
     unit's stated duty against the heat its streams carried. Heaters must
     match it, exchangers must net zero, and machines must stay between zero
     and their shaft work.
   - `simulate_process_line` leads with `status` (ok / warnings / failed) and
     coded `issues`.
   - Mass that does not close is an engine fault, reported as one.
2. **Writes refuse what they cannot do:**
   - A setting a unit does not have is refused, with the names it probably
     meant.
   - A result the engine works out cannot be set: it points to
     `hold_unit_result`.
   - A what-if that changes nothing is marked `noEffect`.
3. **Plan, then act** (`protocol/src/plan.ts`, `tools/src/plan.ts`):
   - `plan_changes` applies a list of changes to a copy, all or none. It
     returns the diff, the static check and a run before and after on one
     seed, plus a `planId`: a hash of the flowsheet's process content (not
     its drawing) and the changes.
   - `apply_changes` applies the same list in one edit, only if the `planId`
     still matches. It then reads the flowsheet back from the app and reports
     anything missing.
4. **One judge of what an edit is:**
   - The desktop bridge passes any edit op through, and the app's
     `applyFlowsheetEdit` accepts or refuses it. Both hosts (the MCP bridge
     and the in-app assistant) already apply edits through it.
   - The bridge's own list had fallen behind: `hold_unit_result` was refused
     at the bridge from the release it shipped in until 0.1.87.

## Consequences

- A model can no longer present a failed run's numbers without stating that
  it failed, and the engineer can see the balance behind a "status: ok".
- The energy check is honest about the engine's simplifications. It uses one
  specific heat per stream, so the tolerance is 10 %. A phase change without
  a latent heat is reported as not checked, never as passed.
- `apply_changes` is marked destructive, because a plan can remove things.
  MCP clients therefore confirm it: one confirmation for the whole plan,
  rather than one per step.
- Plans are bound by a 64-bit FNV-1a hash. It detects change; it does not
  resist forgery, and it does not need to, since the engineer's MCP client
  is trusted and the bridge is local and token-guarded (ADR-0006).
