# Phase 2 — Simulation engine correctness

**Date:** 2026-09-17
**Scope:** `packages/simulation-core/src/engine.ts` (508 lines), `priority-queue.ts` (91 lines)
**Method:** Read of the full engine, plus executable invariant tests written before
any fix. Tests live in `packages/simulation-core/src/__tests__/engine-invariants.test.ts`.

**Status (2026-09-22): all 7 invariant tests pass.** The determinism pair was fixed by the seeded RNG; the other four by the engine changes described in §6 below. Each of the four was confirmed to fail against the pre-fix engine. The original findings are kept as the record.

> ⚠️ Adding this file turns `pnpm test` red for `simulation-core`. That is
> intentional per the audit plan ("write failing tests for anything you find
> before proposing fixes"), but it does mean CI is now failing. See
> *Handling the red build* at the end.

---

## Answers to the five Phase 2 questions

### (1) Event ordering and tie-breaking — NOT deterministic in the useful sense

`PriorityQueue` is a bare binary min-heap keyed on timestamp with **no
tie-breaker** (`priority-queue.ts:7`). Its docstring claims "deterministic
discrete-event scheduling."

It is deterministic in the weak sense that an identical sequence of
enqueue/dequeue calls yields an identical order. It is **not** deterministic in
the sense that matters: events at the same timestamp come out in heap-structure
order, not insertion order.

```
enqueue first, second, third, fourth — all at t=10
dequeue order: first, fourth, third, second
```

Consequence: any two machines completing on the same tick are serviced in an
order that is an artifact of heap geometry. Change an unrelated part of the graph
so the heap fills differently and simultaneous events silently reorder. On a line
where cycle times are round numbers — 12s filler, 25s palletizer — exact ties are
common, not rare.

**Fix:** make the priority a tuple of `(timeSeconds, insertionSequence)`. The
engine already maintains `eventCounter` (`engine.ts:31`), so the sequence number
exists; it just isn't used for ordering.

### (2) State-time accounting — correct for active nodes, leaks for inactive ones

**The good news, and it is genuinely good:** for every node that participates in
the simulation, `busy + blocked + starved + down` sums to the full elapsed time
to within rounding. The test asserting this **passes**. `setNodeState`
(`engine.ts:88`) correctly accumulates the outgoing state's duration on every
transition, and `run()` finalizes all nodes at `maxTimeSeconds` before building
the report. That logic is sound.

**The leak:** `setNodeState` returns early when the new state equals the current
state (`engine.ts:89`). The finalization pass sets every node to `IDLE`. A node
that is *already* `IDLE` therefore hits the early return and its trailing time is
never credited anywhere.

For a node that is never activated at all — no inbound edge, never scheduled — it
stays `IDLE` from t=0 and **100% of its time vanishes**:

```
orphan-tank: totalTimeSeconds=1800, but busy+blocked+starved+down = 0
```

This is hidden by `buildSimulationResult`, which computes
`totalTime = Math.max(totalSimTime, sum)` (`engine.ts:430`). The `Math.max`
papers over the discrepancy: the report shows a full 1800-second run with every
state bucket at zero, and no invariant is ever violated on paper. That `Math.max`
is the tell — a correct accounting never needs it.

**Fix:** credit the duration before the equality check, or have the finalization
pass write the elapsed remainder directly rather than going through
`setNodeState`. Then replace `Math.max` with an assertion.

### (3) The IDLE-credits-starvedTime case — intentional, but wrong and undocumented

`setNodeState` case `'IDLE'` adds the duration to `starvedTime`
(`engine.ts:105`). This looks deliberate: `MachineOeeReport` has no
`idleTimeSeconds` field, so idle time has nowhere else to go.

It is still wrong. Starved means *waiting on upstream material* — a real
production loss with a real cause. Idle means *not scheduled to run*. Folding the
second into the first inflates `starvedTimeSeconds` and misattributes the cause
of lost time, which is exactly what a bottleneck diagnosis reads. A conveyor that
drains its buffer and goes `IDLE` (`engine.ts:243`) is reported as starved.

Note this interacts with (2): idle time is credited to `starvedTime` when the node
*transitions out* of idle, and dropped entirely when it does not. So the same
state is accounted two different ways depending on what happens next.

**Fix:** add `idleTimeSeconds` to `MachineOeeReport` and give IDLE its own
bucket. This is an API change, so it is a decision, not a bug fix.

### (4) Buffer capacity and backpressure — enforced on one path, absent on another

`FILLER_CYCLE_COMPLETE` does this correctly (`engine.ts:194`): it checks
`downstream.bufferCans + produced <= downstream.maxBuffer`, and on overflow holds
the units and sets itself `BLOCKED`. That is proper backpressure.

`LABELER_CYCLE_COMPLETE` does this (`engine.ts:266`):

```ts
downstream.bufferCans++;
```

No capacity check. No block. A labeler can push unbounded material into a
downstream node regardless of its capacity. With a palletizer throttled to 2
units/min behind a 600/min labeler:

```
palletizer buffer peaked at 17,351 against a capacity of 100 — 174x over
```

A labeler therefore never exerts backpressure and never enters `BLOCKED`. Its
`blockedTimeSeconds` is structurally always zero, which means any bottleneck
analysis that looks for blocked time will never identify a labeler as blocked, no
matter how badly the line is configured.

Two lesser instances of the same pattern:
- The filler's own overflow buffer (`engine.ts:203`) is incremented with no
  bound, ignoring the filler's `maxBuffer`.
- `unblockUpstreamIfWaiting` (`engine.ts:356`) re-schedules upstream conveyors and
  labelers without rechecking downstream capacity.

**Worth noting for the test suite:** this defect is invisible on a balanced line.
The existing `buildLine()` fixture never overflows, so a naive capacity test
passes. The invariant test deliberately unbalances the line to take the path.

### (5) Run-to-run reproducibility — FIXED 2026-09-22

> **Resolved.** `simulateProcess` and `SimulationEngine` now take an optional
> `seed`, threaded through a mulberry32 generator in `simulation-core/src/rng.ts`.
> With no seed supplied, one is derived from the graph id, so a graph is
> reproducible by identity. The seed is reported on `SimulationResult` so a run
> can be replayed by whoever receives the report. Both determinism tests are
> un-skipped and passing. The original finding is kept below as the record.

#### Original finding

Two direct `Math.random()` calls, with no seed parameter anywhere in the package:

- `engine.ts:184` — filler reject check: `Math.random() < rejectRate`
- `engine.ts:259` — labeler optical inspection: `Math.random() < failRate`

Measured over 200 runs of a single unchanged graph:

```
distinct outcomes: 59 / 200
filler produced/scrapped varied: 1440/0, 1436/4, 1438/2, ...
labeler produced/scrapped varied: 1331/10, 1332/9, 1337/4, ...
```

The documented guarantee — "rerunning the same seed must produce the exact same
can count" — **cannot** hold, because there is no seed to rerun. There is no
seeded RNG in the engine, no `seed` field on the graph, and no way for a caller
to request reproducibility.

**A trap worth recording:** a two-run comparison is *not* sufficient to detect
this. The outcome space is small enough that two consecutive runs collide
frequently. The first version of this test compared two runs and **passed**. It
took 50 runs to make the failure reliable. Anyone writing a determinism check
here should compare many runs, not two.

Separately, `wallClockExecutionTimeMs` is included in `SimulationResult`
(`engine.ts:489`). It is a wall-clock measurement, so results can never be
byte-identical even after the RNG is fixed. It should be excluded from any
equality comparison, or moved out of the result object.

**Fix:** take an optional `seed` on `SimulationEngine`/`simulateProcess`, thread
a small seeded PRNG (mulberry32 or xorshift128 — a few lines, no dependency)
through both call sites, and default to a fixed seed so the default behavior is
reproducible.

---

## Additional findings outside the five questions

### 4.1 — Only the first outgoing edge of a node is ever used

`findDownstreamRuntime` (`engine.ts:404`) is:

```ts
const edge = this.graph.edges.find((e) => e.sourceNodeId === nodeId);
```

`.find()`, not `.filter()`. A node with two outgoing edges routes everything to
whichever edge appears first in `graph.edges` and silently ignores the rest. A
filler feeding two labelers produces **zero** units at the second labeler.

The engine cannot model splitting, parallel lines, or any branching topology, and
it fails silently rather than rejecting the graph. This is a modeling limitation
rather than a coding slip, but nothing documents it and nothing validates against
it.

### 4.2 — OEE performance uses an arbitrary default speed

`buildSimulationResult` sets `theoreticalSpeedPerMin = 40` and only overrides it
for `ROTARY_FILLER` and `LABELER` (`engine.ts:445`). Every other node kind —
palletizer, conveyor, surge tank, reactor — has its performance percentage
computed against a hardcoded 40 units/min that has nothing to do with its
configuration. For the palletizer in the standard fixture (48/min theoretical),
the resulting `performancePercentage` is not a meaningful number.

`performance` is also clamped with `Math.min(1.0, ...)`, which hides
over-production rather than surfacing it as a modeling error.

### 4.3 — Line throughput takes the max of terminal nodes, not the sum

```ts
totalPackaged = Math.max(totalPackaged, r.unitsProduced);   // engine.ts:481
```

With more than one terminal node, total line output is the largest single
terminal node's output rather than their sum. Combined with 4.1, a branching
graph both under-produces and under-reports.

---

## Test results

`packages/simulation-core/src/__tests__/engine-invariants.test.ts` — 7 tests, **1 pass / 6 fail**.

| Test | Result | Finding |
|---|---|---|
| state-time sums to elapsed, active nodes | **PASS** | accounting is correct where it runs |
| identical node reports across 50 runs | FAIL | 27 distinct outcomes — §5 |
| identical can counts across 50 runs | FAIL | §5 |
| never-activated node is accounted | FAIL | 0s of 1800s attributed — §2 |
| buffer never exceeds capacity | FAIL | 174x over capacity — §4 |
| all downstream edges receive output | FAIL | second branch got nothing — §4.1 |
| equal-priority events dequeue FIFO | FAIL | heap order, not insertion — §1 |

## 6. Fixes (2026-09-22)

| Defect | Fix |
|---|---|
| §1 heap tie order | Entries ordered by (time, insertion sequence) |
| §2 never-activated node unaccounted | Finalization credits trailing time directly; `Math.max` removed |
| §4 labeler overfills downstream | All transfers go through one capacity-checked `routeUnits`; the labeler holds and blocks |
| §4.1 only the first edge used | `routeUnits` deals round-robin across every outgoing edge with room; packaged output sums every terminal node |

Two defects found while fixing these, both in contract-defined nodes:

- A contract node consumed input without unblocking its feeder, so a feeder that blocked once stayed blocked for the rest of the run.
- A blocked contract node was resumed to BUSY with no event scheduled, accruing busy time while doing nothing. Its held output went back into its input queue, which would have been processed twice once the resume was fixed; the two bugs hid each other. Held output now lives in `heldUnits`.

Both have tests in `contractNode.test.ts`.

## Assessment

The engine is real. The event loop, the heap, the state machine, and the
state-time accounting for active nodes are all genuinely implemented and the
accounting invariant holds where the engine actually runs. CLAUDE.md's judgment
that this is "the good part" is correct.

What it is not is *trustworthy for its documented guarantees*. The determinism
claim is false outright. Backpressure is enforced on one of two paths. Branching
topologies fail silently. And three separate places — `Math.max` on totalTime,
`Math.min` on performance, `Math.max` on totalPackaged — smooth over
discrepancies instead of surfacing them, which is why all of this coexisted with
a green test suite.

Recommended fix order, cheapest and highest-confidence first:

1. **Seeded RNG** (§5) — makes every other test in the suite reproducible, so do
   it first. Small and self-contained.
2. **Heap tie-breaker** (§1) — a few lines; `eventCounter` already exists.
3. **Labeler capacity check** (§4) — mirror the filler's existing logic.
4. **Finalization time leak** (§2) — then delete the `Math.max` that hides it.
5. **`findDownstreamRuntime` / branching** (§4.1) — the largest change; decide
   whether to implement splitting or to *reject* multi-edge graphs in
   `validateProcessGraph`. Rejecting is honest and cheap; implementing is real work.
6. **`idleTimeSeconds`** (§3) — an API change, needs a decision.
7. **OEE speed defaults** (§4.2) and **throughput sum** (§4.3).

## Handling the red build

These tests document real defects, so they should not be deleted. Options:

- Leave them failing on a branch until the fixes land (matches the audit plan).
- Mark them `it.skip` with a pointer to this document, so `main` stays green and
  the tests activate as each fix lands.
- Move them to a separate `test:invariants` script excluded from the default
  `turbo run test`.

The second is the usual choice for an audit that will be fixed incrementally.
Nothing has been marked skipped yet — this is left as a decision.
