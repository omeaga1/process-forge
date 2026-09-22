# Plan 0001: A Decision Layer for the Unit-Op Sub-Agents

* **Status:** Proposed — not accepted, not started
* **Date:** 2026-09-22
* **Scope:** `@process-forge/protocol`, `@process-forge/canvas-ui`, `@process-forge/mcp-server`
* **Relates to:** [ADR-0002](../adr/0002-deterministic-sim-vs-llm.md), [ADR-0005](../adr/0005-zero-raw-keys-and-agent-driven-packages.md), [ADR-0006](../adr/0006-model-context-protocol-mcp.md)

---

## 1. Summary

Introduce a **decision layer**: a narrow interface that turns the keyword-matching
branch points in the sub-agent pipeline into *declared questions with typed answers
and confidence scores*, instead of first-match `String.prototype.includes` ladders.

The layer ships with two interchangeable implementations. The heuristic one is the
code we have today, wrapped. The second is backed by **Jev**, a decision model
released 2026-09-15 by TypeSafe AI that returns typed values and probabilities
rather than text.

The layer is an **accelerant, never a dependency**. Offline and air-gapped
deployments keep working unchanged, because the heuristic implementation is the
default and requires no network.

---

## 2. Motivation: where the pipeline is actually non-deterministic

The simulation core is not the problem. [ADR-0002](../adr/0002-deterministic-sim-vs-llm.md)
already decouples inference from calculus, and a `UnitOpContract` is data evaluated
by the restricted evaluator in `packages/protocol/src/unitop/expression.ts` — a
contract-defined node is exactly as reproducible as a hand-written one. **Nothing in
this plan goes anywhere near the engine.**

The non-determinism lives in the routing seams upstream of the engine. There are
135 `.includes('…')` tests across the source packages; four of them make decisions
that change what the user sees.

### 2.1 Intent routing — `packages/canvas-ui/src/ai/aiDispatch.ts:80`

`isCadRequest` is twelve OR'd substring tests, including bare `'reactor'`, `'tank'`,
and `'column'`.

> "the reactor feed pump is fine, don't change anything"

trips `lower.includes('reactor')`, synthesizes a CAD drawing, and offers the engineer
a dressing swap they did not ask for.

### 2.2 Kind detection — `packages/canvas-ui/src/ai/aiDispatch.ts:419`

A first-match ladder that tests `pump` before `reactor`.

> "add a reactor with a feed pump"

instantiates a `PUMP`. `isCreationIntent` (`:407`) fires on a bare `'add'` or `'make'`
appearing anywhere in the message, including inside a question that is not a request.

### 2.3 Template selection in rendering — `packages/protocol/src/cad/equipmentCadEngine.ts:40`

Eight equipment families, first substring match wins, and `'column'` sits in family 1
— so any prompt mentioning a column renders a fractionation tower. Worse, line 51:

```ts
const trayCount = p.includes('10') ? 10 : p.includes('8') ? 8 : /* … */ 5;
```

> "add a 10 inch nozzle"

renders a ten-tray column.

### 2.4 Tool-call extraction — `packages/canvas-ui/src/ai/aiDispatch.ts:370`

`parseUnitOpToolCall` regexes a JSON block out of free-text model output, then falls
back to the §2.2 ladder when the model phrased its answer conversationally. The
output space here is unbounded: the model can emit anything, or nothing.

Every one of these is a closed-set choice, a boolean, or a bounded number. That is
precisely the shape a decision model consumes.

---

## 3. What Jev is

Jev does not generate text. You assemble a `state` object (strings, arrays,
name-value pairs) and attach a set of questions declared in advance; it returns typed
answers with probabilities. Questions are evaluated in parallel, so N questions cost
roughly the latency of one.

| Form | Returns |
| --- | --- |
| **Noul** | 0–1 confidence that a statement is true |
| **Choice** | a probability distribution over options *you* supply |
| **Score** | a float on a numeric scale you describe |

