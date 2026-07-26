import { describe, expect, it } from "vitest";
import { decide, DEFAULT_CONTROLLER_POLICY, DEFAULT_ESCALATION_THRESHOLDS, type ControllerPolicy } from "./controller.js";
import { computeExpectedUtility, DEFAULT_UTILITY_WEIGHTS } from "./expected-utility.js";
import { buildDecisionState, type BuildDecisionStateInput } from "./decision-state.js";
import type { AgentDebateOutput } from "@argus/shared";

function sampleOutput(overrides: Partial<AgentDebateOutput["judge"]> = {}): AgentDebateOutput {
  return {
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
      ...overrides,
    },
  } as unknown as AgentDebateOutput;
}

function sampleInput(overrides: Partial<BuildDecisionStateInput> = {}): BuildDecisionStateInput {
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
    output: sampleOutput(),
    usage: { inputTokens: 1000, outputTokens: 500 },
    processingTimeMs: 82000,
    verdict: "YES",
    ...overrides,
  };
}

const highValuePolicy: ControllerPolicy = {
  ...DEFAULT_CONTROLLER_POLICY,
  escalationThresholds: { highValueEscalationThreshold: 1000 },
};

describe("decide", () => {
  it("always returns stop against a real DecisionState today -- baseValue ($25,000) is below the default $100K threshold", () => {
    const state = buildDecisionState(sampleInput());
    expect(state.objective.value.baseValue).toBeLessThan(DEFAULT_ESCALATION_THRESHOLDS.highValueEscalationThreshold);
    expect(decide(state).action).toBe("stop");
  });

  it("escalates when baseValue exceeds the threshold and agentConsensus is low (stuck proxy)", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ agent_consensus: "low" }) }));
    expect(decide(state, highValuePolicy).action).toBe("escalate");
  });

  it("escalates when baseValue exceeds the threshold and there is any real disagreement, even with high consensus", () => {
    const state = buildDecisionState(
      sampleInput({ output: sampleOutput({ agent_consensus: "high", conflicts: ["Research and Risk disagree"] }) }),
    );
    expect(decide(state, highValuePolicy).action).toBe("escalate");
  });

  it("does not escalate when high-value but not stuck (high consensus, no disagreements)", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ agent_consensus: "high", conflicts: [] }) }));
    expect(decide(state, highValuePolicy).action).toBe("stop");
  });

  it("always includes the real expectedUtility breakdown, computed with the policy's own weights", () => {
    const state = buildDecisionState(sampleInput());
    const result = decide(state, DEFAULT_CONTROLLER_POLICY);
    expect(result.expectedUtility).toEqual(computeExpectedUtility(state, DEFAULT_CONTROLLER_POLICY.weights));
  });

  it("respects custom weights passed via the policy, not hardcoded defaults", () => {
    const state = buildDecisionState(sampleInput());
    const customPolicy: ControllerPolicy = { ...DEFAULT_CONTROLLER_POLICY, weights: { ...DEFAULT_UTILITY_WEIGHTS, gainWeight: 3 } };
    const result = decide(state, customPolicy);
    expect(result.expectedUtility.gain).toBeCloseTo(computeExpectedUtility(state).gain * 3, 10);
  });

  it("escalation rationale cites the real threshold and consensus values it used", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ agent_consensus: "low" }) }));
    const result = decide(state, highValuePolicy);
    expect(result.rationale).toContain("1000");
    expect(result.rationale).toContain("low");
  });
});

describe("DEFAULT_CONTROLLER_POLICY", () => {
  it("is honestly untrained -- no real tuning data exists yet", () => {
    expect(DEFAULT_CONTROLLER_POLICY.version).toBe(0);
    expect(DEFAULT_CONTROLLER_POLICY.trainedOn).toBeNull();
    expect(DEFAULT_CONTROLLER_POLICY.weights).toEqual(DEFAULT_UTILITY_WEIGHTS);
    expect(DEFAULT_CONTROLLER_POLICY.escalationThresholds).toEqual(DEFAULT_ESCALATION_THRESHOLDS);
  });
});
