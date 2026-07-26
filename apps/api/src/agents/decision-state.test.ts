import { describe, expect, it } from "vitest";
import { buildDecisionState, computeTransitionHash, type BuildDecisionStateInput } from "./decision-state.js";
import { AVG_DEAL_SIZE_USD, FP_REDUCTION_VALUE_USD, FN_REDUCTION_VALUE_USD } from "./decision-value.service.js";
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
      conflicts: ["Research and Risk disagree on funding stage"],
      reasoning: "Strong ICP fit despite one funding-stage conflict.",
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

describe("buildDecisionState", () => {
  it("is always version 0 with no parent -- Phase 1 never produces more than one state per decision", () => {
    const state = buildDecisionState(sampleInput());
    expect(state.version).toBe(0);
    expect(state.parentStateId).toBeNull();
  });

  it("computes a transitionHash consistent with computeTransitionHash('', transition)", () => {
    const state = buildDecisionState(sampleInput());
    expect(state.transitionHash).toBe(computeTransitionHash("", state.transition));
  });

  it("maps real verdict/confidence/action/explanation from the judge output", () => {
    const state = buildDecisionState(sampleInput());
    expect(state.verdict).toEqual({ label: "YES", confidence: 82 });
    expect(state.action).toBe("message_now");
    expect(state.explanation).toBe("Strong ICP fit despite one funding-stage conflict.");
    expect(state.confidence).toEqual({ overall: 82, agentConsensus: "high", trajectory: null });
  });

  it("maps judge.conflicts to disagreements with a null magnitude (no real severity score exists)", () => {
    const state = buildDecisionState(sampleInput());
    expect(state.disagreements).toEqual([
      { description: "Research and Risk disagree on funding stage", magnitude: null },
    ]);
  });

  it("computes real RawCost -- tokens/costUsd from usage, reasoningDepth always 5", () => {
    const state = buildDecisionState(sampleInput());
    expect(state.budget.raw.tokens).toBe(1500);
    expect(state.budget.raw.latencyMs).toBe(82000);
    expect(state.budget.raw.reasoningDepth).toBe(5);
    expect(state.budget.raw.costUsd).toBeGreaterThan(0);
  });

  it("reuses the real, already-exported Decision Value constants for objective.value", () => {
    const state = buildDecisionState(sampleInput());
    expect(state.objective.value.baseValue).toBe(AVG_DEAL_SIZE_USD);
    expect(state.objective.value.falsePositiveCost).toBe(FP_REDUCTION_VALUE_USD);
    expect(state.objective.value.falseNegativeCost).toBe(FN_REDUCTION_VALUE_USD);
    expect(state.objective.value.timeHorizonHours).toBeNull();
    expect(state.objective.value.timeDecayRate).toBeNull();
  });

  it("leaves structurally-present-but-unbuilt fields honestly empty, not fabricated", () => {
    const state = buildDecisionState(sampleInput());
    expect(state.evidence).toEqual({ nodes: [], edges: [] });
    expect(state.evidenceGaps).toEqual([]);
    expect(state.reasoningHistory).toEqual([]);
    expect(state.activeCapabilities).toEqual([]);
    expect(state.controllerMemory).toEqual({});
    expect(state.outcome).toBeUndefined();
  });
});

describe("computeTransitionHash", () => {
  it("is deterministic for the same inputs", () => {
    const state = buildDecisionState(sampleInput());
    expect(computeTransitionHash("", state.transition)).toBe(computeTransitionHash("", state.transition));
  });

  it("changes when parentHash changes, all else equal", () => {
    const state = buildDecisionState(sampleInput());
    expect(computeTransitionHash("", state.transition)).not.toBe(computeTransitionHash("some-parent-hash", state.transition));
  });
});
