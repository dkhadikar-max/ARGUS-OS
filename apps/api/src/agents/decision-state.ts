import { createHash } from "node:crypto";
import type { AgentDebateOutput, Verdict } from "@argus/shared";
import {
  AVG_DEAL_SIZE_USD,
  FP_REDUCTION_VALUE_USD,
  FN_REDUCTION_VALUE_USD,
  calculateInferenceCostUsd,
} from "./decision-value.service.js";
import type { DecisionAgentInput, StageOutputs, TokenUsageAccumulator } from "./orchestrator.js";
import { SALES_LEAD_QUALIFICATION_PACK } from "./decision-pack.js";

// Controller & Capability Specification v3.0, Phase 1 -- recommended scope
// per the gap analysis: DecisionState as an additive, shadow-only audit
// record. No Controller, no BudgetManager, no orchestrator.ts control-flow
// change -- this only ever *observes* a real, already-completed decision
// after the fact.
//
// The spec's full DecisionState assumes machinery that doesn't exist yet
// (an iterative Controller loop producing multiple versions/rounds per
// decision, a BudgetManager normalizing raw cost to decision-value points,
// a capability-advisory system, per-prospect deal-value/time-horizon
// estimation). Per this session's "validate every architectural assumption
// against reality, never force the code to match the document" rule, the
// fields below are honestly split into two groups:
//
//   REAL today: id/version/lineage, team/user, subject, context (the real
//   DecisionAgentInput), confidence/disagreements (from the real Judge
//   output), budget (real RawCost -- NOT normalized, since BudgetManager
//   doesn't exist), verdict/action/explanation.
//
//   STRUCTURALLY PRESENT BUT EMPTY today, each with an inline comment
//   explaining why: evidence graph, evidenceGaps, reasoningHistory,
//   activeCapabilities, controllerMemory, and objective's time-horizon/
//   decay fields. These are not fabricated placeholder numbers -- they are
//   left absent/null and documented as gaps for a later phase (Budget
//   Manager, Controller, capability advisories) to fill honestly.

export type StageId5 = "research" | "icp" | "intent" | "risk" | "judge";

/** Real, measured cost -- NOT normalized to decision-value points, since
 *  BudgetManager (which would own that conversion) doesn't exist yet. */
export interface RawCost {
  tokens: number;
  latencyMs: number;
  costUsd: number;
  /** Always 5 today -- the fixed pipeline always runs exactly 5 stages.
   *  Real, not a placeholder: every decision genuinely does 5 reasoning
   *  steps right now. */
  reasoningDepth: number;
}

export interface StateTransition {
  fromVersion: number;
  toVersion: number;
  /** "run_fixed_pipeline" is every real decision's root transition (the
   *  fixed 5-stage pipeline, Phase 1's only literal). "invoke_capability"
   *  is Execution Runtime v1's one real non-root transition: a genuine
   *  extra stage re-invocation the Controller's decide() actually
   *  recommended (see execution-runtime.ts) -- not every ControllerAction
   *  produces a new state, only ones that actually did more real work.
   *  "stop"/"continue"/"escalate" don't append a version because nothing
   *  new was actually run. */
  action: "run_fixed_pipeline" | "invoke_capability";
  timestamp: string;
  latencyMs: number;
  cost: RawCost;
  rationale: string;
}

export interface DecisionObjectiveValue {
  baseValue: number;
  falsePositiveCost: number;
  falseNegativeCost: number;
  /** No real per-prospect time horizon exists anywhere in ARGUS today --
   *  left null rather than inventing a number. Would come from Budget
   *  Manager work (Phase 2 of the recommended migration order). */
  timeHorizonHours: number | null;
  /** Same gap as timeHorizonHours. */
  timeDecayRate: number | null;
}

export interface ConfidenceAssessment {
  overall: number;
  agentConsensus: "high" | "medium" | "low";
  /** Requires multiple rounds to compute a real trend -- always null until
   *  a Controller loop exists (Phase 3 of the recommended migration order). */
  trajectory: null;
}

export interface Disagreement {
  description: string;
  /** The Judge agent's `conflicts` are free text, not numerically scored --
   *  buildDecisionState always sets this to null today, since there is no
   *  real severity/magnitude value to report yet. Typed as `number | null`
   *  (not literal `null`) so the shape can honestly hold a real severity
   *  score once something computes one -- expected-utility.ts's
   *  riskPenalty() filters on `magnitude > 70`, which only makes sense if
   *  a real number is representable here. */
  magnitude: number | null;
}

export interface DecisionState {
  id: string;
  version: number;
  parentStateId: string | null;
  transitionHash: string;
  createdAt: string;
  transition: StateTransition;

  packId: string;
  teamId: string;
  userId: string;

  objective: { value: DecisionObjectiveValue };

  subject: { prospectId: string; prospectName: string };
  context: DecisionAgentInput;

  evidence: { nodes: []; edges: [] };
  evidenceGaps: [];
  reasoningHistory: [];
  activeCapabilities: [];

  confidence: ConfidenceAssessment;
  disagreements: Disagreement[];

