# Replay Methodology (v3)

**This is an experiment protocol, not documentation of code. Once a Replay
run begins under this version, this document does not change for the
duration of that run. A methodology change is a new version (v4), applied
to the next Replay run -- never edited retroactively into an in-progress or
completed one.**

## Changelog

- **v3**: `run-replay.ts` now persists full structured artifacts
  (`output`, `graph`, `controllerDecision`, `executionTrace`, for both
  runtimes) for any fixture that lands in a disagreement category --
  agreement fixtures stay summary-only. Added after diagnosing
  `conflicting-signals-hiring-freeze`'s verdict mismatch required a
  separate, paid diagnostic rerun (`eval/diagnose-fixture.ts`) specifically
  because the original sample only kept the normalized comparison and
  discarded the real result objects. Also fixed a real bug found during
  that diagnosis: `DecisionStateGraph.states` is a `Map`, which
  `JSON.stringify` silently serializes as `{}` -- `run-replay.ts` now
  converts it to an array before persisting. See §5's revised wording and
  the important scope caveat there (this behavior is Replay-specific, safe
  only because Replay fixtures are synthetic -- it must not be assumed to
  carry over unchanged into Shadow, which touches real prospect data).
- **v2**: added §1a (Gate 2a -- Noise Baseline), required before the full
  51-fixture run. v1 had no way to distinguish disagreement caused by the
  new engine from disagreement caused by ordinary independent-LLM-sampling
  variance, since neither runtime is deterministic and neither run is
  compared against a fixed ground truth. Added after a 5-fixture Old-vs-New
  validation sample showed confidence deltas of 5-10 points and 2/5
  controller-action mismatches with no way to tell whether that was
  architectural or just noise.
- **v1**: initial protocol (§1-6 below, unchanged from v1 except
  renumbering to make room for §1a).

## 1. What exactly is executed?

For each of the 51 real fixtures in `eval/fixtures/` (frozen set --
hash pinned in `GATE2_REPLAY_AUTHORIZATION.md`), sequentially, old runtime
then new engine (sequential, not concurrent, to avoid real API
rate/resource contention skewing Layer 3 telemetry):

- **Old runtime**: `runAgentDebateWithController(fixture.input, identity)`
  (`execution-runtime.ts`) -- real Claude calls, not mocked.
- **New engine**: `evaluate(SALES_LEAD_QUALIFICATION_PACK, fixture.input, identity)`
  (`decision-engine.ts`) -- real Claude calls, not mocked.

Both run against the same model, same fixture input, same identity,
independently -- neither observes or depends on the other's execution or
shared mutable state (see the "Isolation" property in the prior review
round). Up to 5 real stage calls × 2 runtimes × 51 fixtures = 510 calls,
plus any real `invoke_capability` re-runs on either side.

## 1a. Gate 2a -- Noise Baseline (required before the full run)

**Purpose**: separate two things Replay's raw disagreement rate cannot
distinguish on its own:

- **Model variance** (expected) -- two independent real Claude calls, same
  runtime, same fixture, disagree simply because LLM sampling is
  stochastic. Not a defect in anything.
- **Architectural variance** (what Replay is actually trying to measure) --
  disagreement caused by the new engine's Planner/Executor/Synthesizer path
  producing genuinely different behavior from the old runtime, beyond what
  sampling alone would produce.

Without a baseline, a given disagreement rate is uninterpretable: 20%
controller-action disagreement could mean "the new engine has a bug" or
"this pack's outputs sit near policy thresholds and any two independent
runs would disagree this often." v1 had no way to tell these apart.

**Procedure**: on the same small fixture subset used for a validation
sample (not the full 51 -- this is a cheap control, run before committing
to the full spend), run the **old runtime twice**, independently:

- Old Runtime A: `runAgentDebateWithController(fixture.input, identity)`
- Old Runtime B: `runAgentDebateWithController(fixture.input, identity)`
  (same fixture, same identity, same model -- a second, independent call)

Compare A vs B using the exact same `compareResults` logic and disagreement
categories defined in §2 below -- no new comparison logic, same function,
just fed two "old" outcomes instead of one old and one new. This produces a
noise floor: verdict / confidence-delta / controller-action / research-
signal agreement rates attributable to sampling alone, with zero
architecture change involved.

**Interpretation**: compare the Old-vs-Old baseline metrics against the
Old-vs-New metrics from the same fixture subset.

- If Old-vs-New agreement rates and confidence deltas are **similar to**
  Old-vs-Old (no formal significance test defined at small sample sizes --
  this is a qualitative comparison, not a statistical test), the new
  engine is behaving within the range of ordinary model variance. That is
  evidence *for* the architecture, not proof of it.
- If Old-vs-New is **materially worse** than Old-vs-Old on the same
  fixtures (lower agreement, larger deltas, mismatches Old-vs-Old never
  produces), that is evidence of a genuine architectural difference worth
  investigating before spending further budget on the full run.