Published pricing is **$0.042 per million input tokens, output free**. A dispatch
classification carries roughly 500 tokens of state, so on the order of $0.00002 per
call — cheap enough to run on every message before submit.

**Caveat, stated plainly:** the description above comes from launch coverage
(TechCrunch, Simon Willison, LangChain), not from TypeSafe's own API documentation.
Nobody on this project has yet read the real docs or called the API. §8.1 is a hard
gate before any of §6.3 begins.

---

## 4. What this buys, and what it does not

It does **not** make the pipeline deterministic. A probabilistic model is still a
probabilistic model. What it buys:

1. **A closed output space.** A Choice can only return a member of the enum you
   supplied. The current free-text-plus-regex path can return anything at all.
2. **A confidence number to threshold on.** This is the largest single quality win
   available here. Below a tuned threshold, *ask the engineer* — "did you mean a
   packed absorption column or a spray chamber?" — instead of silently rendering
   the wrong vessel.
3. **Testability.** A fixture set of prompts mapped to expected answers becomes a
   real regression eval. The `includes()` ladder can be tested but cannot be
   *improved*: every fix is one more substring that breaks a neighbouring case.

Where genuine reproducibility is required — golden tests, `.pfg.json` replay — the
provider memoizes on `hash(state + questionSet)` and the cache is pinned (§6.6).

---

## 5. Design

### 5.1 The interface

New package-internal module: `packages/protocol/src/decisions/`.

It lives in `protocol` because `equipmentCadEngine.ts` (a consumer) already lives
there, and because the question sets are derived from the Zod schemas in that
package.

```ts
export interface Distribution<T extends string> {
  /** Highest-probability option. */
  value: T;
  /** Probability mass on `value`, 0–1. */
  confidence: number;
  /** Full distribution, retained for logging and for runner-up disclosure. */
  options: Record<T, number>;
}

export interface DecisionProvider {
  readonly id: 'heuristic' | 'jev';
  choice<T extends string>(state: DecisionState, q: ChoiceQuestion<T>): Promise<Distribution<T>>;
  noul(state: DecisionState, q: NoulQuestion): Promise<number>;
  score(state: DecisionState, q: ScoreQuestion): Promise<number>;
}
```

`DecisionState` mirrors the Jev state object: a flat record of strings, string
arrays, and name-value pairs. Keeping it provider-shaped avoids a translation layer.

### 5.2 The two implementations

| Implementation | Behaviour |
| --- | --- |
| `HeuristicDecisionProvider` | Today's substring ladders, extracted verbatim and wrapped to return `{ value, confidence: 1, options }`. **Zero network.** The default. Never removed. |
| `JevDecisionProvider` | Batches every question for a call site into one parallel Jev request. On error, timeout, or missing credentials it **falls through to the heuristic provider** — never throws into the UI. |

The fall-through is the important part. It is the same shape the codebase already
uses everywhere else: offline mode is a first-class citizen in `aiDispatch.ts`, not
an error path.

### 5.3 The four call sites

**A. `selectCadTemplate(prompt, kind)` → `packages/protocol/src/cad/`**

* Choice over the eight family ids, which this work promotes from implicit control
  flow into a named, exported table.
* Nouls for the booleans the function already extracts: `isPacked`, `isConeBottom`,
  `hasJacket`, `hasDemister`.
* Score for `trayCount` on a 2–40 scale, replacing the digit-substring test.

**B. `selectNodeKind(message)` → `packages/canvas-ui/src/ai/`**

* Choice with `options` derived directly from `NodeKindSchema.options`. The question
  set then cannot drift from the type — adding a kind to the enum adds it to the
  question automatically.

**C. `classifyDispatchIntent(message, ctx)` → `packages/canvas-ui/src/ai/`**

* Choice over `CAD_GEOMETRY_CHANGE | PARAMETER_ADVICE | CREATE_UNIT_OP |
  DIAGNOSTIC_QUERY | CHITCHAT`, replacing both `isCadRequest` and `isCreationIntent`.

