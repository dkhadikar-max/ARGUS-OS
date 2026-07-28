# Gate 2 (Replay) Authorization Package

**Status: Architecture Freeze declared. This document requests authorization
to run Gate 2 (Replay) -- it does not run anything itself.** No code in this
package executes Replay; it exists so you can decide whether to authorize
the real Claude API spend Replay requires.

## Architecture Freeze

As of commit `6f73804`, the v5.0 Compiler Architecture scaffolding
(Increments 1-2: agent-stage capabilities, Planner, Executor,
DecisionSynthesizer, DecisionEngine.evaluate(), ExecutionTrace, the
reusable PII check) is frozen. From this point, changes to this code
require evidence from Replay, evidence from Shadow, or a production
incident -- not further architectural refinement. `decision.service.ts`
remains untouched throughout; nothing in the live decision-making path has
changed.

## What Gate 2 (Replay) actually is

Run all 51 real fixtures through **both** the old runtime
(`runAgentDebateWithController`, `execution-runtime.ts`) and the new engine
(`evaluate()`, `decision-engine.ts`) against the **real Claude API** (not
mocked), and compare results using the layered approach already proven in
`decision-engine.test.ts`'s parity tests:
- Layer 1 (decision semantics -- verdict, confidence, weighted_score,
  controller action/target): must match.
- Layer 2 (evidence semantics -- research data_points etc.): compared as
  set/sorted equality, not exact order.
- Layer 3 (latency, cost, tokens): measured and reported, never asserted
  equal between the two runtimes.

This does not exist as a script yet -- it would need to be built (a new
`eval/run-replay.ts` or similar, reusing the existing fixture-loading and
manifest-writing conventions from `eval/run-candidate.ts` /
`eval/run-model-routing.ts`). Not built in this package; building it is
part of what authorization would unlock.

## Technical freeze (real, verifiable now)

| Item | Value |
|---|---|
| Fixture set | `eval/fixtures/`, 51 files |
| Fixture set hash (SHA-256 of all 51 files concatenated in sorted order) | `1B0A70833B6D7044EF6C0526C90DD2ABA0F9D1338FB8C1F272F374A6E0BD7DDA` |
| Fixtures last changed | commit `8c5cb11` (2026-07-24) |
| Prompts (`prompts.ts`) last changed | commit `f2279bb` (2026-07-27) |
| Decision Pack (`decision-pack.ts`) version | `"1"` (commit `c3c9ccc`) |
| Controller policy (`DEFAULT_CONTROLLER_POLICY`) version | `0` (commit `23a232e`) |
| Model | `CLAUDE_MODEL` constant (`claude-client.ts`) -- whatever it's currently pinned to; both runtimes use the same default, no per-stage override in either path |
| Codebase state | `6f73804` |

If any of these change before Replay runs, this table (and the fixture
hash specifically) needs to be regenerated -- a changed hash means the
comparison is no longer against the frozen corpus this package describes.

## Known placeholders (audited, not blocking)

Per the earlier placeholder audit (grep across all v5.0 scaffolding files
for TODO/FIXME/placeholder/dummy/NO_REAL_/temporary/fake): 2 hits, both
pre-existing and already explicitly documented in code comments -- the
"unconstrained" `BudgetSnapshot` placeholder (`decision-engine.ts`,
`capability-shadow.ts`) and `NO_REAL_COMPLEXITY_SCORE_AVAILABLE`
(`budget-manager.ts`, pre-dates this work). Neither affects the real
verdict/confidence a fixture produces -- both are only consulted before a
real `DecisionState` exists, and `decide()`'s actual branching is driven by
real confidence/budget-after-execution values, not these pre-state
placeholders. Not a Replay blocker.

## Cost estimate (real basis, clearly an estimate, not a quote)

Grounded in two already-established real numbers, not invented:
- **Pricing**: Bible §13.1's own stated Claude Sonnet-tier rate, already
  used throughout this codebase (`decision-value.service.ts`): $3/million
  input tokens, $15/million output tokens.
- **Real output-token measurement**: `orchestrator.ts`'s own documented
  finding from live testing of the current split-pipeline design: **5,361
  combined output tokens** on the critical path per decision (vs.
  ~3,000-3,360 for the old single-call design). This is a real number from
  an actual prior live test, not estimated here.
