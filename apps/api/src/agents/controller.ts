import type { DecisionState } from "./decision-state.js";
import { computeExpectedUtility, DEFAULT_UTILITY_WEIGHTS, type UtilityWeights } from "./expected-utility.js";
import type { BudgetSnapshot } from "./budget-manager.js";
import type { CapabilityOutputsByStage } from "./reasoning-capability.js";

// Controller & Capability Specification v3.0 -- Planning Policy / Controller,
// now covering the full stop/continue/invoke_capability/escalate decision
// space (previously scoped to stop/escalate only -- see git history for
// that narrower slice). Per explicit design direction: decide() is a PURE
// policy function over (DecisionState, BudgetSnapshot,
// CapabilityOutputsByStage?, ControllerPolicy) -> ControllerDecision. It has
// no knowledge of the orchestrator and performs no execution -- it doesn't
// know how a BudgetSnapshot was built (budget-manager.ts's
// deriveBudgetSnapshot is the one real example today) or how
// CapabilityOutputsByStage was gathered (capability-shadow.ts's
// observeCapabilityOutputs is the one real example today). This means the
// signature will not need to change on the day a real Controller loop
// starts calling decide() mid-decision instead of only after one completes
// -- the interface is already the "steer decisions in progress" shape,
// even though every real caller today only ever has a completed
// DecisionState to hand it (decision-state-shadow.ts).
//
// Still not wired into orchestrator.ts or decision.service.ts's real
// control flow -- invoking a capability or looping again would change
// runtime behavior, which is a separate milestone needing its own explicit
// authorization, independent of this being free to build.

export type ControllerAction = "stop" | "continue" | "invoke_capability" | "escalate";

export interface ControllerDecision {
  action: ControllerAction;
  /** Every real reason decide() actually used, as independent statements
   *  ("Confidence (42) below confidenceThreshold (70)", "Remaining budget:
   *  ...", "risk capability confidence (0) is the weakest link") rather
   *  than one concatenated sentence -- built for debugging, replay, and
   *  analytics, per explicit design direction. */
  reasons: string[];
  /** Only set for action "invoke_capability" -- the capabilityId
   *  (research/icp/intent/risk today) decide() identified as the weakest
   *  link from the real CapabilityOutputsByStage it was given. */
  targetCapability?: string;
  confidence: number;
  utilityEstimate: number;
}

// Controller spec v3.0 Section 5.2's own stated default.
export interface EscalationThresholds {
  highValueEscalationThreshold: number;
}

export const DEFAULT_ESCALATION_THRESHOLDS: EscalationThresholds = {
  highValueEscalationThreshold: 100_000,
};

// Section 5.2 also lists REPUTATION_ESCALATION_THRESHOLD (escalate when
// reputationWeight > 0.7 and stuck). Deliberately not implemented: no
// "reputationWeight" (or any analogous per-rep/per-team reputation score)
// exists anywhere in ARGUS today. Adding it here would mean fabricating an
// input this codebase has no real source for.

/**
 * Controller spec v3.0 Section 5.3 -- a versioned bundle of the Controller's
 * tunable parameters. trainedOn is null because no policy has ever actually
 * been trained/tuned against real production data. confidenceThreshold and
 * capabilityConfidenceThreshold are NOT sourced from any spec-stated
 * default (unlike highValueEscalationThreshold above) -- no decision has
 * ever had a variable stopping point to tune these against, so these are
 * reasonable, explicitly-placeholder round numbers pending real tuning
 * data, the same honest-placeholder treatment budget-manager.ts's
 * BASE_BUDGET_POINTS already uses.
 */
export interface ControllerPolicy {
  version: number;
  weights: UtilityWeights;
  escalationThresholds: EscalationThresholds;
  /** Below this, decide() acts (continue/invoke_capability) instead of
   *  stopping. At or above it, the verdict is treated as good enough. */
  confidenceThreshold: number;
  /** Below this, a specific capability in a provided CapabilityOutputsByStage
   *  is named as the weak link (invoke_capability). At or above it for
   *  every provided capability, decide() returns "continue" instead --
   *  aggregate confidence is low despite no identifiable single weak
   *  capability. */
  capabilityConfidenceThreshold: number;
  trainedOn: { decisionCount: number; dateRange: [string, string]; evalSuiteVersion: string } | null;
}

export const DEFAULT_CONTROLLER_POLICY: ControllerPolicy = {
  version: 0,
  weights: DEFAULT_UTILITY_WEIGHTS,
  escalationThresholds: DEFAULT_ESCALATION_THRESHOLDS,
  confidenceThreshold: 70,
  capabilityConfidenceThreshold: 50,
  trainedOn: null,
};

