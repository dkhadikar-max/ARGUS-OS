import type { DecisionAgentInput } from "../src/agents/orchestrator.js";

/** One fixture file under eval/fixtures/*.json. */
export interface EvalFixture {
  name: string;
  input: DecisionAgentInput;
}

/** One fixture's result from a single eval run. */
export interface EvalRunResult {
  fixture: string;
  verdict: string;
  weightedScore: number;
  confidence: number;
  agentConsensus: string;
  recommendedAction: string;
  processingTimeMs: number;
  error: string | null;
}

/**
 * One full run across all fixtures, written to eval/runs/<runId>.json.
 * Two of these are diffed by compare.ts to detect regressions across a
 * code change (e.g. LLMProvider extraction, Retriever Registry wiring, the
 * eventual single-call-vs-multi-call benchmark).
 */
export interface EvalRunManifest {
  runId: string;
  createdAt: string;
  model: string;
  gitCommit: string | null;
  results: EvalRunResult[];
}

// v4 roadmap Phase 9 -- the 3-candidate architecture benchmark. Additive:
// EvalFixture/EvalRunResult/EvalRunManifest above are untouched and still
// used by the Phase 0 baseline manifest already committed.

export type BenchmarkCandidate = "pipeline" | "single-call" | "pipeline-with-conflict";

export interface CandidateRunResult {
  fixture: string;
  candidate: BenchmarkCandidate;
  verdict: string;
  weightedScore: number;
  confidence: number;
  agentConsensus: string;
  recommendedAction: string;
  processingTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  inferenceCostUsd: number;
  /** No-outcome variant (time_saved only) -- see eval/metrics.ts's module
   *  comment for why the full Decision Value formula isn't measurable
   *  against synthetic fixtures. */
  decisionValueUsd: number;
  valueCostRatio: number | null;
  evidenceUtilizationRate: number | null;
  confidenceCalibration: { consideredSparse: boolean; judgeConfidence: number; ruleHeld: boolean };
  /** Only populated for the pipeline-with-conflict candidate. */
  conflict: { cv: number; spread: number; directional: boolean } | null;
  error: string | null;
}

export interface CandidateRunManifest {
  runId: string;
  createdAt: string;
  candidate: BenchmarkCandidate;
  model: string;
  gitCommit: string | null;
  results: CandidateRunResult[];
}

// v4 roadmap Phase 14 (docs/ARCHITECTURE_V4.md, "Dynamic Model Routing"
// benchmark) -- deliberately separate from BenchmarkCandidate/
// CandidateRunResult above: this varies which MODEL each agent stage runs
// on, not which orchestration ARCHITECTURE is used, and compare-candidates.
// ts's pipeline-with-conflict-specific comparison logic doesn't apply here.
export interface ModelRoutingRunResult {
  fixture: string;
  agentOverrides: Record<string, string>;
  verdict: string;
  weightedScore: number;
  confidence: number;
  agentConsensus: string;
  recommendedAction: string;
  processingTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  inferenceCostUsd: number;
  error: string | null;
}

export interface ModelRoutingRunManifest {
  runId: string;
  createdAt: string;
  agentOverrides: Record<string, string>;
  gitCommit: string | null;
  results: ModelRoutingRunResult[];
}

