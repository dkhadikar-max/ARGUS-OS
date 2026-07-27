import type { DecisionObjectiveValue, RawCost } from "./decision-state.js";

// Controller & Capability Specification v3.0, Phase 2 -- scoped per the
// gap analysis: normalization functions only (normalizeCost/
// denormalizeCost/allocate), plus deriveBudgetSnapshot (added once
// controller.ts's decide() needed a real BudgetSnapshot to reason over). No
// consume()/evaluateReallocation()/estimateCapabilityCost()/
// getCostBreakdown() yet -- those need a live Controller actually spending
// a budget mid-decision, which doesn't exist (Planning Policy / Controller
// is the next phase in the migration order). Nothing here is wired into
// orchestrator.ts or decision.service.ts; these are pure functions over the
// real RawCost/DecisionObjectiveValue shapes decision-state.ts (Phase 1)
// already established.

export interface NormalizedBudget {
  initial: number;
  consumed: number;
  remaining: number;
  rawEquivalent: RawCost;
}

// Tunable (Controller spec v3.0 Section 5.2) -- the spec's own stated
// default (2 points per reasoning step). Not derived from ARGUS's own
// data, since no decision has ever had a variable per-stage budget to
// measure against.
const REASONING_DEPTH_POINTS_PER_STEP = 2;

function computeLatencyPoints(latencyMs: number, baseValue: number, timeDecayRate: number | null): number {
  // timeDecayRate is null whenever there's no real per-decision time-decay
  // rate to use (see decision-state.ts's DecisionObjectiveValue comment --
  // nothing in ARGUS computes one today). Treated as zero latency cost
  // rather than fabricating a decay curve.
  if (timeDecayRate === null || baseValue <= 0) return 0;
  const latencyHours = latencyMs / 3_600_000;
  const latencyValueLost = baseValue * (1 - Math.pow(1 - timeDecayRate, latencyHours));
  return (latencyValueLost / baseValue) * 100;
}

/**
 * Converts a real RawCost (tokens/latencyMs/costUsd/reasoningDepth, see
 * decision-state.ts) into normalized decision-value points -- a 0-100
 * scale where 100 = the decision's full baseValue. Three additive terms:
 * cost as a fraction of value, latency-decay as a fraction of value (zero
 * when no real decay rate exists for this decision), and a fixed penalty
 * per reasoning step actually taken.
 */
export function normalizeCost(raw: RawCost, decisionValue: DecisionObjectiveValue): number {
  if (decisionValue.baseValue <= 0) return 0;
  const tokenPoints = (raw.costUsd / decisionValue.baseValue) * 100;
  const latencyPoints = computeLatencyPoints(raw.latencyMs, decisionValue.baseValue, decisionValue.timeDecayRate);
  const depthPoints = raw.reasoningDepth * REASONING_DEPTH_POINTS_PER_STEP;
  return tokenPoints + latencyPoints + depthPoints;
}

/**
 * Best-effort dollar-equivalent for reporting -- NOT a true inverse of
 * normalizeCost. normalizeCost sums three different terms (cost, latency-
 * decay, reasoning-depth) into one scalar, and that sum can't be uniquely
 * decomposed back into tokens/latencyMs/reasoningDepth -- there are
 * infinitely many RawCost combinations that normalize to the same points
 * value. This recovers only the cost-USD magnitude the points figure
 * represents against a given decision's baseValue; tokens/latencyMs/
 * reasoningDepth are left at 0 rather than guessed.
 */
export function denormalizeCost(points: number, decisionValue: DecisionObjectiveValue): RawCost {
  const costUsd = decisionValue.baseValue > 0 ? (points / 100) * decisionValue.baseValue : 0;
  return { tokens: 0, latencyMs: 0, costUsd, reasoningDepth: 0 };
}

