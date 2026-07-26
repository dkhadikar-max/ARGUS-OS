import { describe, expect, it, vi, afterEach } from "vitest";
import { recordDecisionStateShadow } from "./decision-state-shadow.js";
import { logger } from "../lib/logger.js";
import type { BuildDecisionStateInput } from "./decision-state.js";
import type { AgentDebateOutput } from "@argus/shared";

function sampleInput(): BuildDecisionStateInput {
  return {
    decisionId: "dec_1",
    teamId: "team_1",
    userId: "user_1",
    prospectId: "prospect_1",
    prospectName: "Jane Prospect",
    input: {
      prospectData: {},
      teamIcp: null,
      companyMemory: null,
      intentSignals: null,
      historicalEngagement: [],
      teamHistory: [],
      userPreferences: null,
      teamPatterns: null,
      companyContext: null,
    },
    output: {
      research: { summary: "s", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 80, data_gaps: [] },
      icp: { score: 80, criteria_evaluated: [], overall_assessment: "Good", edge_cases: [], confidence: 80 },
      intent: { score: 75, signals: [], trajectory: "stable", false_intent_flags: [], confidence: 75 },
      risk: { score: 20, risks: [], red_flags: [], time_waste_probability: 15, mitigation_strategies: [], confidence: 80 },
      judge: {
        verdict: "YES",
        confidence: 82,
        weighted_score: 78,
        agent_consensus: "high",
        conflicts: [],
        reasoning: "r",
        key_evidence: [],
        message: { linkedin: "hi", email: null, tone: "professional", personalization_hooks: [] },
        recommended_action: "message_now",
        confidence_explanation: "c",
      },
    } as unknown as AgentDebateOutput,
    usage: { inputTokens: 100, outputTokens: 100 },
    processingTimeMs: 1000,
    verdict: "YES",
  };
}

describe("recordDecisionStateShadow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the decision state via logger.info without throwing", () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
    recordDecisionStateShadow(sampleInput());
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const call = infoSpy.mock.calls[0] ?? [];
    const [payload, message] = call;
    expect(message).toBe("DecisionState shadow-recorded (Controller spec v3.0)");
    expect(payload).toMatchObject({
      decisionId: "dec_1",
      version: 0,
      teamId: "team_1",
      verdict: { label: "YES", confidence: 82 },
      action: "message_now",
      controllerAction: "stop",
    });
  });

  it("includes the real Expected Utility breakdown computed for this same state", () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
    recordDecisionStateShadow(sampleInput());
    const call = infoSpy.mock.calls[0] ?? [];
    const [payload] = call as [{ expectedUtility?: { gain: number; loss: number; expectedUtility: number } }];
    expect(typeof payload.expectedUtility?.gain).toBe("number");
    expect(typeof payload.expectedUtility?.expectedUtility).toBe("number");
  });
});
