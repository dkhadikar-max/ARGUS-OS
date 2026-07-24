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
