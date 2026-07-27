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