**D. Contract advisory gate → `packages/mcp-server/src/tools/validateUnitOp.ts`**

After the three existing hard gates pass, run Nouls over the candidate contract for
what the evaluator structurally *cannot* check:

* "every parameter's unit is consistent with its label"
* "the constraints cover the failure modes a real unit of this type has"
* "the derived expressions are dimensionally coherent"

Emitted as **`WARNING` severity only, never `ERROR`, never a blocker.** The engine
keeps deciding what is valid; the model only adds a smell test. This preserves the
central claim in `designUnitOp.ts`: *the model proposes, the engine decides.*

### 5.4 Confidence thresholds

| Confidence | Behaviour |
| --- | --- |
| ≥ 0.85 | Act. |
| 0.60 – 0.85 | Act, but surface the runner-up in the UI: "Rendered as X — did you mean Y?" |
| < 0.60 | Do not act. Ask the engineer to disambiguate between the top two. |

Thresholds are constants in one file, tuned against the §7 fixtures, not scattered
across call sites.

---

## 6. Implementation phases

Each phase is independently shippable and independently valuable. **Phases 1 and 2
have no dependency on Jev at all** and are worth doing even if §8 kills the rest.

### 6.1 Phase 1 — Extract the interface and the heuristic provider

*No behaviour change. Pure refactor.*

1. Create `packages/protocol/src/decisions/` with the types in §5.1.
2. Implement `HeuristicDecisionProvider` by lifting the existing ladders.
3. Export a module-level `getDecisionProvider()` returning the heuristic provider.
4. Existing tests must pass untouched. That is the acceptance criterion.

### 6.2 Phase 2 — Promote the CAD template families to data

*No behaviour change. Highest standalone value.*

1. Refactor `synthesizeEquipmentDrawing` so the eight families become an exported
   `CAD_TEMPLATE_FAMILIES` table: `{ id, label, category, keywords, build(params) }`.
2. Route selection through `provider.choice()`; the heuristic implementation
   reproduces today's first-match-wins ordering exactly.
3. Route `trayCount` through `provider.score()` and the booleans through
   `provider.noul()`.
4. Add the §7 fixture suite. It will document the current wrong answers as *known
   failures* — that is the point, and it is what makes Phase 4 measurable.

### 6.3 Phase 3 — The Jev provider

*Gated on §8.1.*

1. Implement `JevDecisionProvider` against the real API, with batching, a timeout,
   and heuristic fall-through.
2. Wire credentials per whichever path §8.2 resolves to.
3. Ship it **off by default**, behind an explicit opt-in in AI settings.

### 6.4 Phase 4 — Turn it on for template selection

1. Enable the Jev provider for call site A only.
2. Run the Phase 2 fixture suite against both providers and publish the delta.
3. Tune the §5.4 thresholds against that run.
4. Proceed to call sites B and C only if the delta justifies it.

### 6.5 Phase 5 — The contract advisory gate

1. Call site D, `WARNING` severity only.
2. Requires resolving §8.3 — the MCP server has never performed inference of its own.

### 6.6 Caching

`JevDecisionProvider` memoizes on `hash(canonicalize(state) + questionSetId)`, with
an in-memory LRU for the session. Golden tests and `.pfg.json` replay run against a
pinned on-disk cache so a recorded flowsheet renders identically on re-open.

---

## 7. Test strategy

**Fixtures.** A table of real engineer prompts mapped to expected answers, living at
`packages/protocol/src/decisions/__tests__/fixtures/`. Seeded with the known-bad
cases from §2:

| Prompt | Expected | Heuristic today |
| --- | --- | --- |
| "the reactor feed pump is fine, don't change anything" | `PARAMETER_ADVICE` | `CAD_GEOMETRY_CHANGE` ✗ |
| "add a reactor with a feed pump" | `BATCH_REACTOR` | `PUMP` ✗ |
| "add a 10 inch nozzle to the tank" | trayCount n/a | 10 trays ✗ |
| "packed absorption column, 4 metre bed" | packed column | packed column ✓ |

