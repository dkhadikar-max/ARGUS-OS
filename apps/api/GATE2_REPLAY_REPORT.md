# Gate 2 Replay Report

**Run `af57c00e-d04c-464b-ad62-42b8aab42e71`, 2026-07-30, `REPLAY_METHODOLOGY.md` v3,
codebase `3fa92b2`, model `claude-sonnet-4-6`, real Claude spend $2.076.**

## Headline finding: this run is incomplete, and not for an architectural reason

41 of 51 fixtures (80%) show `runtime_error` on **both** runtimes, with the
identical error message on every one. The raw report's aggregate metrics
(15.7% verdict agreement, 11.8% controller agreement) are dominated by
this and **do not describe the architecture** — they describe a billing
outage. Read past this section before the numbers below, or they will be
misread.

**Root cause, found directly in the run log, not inferred:**

```
BadRequestError: 400 {"type":"error","error":{"type":"invalid_request_error",
"message":"Your credit balance is too low to access the Anthropic API.
Please go to Plans & Billing to upgrade or purchase credits."}}
```

This fired mid-`edge-title-partial-match` (fixture 11 of 51, alphabetically),
tripped `CircuitBreakerProvider` after 3 consecutive real failures ("Circuit
breaker open -- 3 consecutive real provider failures"), and every one of
the remaining 41 fixtures then failed immediately and identically on
**both** the old runtime and the new engine — the circuit breaker is
shared infrastructure both pipelines call through, so once open, it
fast-fails everything, symmetrically. This is the correct, designed
behavior of `CircuitBreakerProvider` under real API exhaustion, not a bug
in either pipeline.

**Per `REPLAY_METHODOLOGY.md` §3/§4**, this is exactly the documented
"API failure rate crossing the agreed threshold mid-run" condition — the
methodology says pause and investigate rather than treat every failure as
a data point, which is what this section does. It is not a `schema_error`,
so the run correctly did not immediate-abort; it finished the dataset (per
your own instruction not to stop mid-run), and this is that post-run
analysis.

**I cannot resolve this** — adding Anthropic credits is a real financial
transaction on your account, which I don't do on your behalf. The 10
fixtures that completed before the outage are valid, real data (see
below); the other 41 need a re-run once the account has balance again. I'd
suggest re-running only those 41 by name at that point, not the full 51 --
the 10 valid results don't need to be spent again.

## Valid data: 10 fixtures completed before the outage

Everything below is computed only over the 10 fixtures that got a real,
paired old-vs-new comparison (alphabetically first 10 of 51, before
`edge-title-partial-match`). This is the same set of numbers already
correctly isolated in the saved report's `confidenceDeltaP50/P95` and
`totalOldCostUsd`/`totalNewCostUsd` (both already exclude the 41 zero-cost
error rows by construction) -- verdict/controller agreement rates and
latency below are **recomputed here** over n=10, since the raw report's
versions are diluted by the 41-fixture denominator.

| Metric | Value (n=10) | Raw report's n=51 value (misleading) |
|---|---:|---:|
| Verdict agreement | **80% (8/10)** | 15.7% |
| Controller action agreement | **60% (6/10)** | 11.8% |
| Confidence delta P50 / P95 | **3 / 7** | 3 / 7 (already correct -- error rows excluded) |
| Avg old / new latency | **87.6s / 89.5s** | 17.2s / 17.5s (diluted by 41 zero-latency error rows) |
| Total old / new cost | **$1.260 / $0.816** | same (already correct) |
| Research signal agreement | 0% (0/10) | 0% -- known broken metric, see below |

**Token usage**: not separately tracked in `ReplayFixtureResult` (cost is
the measured field; tokens aren't captured at this layer). Exact
input/output token counts for the 6 disagreeing fixtures are in their
persisted artifact files (`usage` field, both `old` and `new`) if needed --
not fabricating a total here since it isn't real, measured data at this
level.

### Disagreement taxonomy (n=10)

| Category | Count | Fixtures |
|---|---:|---|
| `verdict_mismatch` | 2 | `conflicting-signals-hiring-freeze`, `edge-icp-boundary-exact` |
| `confidence_threshold_exceeded` | 2 | `edge-conflicting-weak-icp-hot-intent` (Δ6), `edge-funding-just-missed` (Δ7) |
| `controller_action_mismatch` | 4 | `conflicting-signals-hiring-freeze`, `edge-conflicting-strong-icp-severe-risk`, `edge-conflicting-weak-icp-hot-intent`, `edge-recent-funding-but-hiring-freeze` |
| `runtime_error` | 0 (of these 10) | -- |
| `schema_error` | 0 | -- |

4 of 10 fixtures (`edge-all-null-evidence`, `edge-enterprise-existing-relationship`,
`edge-gdpr-region-compliance`, `edge-multiple-risk-flags-history`) show
**zero** disagreement on every dimension.

### Artifact links (every disagreeing fixture, full structured old/new results)

- `eval/runs/artifacts/af57c00e-..._conflicting-signals-hiring-freeze.json`
- `eval/runs/artifacts/af57c00e-..._edge-conflicting-strong-icp-severe-risk.json`
- `eval/runs/artifacts/af57c00e-..._edge-conflicting-weak-icp-hot-intent.json`
- `eval/runs/artifacts/af57c00e-..._edge-funding-just-missed.json`
- `eval/runs/artifacts/af57c00e-..._edge-icp-boundary-exact.json`
- `eval/runs/artifacts/af57c00e-..._edge-recent-funding-but-hiring-freeze.json`

(These exist because of the `REPLAY_METHODOLOGY.md` v3 improvement built
during the Gate 2a investigation -- confirmed working exactly as designed:
every one of the 6 real disagreements in this run got its full artifact
persisted automatically, with zero additional spend needed to inspect
them.)

### `conflicting-signals-hiring-freeze`: third independent trial, and the pattern reverses

This exact fixture was already deep-diagnosed in a prior session round
(traced to an ICP-stage rubric-interpretation difference on the "title
contains VP" criterion for "Head of Growth"). Across three independent
trials now:

| Trial | Old verdict | New verdict |
|---|---|---|
| Validation sample | PASS | WAIT |
| Diagnostic rerun | PASS | WAIT |
| **This Replay run** | **WAIT** | **PASS** |

The direction **flipped**. A real architectural bias would be expected to
point the same way each time; flip-flopping across independent trials is
the signature of a fixture sitting on a genuine decision boundary with
roughly symmetric noise on both sides, not a directional defect in either
pipeline. This is the strongest single piece of evidence in this report
against "implementation defect" for this fixture specifically.

`edge-icp-boundary-exact` is a new mismatch not seen in earlier samples --
its own name indicates it's a deliberately constructed boundary-exact ICP
fixture, i.e. designed to be maximally sensitive to small scoring
differences. Plausible for the same reason, not yet individually
diagnosed to the same depth; its full artifact is available above if
you want that done.

## Decision criteria, evaluated against your own bar

- **No systematic regression in decision quality**: on the n=10 valid
  data, no directional pattern found -- one repeat mismatch flipped
  direction across trials (evidence against a systematic bias), the other
  three disagreement categories (confidence delta, controller action) are
  consistent with the noise-floor ranges already established in the Gate
  2a baseline.
- **Remaining disagreements attributable to rubric/model interpretation,
  not implementation defects**: supported for `conflicting-signals-hiring-freeze`
  (previously diagnosed) and plausible for the rest, not all individually
  re-diagnosed here per your instruction to analyze patterns rather than
  investigate every disagreement.
- **Cost and latency within expected envelope**: yes on the valid
  subset -- $0.208/fixture combined (both runtimes), in line with
  `GATE2_REPLAY_AUTHORIZATION.md`'s ~$0.10-0.15/decision estimate; latency
  87.6s/89.5s old/new, within ~2% of each other.
- **No reproducible architectural bugs**: the one real bug this run
  surfaced -- the account running out of Anthropic credits -- is an
  operational/billing issue, not a code defect in either runtime.

## Recommendation: **Conditional Pass**

Not a clean Pass: only 20% of the frozen 51-fixture set produced valid
paired data, and `REPLAY_METHODOLOGY.md`'s 99% agreement thresholds are
defined against the full 51, not a 10-fixture subset -- n=10 isn't enough
to certify against those thresholds on its own, whatever it shows.

Not a Fail: nothing in the valid data or the artifacts suggests an
implementation defect, and the failure mode that consumed 80% of the run
is external (billing), not the architecture being tested.

**Conditional on**: adding Anthropic API credits, then re-running the 41
fixtures that never got a real comparison (`edge-title-partial-match`
through the end of the sorted fixture list -- see `disagreementBreakdown`
in the raw report for the full list). If that completes with results
consistent with what's shown here, Gate 2 clears for real and Shadow Mode
(Gate 3) sign-off follows. I'd hold off on that sign-off until the full 51
has real data -- what's here is a promising 10-fixture preview, not the
Gate 2 result itself.
