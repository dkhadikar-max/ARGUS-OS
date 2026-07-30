/**
 * Gate 3 Shadow Mode, Increment 1 -- comparison logic between a live
 * decision and its shadow evaluate() run. Mirrors Gate 2 Replay's real,
 * already-tested disagreement taxonomy (eval/types.ts's
 * `DisagreementCategory`, eval/run-replay.ts's `compareResults`) by
 * contract, not by import: apps/api/tsconfig.json has `rootDir: "src"` /
 * `include: ["src"]`, so `src/` importing anything from `eval/` is a real
 * TS6059 build error, not a style choice -- and eval/run-replay.ts isn't
 * meant to be a runtime dependency of the live API process anyway (it
 * makes real, billable Claude calls when its own main() runs).
 *
 * Keep `DisagreementCategory` in sync manually if Gate 2's own definition
 * (eval/types.ts) changes -- a real, accepted trade-off, not silent drift
 * (flagged here so both sides are easy to find).
 *
 * One deliberate difference from Replay's own `compareResults`: verdict
 * here is taken as an already-derived field (`scoreToVerdict(weightedScore)`),
 * not read from `output.judge.verdict` -- decision.service.ts's own
 * comment documents the Judge agent mislabeling its own weighted_score
 * band, and Shadow Runner must use the same de-risked derivation the live
 * path already applies, on both sides, or it would report a fake
 * "verdict mismatch" caused by that known bug rather than real
 * architectural disagreement.
 */

export type DisagreementCategory =
  | "verdict_mismatch"
  | "confidence_threshold_exceeded"
  | "controller_action_mismatch"
  | "runtime_error"
  | "schema_error"
  | "missing_capability_output";

export interface NormalizedShadowOutcome {
  verdict: string; // already de-risked -- scoreToVerdict(weightedScore), never output.judge.verdict directly
  confidence: number;
  controllerAction: string | null; // null when the live side never ran a real Controller cycle (legacy pipeline or cache hit)
  controllerTargetCapability: string | null;
}

export interface DisagreementComparison {
  verdictAgreement: boolean;
  confidenceDelta: number;
  disagreementCategories: DisagreementCategory[];
}

/** REPLAY_METHODOLOGY.md's own confidence-delta threshold (5), reused
 *  rather than reinvented -- same number Gate 2 Replay's
 *  CONFIDENCE_DELTA_FLAG_THRESHOLD/maxConfidenceDeltaP95 uses. */
export const SHADOW_CONFIDENCE_DELTA_THRESHOLD = 5;

/**
 * `controllerComparisonApplicable` is `false` whenever the live side has
 * no real ControllerDecision at all -- true for the common case today
 * (env.EXECUTION_RUNTIME_V1 defaults false -> legacy pipeline never
 * produces one; every cache hit, regardless of that flag, reuses a
 * cached AgentDebateOutput with no controller decision either). Without
 * this, `controller_action_mismatch` would fire on ~100% of shadowed
 * decisions for a reason that has nothing to do with engine quality.
 */
export function compareForShadow(
  oldR: NormalizedShadowOutcome,
  newR: NormalizedShadowOutcome,
): { comparison: DisagreementComparison; controllerComparisonApplicable: boolean } {
  const categories: DisagreementCategory[] = [];

  const verdictAgreement = oldR.verdict === newR.verdict;
  if (!verdictAgreement) categories.push("verdict_mismatch");

  const confidenceDelta = Math.abs(oldR.confidence - newR.confidence);
  if (confidenceDelta > SHADOW_CONFIDENCE_DELTA_THRESHOLD) categories.push("confidence_threshold_exceeded");

  const controllerComparisonApplicable = oldR.controllerAction !== null;
  if (controllerComparisonApplicable) {
    const controllerActionAgreement =
      oldR.controllerAction === newR.controllerAction &&
      (oldR.controllerAction !== "invoke_capability" || oldR.controllerTargetCapability === newR.controllerTargetCapability);
    if (!controllerActionAgreement) categories.push("controller_action_mismatch");
  }

  return {
    comparison: { verdictAgreement, confidenceDelta, disagreementCategories: categories },
    controllerComparisonApplicable,
  };
}
