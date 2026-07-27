import type { CapabilityOutput, RecommendedAction, RecommendedActionPriority } from "./reasoning-capability.js";

// Controller & Capability Specification v3.0, Section 3.3/3.4 --
// "Capability Advisory Outputs" scoring. priorityWeight() and
// scoreRecommendedAction() are pure, real, and have no data gap.
// selectBestAdvisory() aggregates real CapabilityOutputs' advisories --
// but no real capability emits one today (see reasoning-capability.ts's
// wrapRetrieverAsCapability module comment: "a Retriever has no basis
// today for recommending a next action"), so this always returns null
// against real data. That's an honest finding, not a bug -- there's
// nothing to score until a capability that can actually reason about
// "what should happen next" exists.
//
// Deliberately NOT built: the spec's own incorporateAdvisories(), which
// compares an advisory's score against "the Controller's own capability-
// selection score" and overrides it if 1.2x better. Our real
// controller.ts's decide() has no capability-selection score to compare
// against -- it only ever decides stop/escalate (see its own module
// comment: no continue/invoke_capability, since there's no real next
// capability to invoke). Building a comparison against a score that
// doesn't exist would mean fabricating one side of the comparison.

// Section 3.3's own stated weights.
export const PRIORITY_WEIGHTS: Record<RecommendedActionPriority, number> = {
  critical: 2.0,
  high: 1.5,
  medium: 1.0,
  low: 0.5,
};

export function priorityWeight(priority: RecommendedActionPriority): number {
  return PRIORITY_WEIGHTS[priority];
}

export interface ScoredRecommendedAction extends RecommendedAction {
  advisoryConfidence: number;
  score: number;
}

/**
 * Scores one recommended action: score = expectedConfidenceGain *
 * (advisoryConfidence / 100) * priorityWeight(priority) (Section 3.3).
 * Returns null when expectedConfidenceGain is absent -- Section 3.4's own
 * constraint #3: "Advisories must include expected confidence gain.
 * Without this, the Controller cannot score them." Treating a missing
 * value as 0 would silently score an unscoreable recommendation as
 * "worthless" rather than "unscoreable" -- those are different claims.
 */
export function scoreRecommendedAction(action: RecommendedAction, advisoryConfidence: number): ScoredRecommendedAction | null {
  if (action.expectedConfidenceGain === undefined) return null;
  const score = action.expectedConfidenceGain * (advisoryConfidence / 100) * priorityWeight(action.priority);
  return { ...action, advisoryConfidence, score };
}

/**
 * Collects every scoreable recommended action across a set of real
 * CapabilityOutputs and returns the single highest-scoring one (or null
 * if none of them carry an advisory, or none of their recommendations are
 * scoreable). Against real data today this always returns null -- see
 * the module comment above. Real, tested logic ahead of there being real
 * advisories to run it against, the same pattern already used for
 * controller.ts's decide() and wrapRetrieverAsCapability.
 */
export function selectBestAdvisory<TOutputs>(outputs: Array<CapabilityOutput<TOutputs>>): ScoredRecommendedAction | null {
  const scored = outputs
    .filter((o) => o.advisory !== undefined)
    .flatMap((o) => {
      const advisory = o.advisory;
      if (!advisory) return [];
      return advisory.recommendedNextActions.map((action) => scoreRecommendedAction(action, advisory.confidence));
    })
    .filter((s): s is ScoredRecommendedAction => s !== null);

  if (scored.length === 0) return null;
  return scored.reduce((best, current) => (current.score > best.score ? current : best));
}
