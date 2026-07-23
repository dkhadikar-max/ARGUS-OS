import type { ExecutionStrategy, RoutingThresholds } from "@argus/shared";

/**
 * v4 roadmap Phase 6 -- decides how much debate a decision needs, given
 * Phase 3's conflict signals and a team's (possibly team-specific)
 * thresholds. Deliberately does NOT read or modify anything in
 * conflict-surprise.ts -- that module's own `needsDebate`/`severity`
 * fields use fixed, hardcoded thresholds and keep working exactly as
 * before; this is a separate, configurable decision computed from the
 * same raw cv/maxSurprise/directional inputs, not a wrapper around the
 * fixed one.
 *
 * "executive_debate" for maxSurprise > 0.9 is intentionally NOT
 * configurable via thresholds -- a disagreement this unusual for a company
 * warrants the deepest review regardless of how lenient that team's own
 * thresholds are set.
 */
export interface ConflictSignal {
  cv: number;
  maxSurprise: number;
  directional: boolean;
}

const EXECUTIVE_SURPRISE_FLOOR = 0.9;

export function determineExecutionStrategy(
  conflict: ConflictSignal,
  thresholds: RoutingThresholds,
): ExecutionStrategy {
  // Checked first, independent of the team's own thresholds below -- this
  // is what makes it genuinely "regardless of thresholds" per the module
  // comment. Gating it behind hasConflict would let a lenient team's
  // thresholds suppress it entirely, which was a real bug caught by this
  // module's own test (a lenient maxSurpriseThreshold of 0.95 was letting
  // a 0.95 surprise score return single_pass instead of executive_debate).
  if (conflict.maxSurprise > EXECUTIVE_SURPRISE_FLOOR) return "executive_debate";

  const hasConflict =
    conflict.cv > thresholds.cvThreshold ||
    conflict.maxSurprise > thresholds.maxSurpriseThreshold ||
    conflict.directional;

  return hasConflict ? "micro_debate" : "single_pass";
}

/** "A/B support": what the ACTIVE thresholds decide vs. what a PENDING
 *  proposal would decide for the same conflict signal, so an admin can see
 *  the effect of a change before approving it -- not two configurations
 *  simultaneously routing real decisions. */
export function compareExecutionStrategies(
  conflict: ConflictSignal,
  activeThresholds: RoutingThresholds,
  pendingThresholds: RoutingThresholds | null,
): { active: ExecutionStrategy; pending: ExecutionStrategy | null } {
  return {
    active: determineExecutionStrategy(conflict, activeThresholds),
    pending: pendingThresholds ? determineExecutionStrategy(conflict, pendingThresholds) : null,
  };
}
