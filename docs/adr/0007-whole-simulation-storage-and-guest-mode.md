# ADR-0007: Whole-project storage and guest mode

* **Status:** Accepted
* **Date:** 2026-09-12
* **Deciders:** maintainer

## Context

Someone trying ProcessForge should be able to build and run a flowsheet
without creating an account. A saved project should also keep more than the
graph: the chat with the assistant explains why a unit was configured the way
it is.

## Decision

### 1. One project format (`SimulationProject`)

`@process-forge/protocol` (`src/storage.ts`) defines a project as:

- `id`, `name`, `description`, `createdAt`, `updatedAt`;
- `graph`: the full `ProcessGraph` (nodes, streams, configurations);
- `subAgentHistories`: chat history per unit;
- `orchestratorHistory`: chat history with the flowsheet-level assistant;
- `cachedRunMetrics`: results of the last run, optional;
- `schemaVersion`, for future migrations;
- `isGuestProject`.

The same object is written to a local `.pfg.json` file, to browser storage, or
to the cloud API.

### 2. Guest mode

- The studio opens without a sign-in.
- The header shows that the session is in guest mode and stored locally.
- A dialog explains that guest work lives in browser storage and offers two
  ways to keep it: download a `.pfg.json` file (no account needed), or sign in
  with Google to save to the cloud.

## Consequences

- Users can work entirely offline with local files.
- A guest who clears browser storage without downloading the file loses their
  work.
