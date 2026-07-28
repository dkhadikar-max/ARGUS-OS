import type { Verdict } from "@argus/shared";
import type { StageId } from "./orchestrator.js";
import type { ControllerDecision } from "./controller.js";

// v5.0 scaffolding, Increment 2 follow-up -- an immutable, operator-facing
// record of one real DecisionEngine.evaluate() run. Not for end users; for
// whoever needs to compare old-runtime vs new-engine behavior (shadow mode)
// or debug a specific execution after the fact. Built entirely from data
// evaluate() already has -- no new measurement, just a single place that
// collects it.
//
// PII/raw-evidence audit (2026, real, not asserted): the first draft of
// this type included `graph: DecisionStateGraph` and the full
// `JudgeAgentOutput` directly. Checked against decision-state.ts's real
// DecisionState shape and found both leaked real prospect data --
// DecisionState.subject.prospectName (real PII) and
// DecisionState.context (the full DecisionAgentInput, including raw
// prospectData) via `graph`; JudgeAgentOutput.message/key_evidence/
// reasoning (drafted outreach text and evidence summaries that reference
// real prospect signals) via the full synthesizer output. Both are now
// excluded from this type entirely -- the full real audit chain
// (DecisionStateGraph + ControllerDecision) stays on DecisionEngineResult
// directly, alongside but separate from executionTrace, for a caller that
// genuinely needs it (e.g. a future persistence layer, which already
// handles real prospect data via the database). ExecutionTrace itself
// should be replayable without being reconstructive: it tells you WHAT
// HAPPENED (verdict, confidence, timings, costs, which stages ran), not
// everything the pipeline saw.
//
// Explicit checklist this type is scoped to (present / deliberately
// absent):
//   present: requestId, packId, model, controller actions, capability
//     timings, capability costs, verdict, confidence, weighted score,
//     recommended action, executed/skipped nodes.
//   absent: raw prospect data, prospect name/email, raw evidence
//     (LinkedIn/Apollo-style payloads), prompt text, drafted message
//     content, free-text reasoning/evidence summaries.
//
// Known, explicit gap: only built on the SUCCESS path today.
// attachUsageAndRethrow (orchestrator.ts) already attaches real usage to a
// thrown AppError on failure, shared with execution-runtime.ts and
// decision.service.ts's real error paths -- extending that shared function
// to also carry a partial ExecutionTrace would ripple beyond what's been
// tested here. Not built in this pass; a real limitation, not silently
// omitted.

export interface StageTiming {
  stage: StageId;
  latencyMs: number;
}

export interface StageCost {
  stage: StageId;
  tokens: number;
  costUsd: number;
}

/** A deliberately narrow projection of JudgeAgentOutput -- excludes
 *  `reasoning`, `key_evidence`, `message`, and `confidence_explanation`
 *  (free-text fields that can embed prospect-specific content: a drafted
 *  outreach message, evidence summaries referencing real signals). Only
 *  the structured verdict fields survive into an ExecutionTrace. */
export interface SynthesizerVerdictSummary {
  verdict: Verdict;
  confidence: number;
  weightedScore: number;
  agentConsensus: string;
  recommendedAction: string;
}

export interface ExecutionTrace {
  requestId: string;
  packId: string;
  /** The real model this run was configured to use. Accurate today
   *  (evaluate() has no per-stage model override in this increment --
   *  that's a separate, unwired benchmark candidate,
   *  model-routing-orchestrator.ts, not part of this path), not
   *  fabricated; would need real threading through StageExecutionResult
   *  if per-stage overrides are ever added here. */
  model: string;
  /** Plural, not the single ControllerDecision execution-runtime.ts's
   *  ExecutionRuntimeResult carries -- Execution Runtime v1 (and this
   *  increment) only ever run one real cycle, so this is always
   *  length-1 today, but a real multi-cycle loop (out of scope for this
   *  increment) would append here, not require a shape change.
   *  ControllerDecision.reasons is real but purely formulaic (e.g.
   *  "Confidence (63.75) below confidenceThreshold (70)") -- checked,
   *  never references prospect content. */
  controllerDecisions: ControllerDecision[];
  executedNodes: StageId[];
  /** Plan nodes that did NOT run. Always [] today -- all 4 real agent
   *  stages, plus a possible invoke_capability re-run, always execute;
   *  nothing in the current Controller/Executor path ever skips a planned
   *  node. Real, not fabricated: kept as a genuine (currently always
   *  empty) field rather than omitted, since a future conditional
   *  skipIf-style plan (the original v5.0 proposal's CapabilityRequirement.skipIf,
   *  never built here) would need somewhere honest to report it. */
  skippedNodes: StageId[];
  synthesizerOutput: SynthesizerVerdictSummary;
  timings: StageTiming[];
  costs: StageCost[];
}
