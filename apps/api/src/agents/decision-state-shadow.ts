import { logger } from "../lib/logger.js";
import { buildDecisionState, type BuildDecisionStateInput } from "./decision-state.js";
import { decide } from "./controller.js";

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
 * Also computes and logs the real Expected Utility breakdown and
 * Controller stop/escalate decision (controller.ts) for this same state --
 * still purely observational, same flag, same zero-behavior-change
 * guarantee. This is the first place those two pieces see real (if
 * currently narrow -- see controller.ts's own module comment) production
 * shape, rather than only synthetic test fixtures.
 */
export function recordDecisionStateShadow(input: BuildDecisionStateInput): void {
  const state = buildDecisionState(input);
  const controllerDecision = decide(state);

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
      action: state.action,
      controllerAction: controllerDecision.action,
      expectedUtility: controllerDecision.expectedUtility,
    },
    "DecisionState shadow-recorded (Controller spec v3.0)",
  );
}
