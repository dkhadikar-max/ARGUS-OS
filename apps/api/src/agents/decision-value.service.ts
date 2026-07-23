import type { OutcomeType, Verdict } from "@argus/shared";

/**
 * v4 roadmap Phase 2 (Decision Value) -- "stop optimizing tokens, start
 * optimizing outcomes." Historical analytics only: nothing here changes
 * routing, tiering, or agent behavior.
 *
 * Pricing is not a guess: the Bible's own §13.1 cost breakdown states
 * "Cost per decision: ~$0.042 (4K x $3/1M + 2K x $15/1M)" -- $3/million
 * input tokens, $15/million output tokens is the Bible's own assumed
 * Claude Sonnet-tier rate, reused here rather than inventing a different
 * number. If Anthropic's actual pricing for the configured model differs,
 * update these two constants -- don't treat them as automatically correct
 * forever.
 */
const INPUT_TOKEN_COST_PER_MILLION_USD = 3;
const OUTPUT_TOKEN_COST_PER_MILLION_USD = 15;

export function calculateInferenceCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_TOKEN_COST_PER_MILLION_USD +
    (outputTokens / 1_000_000) * OUTPUT_TOKEN_COST_PER_MILLION_USD
  );
}

// Architecture doc's own DecisionValueCalculator constants -- carried over
// as-is (not re-derived from ARGUS's own data, which doesn't exist yet to
// derive them from).
const SDR_HOURLY_COST_USD = 75;
const AVG_DEAL_SIZE_USD = 25000;
const REVENUE_ATTRIBUTION_RATE = 0.05;
const FP_REDUCTION_VALUE_USD = 150;
const FN_REDUCTION_VALUE_USD = 5000;

/** Hours of SDR time a verdict saves (or well-spends) by correctly
 *  prioritizing or deprioritizing a prospect. The architecture doc's own
 *  pseudocode only distinguishes PASS/STRONG_YES/else -- extended here to
 *  ARGUS's real 5-verdict scale: PASS and HARD_PASS both represent time
 *  correctly NOT spent (2.5h, matching the doc's own PASS case);
 *  STRONG_YES/YES get faster prioritization (1.0h, matching the doc's own
 *  STRONG_YES case); WAIT is the doc's "else" case (0.5h). */
function timeSavedHours(verdict: Verdict): number {
  switch (verdict) {
    case "PASS":
    case "HARD_PASS":
      return 2.5;
    case "STRONG_YES":
    case "YES":
      return 1.0;
    case "WAIT":
      return 0.5;
  }
}

export interface DecisionValueInputs {
  verdict: Verdict;
  /** null until an outcome is logged -- revenue/fp/fn all require one. */
  outcomeType: OutcomeType | null;
}

export interface DecisionValueResult {
  timeSavedHours: number;
  revenueInfluencedUsd: number;
  fpReduction: 0 | 1;
  fnReduction: 0 | 1;
  decisionValueUsd: number;
}

export function calculateDecisionValue({ verdict, outcomeType }: DecisionValueInputs): DecisionValueResult {
  const timeSaved = timeSavedHours(verdict);

  const revenueInfluencedUsd = outcomeType === "CLOSED_WON" ? AVG_DEAL_SIZE_USD : 0;

  // A PASS/HARD_PASS that correctly avoided wasted time -- the prospect
  // simply never responded, confirming the AI's call was right.
  const fpReduction: 0 | 1 = (verdict === "PASS" || verdict === "HARD_PASS") && outcomeType === "NO_RESPONSE" ? 1 : 0;

  // A STRONG_YES/YES that actually closed -- the AI correctly caught a real
  // opportunity instead of missing it.
  const fnReduction: 0 | 1 = (verdict === "STRONG_YES" || verdict === "YES") && outcomeType === "CLOSED_WON" ? 1 : 0;

  const decisionValueUsd =
    timeSaved * SDR_HOURLY_COST_USD +
    revenueInfluencedUsd * REVENUE_ATTRIBUTION_RATE +
    fpReduction * FP_REDUCTION_VALUE_USD +
    fnReduction * FN_REDUCTION_VALUE_USD;

  return { timeSavedHours: timeSaved, revenueInfluencedUsd, fpReduction, fnReduction, decisionValueUsd };
}

/** null (not 0 or Infinity) when inferenceCostUsd is 0 -- a cache-hit
 *  decision made no new API call, so "value per dollar spent" is undefined
 *  for it, not infinite. */
export function calculateValueCostRatio(decisionValueUsd: number, inferenceCostUsd: number): number | null {
  if (inferenceCostUsd <= 0) return null;
  return decisionValueUsd / inferenceCostUsd;
}