- **Input tokens**: this session's own direct measurement (all 51 real
  fixtures, `measure-prompt-lengths.ts`) found each stage's real system+user
  prompt runs ~1,300-1,450 tokens; across 5 stages (research/icp/intent/risk
  each repeating the full system prompt, plus judge) that's roughly
  6,500-7,500 input tokens per decision.

Per-decision estimate: (~7,000 input × $3/1M) + (5,361 output × $15/1M) ≈
**$0.021 + $0.080 ≈ $0.10/decision**.

Replay = 51 fixtures × 2 runtimes = **102 real decisions** ≈ **$10-11**,
plus a margin for `invoke_capability` re-runs (adds one real stage call for
whichever fixtures trigger it) -- **budget ~$15 total** as a safe upper
estimate, not a guarantee.

**Treat this as an estimate to be validated, not a commitment.** Token
usage varies with real input complexity; a small representative sample
(e.g. 3-5 fixtures against real Claude, both runtimes) before committing
to the full 102-decision run would both validate this estimate and be a
first real data point on the engine itself. That sample is itself a real,
small API spend -- not run here, requires the same explicit authorization
as the full run.

## Stop conditions

Not every failure during Replay should be handled the same way -- some
justify aborting immediately, others justify finishing the run to collect
diagnostic data while still blocking progression to Gate 3.

| Condition | Action |
|---|---|
| Replay infrastructure error (script crash, fixture load failure, network/auth failure unrelated to the engine itself) | Stop immediately |
| Schema mismatch (either runtime produces output that fails its own real Zod schema) | Stop immediately |
| API failure rate above threshold (proposed: >10% of calls fail) | Stop and investigate |
| Verdict agreement below the predefined threshold (see metrics below) | Complete the run, then block Gate 3 |

Thresholds above are proposed, not decided -- same status as the metrics
table below.

## Proposed success metrics (not yet agreed -- for your review)

| Metric | Proposed target |
|---|---:|
| Verdict agreement (Layer 1) | ≥99% |
| Confidence delta (P95) | ≤0.05 (normalized) or ≤5 points (raw scale) -- needs your call on which scale |
| Controller action agreement | ≥99% |
| Execution failures (either runtime) | 0 |
| Schema validation failures | 0 |
| Planner/Executor failures | 0 |

These are proposed, not decided -- flagged explicitly rather than treated
as already-agreed thresholds.

## Output artifact (designed, real code -- built before `run-replay.ts` itself)

Per review feedback -- design the output before the implementation.
`ReplayReport` and its constituent types (`ReplayMetadata`,
`ReplayFixtureResult`, `ReplayAggregateMetrics`, `ReplayThresholds`) are
now real, typechecked TypeScript in `eval/types.ts`, not just this
document's prose. Structure:

- **metadata**: fixture hash (must match this document's frozen hash --
  a mismatch means the corpus changed and the freeze needs regenerating),
  model, prompts/pack/policy versions, and the real (not estimated) $ actually
  spent.
- **perFixtureResults**: one row per fixture -- old vs. new verdict,
  confidence delta, controller action agreement, Layer 2 evidence
  agreement (set-based, not exact order), latency/cost for both runtimes,
  and a real error field for any fixture that failed on either side.
- **aggregateMetrics**: real computed rates/percentiles across all 51
  fixtures.
- **thresholds**: the actual thresholds this run was judged against --
  populated from whatever this document's metrics table is agreed to be
  at run time, not hardcoded, so a future threshold change doesn't
  require touching the type.
- **passed**/**failureReasons**: computed from aggregateMetrics vs.
  thresholds, never manually set -- can't silently drift from what the
  real numbers say.

## What authorization would unlock

1. Build `eval/run-replay.ts` (new eval script, reusing existing
   conventions -- no behavior change to anything live).
2. Run it against real Claude, spending the estimated ~$10-15 above.
3. Produce a real comparison report (the layered metrics table above,
   populated with real numbers) for your review.
4. Gate 3 (Shadow) and Gate 4 (Cutover) remain separate, later,
   explicitly-authorized decisions -- this package covers Gate 2 only.

**Nothing above has been executed. This is the authorization request, not
the result.**
