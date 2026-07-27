import { describe, expect, it } from "vitest";
import { decide, DEFAULT_CONTROLLER_POLICY, DEFAULT_ESCALATION_THRESHOLDS, type ControllerPolicy } from "./controller.js";
import { computeExpectedUtility, DEFAULT_UTILITY_WEIGHTS } from "./expected-utility.js";
import { buildDecisionState, type BuildDecisionStateInput } from "./decision-state.js";
import { deriveBudgetSnapshot, type BudgetSnapshot } from "./budget-manager.js";
import type { CapabilityOutput, CapabilityOutputsByStage } from "./reasoning-capability.js";
import type { AgentDebateOutput } from "@argus/shared";
import type { Evidence } from "@argus/database";

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

// Ample on every dimension -- isolates the confidence/capability branches
// from the budget-exhaustion branch in tests that aren't about budget.
const ampleBudget: BudgetSnapshot = { remainingReasoning: 3, remainingLatency: Number.POSITIVE_INFINITY, remainingCost: 100 };
const exhaustedBudget: BudgetSnapshot = { remainingReasoning: 0, remainingLatency: Number.POSITIVE_INFINITY, remainingCost: 100 };

function capabilityOutput(confidence: number, capabilityId = "x"): CapabilityOutput<Evidence[]> {
  return {
    capabilityId,
    outputs: [],
    confidence,
    evidenceProduced: [],
    disagreements: [],
    cost: { tokens: 0, latencyMs: 0, costUsd: 0, reasoningDepth: 0 },
    latencyMs: 0,
  };
}

const highValuePolicy: ControllerPolicy = {
  ...DEFAULT_CONTROLLER_POLICY,
  escalationThresholds: { highValueEscalationThreshold: 1000 },
};

