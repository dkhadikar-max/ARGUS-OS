import { describe, expect, it } from "vitest";
import { JUDGE_AGENT_PROMPT } from "./prompts.js";

// Regression coverage for a real, reproduced failure: a live eval run
// (Execution Runtime v1 8-fixture comparison, matrix-icp-moderate_intent-
// hot_risk-moderate) hit judgeAgentOutputSchema's own refine() -- "message.
// linkedin and message.email cannot both be null unless recommended_action
// is pass_and_move_on" (packages/shared/src/schemas/agents.ts) -- on both
// retry attempts. agents.test.ts already proves the SCHEMA enforces this
// rule correctly; it was already doing its job (rejecting the bad output
// and triggering a retry). The actual gap was upstream: JUDGE_AGENT_PROMPT
// told the model a fully-null message was fine whenever "no message is
// warranted" without ever tying that specifically to recommended_action
// being pass_and_move_on -- so the model could (and did) reach that
// implication for a different recommended_action.
//
// This doesn't re-test the schema (agents.test.ts already does). It tests
// that the PROMPT text itself still states the real constraint the schema
// enforces -- the actual thing that regressed here, and the actual thing a
// future prompt edit could silently remove or weaken again.
describe("JUDGE_AGENT_PROMPT", () => {
  it("explicitly ties a fully-null message to recommended_action being pass_and_move_on", () => {
    expect(JUDGE_AGENT_PROMPT).toContain("pass_and_move_on");
    expect(JUDGE_AGENT_PROMPT).toMatch(/BOTH be null ONLY when recommended_action is\s+pass_and_move_on/);
  });

  it("tells the model every other recommended_action needs at least one real message channel", () => {
    expect(JUDGE_AGENT_PROMPT).toMatch(/every other recommended_action[\s\S]*at least one of linkedin or email must\s+be non-null/);
  });
});
