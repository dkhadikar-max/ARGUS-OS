import { createHash } from "node:crypto";
import type { AgentDebateOutput, Verdict } from "@argus/shared";
import {
  AVG_DEAL_SIZE_USD,
  FP_REDUCTION_VALUE_USD,
  FN_REDUCTION_VALUE_USD,
  calculateInferenceCostUsd,
} from "./decision-value.service.js";
import type { DecisionAgentInput, TokenUsageAccumulator } from "./orchestrator.js";

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
  /** No real ControllerAction enum exists yet (no Controller). This one
   *  literal value is all Phase 1 ever produces. */
  action: "run_fixed_pipeline";
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
}

const SALES_LEAD_QUALIFICATION_PACK_ID = "sales-lead-qualification-v1";

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
    reasoningDepth: 5,
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

    packId: SALES_LEAD_QUALIFICATION_PACK_ID,
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

    metadata: { latencySoFarMs: input.processingTimeMs, packId: SALES_LEAD_QUALIFICATION_PACK_ID, capturedAt: createdAt },
  };
}