describe("decide", () => {
  it("always returns stop against a real DecisionState today -- deriveBudgetSnapshot's remainingReasoning is always 0", () => {
    const state = buildDecisionState(sampleInput());
    const budget = deriveBudgetSnapshot(state.budget.raw, state.objective.value, 0);
    expect(budget.remainingReasoning).toBe(0);
    expect(decide(state, budget, undefined).action).toBe("stop");
  });

  it("escalates when baseValue exceeds the threshold and agentConsensus is low (stuck proxy)", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ agent_consensus: "low" }) }));
    expect(decide(state, ampleBudget, undefined, highValuePolicy).action).toBe("escalate");
  });

  it("escalates when baseValue exceeds the threshold and there is any real disagreement, even with high consensus", () => {
    const state = buildDecisionState(
      sampleInput({ output: sampleOutput({ agent_consensus: "high", conflicts: ["Research and Risk disagree"] }) }),
    );
    expect(decide(state, ampleBudget, undefined, highValuePolicy).action).toBe("escalate");
  });

  it("does not escalate when high-value but not stuck (high consensus, no disagreements)", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ agent_consensus: "high", conflicts: [] }) }));
    expect(decide(state, ampleBudget, undefined, highValuePolicy).action).toBe("stop");
  });

  it("escalates even when budget is exhausted -- a stuck high-value decision needs a human regardless of remaining budget", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ agent_consensus: "low" }) }));
    expect(decide(state, exhaustedBudget, undefined, highValuePolicy).action).toBe("escalate");
  });

  it("escalation reasons cite the real threshold and consensus values it used", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ agent_consensus: "low" }) }));
    const result = decide(state, ampleBudget, undefined, highValuePolicy);
    expect(result.reasons.join(" ")).toContain("1000");
    expect(result.reasons.join(" ")).toContain("low");
  });

  it("stops when budget is exhausted, even with low confidence and an identifiable weak capability", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ confidence: 42 }) }));
    const capabilityOutputs: CapabilityOutputsByStage = { risk: capabilityOutput(18, "risk") };
    const result = decide(state, exhaustedBudget, capabilityOutputs);
    expect(result.action).toBe("stop");
    expect(result.reasons.join(" ")).toContain("Budget exhausted");
  });

  it("stops when confidence meets confidenceThreshold, even with ample budget", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ confidence: 82 }) }));
    const result = decide(state, ampleBudget, undefined);
    expect(result.action).toBe("stop");
    expect(result.reasons.join(" ")).toContain("confidenceThreshold");
  });

  it("invokes the weakest capability when confidence is low, budget remains, and one capability is clearly below capabilityConfidenceThreshold", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ confidence: 42 }) }));
    const capabilityOutputs: CapabilityOutputsByStage = {
      research: capabilityOutput(90, "research"),
      icp: capabilityOutput(85, "icp"),
      risk: capabilityOutput(18, "risk"),
    };
    const result = decide(state, ampleBudget, capabilityOutputs);
    expect(result.action).toBe("invoke_capability");
    expect(result.targetCapability).toBe("risk");
    expect(result.reasons.join(" ")).toContain("risk");
  });

  it("continues (no target) when confidence is low but every provided capability individually clears its own threshold", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ confidence: 42 }) }));
    const capabilityOutputs: CapabilityOutputsByStage = {
      research: capabilityOutput(90, "research"),
      icp: capabilityOutput(85, "icp"),
      risk: capabilityOutput(60, "risk"),
    };
    const result = decide(state, ampleBudget, capabilityOutputs);
    expect(result.action).toBe("continue");
    expect(result.targetCapability).toBeUndefined();
    expect(result.reasons.join(" ")).toContain("synthesis");
  });

  it("continues (no target) when confidence is low and no capability-level output was provided at all", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ confidence: 42 }) }));
    const result = decide(state, ampleBudget, undefined);
    expect(result.action).toBe("continue");
    expect(result.targetCapability).toBeUndefined();
    expect(result.reasons.join(" ")).toContain("No capability-level output was provided");
  });

  it("is deterministic -- the same inputs always produce the same ControllerDecision", () => {
    const state = buildDecisionState(sampleInput({ output: sampleOutput({ confidence: 42 }) }));
    const capabilityOutputs: CapabilityOutputsByStage = { risk: capabilityOutput(18, "risk") };
    const first = decide(state, ampleBudget, capabilityOutputs);
    const second = decide(state, ampleBudget, capabilityOutputs);
    expect(second).toEqual(first);
  });

  it("always includes a real utilityEstimate, computed with the policy's own weights", () => {
    const state = buildDecisionState(sampleInput());
    const result = decide(state, ampleBudget, undefined, DEFAULT_CONTROLLER_POLICY);
    expect(result.utilityEstimate).toBe(computeExpectedUtility(state, DEFAULT_CONTROLLER_POLICY.weights).expectedUtility);
  });

  it("respects custom weights passed via the policy, not hardcoded defaults", () => {
    const state = buildDecisionState(sampleInput());
    const customPolicy: ControllerPolicy = { ...DEFAULT_CONTROLLER_POLICY, weights: { ...DEFAULT_UTILITY_WEIGHTS, gainWeight: 3 } };
    const result = decide(state, ampleBudget, undefined, customPolicy);
    expect(result.utilityEstimate).toBe(computeExpectedUtility(state, customPolicy.weights).expectedUtility);
    expect(result.utilityEstimate).not.toBe(computeExpectedUtility(state, DEFAULT_UTILITY_WEIGHTS).expectedUtility);
  });
});

describe("DEFAULT_CONTROLLER_POLICY", () => {
  it("is honestly untrained -- no real tuning data exists yet", () => {
    expect(DEFAULT_CONTROLLER_POLICY.version).toBe(0);
    expect(DEFAULT_CONTROLLER_POLICY.trainedOn).toBeNull();
    expect(DEFAULT_CONTROLLER_POLICY.weights).toEqual(DEFAULT_UTILITY_WEIGHTS);
    expect(DEFAULT_CONTROLLER_POLICY.escalationThresholds).toEqual(DEFAULT_ESCALATION_THRESHOLDS);
    expect(DEFAULT_CONTROLLER_POLICY.confidenceThreshold).toBe(70);
    expect(DEFAULT_CONTROLLER_POLICY.capabilityConfidenceThreshold).toBe(50);
  });
});
