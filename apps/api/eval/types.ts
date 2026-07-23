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
