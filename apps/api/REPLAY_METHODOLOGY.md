# Replay Methodology (v1)

**This is an experiment protocol, not documentation of code. Once a Replay
run begins under this version, this document does not change for the
duration of that run. A methodology change is a new version (v2), applied
to the next Replay run -- never edited retroactively into an in-progress or
completed one.**

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

## 2. What counts as a disagreement?

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
error (if any), disagreement categories.

Aggregate (`ReplayAggregateMetrics`): verdict/controller-action/research-
signal agreement rates, confidence delta P50/P95, avg latency and total
cost for both runtimes, execution/schema failure counts,
`disagreementBreakdown` by category.

Provenance (`ReplayMetadata`): `replayId` (one immutable UUID every
artifact from this run carries), codebase commit, fixture hash, fixture
count, model, prompts commit, Decision Pack version, Controller policy
version, run timestamp, real (not estimated) total cost.

## 6. What is explicitly not recorded / ignored?

- **Exact equality of free-text fields** (`reasoning`, `key_evidence`, the
  drafted message) -- expected to vary between independent LLM calls even
  on the *same* runtime re-run (real generation stochasticity). Comparing
  these for agreement would measure noise, not signal, so they are never a
  disagreement category.
- **Absolute latency as pass/fail** -- Layer 3's own established principle
  (`decision-engine.test.ts`): measured and reported, never asserted equal
  or used as a threshold. Informational only.
- **Any PII or raw evidence** -- never captured in a Replay artifact at
  all, per `ExecutionTrace`'s own allowlist-enforced design
  (`src/test/pii-check.ts`).
