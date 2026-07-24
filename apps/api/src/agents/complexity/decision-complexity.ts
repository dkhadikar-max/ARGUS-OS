import type { DecisionComplexityWeights, OutcomeType, Verdict } from "@argus/shared";
import { computeBaseConflict, type ConflictInputScores } from "../conflict/conflict-detector.js";
import { calculateSurpriseForPairs } from "../conflict/conflict-surprise.js";

/**
 * v4 roadmap Phase 12 (docs/ARCHITECTURE_V4.md, "Decision Complexity
 * Engine") -- combines the 3 conflict features that already exist (cv,
 * directional, maxSurprise) into a single weighted complexity score. Pure,
 * DB-free scoring logic; complexity-training-data.repository.ts is the
 * module that pulls real decisions/outcomes and calls into this one.
 *
 * This is a new, additional score -- it does not replace or modify
 * conflict-surprise.ts's own needsDebate/severity fields (fixed thresholds,
 * unchanged) or execution-strategy.ts's registry (Phase 11, also unchanged).
 * Nothing reads calculateComplexityScore's output yet; wiring it into an
 * actual routing decision is separate, unstarted work (see
 * docs/ARCHITECTURE_V4.md's Execution Strategy Registry caveat).
 */
export interface ComplexityFeatures {
  cv: number;
  /** 0 or 1 -- computeBaseConflict's boolean `directional` flag, coerced to
   *  a number so it can take part in the same weighted sum as the other
   *  two features. */
  directional: number;
  maxSurprise: number;
}

/** Coefficient of variation is unbounded above in theory but in practice,
 *  for 0-100 scores, essentially never exceeds 1 -- clamping keeps a rare
 *  outlier from skewing the weighted sum outside its expected 0-1 range. */
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function extractComplexityFeatures(
  scores: ConflictInputScores,
  historicalPairRates: Record<string, number>,
): ComplexityFeatures {
  const base = computeBaseConflict(scores);
  const { maxSurprise } = calculateSurpriseForPairs(scores, historicalPairRates);
  return { cv: clamp01(base.cv), directional: base.directional ? 1 : 0, maxSurprise };
}

export function calculateComplexityScore(features: ComplexityFeatures, weights: DecisionComplexityWeights): number {
  return features.cv * weights.cv + features.directional * weights.directional + features.maxSurprise * weights.maxSurprise;
}

export type VerdictCorrectness = "correct" | "wrong" | "ambiguous";

/** Only judges correctness in the cases where a verdict and its logged
 *  outcome are unambiguously aligned or opposed -- the same "well-defined
 *  direction only" discipline decision-value.service.ts's own
 *  fpReduction/fnReduction fields already use. WAIT, REPLIED_NO_MEETING,
 *  DISQUALIFIED, SNOOZED, and CLOSED_LOST for a PASS/HARD_PASS all stay
 *  "ambiguous" and are excluded from weight training rather than guessed
 *  at -- there's no principled way to say a PASS was "wrong" just because
 *  the deal was later lost, for example. */
export function classifyVerdictCorrectness(verdict: Verdict, outcome: OutcomeType): VerdictCorrectness {
  const isPassVerdict = verdict === "PASS" || verdict === "HARD_PASS";
  const isYesVerdict = verdict === "STRONG_YES" || verdict === "YES";

  if (isPassVerdict && outcome === "NO_RESPONSE") return "correct"; // correctly avoided a dead end
  if (isPassVerdict && (outcome === "MEETING_BOOKED" || outcome === "OPPORTUNITY_CREATED" || outcome === "CLOSED_WON")) {
    return "wrong"; // missed a real opportunity
  }
  if (isYesVerdict && outcome === "CLOSED_WON") return "correct"; // correctly caught a real opportunity
  if (isYesVerdict && outcome === "NO_RESPONSE") return "wrong"; // over-prioritized a dead end

  return "ambiguous";
}

export interface LabeledDecision {
  correctness: "correct" | "wrong";
  features: ComplexityFeatures;
}

export interface WeightRecomputeResult {
  status: "proposed" | "insufficient_data";
  weights?: DecisionComplexityWeights;
  reason?: "not_enough_labeled_decisions" | "no_separating_signal";
  labeledDecisionCount: number;
  correctCount: number;
  wrongCount: number;
}

// Below this, a computed separation between "correct" and "wrong" decisions
// is more likely to be sampling noise than a real signal -- an explicit,
// stated minimum rather than silently producing a proposal off a handful
// of decisions. Mirrors the same spirit as pair-frequency.repository.ts's
// own "200+ disagreements is the point real data becomes meaningful" note,
// scaled down for how much rarer an outcome-backed decision is than a
// disagreement.
const MINIMUM_TOTAL_LABELED = 20;
const MINIMUM_PER_BUCKET = 5;

/** How much more elevated a feature is, on average, among "wrong" decisions
 *  vs "correct" ones. A feature that's actually LOWER on wrong decisions
 *  isn't a "should have debated more" signal, so negative separations
 *  clamp to 0 rather than pulling weight away from other features. */
function meanOf(bucket: LabeledDecision[], feature: keyof ComplexityFeatures): number {
  return bucket.reduce((sum, d) => sum + d.features[feature], 0) / bucket.length;
}

export function computeWeightsFromLabeledDecisions(labeled: LabeledDecision[]): WeightRecomputeResult {
  const correct = labeled.filter((d) => d.correctness === "correct");
  const wrong = labeled.filter((d) => d.correctness === "wrong");

  if (labeled.length < MINIMUM_TOTAL_LABELED || correct.length < MINIMUM_PER_BUCKET || wrong.length < MINIMUM_PER_BUCKET) {
    return {
      status: "insufficient_data",
      reason: "not_enough_labeled_decisions",
      labeledDecisionCount: labeled.length,
      correctCount: correct.length,
      wrongCount: wrong.length,
    };
  }

  const rawSeparation = {
    cv: Math.max(0, meanOf(wrong, "cv") - meanOf(correct, "cv")),
    directional: Math.max(0, meanOf(wrong, "directional") - meanOf(correct, "directional")),
    maxSurprise: Math.max(0, meanOf(wrong, "maxSurprise") - meanOf(correct, "maxSurprise")),
  };

  const total = rawSeparation.cv + rawSeparation.directional + rawSeparation.maxSurprise;
  if (total === 0) {
    return {
      status: "insufficient_data",
      reason: "no_separating_signal",
      labeledDecisionCount: labeled.length,
      correctCount: correct.length,
      wrongCount: wrong.length,
    };
  }

  return {
    status: "proposed",
    weights: {
      cv: rawSeparation.cv / total,
      directional: rawSeparation.directional / total,
      maxSurprise: rawSeparation.maxSurprise / total,
    },
    labeledDecisionCount: labeled.length,
    correctCount: correct.length,
    wrongCount: wrong.length,
  };
}
