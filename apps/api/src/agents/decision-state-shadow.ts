import { logger } from "../lib/logger.js";
import { buildDecisionState, type BuildDecisionStateInput } from "./decision-state.js";

/**
 * Controller & Capability Specification v3.0, Phase 1 -- records a
 * DecisionState for a real, already-completed decision, gated by
 * RECORD_DECISION_STATE (env.ts, default false). Purely observational:
 * never called before a decision's real verdict/action/explanation are
 * known, never feeds back into anything that changes behavior. Structured-
 * logged (not persisted to a new table) since the shape hasn't been
 * validated against real production decisions yet -- the same reasoning
 * Phase 16 Day 5 used for its own shadow observation before trusting a
 * schema with real storage.
 */
export function recordDecisionStateShadow(input: BuildDecisionStateInput): void {
  const state = buildDecisionState(input);
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
    },
    "DecisionState shadow-recorded (Controller spec v3.0 Phase 1)",
  );
}