// Tunable (Section 5.2), explicitly a placeholder: no decision has ever had
// a variable budget, so there is no historical relationship between
// complexity and "the right budget" to fit these against yet. A simple
// linear default pending real tuning data -- Section 5.3's ControllerPolicy
// versioning is the intended eventual home for these, once a Controller
// exists to consume them.
const BASE_BUDGET_POINTS = 20;
const COMPLEXITY_BUDGET_POINTS_PER_UNIT = 30;

/**
 * Allocates an initial normalized budget for a decision, given its
 * complexity (the same 0-1-ish scale calculateComplexityScore in
 * decision-complexity.ts already produces) and decision value. consumed
 * starts at 0 -- nothing spends against this budget yet, since there's no
 * Controller loop to spend it (Planning Policy / Controller is the next
 * phase).
 */
export function allocate(complexity: number, decisionValue: DecisionObjectiveValue): NormalizedBudget {
  const initial = BASE_BUDGET_POINTS + complexity * COMPLEXITY_BUDGET_POINTS_PER_UNIT;
  return {
    initial,
    consumed: 0,
    remaining: initial,
    rawEquivalent: denormalizeCost(initial, decisionValue),
  };
}

/**
 * Controller & Capability Specification v3.0 -- the 3-dimensional budget
 * contract controller.ts's decide() consumes. Deliberately decoupled from
 * allocate()/normalizeCost()/denormalizeCost() by design: the Controller
 * receives a snapshot and never learns how it was built, so this interface
 * (and decide()'s signature) won't need to change on the day a real
 * Controller loop starts calling decide() mid-decision instead of only
 * after one completes -- see controller.ts's own module comment.
 */
export interface BudgetSnapshot {
  remainingReasoning: number;
  remainingLatency: number;
  remainingCost: number;
}

// The fixed 5-stage pipeline's own real step count (decision-state.ts's
// RawCost.reasoningDepth comment: "Always 5 today -- the fixed pipeline
// always runs exactly 5 stages"). Not a policy choice -- a structural fact
// about what the pipeline actually does today, reused here rather than
// re-declared.
const FIXED_PIPELINE_REASONING_STEPS = 5;

/**
 * Builds a real BudgetSnapshot for a DecisionState. Each dimension is
 * honestly derived, not uniformly fabricated from one number:
 *   - remainingReasoning: FIXED_PIPELINE_REASONING_STEPS minus the steps a
 *     decision's RawCost says it already took. Against every real decision
 *     today, raw.reasoningDepth is always 5 (the pipeline has no adaptive
 *     step budget yet), so this is always exactly 0 -- an honest finding,
 *     not a bug: there is currently no real budget for a 6th reasoning
 *     step, at all, for any decision.
 *   - remainingCost: allocate()'s normalized decision-value-points budget
 *     minus what normalizeCost() says was actually spent, converted back to
 *     a dollar-equivalent via denormalizeCost (the same lossy best-effort
 *     conversion already documented on denormalizeCost itself).
 *   - remainingLatency: no real per-decision time horizon or decay rate
 *     exists anywhere in ARGUS (decision-state.ts's DecisionObjectiveValue
 *     comment), so there is no real ceiling to run out of yet.
 *     Number.POSITIVE_INFINITY represents "no real constraint exists
 *     today," not a guessed number -- the same honest-Infinity treatment
 *     expected-utility.ts's delay() already uses for its own "expired"
 *     case once a real time horizon exists.
 */
export function deriveBudgetSnapshot(raw: RawCost, decisionValue: DecisionObjectiveValue, complexity: number): BudgetSnapshot {
  const allocated = allocate(complexity, decisionValue);
  const consumed = normalizeCost(raw, decisionValue);
  const remainingPoints = allocated.initial - consumed;

  return {
    remainingReasoning: FIXED_PIPELINE_REASONING_STEPS - raw.reasoningDepth,
    remainingLatency: decisionValue.timeDecayRate === null ? Number.POSITIVE_INFINITY : remainingPoints,
    remainingCost: denormalizeCost(Math.max(0, remainingPoints), decisionValue).costUsd,
  };
}
