/**
 * v4 roadmap Phase 3 -- base statistical conflict detector.
 *
 * There is no existing standalone Conflict Detector to preserve: today the
 * only "conflict awareness" is the Judge's own free-text `conflicts` field
 * (Bible §8.7, prompts.ts:194-196 -- "note the conflict if agents disagree
 * >30 points"), a qualitative note, not a computed metric. This module and
 * conflict-surprise.ts together are what the roadmap's Phase 3 actually
 * needs to build, not just a "surprise layer" on top of something that
 * already existed.
 *
 * Deliberately does NOT include Research in the pairwise/directional
 * calculations. ICP score (higher = better fit, Bible §8.4) and Intent
 * score (higher = more buying intent, §8.5) both have an unambiguous
 * "good for this prospect" direction. Research's `confidence` measures data
 * quality, not prospect favorability -- pairing it against ICP/Intent would
 * produce a meaningless "disagreement" signal (low confidence isn't the
 * opposite of high ICP fit). Risk's `score` field has the same problem this
 * session already ran into once before (packages/shared/src/schemas/
 * agents.ts:146-150's own note on why a weighted-score-drift checker using
 * risk.score was removed): the Bible's own RISK_AGENT_PROMPT never states
 * whether higher risk.score means riskier or safer. `time_waste_probability`
 * has no such ambiguity (explicitly "probability that this prospect will
 * waste time," 0-100, higher = worse) -- so risk's contribution here uses
 * `100 - time_waste_probability` as a "prospect safety" score instead of
 * the ambiguous `risk.score`.
 */

export interface ConflictInputScores {
  /** ICP Agent's own score, 0-100, higher = better fit. */
  icpScore: number;
  /** Intent Agent's own score, 0-100, higher = more buying intent. */
  intentScore: number;
  /** 100 - Risk Agent's time_waste_probability, 0-100, higher = safer. */
  riskSafetyScore: number;
}

export interface BaseConflictResult {
  mean: number;
  cv: number;
  spread: number;
  directional: boolean;
}

const POSITIVE_THRESHOLD = 65;
const NEGATIVE_THRESHOLD = 35;

export type ScoreDirection = "positive" | "negative" | "neutral";

/** A score above POSITIVE_THRESHOLD is a clear "good for this prospect"
 *  signal; below NEGATIVE_THRESHOLD is a clear "bad" signal. Anything in
 *  between is neutral/uncertain, not a disagreement in either direction. */
export function scoreDirection(score: number): ScoreDirection {
  if (score > POSITIVE_THRESHOLD) return "positive";
  if (score < NEGATIVE_THRESHOLD) return "negative";
  return "neutral";
}

/** Coefficient of variation, spread, and whether any two scores land on
 *  strictly opposite sides of neutral (one positive, one negative) --
 *  the same three base signals the architecture doc calls for (CV, spread,
 *  directional disagreement), computed over the three well-defined-
 *  direction scores only (see module comment above). */
export function computeBaseConflict(scores: ConflictInputScores): BaseConflictResult {
  const values = [scores.icpScore, scores.intentScore, scores.riskSafetyScore];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean === 0 ? 0 : stdDev / mean;
  const spread = Math.max(...values) - Math.min(...values);

  const directions = values.map(scoreDirection);
  const directional = directions.includes("positive") && directions.includes("negative");

  return { mean, cv, spread, directional };
}