/**
 * Pure policy decision -- see this module's own comment for the full
 * contract. Deterministic: the same four inputs always produce the same
 * ControllerDecision (no randomness, no I/O, no wall-clock reads).
 *
 * Evaluation order, each an explicit, real-data-driven branch -- never a
 * residual "else, so continue" default (a specific, named design
 * requirement: continue must not mean "I don't know"):
 *
 *   1. escalate -- high-value AND stuck. Checked first: a human should be
 *      pulled in regardless of remaining budget or confidence. "Stuck" has
 *      no real multi-round signal to check (there's only ever one round
 *      against real data today) -- proxied by two real, Judge-produced
 *      signals instead: low agent consensus, or any disagreement at all.
 *   2. stop -- budget exhausted (any BudgetSnapshot dimension <= 0). No
 *      further reasoning is affordable, whatever the confidence is.
 *   3. stop -- confidence >= policy.confidenceThreshold. The verdict is
 *      good enough as-is.
 *   4. invoke_capability -- capabilityOutputs was given AND its weakest
 *      capability's confidence is below capabilityConfidenceThreshold.
 *      Names that capability explicitly, since it's a real, identifiable
 *      weak link -- never invoke_capability without a real target.
 *   5. continue -- confidence is low, budget remains, not stuck-enough to
 *      escalate, and no single capability can be blamed: either
 *      capabilityOutputs wasn't given (no capability-level visibility for
 *      this call -- an explicit, named condition, not a fallback for
 *      "nothing else matched") or every provided capability individually
 *      clears its own threshold (the ambiguity is in synthesis, not
 *      evidence -- also explicit, also named).
 *
 * Against every real DecisionState today, branch 2 always fires:
 * deriveBudgetSnapshot's remainingReasoning is always exactly 0 (the fixed
 * 5-stage pipeline has no adaptive step budget), so decide() always
 * returns "stop" for real decisions -- an honest, deterministic finding,
 * not a bug. continue/invoke_capability are real and reachable (proven
 * against synthetic BudgetSnapshot/CapabilityOutputsByStage in
 * controller.test.ts) but stay dormant until a real Controller loop can
 * actually afford a next step.
 */
export function decide(
  state: DecisionState,
  budget: BudgetSnapshot,
  capabilityOutputs: CapabilityOutputsByStage | undefined,
  policy: ControllerPolicy = DEFAULT_CONTROLLER_POLICY,
): ControllerDecision {
  const expectedUtility = computeExpectedUtility(state, policy.weights);
  const utilityEstimate = expectedUtility.expectedUtility;
  const confidence = state.confidence.overall;

  const isStuck = state.confidence.agentConsensus === "low" || state.disagreements.length > 0;
  const isHighValue = state.objective.value.baseValue > policy.escalationThresholds.highValueEscalationThreshold;

  if (isHighValue && isStuck) {
    return {
      action: "escalate",
      reasons: [
        `baseValue (${state.objective.value.baseValue}) exceeds highValueEscalationThreshold ` +
          `(${policy.escalationThresholds.highValueEscalationThreshold})`,
        `decision shows signs of being stuck (agentConsensus=${state.confidence.agentConsensus}, ` +
          `${state.disagreements.length} disagreement(s))`,
      ],
      confidence,
      utilityEstimate,
    };
  }

  const isBudgetExhausted = budget.remainingReasoning <= 0 || budget.remainingLatency <= 0 || budget.remainingCost <= 0;
  if (isBudgetExhausted) {
    return {
      action: "stop",
      reasons: [
        `Budget exhausted (remainingReasoning=${budget.remainingReasoning}, ` +
          `remainingLatency=${budget.remainingLatency}, remainingCost=${budget.remainingCost}); ` +
          "no further reasoning is affordable regardless of confidence.",
      ],
      confidence,
      utilityEstimate,
    };
  }

  if (confidence >= policy.confidenceThreshold) {
    return {
      action: "stop",
      reasons: [`Confidence (${confidence}) meets confidenceThreshold (${policy.confidenceThreshold}); the verdict stands.`],
      confidence,
      utilityEstimate,
    };
  }

  const remainingBudgetReason =
    `Remaining budget: reasoning=${budget.remainingReasoning}, latency=${budget.remainingLatency}, cost=${budget.remainingCost}`;
  const confidenceReason = `Confidence (${confidence}) below confidenceThreshold (${policy.confidenceThreshold})`;

  const capabilityEntries = capabilityOutputs ? Object.entries(capabilityOutputs) : [];
  if (capabilityEntries.length > 0) {
    const [weakestStage, weakestOutput] = capabilityEntries.reduce((min, cur) =>
      cur[1].confidence < min[1].confidence ? cur : min,
    );
    if (weakestOutput.confidence < policy.capabilityConfidenceThreshold) {
      return {
        action: "invoke_capability",
        targetCapability: weakestStage,
        reasons: [
          confidenceReason,
          remainingBudgetReason,
          `${weakestStage} capability confidence (${weakestOutput.confidence}) is the weakest of the ` +
            `${capabilityEntries.length} provided, below capabilityConfidenceThreshold (${policy.capabilityConfidenceThreshold})`,
        ],
        confidence,
        utilityEstimate,
      };
    }
    return {
      action: "continue",
      reasons: [
        confidenceReason,
        remainingBudgetReason,
        `Every provided capability meets capabilityConfidenceThreshold (${policy.capabilityConfidenceThreshold}); ` +
          "no single weak link to target, so the ambiguity is in synthesis, not evidence.",
      ],
      confidence,
      utilityEstimate,
    };
  }

  return {
    action: "continue",
    reasons: [
      confidenceReason,
      remainingBudgetReason,
      "No capability-level output was provided to this decision, so no specific capability can be targeted.",
    ],
    confidence,
    utilityEstimate,
  };
}
