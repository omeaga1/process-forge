# ADR-0002: AI writes configuration; a deterministic engine does the math

* **Status:** Accepted
* **Date:** 2026-09-12
* **Deciders:** maintainer

## Context

A simulation must give the same answer every time for the same inputs, and
its numbers must come from equations that can be inspected. Language models
are useful for turning a description into a configuration, but they are not
reliable at arithmetic and their output varies between calls.

## Decision

Keep the model out of the simulation loop.

1. **AI role:** turn an engineer's description into data: a unit-op contract
   (parameters, derived-value expressions, constraints, behavior, drawing), or
   parameter suggestions for a standard unit.
2. **Engine role:** [`@process-forge/simulation-core`](../../packages/simulation-core/README.md),
   a TypeScript discrete-event engine, runs the flowsheet. Contract expressions
   are evaluated by a restricted evaluator in `@process-forge/protocol`, not by
   the model.
3. The engine, not the model, decides whether a contract is accepted.

## Consequences

- Runs are reproducible: the engine uses a seeded random number generator and
  reports the seed with each result.
- A model can still write a physically wrong contract. The constraint checks
  catch what the contract declares, not everything.
- Every machine type needs a well-defined configuration schema in
  `@process-forge/protocol`.