// Execution Runtime v1 (docs/ARCHITECTURE_V4.md) -- the legacy-vs-Execution-
// Runtime-v1 comparison harness. Deliberately its own type, not a reuse of
// CandidateRunResult: this varies which RUNTIME executes the same fixed
// pipeline stages (legacy runAgentDebate vs runAgentDebateWithController),
// not which orchestration architecture or model is used, so it carries its
// own Controller-specific fields (controllerAction/targetCapability/
// reasons/graph version count) that neither BenchmarkCandidate nor
// ModelRoutingRunResult has any use for. The legacy side of the comparison
// reuses the existing "pipeline" CandidateRunManifest as-is (see
// eval/compare-execution-runtime.ts) rather than introducing a second
// "legacy" result shape that would just duplicate CandidateRunResult.
export interface ExecutionRuntimeRunResult {
  fixture: string;
  verdict: string;
  weightedScore: number;
  confidence: number;
  agentConsensus: string;
  recommendedAction: string;
  processingTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  inferenceCostUsd: number;
  decisionValueUsd: number;
  valueCostRatio: number | null;
  evidenceUtilizationRate: number | null;
  confidenceCalibration: { consideredSparse: boolean; judgeConfidence: number; ruleHeld: boolean };
  controllerAction: string;
  controllerTargetCapability: string | null;
  controllerReasons: string[];
  /** 1 for every real decision today (deriveBudgetSnapshot's
   *  remainingReasoning is only ever nonzero at this one checkpoint) or 2
   *  when invoke_capability genuinely re-ran a stage and
   *  decision-state-graph.ts appended a real version-1 state. */
  graphVersionCount: number;
  /** 0 or 1 in Phase 1 (exactly one controller cycle) -- named separately
   *  from graphVersionCount so a future multi-cycle Phase 2 run doesn't
   *  need a new field, just a count that can exceed 1. */
  extraCapabilityInvocations: number;
  error: string | null;
}

export interface ExecutionRuntimeRunManifest {
  runId: string;
  createdAt: string;
  model: string;
  gitCommit: string | null;
  results: ExecutionRuntimeRunResult[];
}

// Gate 2 (Replay) -- GATE2_REPLAY_AUTHORIZATION.md. Output artifact
// designed before eval/run-replay.ts's own implementation, per review
// feedback ("designing the output first often makes the implementation
// simpler"). Compares the old runtime (runAgentDebateWithController,
// execution-runtime.ts) against the new engine (evaluate(),
// decision-engine.ts) per fixture, using the same layered approach already
// proven in decision-engine.test.ts's parity tests: Layer 1 (decision
// semantics) drives pass/fail; Layer 3 (telemetry) is measured and
// reported, never asserted equal between two separately-executed runs.

export interface ReplayMetadata {
  /** The one immutable identifier every artifact from this run should
   *  carry -- the report itself, any logs, any separately-exported
   *  metrics/cost records. A real UUID (crypto.randomUUID()), generated
   *  once when the run starts, not derived from the other fields (a
   *  derived id would collide across two runs with identical provenance,
   *  e.g. two Replay attempts on the same commit/fixture-hash/model after
   *  a transient failure). "Why did Replay run X fail" becomes a lookup
   *  by this one value instead of reconstructing which combination of
   *  commit+hash+timestamp a given log line came from. */
  replayId: string;
  /** The overall codebase commit at run time (git rev-parse HEAD) --
   *  distinct from promptsCommit below, which is the last commit that
   *  specifically touched prompts.ts. Without this, two reports run
   *  against different code states are hard to tell apart even if every
   *  other provenance field happens to match. */
  codebaseCommit: string | null;
  /** Matches GATE2_REPLAY_AUTHORIZATION.md's own frozen fixture hash --
   *  a mismatch here means the corpus changed since that document was
   *  written and the freeze needs to be regenerated before trusting this
   *  report. */
  fixtureSetHash: string;
  fixtureCount: number;
  model: string;
  promptsCommit: string | null;
  decisionPackVersion: string;
  controllerPolicyVersion: number;
  runAt: string;
  /** Real, not estimated -- the actual $ spent running this Replay,
   *  summed from both runtimes' real usage. Compared against
   *  GATE2_REPLAY_AUTHORIZATION.md's ~$10-15 estimate after the fact. */
  actualCostUsd: number;
}

