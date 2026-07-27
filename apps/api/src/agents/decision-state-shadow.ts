import { logger } from "../lib/logger.js";
import { buildDecisionState, type BuildDecisionStateInput } from "./decision-state.js";
import { decide, DEFAULT_CONTROLLER_POLICY } from "./controller.js";
import { computeExpectedUtility } from "./expected-utility.js";
import { deriveBudgetSnapshot, NO_REAL_COMPLEXITY_SCORE_AVAILABLE } from "./budget-manager.js";
import type { CapabilityOutputsByStage } from "./reasoning-capability.js";

/**
 * Controller & Capability Specification v3.0 -- records a DecisionState
 * for a real, already-completed decision, gated by RECORD_DECISION_STATE
 * (env.ts, default false). Purely observational: never called before a
 * decision's real verdict/action/explanation are known, never feeds back
 * into anything that changes behavior. Structured-logged (not persisted
 * to a new table) since the shape hasn't been validated against real
 * production decisions yet -- the same reasoning Phase 16 Day 5 used for
 * its own shadow observation before trusting a schema with real storage.
 *
 * Also computes and logs the real Expected Utility breakdown and a full
 * controller.ts decide() call (stop/continue/invoke_capability/escalate,
 * now budget- and capability-aware) for this same state -- still purely
 * observational, same flag, same zero-behavior-change guarantee. The
 * BudgetSnapshot is real (budget-manager.ts's deriveBudgetSnapshot, using
 * this decision's own real RawCost), and capabilityOutputs -- when the
 * caller has them (decision.service.ts passes the real
 * observeCapabilityOutputs() result) -- are real per-stage data, not a
 * synthetic stand-in.
 *
 * Against most real DecisionStates today, decide() returns "stop" -- but,
 * since Critical Bug #4's fix (controller.ts's own module comment),
 * because real Judge confidence usually meets confidenceThreshold, not
 * because of budget (remainingCost is typically large and positive; the
 * old remainingReasoning-based exhaustion gate is gone). A real decision
 * with genuinely low confidence now reaches continue/invoke_capability
 * here for real, not just in controller.test.ts's synthetic fixtures.
 */
export function recordDecisionStateShadow(input: BuildDecisionStateInput, capabilityOutputs?: CapabilityOutputsByStage): void {
  const state = buildDecisionState(input);
  const budgetSnapshot = deriveBudgetSnapshot(state.budget.raw, state.objective.value, NO_REAL_COMPLEXITY_SCORE_AVAILABLE);
  const controllerDecision = decide(state, budgetSnapshot, capabilityOutputs);
  const expectedUtility = computeExpectedUtility(state, DEFAULT_CONTROLLER_POLICY.weights);

  logger.info(
    {
      decisionId: state.id,
      version: state.version,
      transitionHash: state.transitionHash,
      packId: state.packId,
      teamId: state.teamId,
      verdict: state.verdict,
      confidence: state.confidence,
      disagreements: state.disagreements,
      budget: state.budget,
      budgetSnapshot,
      action: state.action,
      controllerAction: controllerDecision.action,
      controllerReasons: controllerDecision.reasons,
      controllerTargetCapability: controllerDecision.targetCapability,
      expectedUtility,
    },
    "DecisionState shadow-recorded (Controller spec v3.0)",
  );
}