**Provider parity.** Both implementations run the same suite. The heuristic
implementation is *allowed* to fail cases; the suite records a pass rate per
provider rather than asserting green, and that pass rate is the gate in Phase 4.

**No network in CI.** The Jev suite runs against recorded responses. Only a manual,
credentialed job hits the live API.

**Existing suites must stay green throughout**, in particular
`packages/canvas-ui/src/__tests__/dressingAndAnimations.test.ts` and
`packages/mcp-server/src/__tests__/unitOpDesignLoop.test.ts`.

---

## 8. Open questions and blockers

These are unresolved. Phases 3–5 should not start until 8.1 and 8.2 have answers.

### 8.1 The API is unverified — **hard gate**

Nobody has read TypeSafe's documentation or called the endpoint. Before Phase 3:

* Is there a TypeScript SDK, or is this a raw HTTP contract?
* **Does the endpoint permit browser origins?** `canvas-ui` calls providers directly
  from the browser (`packages/canvas-ui/src/ai/llmClient.ts`) and the zero-middleman
  property is load-bearing for the project's trust story. If Jev is CORS-restricted,
  the layer must move into the MCP server or a Worker, and §5 changes shape.
* What are the real latency numbers and rate limits under a burst of parallel
  questions?

### 8.2 ADR-0005 conflict — zero raw API keys

Jev is a third-party service with its own key and no OAuth path.
[ADR-0005](../adr/0005-zero-raw-keys-and-agent-driven-packages.md) states plainly
that asking plant engineers to paste `sk-…` into a form "feels like a hobbyist
wrapper." The `DecisionProvider` split makes Jev optional, which softens the
conflict but does not dissolve it. Someone has to decide between:

* **(a)** a fifth entry in `LlmProvider`, accepting an explicit ADR-0005 carve-out;
* **(b)** routing through a ForgeHub-side proxy, which reintroduces a middleman;
* **(c)** shipping it disabled and letting only self-hosters turn it on.

### 8.3 The MCP server has never performed inference

[ADR-0006](../adr/0006-model-context-protocol-mcp.md) and the architecture note at
`packages/mcp-server/src/tools/designUnitOp.ts:13` are explicit: in MCP deployment
*the client is the model*, and a sub-agent reaching for its own API key duplicates
the client and defeats the BYO-subscription thesis. At $0.042/M this is a weaker
objection than it would be for a frontier model, but call site D would still be the
first inference that server performs on its own account. **That warrants its own
ADR (ADR-0009) before Phase 5.**

### 8.4 No reasoning trace

Jev returns numbers with no explanation. For a tool where a misrouted template
silently renders the wrong vessel, that is an auditability *regression* against an
LLM that can say why. Mitigations, all already in the design: log the full
distribution rather than the argmax (§5.1), disclose the runner-up at marginal
confidence (§5.4), and keep the engine as the only authority on validity (§5.3 D).

---

## 9. Recommended first slice

**Phase 2 — `selectCadTemplate`.** Smallest blast radius. It is the rendering path
that motivated the investigation. `dressingAndAnimations.test.ts` already exists as
a home for the fixtures. And promoting the eight equipment families from an
`if/else` ladder into a named, exported table pays for itself in readability even if
§8 ends with Jev never being wired in at all.

---

## 10. References

* [Jev introduces a new shape of LLM — System One, aka Decision Models](https://simonwillison.net/2026/Sep/21/jev/) — Simon Willison, 2026-09-21
* [A new kind of AI model from a ChatGPT inventor is thrilling developers](https://techcrunch.com/2026/09/18/a-new-kind-of-ai-model-from-a-chatgpt-inventor-is-thrilling-developers/) — TechCrunch, 2026-09-18
* [ChatGPT pioneer launches Jev model for programmatic logic](https://www.artificialintelligence-news.com/news/chatgpt-pioneer-launches-jev-model-for-programmatic-logic/) — AI News
* [Building a harness with Jev](https://www.langchain.com/blog/building-a-harness-with-jev) — LangChain
