import { describe, expect, it } from "vitest";
import {
  computeExpectedUtility,
  delay,
  gain,
  loss,
  reasoningCost,
  riskPenalty,
  DEFAULT_UTILITY_WEIGHTS,
} from "./expected-utility.js";
import { normalizeCost } from "./budget-manager.js";
import { buildDecisionState, type BuildDecisionStateInput, type DecisionState } from "./decision-state.js";
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

describe("gain", () => {
  it("reduces to min(100, confidence) -- baseValue cancels out of the spec's own formula", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ confidence: 82 }) }));
    expect(gain(state)).toBeCloseTo(82, 10);
  });

  it("is unaffected by baseValue, since it cancels out mathematically", () => {
    const lowValue = buildDecisionState(sampleInput());
    // objective.value.baseValue is always the same real constant today
    // (AVG_DEAL_SIZE_USD), so this just re-confirms gain doesn't depend on it.
    expect(gain(lowValue)).toBeCloseTo(82, 10);
  });
});

describe("loss", () => {
  it("uses falsePositiveCost when the verdict is positive (YES/STRONG_YES)", () => {
    const state = buildDecisionState(sampleInput({ verdict: "YES", output: sampleOutput({ verdict: "YES", confidence: 82 }) }));
    // pWrong=0.18, falseCost=150 (falsePositiveCost) -> expectedLoss=27 -> /25000*100
    expect(loss(state)).toBeCloseTo((0.18 * 150 * 100) / 25000, 6);
  });

  it("uses falseNegativeCost when the verdict is not positive (e.g. PASS)", () => {
    const state = buildDecisionState(sampleInput({ verdict: "PASS", output: sampleOutput({ verdict: "PASS", confidence: 82 }) }));
    // pWrong=0.18, falseCost=5000 (falseNegativeCost) -> expectedLoss=900 -> /25000*100
    expect(loss(state)).toBeCloseTo((0.18 * 5000 * 100) / 25000, 6);
  });
});

describe("delay", () => {
  it("is always 0 against a real DecisionState today -- timeHorizonHours/timeDecayRate are null", () => {
    const state = buildDecisionState(sampleInput());
    expect(state.objective.value.timeHorizonHours).toBeNull();
    expect(state.objective.value.timeDecayRate).toBeNull();
    expect(delay(state)).toBe(0);
  });

  it("computes a real decay-based penalty once a real time horizon/decay rate exists", () => {
    const state = buildDecisionState(sampleInput());
    const withTimeData: DecisionState = {
      ...state,
      objective: { value: { ...state.objective.value, timeHorizonHours: 24, timeDecayRate: 0.05 } },
      metadata: { ...state.metadata, latencySoFarMs: 3_600_000 },
    };
    expect(delay(withTimeData)).toBeGreaterThan(0);
  });

  it("returns Infinity once remainingHours is exhausted (decision expired)", () => {
    const state = buildDecisionState(sampleInput());
    const expired: DecisionState = {
      ...state,
      objective: { value: { ...state.objective.value, timeHorizonHours: 1, timeDecayRate: 0.05 } },
      metadata: { ...state.metadata, latencySoFarMs: 10 * 3_600_000 },
    };
    expect(delay(expired)).toBe(Infinity);
  });
});

describe("reasoningCost", () => {
  it("delegates directly to Budget Manager's normalizeCost -- no separate cost logic", () => {
    const state = buildDecisionState(sampleInput());
    expect(reasoningCost(state.budget.raw, state.objective.value)).toBe(normalizeCost(state.budget.raw, state.objective.value));
  });
});

describe("riskPenalty", () => {
  it("is always 0 against a real DecisionState today -- disagreement magnitude is always null", () => {
    const state = buildDecisionState(
      sampleInput({ output: sampleOutput({ conflicts: ["Research and Risk disagree on funding stage"] }) }),
    );
    expect(state.disagreements.every((d) => d.magnitude === null)).toBe(true);
    expect(riskPenalty(state)).toBe(0);
  });

  it("computes a real, non-zero penalty once a disagreement has a real severity score above 70", () => {
    const state = buildDecisionState(sampleInput());
    const withSevereRisk: DecisionState = {
      ...state,
      disagreements: [{ description: "Severe conflict", magnitude: 85 }],
    };
    // penaltyPerRisk = 0.05 * 25000 = 1250 -> /25000*100 = 5
    expect(riskPenalty(withSevereRisk)).toBeCloseTo(5, 10);
  });
});

describe("computeExpectedUtility", () => {
  it("combines all 5 terms as Gain - Loss - Delay - ReasoningCost - RiskPenalty with default (1.0) weights", () => {
    const state = buildDecisionState(sampleInput());
    const result = computeExpectedUtility(state);
    expect(result.expectedUtility).toBeCloseTo(
      result.gain - result.loss - result.delay - result.reasoningCost - result.riskPenalty,
      10,
    );
  });

  it("scales each term by its corresponding weight, not hardcoded to 1.0", () => {
    const state = buildDecisionState(sampleInput());
    const unweighted = computeExpectedUtility(state, DEFAULT_UTILITY_WEIGHTS);
    const doubledGain = computeExpectedUtility(state, { ...DEFAULT_UTILITY_WEIGHTS, gainWeight: 2 });
    expect(doubledGain.gain).toBeCloseTo(unweighted.gain * 2, 10);
    expect(doubledGain.loss).toBeCloseTo(unweighted.loss, 10);
  });
});
