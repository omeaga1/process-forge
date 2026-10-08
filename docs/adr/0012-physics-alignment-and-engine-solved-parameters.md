# ADR-0012: Contracts are held to the physics of the equipment they describe

* **Status:** Accepted
* **Date:** 2026-10-08
* **Deciders:** maintainer

## Context

`validate_unit_op` checked that a contract was coherent: expressions parse,
names resolve, units agree, its own constraints hold, phases balance. None of
that can tell a correct pump from a "pump" with no shaft power, a spray dryer
that never evaporates anything, or an exchanger that mixes its two streams.
A model could write a coherent, wrong contract, and the loop accepted it.

On the engineer's side, every parameter was the same control: a number box
and a slider over min..max. The slider said nothing about which values work,
a count was a slider, a choice from a catalogue was a slider, a yes/no was a
slider, and a pressure in psi could only be typed in psi.

## Decision

**Physics alignment** (`protocol/src/unitop/physicsAlignment.ts`), a new gate
in `validate_unit_op`:

- Each archetype (`phases.ts`, now 24, with single-phase and packaging
  equipment in `archetypes.ts`) carries machine-checkable **requirements**:
  a quantity of a given dimension (optionally named, optionally guarded by a
  constraint, optionally computed rather than typed), a duty, channels,
  reactions, recoveries, an outlet temperature, a liquid draw per cycle, and
  so on, each with its fix. It also states the behavior modes the equipment
  runs in.
- A contract may declare `archetype`. Declared, it is **binding**: a missing
  port phase, phase change, mode or ERROR requirement rejects the contract.
  Undeclared, the archetype is inferred from the name (then the description)
  and findings are warnings, since a keyword match can be wrong. `custom`
  opts out.
- Whatever the archetype, the gate checks **energy and the second law at the
  design point**: outlets hotter or colder than the feed need a duty that
  covers m·cp·ΔT plus latent heat; streams in channels must trade the same
  heat and may not cross temperatures.
- Every verdict carries a **revisionPlan** (each problem across all gates,
  with its path and fix), and, when the contract's own checks fail,
  **suggestedFixes**: single-parameter values the engine solved for.
- `design_unit_op` hands the requirements over up front, tells the model to
  declare the archetype, and returns the matched equipment's own worked
  example when one ships (a new centrifugal pump example among them).
- `explore_unit_op` (MCP and in-app) returns, for each parameter, the exact
  ranges where the design passes, warns and fails, what each parameter
  changes, and the suggested fixes.

**Engine-solved parameter panel** (`canvas-ui/.../ContractParametersPanel.tsx`):

- The control follows the parameter: options → select, a 0/1 flag → switch,
  a count → stepper, a bounded value → slider, an open value → field,
  a constant → read-only. Contracts may state `integer`, `options` and
  `ui` (`control`, `group`, `step`, `scale`, `advanced`).
- Every slider is coloured by the engine's verdict along its range, with the
  pass/warn/fail edges bisected exactly; the caption says where it passes.
- Failing checks get one-click, engine-solved fixes; each check lists the
  parameters that move it, and hovering a parameter lights what it changes.
- Values can be typed in any unit of the same dimension ("3 bar" into a psi
  field), and the display unit is remembered per kind of quantity.
- Derived values show their change since the panel opened; Revert puts the
  parameters back. Standard units use the same panel through the contract
  built from their config.
- Editing a designed unit's parameter records it in
  `provenance.engineerConfirmed`.

## Consequences

- A model negotiating a design gets the engine's counter-offers and the
  physics it is held to in one round, not a pass/fail.
- The archetype table is now where both the phase plan and the physics
  requirements of a kind of equipment live. Each archetype must have
  requirements and modes, and every shipped example that declares one must
  meet it (tested).
- Inferred findings never reject, so existing contracts keep validating; the
  older examples that miss a requirement get warnings, not errors.
