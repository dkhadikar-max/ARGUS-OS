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
 *
 * v4 roadmap Phase 11 (Architecture North Star, docs/ARCHITECTURE_V4.md) --
 * EXECUTION_STRATEGY_REGISTRY replaces what used to be nested if/else
 * branching with an ordered list of strategy definitions, so adding a new
 * strategy later means appending a registry entry instead of editing
 * control flow. Order is priority, evaluated top to bottom, first match
 * wins -- this preserves the exact same "executive_debate is checked
 * first, independent of the team's own thresholds" invariant as before
 * (see the same real bug this behavior was already caught by, referenced
 * in the executive_debate entry below and covered by
 * execution-strategy.test.ts).
 *
 * This registry only decides WHICH strategy name applies -- it does not
 * yet make strategies "implement behavior". Nothing in orchestrator.ts
 * currently branches on the returned ExecutionStrategy to actually run
 * fewer or more debate rounds; determineExecutionStrategy isn't called
 * from the live decision pipeline at all yet. Wiring real orchestration
 * behavior to this registry is separate, larger, unstarted work.
 */
export interface ConflictSignal {
  cv: number;
  maxSurprise: number;
  directional: boolean;
}

export interface ExecutionStrategyDefinition {
  name: ExecutionStrategy;
  /** True if this strategy applies to the given conflict signal under the
   *  given team thresholds. Registry entries are evaluated in array order;
   *  the first match wins. */
  matches: (conflict: ConflictSignal, thresholds: RoutingThresholds) => boolean;
}

const EXECUTIVE_SURPRISE_FLOOR = 0.9;

export const EXECUTION_STRATEGY_REGISTRY: ExecutionStrategyDefinition[] = [
  {
    name: "executive_debate",
    // Regardless of a team's own thresholds -- see module comment above.
    // A lenient maxSurpriseThreshold must not be able to suppress this.
    matches: (conflict) => conflict.maxSurprise > EXECUTIVE_SURPRISE_FLOOR,
  },
  {
    name: "micro_debate",
    matches: (conflict, thresholds) =>
      conflict.cv > thresholds.cvThreshold ||
      conflict.maxSurprise > thresholds.maxSurpriseThreshold ||
      conflict.directional,
  },
  {
    name: "single_pass",
    // Fallback -- always matches if nothing above did. Must stay last.
    matches: () => true,
  },
];

export function determineExecutionStrategy(
  conflict: ConflictSignal,
  thresholds: RoutingThresholds,
): ExecutionStrategy {
  // EXECUTION_STRATEGY_REGISTRY's last entry (single_pass) always matches,
  // so `find` never falls through to the `?? "single_pass"` default in
  // practice -- it's there so the return type doesn't need a cast.
  const matched = EXECUTION_STRATEGY_REGISTRY.find((strategy) => strategy.matches(conflict, thresholds));
  return matched?.name ?? "single_pass";
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