// Per review feedback: a scorecard ("49 passed, 2 failed") tells you
// THAT the engines disagreed; a category breakdown tells you WHY, which
// is what turns Replay into a diagnostic tool. Deliberately a closed set
// (not a free-text reason string) so the aggregate breakdown below can be
// a real count per category, not a bag of unique strings to eyeball.
export type DisagreementCategory =
  | "verdict_mismatch"
  | "confidence_threshold_exceeded"
  | "controller_action_mismatch"
  | "runtime_error"
  | "schema_error"
  | "missing_capability_output";

export interface ReplayFixtureResult {
  fixture: string;
  oldVerdict: string;
  newVerdict: string;
  verdictAgreement: boolean;
  oldConfidence: number;
  newConfidence: number;
  confidenceDelta: number;
  oldControllerAction: string;
  newControllerAction: string;
  controllerActionAgreement: boolean;
  /** Layer 2 (evidence semantics) -- compared as set/sorted equality per
   *  decision-engine.test.ts's own established approach, not exact array
   *  order. */
  researchSignalsAgreement: boolean;
  oldLatencyMs: number;
  newLatencyMs: number;
  oldCostUsd: number;
  newCostUsd: number;
  /** Non-null only when this fixture failed on either runtime -- see
   *  GATE2_REPLAY_AUTHORIZATION.md's stop-condition table for how a
   *  non-empty error here should be handled (schema mismatch: stop the
   *  whole run immediately; anything else: recorded, run continues). */
  error: string | null;
  /** Every category this fixture's real result falls into (can be more
   *  than one -- e.g. a verdict mismatch AND a confidence delta past
   *  threshold on the same fixture are two separate, real facts about
   *  it). Empty when this fixture agreed on everything measured. The
   *  report-level breakdown is computed by aggregating this field across
   *  all fixtures, not maintained as a separate parallel count that could
   *  drift from what each fixture actually shows. */
  disagreementCategories: DisagreementCategory[];
}

export interface DisagreementBreakdownEntry {
  category: DisagreementCategory;
  count: number;
  /** Which real fixtures contributed to this category -- traceable back
   *  to perFixtureResults, not just an opaque number. */
  fixtures: string[];
}

export interface ReplayAggregateMetrics {
  verdictAgreementRate: number;
  confidenceDeltaP50: number;
  confidenceDeltaP95: number;
  controllerActionAgreementRate: number;
  researchSignalsAgreementRate: number;
  avgOldLatencyMs: number;
  avgNewLatencyMs: number;
  totalOldCostUsd: number;
  totalNewCostUsd: number;
  executionFailureCount: number;
  schemaValidationFailureCount: number;
}

/** Real thresholds this run was actually judged against -- populated from
 *  whatever GATE2_REPLAY_AUTHORIZATION.md's metrics table is agreed to be
 *  at run time, not silently hardcoded here so a future threshold change
 *  doesn't require a code change to this type. */
export interface ReplayThresholds {
  minVerdictAgreementRate: number;
  maxConfidenceDeltaP95: number;
  minControllerActionAgreementRate: number;
  maxExecutionFailures: number;
  maxSchemaValidationFailures: number;
}

export interface ReplayReport {
  metadata: ReplayMetadata;
  thresholds: ReplayThresholds;
  aggregateMetrics: ReplayAggregateMetrics;
  perFixtureResults: ReplayFixtureResult[];
  /** Category -> count -> which fixtures, computed by aggregating every
   *  perFixtureResults[].disagreementCategories entry -- not a separately
   *  maintained parallel structure, so it can't drift from what each
   *  fixture's own real result shows. Turns "49 passed, 2 failed" into a
   *  diagnostic (which category, which fixtures) rather than a scorecard. */
  disagreementBreakdown: DisagreementBreakdownEntry[];
  /** Real, computed from aggregateMetrics vs. thresholds -- never manually
   *  set, so this can't silently drift from what the numbers actually say. */
  passed: boolean;
  /** Which specific threshold(s) failed, if any -- empty when passed. */
  failureReasons: string[];
}