  budget: { raw: RawCost };

  verdict: { label: Verdict; confidence: number };
  action: string;
  explanation: string;

  outcome: undefined;
  controllerMemory: Record<string, never>;

  metadata: { latencySoFarMs: number; packId: string; capturedAt: string };
}

/** SHA-256 of (parentHash + transition + timestamp), per the spec. Root
 *  states (parentStateId null) use "" as parentHash. */
export function computeTransitionHash(parentHash: string, transition: StateTransition): string {
  const data = JSON.stringify({ parentHash, transition });
  return createHash("sha256").update(data).digest("hex");
}

export interface BuildDecisionStateInput {
  decisionId: string;
  teamId: string;
  userId: string;
  prospectId: string;
  prospectName: string;
  input: DecisionAgentInput;
  output: AgentDebateOutput;
  usage: TokenUsageAccumulator;
  processingTimeMs: number;
  verdict: Verdict;
  /** Real count of distinct reasoning stages actually run for this
   *  decision. Defaults to 5 -- every decision built through the fixed
   *  pipeline (runAgentDebate) genuinely runs exactly 5 stages. Only
   *  Execution Runtime v1's invoke_capability path (one real extra stage
   *  re-invocation) ever passes a different value. */
  reasoningDepth?: number;
}

/** Builds the single (version 0, root) DecisionState for one real,
 *  already-completed decision. Never called mid-decision, never consumed
 *  by anything that changes behavior -- see the module comment above for
 *  which fields are real vs. structurally-present-but-empty. */
export function buildDecisionState(input: BuildDecisionStateInput): DecisionState {
  const createdAt = new Date().toISOString();
  const rawCost: RawCost = {
    tokens: input.usage.inputTokens + input.usage.outputTokens,
    latencyMs: input.processingTimeMs,
    costUsd: calculateInferenceCostUsd(input.usage.inputTokens, input.usage.outputTokens),
    reasoningDepth: input.reasoningDepth ?? 5,
  };

  const transition: StateTransition = {
    fromVersion: 0,
    toVersion: 0,
    action: "run_fixed_pipeline",
    timestamp: createdAt,
    latencyMs: input.processingTimeMs,
    cost: rawCost,
    rationale:
      "Fixed 5-stage pipeline (Research -> ICP+Intent -> Risk -> Judge) ran to completion; " +
      "no adaptive Controller exists yet (Controller spec v3.0 Phase 1 scope).",
  };

  return {
    id: input.decisionId,
    version: 0,
    parentStateId: null,
    transitionHash: computeTransitionHash("", transition),
    createdAt,
    transition,

    packId: SALES_LEAD_QUALIFICATION_PACK.id,
    teamId: input.teamId,
    userId: input.userId,

    objective: {
      value: {
        baseValue: AVG_DEAL_SIZE_USD,
        falsePositiveCost: FP_REDUCTION_VALUE_USD,
        falseNegativeCost: FN_REDUCTION_VALUE_USD,
        timeHorizonHours: null,
        timeDecayRate: null,
      },
    },

    subject: { prospectId: input.prospectId, prospectName: input.prospectName },
    context: input.input,

    evidence: { nodes: [], edges: [] },
    evidenceGaps: [],
    reasoningHistory: [],
    activeCapabilities: [],

    confidence: {
      overall: input.output.judge.confidence,
      agentConsensus: input.output.judge.agent_consensus,
      trajectory: null,
    },
    disagreements: input.output.judge.conflicts.map((description) => ({ description, magnitude: null })),

    budget: { raw: rawCost },

    verdict: { label: input.verdict, confidence: input.output.judge.confidence },
    action: input.output.judge.recommended_action,
    explanation: input.output.judge.reasoning,

    outcome: undefined,
    controllerMemory: {},

    metadata: { latencySoFarMs: input.processingTimeMs, packId: SALES_LEAD_QUALIFICATION_PACK.id, capturedAt: createdAt },
  };
}

export interface BuildInterimDecisionStateInput {
  decisionId: string;
  teamId: string;
  userId: string;
  prospectId: string;
  prospectName: string;
  input: DecisionAgentInput;
  /** Whichever real stage outputs exist so far. Execution Runtime v1's one
   *  real checkpoint calls this after research/icp/intent/risk (all four
   *  present); typed as StageOutputs (all optional) rather than requiring
   *  all four so this stays honestly reusable for an earlier checkpoint. */
  stageOutputs: StageOutputs;
  usage: TokenUsageAccumulator;
  processingTimeMs: number;
  reasoningDepth: number;
  /** Omit for a real root (version 0, no parent) -- Execution Runtime v1's
   *  one real non-root use passes the parent checkpoint's own version +
   *  transitionHash after a genuine invoke_capability re-run, following
   *  decision-state-graph.ts's own hash-chaining convention exactly. */
  parent?: { version: number; transitionHash: string };
  transitionAction?: StateTransition["action"];
  transitionRationale?: string;
}

