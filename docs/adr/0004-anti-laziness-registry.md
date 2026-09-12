# ADR-0004: Anti-Laziness Protocol & Scaffold Registry

* **Status:** Accepted
* **Date:** 2026-09-12
* **Deciders:** Lead Systems Architect, Quality Engineering Lead

## Context
AI-assisted codebases often accumulate lazy stubs, unhandled `TODO` comments, and mock implementations that remain forgotten in production paths. When users encounter half-implemented stubs, platform trust collapses.

## Decision
We enforce an automated, zero-tolerance **Anti-Laziness Protocol**:
1. **Manifest Requirement:** Any temporary scaffolding required during phased milestones must be logged in [`scaffold-manifest.json`](../../scaffold-manifest.json) with a unique ID (`SCAF-XXX`), rationale, explicit removal condition, and blocked milestone.
2. **Runtime Guard:** Interim stubs must be wrapped in `createTrackedScaffold()`, which throws in production mode.
3. **Automated CI Scanner:** The CLI `verify-scaffolds` runs in CI and pre-commit, failing the build if any unregistered `TODO`, `FIXME`, or unhandled error stub is detected.

## Consequences
### Positive
- Zero hidden or forgotten stubs in production releases.
- Machine-verifiable audit trail of temporary scaffolding.
- Eliminates "lazy AI boilerplate" from the codebase.
