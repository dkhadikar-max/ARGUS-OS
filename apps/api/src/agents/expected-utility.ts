import type { DecisionObjectiveValue, DecisionState, RawCost } from "./decision-state.js";
import { normalizeCost } from "./budget-manager.js";

// Controller & Capability Specification v3.0 -- Planning Policy /
// Controller, scoped narrowly per the gap analysis: the Expected Utility
// function only (EU = Gain - Loss - Delay - ReasoningCost - RiskPenalty),
// as pure functions over one real DecisionState snapshot. No Controller
// loop, no capability invocation, no advisory scoring, no progress/
// oscillation detection -- those all need multiple real rounds per
// decision, which don't exist yet (the live pipeline is still a fixed,
// single-pass sequence; DecisionState only ever produces version 0).
// Nothing here is wired anywhere.

function normalizeToDecisionPoints(value: number, baseValue: number): number {
  if (baseValue <= 0) return 0;
  return Math.min(100, (value / baseValue) * 100);
}

/**
 * Expected value of the current verdict, normalized to 0-100 decision-
 * value points. Mathematically this reduces to min(100, verdict.
 * confidence) -- baseValue cancels out of pCorrect * baseValue when
 * re-normalized against the same baseValue. That's the spec's own
 * formula, not a shortcut taken here; kept spelled out rather than
 * collapsed so it stays traceable to Controller spec v3.0 Section 2.2.1.
 */
export function gain(state: DecisionState): number {
  const { verdict, objective } = state;
  const pCorrect = verdict.confidence / 100;
  const expectedValue = pCorrect * objective.value.baseValue;
  return normalizeToDecisionPoints(expectedValue, objective.value.baseValue);
}

/**
 * Expected cost of the verdict being wrong, direction-weighted: a
 * positive verdict (STRONG_YES/YES) being wrong is a false positive
 * (falsePositiveCost); anything else being wrong is a false negative
 * (falseNegativeCost). Both are real, already-exported Decision Value
 * constants (decision-value.service.ts), not invented for this function.
 */
export function loss(state: DecisionState): number {
  const { verdict, objective } = state;
  const pWrong = 1 - verdict.confidence / 100;
  const isPositiveVerdict = verdict.label === "STRONG_YES" || verdict.label === "YES";
  const falseCost = isPositiveVerdict ? objective.value.falsePositiveCost : objective.value.falseNegativeCost;
  const expectedLoss = pWrong * falseCost;
  return normalizeToDecisionPoints(expectedLoss, objective.value.baseValue);
}

/**
 * Cost of time elapsed, as value decayed via objective.value.
 * timeDecayRate over objective.value.timeHorizonHours. Both are null for
 * every real DecisionState today (see decision-state.ts's
 * DecisionObjectiveValue comment -- no per-decision time horizon or decay
 * rate exists anywhere in ARGUS) -- returns 0 rather than fabricating a
 * decay curve, the same honest treatment budget-manager.ts's
 * computeLatencyPoints already uses for a related (but distinct) real
 * quantity. The Infinity branch (decision expired) is spec-faithful but
 * unreachable against real data today, kept for when a real time horizon
 * exists.
 */
export function delay(state: DecisionState): number {
  const { timeHorizonHours, timeDecayRate, baseValue } = state.objective.value;
  if (timeHorizonHours === null || timeDecayRate === null || baseValue <= 0) return 0;

  const elapsedHours = state.metadata.latencySoFarMs / 3_600_000;
  const remainingHours = timeHorizonHours - elapsedHours;
  if (remainingHours <= 0) return Infinity;

  const decayedValue = baseValue * Math.pow(1 - timeDecayRate, elapsedHours);
  const lostValue = baseValue - decayedValue;
  return normalizeToDecisionPoints(lostValue, baseValue);
}

/**
 * Normalized cost of a real RawCost against a decision's value -- a thin,
 * named wrapper around Budget Manager's normalizeCost (the ONLY place raw
 * costs are handled, per budget-manager.ts). The spec's own signature
 * takes a hypothetical "next action" to estimate the cost of continuing
 * reasoning; there's no such thing yet (no Controller loop proposes next
 * actions), so this is called against the decision's own already-incurred
 * RawCost (state.budget.raw) instead -- "what did the reasoning that
 * already happened cost," not "what would more reasoning cost."
 */
export function reasoningCost(rawCost: RawCost, decisionValue: DecisionObjectiveValue): number {
  return normalizeCost(rawCost, decisionValue);
}

/**
 * Penalty for unresolved severe disagreements (magnitude > 70). Every real
 * Disagreement's magnitude is null today (see decision-state.ts -- the
 * Judge agent's `conflicts` are free text with no severity score), so this
 * always evaluates to 0 against real data. That's an honest finding, not a
 * bug: there is currently no real basis to identify a disagreement as
 * "severe."
 */
export function riskPenalty(state: DecisionState): number {
  const { baseValue } = state.objective.value;
  const unresolvedSevereRisks = state.disagreements.filter((d) => d.magnitude !== null && d.magnitude > 70);
  const penaltyPerRisk = 0.05 * baseValue;
  return normalizeToDecisionPoints(unresolvedSevereRisks.length * penaltyPerRisk, baseValue);
}

// Controller spec v3.0 Section 5.2's own stated defaults. Every weight
// starts at 1.0 pending real, A/B-tested tuning data -- no decision has
// ever had a variable reasoning depth or stopping point to measure
// against yet. Deliberately not hardcoded into computeExpectedUtility's
// formula; callers (eventually a real ControllerPolicy) supply their own.
export interface UtilityWeights {
  gainWeight: number;
  lossWeight: number;
  delayWeight: number;
  reasoningCostWeight: number;
  riskPenaltyWeight: number;
}

export const DEFAULT_UTILITY_WEIGHTS: UtilityWeights = {
  gainWeight: 1,
  lossWeight: 1,
  delayWeight: 1,
  reasoningCostWeight: 1,
  riskPenaltyWeight: 1,
};

export interface ExpectedUtilityBreakdown {
  gain: number;
  loss: number;
  delay: number;
  reasoningCost: number;
  riskPenalty: number;
  /** EU = Gain - Loss - Delay - ReasoningCost - RiskPenalty (Section 2.1). */
  expectedUtility: number;
}

/**
 * The full five-term Expected Utility (Controller spec v3.0 Section 2.1):
 * EU = Gain - Loss - Delay - ReasoningCost - RiskPenalty. Computed against
 * one real, already-completed DecisionState snapshot -- this is the
 * utility math a future Controller loop will need to decide whether
 * continuing reasoning is worth it, not a decision-making loop itself.
 */
export function computeExpectedUtility(
  state: DecisionState,
  weights: UtilityWeights = DEFAULT_UTILITY_WEIGHTS,
): ExpectedUtilityBreakdown {
  const gainValue = gain(state) * weights.gainWeight;
  const lossValue = loss(state) * weights.lossWeight;
  const delayValue = delay(state) * weights.delayWeight;
  const reasoningCostValue = reasoningCost(state.budget.raw, state.objective.value) * weights.reasoningCostWeight;
  const riskPenaltyValue = riskPenalty(state) * weights.riskPenaltyWeight;

  return {
    gain: gainValue,
    loss: lossValue,
    delay: delayValue,
    reasoningCost: reasoningCostValue,
    riskPenalty: riskPenaltyValue,
    expectedUtility: gainValue - lossValue - delayValue - reasoningCostValue - riskPenaltyValue,
  };
}