// A completed decision's Judge output doesn't exist yet at an interim
// checkpoint -- Verdict (STRONG_YES/YES/WAIT/PASS/HARD_PASS) is an LLM
// judgment, not a formula this codebase can honestly compute from partial
// stage data (Judge is the only place that ever produces a weighted_score/
// verdict; there is no deterministic combination of research/icp/intent/
// risk's own scores that would produce one without fabricating new
// business logic). WAIT is used below as an explicit, documented
// placeholder -- the verdict band that already means "insufficient
// signal" -- with confidence 0, NOT a claim that the model said WAIT.
// Consequence: computeExpectedUtility's gain()/loss() (and therefore
// ControllerDecision.utilityEstimate, computed inside controller.ts's
// decide()) are NOT meaningful for an interim state -- only
// confidence.overall (derived below from real per-stage confidences, a
// completely separate DecisionState field) drives decide()'s actual
// branching logic.
const INTERIM_VERDICT_PLACEHOLDER: { label: Verdict; confidence: number } = { label: "WAIT", confidence: 0 };

/**
 * Builds a mid-pipeline DecisionState checkpoint -- Execution Runtime v1's
 * (execution-runtime.ts) one real use of a DecisionState for a decision
 * that ISN'T complete yet. Deliberately a separate function from
 * buildDecisionState, not an optional-output overload of it:
 * buildDecisionState's own contract ("the single (version 0, root)
 * DecisionState for one real, already-completed decision... never called
 * mid-decision") stays completely unchanged by this addition.
 */
export function buildInterimDecisionState(input: BuildInterimDecisionStateInput): DecisionState {
  const createdAt = new Date().toISOString();
  const rawCost: RawCost = {
    tokens: input.usage.inputTokens + input.usage.outputTokens,
    latencyMs: input.processingTimeMs,
    costUsd: calculateInferenceCostUsd(input.usage.inputTokens, input.usage.outputTokens),
    reasoningDepth: input.reasoningDepth,
  };

  const completedConfidences = [
    input.stageOutputs.research?.confidence,
    input.stageOutputs.icp?.confidence,
    input.stageOutputs.intent?.confidence,
    input.stageOutputs.risk?.confidence,
  ].filter((c): c is number => c !== undefined);

  // Real, not fabricated -- the mean of whatever real per-stage confidence
  // values exist so far. 0 only if genuinely nothing has completed yet.
  const overallConfidence =
    completedConfidences.length > 0 ? completedConfidences.reduce((a, b) => a + b, 0) / completedConfidences.length : 0;

  // A real proxy for agentConsensus, computed from the actual spread
  // between completed stages' own confidences -- not a Judge-computed
  // consensus (that doesn't exist yet). Documented as a proxy the same way
  // controller.ts's own isStuck already documents itself as one for
  // "stuck." Thresholds are explicit, non-spec placeholders, same honest
  // treatment as controller.ts's own confidenceThreshold.
  const spread = completedConfidences.length > 1 ? Math.max(...completedConfidences) - Math.min(...completedConfidences) : 0;
  const agentConsensus: "high" | "medium" | "low" = spread > 30 ? "low" : spread > 15 ? "medium" : "high";

  const version = input.parent ? input.parent.version + 1 : 0;
  const parentStateId = input.parent ? input.parent.transitionHash : null;

  const transition: StateTransition = {
    fromVersion: input.parent?.version ?? 0,
    toVersion: version,
    action: input.transitionAction ?? "run_fixed_pipeline",
    timestamp: createdAt,
    latencyMs: input.processingTimeMs,
    cost: rawCost,
    rationale:
      input.transitionRationale ??
      `Execution Runtime v1 interim checkpoint after ${completedConfidences.length} real stage(s); Judge has not run yet.`,
  };

  return {
    id: input.decisionId,
    version,
    parentStateId,
    transitionHash: computeTransitionHash(parentStateId ?? "", transition),
    createdAt,
    transition,

    packId: SALES_LEAD_QUALIFICATION_PACK.id,
    teamId: input.teamId,
    userId: input.userId,

    objective: {
      value: {
        baseValue: AVG_DEAL_SIZE_USD,
        falsePositiveCost: FP_REDUCTION_VALUE_USD,
        falseNegativeCost: FN_REDUCTION_VALUE_USD,
        timeHorizonHours: null,
        timeDecayRate: null,
      },
    },

    subject: { prospectId: input.prospectId, prospectName: input.prospectName },
    context: input.input,

    evidence: { nodes: [], edges: [] },
    evidenceGaps: [],
    reasoningHistory: [],
    activeCapabilities: [],

    confidence: { overall: overallConfidence, agentConsensus, trajectory: null },
    disagreements: [],

    budget: { raw: rawCost },

    verdict: INTERIM_VERDICT_PLACEHOLDER,
    action: "pending_judge",
    explanation: "Interim checkpoint -- Judge has not run yet (Execution Runtime v1).",

    outcome: undefined,
    controllerMemory: {},

    metadata: { latencySoFarMs: input.processingTimeMs, packId: SALES_LEAD_QUALIFICATION_PACK.id, capturedAt: createdAt },
  };
}