Gate 2a does not replace the full 51-fixture Replay or its proposed
thresholds (§5) -- it is an interpretive aid run once, cheaply, before
deciding whether the full run is likely to produce actionable evidence.

## 2. What counts as a disagreement?

Interpret every rate below in light of the Gate 2a noise baseline (§1a),
not in isolation -- a rate below threshold is only evidence of an
architectural problem if it is also materially worse than the same
runtime's disagreement with itself.

A fixture contributes to a `DisagreementCategory` (`eval/types.ts`) when:

- **verdict_mismatch**: old and new `output.judge.verdict` differ.
- **confidence_threshold_exceeded**: `|old.confidence - new.confidence|`
  exceeds the agreed threshold (proposed in `GATE2_REPLAY_AUTHORIZATION.md`,
  not yet agreed).
- **controller_action_mismatch**: old and new controller `action` differ,
  or (when both are `invoke_capability`) `targetCapability` differs.
- **runtime_error**: either runtime throws for this fixture.
- **schema_error**: either runtime's output fails its own real Zod schema.
- **missing_capability_output**: a stage the ExecutionPlan says should run
  produced no `CapabilityOutput` -- a real Executor bug, not a model
  disagreement.

A fixture with none of the above is "agreement" -- not necessarily
byte-identical. Layer 2 (research evidence) is compared as set/sorted
equality per the already-established layered approach, not exact array
order.

## 3. What aborts the run immediately?

- Replay infrastructure error (script crash, fixture load failure, an
  auth/network failure unrelated to either engine's real behavior).
- Any `schema_error` -- a schema violation is a contract break, not a
  semantic disagreement worth continuing to measure around.

## 4. What continues the run, but blocks Gate 3?

- Verdict agreement below the agreed threshold -- the run completes so the
  full disagreement breakdown is available to diagnose *why*, but nothing
  proceeds to Gate 3 (Shadow) until that's investigated.
- API failure rate crossing the agreed threshold mid-run -- pause and
  investigate before deciding whether to resume or abort; spending further
  real API budget on a systemically broken run isn't justified just
  because no single fixture triggered an immediate-abort condition.

## 5. What is recorded?

Per fixture (`ReplayFixtureResult`): old/new verdict, confidence,
controller action, latency, cost (real tokens + $), research signal set,
error (if any), disagreement categories. Recorded for **every** fixture,
agreement or not.

Aggregate (`ReplayAggregateMetrics`): verdict/controller-action/research-
signal agreement rates, confidence delta P50/P95, avg latency and total
cost for both runtimes, execution/schema failure counts,
`disagreementBreakdown` by category.

Provenance (`ReplayMetadata`): `replayId` (one immutable UUID every
artifact from this run carries), codebase commit, fixture hash, fixture
count, model, prompts commit, Decision Pack version, Controller policy
version, run timestamp, real (not estimated) total cost.

**Disagreement-only, additional (v3+)**: for any fixture landing in a
disagreement category, `run-replay.ts` also persists the full raw result
from both pipelines (`output`, `graph`, `controllerDecision`,
`executionTrace`) to `eval/runs/artifacts/<replayId>_<fixture>.json` --
not just the summary. Purpose: classify a disagreement at the earliest
pipeline stage where the two paths actually diverge
(CapabilityOutputsByStage -> DecisionState -> ControllerDecision ->
SynthesizerResult) without needing a second, paid diagnostic rerun. Only
for fixtures that disagree -- an agreeing fixture's summary already says
everything needed, and persisting full artifacts for all 51 would retain
far more operational detail than the experiment needs.

**Important scope caveat**: this is safe specifically because Replay's 51
fixtures are synthetic test data, not real prospects -- the full artifacts
contain no real PII. This behavior is Replay-specific and must NOT be
assumed to carry over unchanged into Shadow (Gate 3), which runs against
real production prospect data; a Shadow methodology needs its own explicit
decision about what, if anything, gets persisted beyond the PII-safe
`ExecutionTrace`.

## 6. What is explicitly not recorded / ignored?

- **Exact equality of free-text fields** (`reasoning`, `key_evidence`, the
  drafted message) -- expected to vary between independent LLM calls even
  on the *same* runtime re-run (real generation stochasticity). Comparing
  these for agreement would measure noise, not signal, so they are never a
  disagreement category.
- **Absolute latency as pass/fail** -- Layer 3's own established principle
  (`decision-engine.test.ts`): measured and reported, never asserted equal
  or used as a threshold. Informational only.
- **Real PII or raw evidence in the aggregate `ReplayReport` itself** --
  `ReplayFixtureResult`/`ReplayAggregateMetrics`/`ReplayMetadata` stay
  exactly as PII-free as `ExecutionTrace`'s own allowlist-enforced design
  (`src/test/pii-check.ts`); this is unchanged by v3. The disagreement-only
  full artifacts above are a separate, side file, not part of the
  `ReplayReport` -- and are PII-free in practice only because Replay's
  fixtures are synthetic (see the scope caveat in §5), not because of any
  enforced redaction.
