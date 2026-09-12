# ADR-0007: Whole-Simulation Project Storage & Zero-Friction Guest Mode

* **Status:** Accepted
* **Date:** 2026-09-12
* **Deciders:** Lead Systems Architect, Orchestration Engineer, Platform Product Lead

## Context
Industrial domain engineers evaluating simulation software frequently encounter excessive friction:
1. **The Forced Registration Barrier:** Mandatory sign-ups, email verification, or credit card gates before allowing users to run or build their first simulation twin alienate busy engineers and reduce trial adoption.
2. **Loss of Machine Agent Context:** Typical simulation tools only save numerical spreadsheets or basic CAD coordinates. In ProcessForge, engineers interact with dedicated machine Sub-Agents (e.g. conversational prompt adjustments, transfer function derivations, and bottleneck discussions). If the storage format does not preserve this dialog, the software engineering context is permanently lost.
3. **Data Exfiltration Anxieties:** Plant operators are reluctant to create accounts on third-party cloud services before confirming the software satisfies their requirements and respects data confidentiality.

## Decision
We establish a two-pronged solution:

### 1. Whole-Simulation Project Contract (`SimulationProject`)
We define a comprehensive project schema in `@process-forge/protocol` that encapsulates the complete digital twin state:
- **`id` & `name`**: Authoritative simulation project identifiers.
- **`graph`**: Complete `ProcessGraph` containing all nodes, continuous fluid streams, discrete conveyor streams, and custom machine configurations.
- **`subAgentHistories`**: Key-value map preserving all multi-turn conversational transcripts between the engineer and machine-level Sub-Agents.
- **`orchestratorHistory`**: Transcripts with the Master Orchestrator (plant-wide bottleneck diagnosis, mass balance audits).
- **`cachedRunMetrics`**: High-resolution telemetry, cycle times, throughput, and OEE metrics from the most recent deterministic simulation.
- **`schemaVersion`**: Semantic versioning for future backward-compatible migrations.

### 2. Zero-Friction Guest Mode with Clear Acknowledgement
- **Instant Access:** Users land directly in the Osaka Jade interactive workspace without a login wall, credit card, or email prompt.
- **Local-Only Notice:** A prominent, non-intrusive badge (`GUEST MODE • LOCAL ONLY`) appears in the top navigation bar.
- **Guest Acknowledgement Dialog:** Clearly informs the user:
  > *"You are exploring in Guest Mode. Your changes are currently stored in your browser's temporary storage. If you clear your browser cache or switch computers, your work will not persist."*
- **Two Clear Preservation Pathways:**
  1. **Download `.pfg.json` Project Bundle:** 100% free and unlimited local file export on the user's hard drive. No account required.
  2. **Create Free Account / Sign In:** Cloud database sync with OAuth 2.0 PKCE (Google, Microsoft, GitHub) or Enterprise SSO for cross-device access and team collaboration.

## Consequences
### Positive
- Completely eliminates trial friction—engineers can build and simulate lines within seconds.
- Guarantees data sovereignty: users can run entirely offline with `.pfg.json` local files.
- Preserves full conversational software engineering context alongside mathematical parameters.

### Negative
- Users who ignore the Guest Mode acknowledgement and clear browser cache without downloading `.pfg.json` could lose temporary edits.
