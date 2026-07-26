import type { DecisionState } from "./decision-state.js";
import { computeExpectedUtility, DEFAULT_UTILITY_WEIGHTS, type ExpectedUtilityBreakdown, type UtilityWeights } from "./expected-utility.js";

// Controller & Capability Specification v3.0 -- Planning Policy /
// Controller, narrowest honest slice: a stop/escalate decision over one
// real, already-completed DecisionState. Deliberately excludes
// "continue"/"invoke_capability": the live pipeline is still fixed and
// single-pass, so there is no real next capability this Controller could
// invoke (see expected-utility.ts's own module comment). Progress/
// oscillation detection is also excluded -- both need real evidence
// across multiple rounds, which don't exist for any real decision today.
// Nothing here is wired into orchestrator.ts or decision.service.ts.

export type ControllerAction = "stop" | "escalate";

export interface ControllerDecision {
  action: ControllerAction;
  expectedUtility: ExpectedUtilityBreakdown;
  rationale: string;
}

// Controller spec v3.0 Section 5.2's own stated default. Tunable, not
// hardcoded into decide() -- see ControllerPolicy below.
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
 * been trained/tuned against real production data (no decision has ever
 * had its reasoning depth or stopping point varied to measure against) --
 * left honestly null rather than fabricating a training record.
 */
export interface ControllerPolicy {
  version: number;
  weights: UtilityWeights;
  escalationThresholds: EscalationThresholds;
  trainedOn: { decisionCount: number; dateRange: [string, string]; evalSuiteVersion: string } | null;
}

export const DEFAULT_CONTROLLER_POLICY: ControllerPolicy = {
  version: 0,
  weights: DEFAULT_UTILITY_WEIGHTS,
  escalationThresholds: DEFAULT_ESCALATION_THRESHOLDS,
  trainedOn: null,
};

/**
 * Given a real, completed DecisionState, decides whether the verdict
 * simply stands (stop) or should be flagged for human review (escalate).
 *
 * "Stuck" (spec: escalate when high-value AND stuck) has no real multi-
 * round signal to check -- there's only ever one round. Proxied here by
 * two real, Judge-produced signals instead: low agent consensus, or any
 * disagreement at all (even though its severity isn't scored -- see
 * decision-state.ts's Disagreement comment). Not a literal implementation
 * of the spec's "stuck," which needs evidence-stagnation history across
 * rounds; documented as a proxy, not asserted as equivalent.
 *
 * Against real data today, objective.value.baseValue is always the same
 * constant (AVG_DEAL_SIZE_USD, $25,000 -- no per-prospect deal-value
 * estimate exists anywhere in ARGUS), which is below
 * highValueEscalationThreshold ($100,000). So this always returns "stop"
 * for every real decision today -- an honest, deterministic finding, not
 * a bug: escalation only becomes reachable once a real per-prospect deal
 * value exists.
 */
export function decide(state: DecisionState, policy: ControllerPolicy = DEFAULT_CONTROLLER_POLICY): ControllerDecision {
  const expectedUtility = computeExpectedUtility(state, policy.weights);

  const isStuck = state.confidence.agentConsensus === "low" || state.disagreements.length > 0;
  const isHighValue = state.objective.value.baseValue > policy.escalationThresholds.highValueEscalationThreshold;

  if (isHighValue && isStuck) {
    return {
      action: "escalate",
      expectedUtility,
      rationale:
        `baseValue (${state.objective.value.baseValue}) exceeds highValueEscalationThreshold ` +
        `(${policy.escalationThresholds.highValueEscalationThreshold}) and the decision shows signs of being ` +
        `stuck (agentConsensus=${state.confidence.agentConsensus}, ${state.disagreements.length} disagreement(s)).`,
    };
  }

  return {
    action: "stop",
    expectedUtility,
    rationale: "No escalation criteria met; the verdict stands.",
  };
}
