# ADR-0011: Phases are part of the unit-op contract

* **Status:** Accepted
* **Date:** 2026-10-08
* **Deciders:** maintainer

## Context

A unit-op port said only whether it carried a continuous fluid or discrete
items. Gas, bulk solids and liquids were all a "fluid" counted in gal/min.
So a model designing a dust collector or a spray dryer had no target for the
basic facts of the unit: air comes in at so many ACFM, powder leaves at so
many kg/h, and a liquid becomes a solid because water evaporates with heat
that has to come from somewhere. Nothing checked any of it.

## Decision

- A port may state its `phase` (LIQUID, GAS, SOLID, ITEMS), the components
  it carries in another phase (`dispersed`) and what it carries (`carries`).
- A contract may declare `phaseChanges`, each with a mechanism and a latent
  heat expression.
- A **phase gate** in static analysis rejects:
  - a phase that leaves but neither enters nor forms;
  - a component that leaves in a phase it never had;
  - a mechanism that cannot make its change;
  - a heat-taking change with no heat source.
- `design_unit_op` returns a **phase plan** from deterministic equipment
  archetypes: ports, phases, flow units, phase changes, governing relations
  and key checks. It also returns one worked example that fits.
- The engine reports each outlet of a phase-aware unit in its phase's units.
- Everything is optional and defaults to the old meaning, so existing
  contracts and saved projects are unchanged. The standard units that handle
  gas or solids now state their phases.

## Consequences

- "Liquid in, solid out" is a checked statement, and the energy behind it is
  a constraint the engine evaluates live.
- The archetype table is the place to teach the tool a new kind of
  equipment. Each entry must pass the phase gate (tested).
- The engine still moves all continuous material on one mass-basis network.
  Gas and solid pipes are not yet sized in their own units; see the limits in
  [phases and physics](../architecture/06-phases-and-physics.md).
