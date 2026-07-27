import { describe, expect, it } from "vitest";
import {
  buildDecisionState,
  buildInterimDecisionState,
  computeTransitionHash,
  type BuildDecisionStateInput,
  type BuildInterimDecisionStateInput,
} from "./decision-state.js";
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

  it("computes real RawCost -- tokens/costUsd from usage, reasoningDepth defaults to 5", () => {
    const state = buildDecisionState(sampleInput());
    expect(state.budget.raw.tokens).toBe(1500);
    expect(state.budget.raw.latencyMs).toBe(82000);
    expect(state.budget.raw.reasoningDepth).toBe(5);
    expect(state.budget.raw.costUsd).toBeGreaterThan(0);
  });

  it("respects an explicit reasoningDepth override -- Execution Runtime v1's invoke_capability path passes 6", () => {
    const state = buildDecisionState(sampleInput({ reasoningDepth: 6 }));
    expect(state.budget.raw.reasoningDepth).toBe(6);
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

function sampleInterimInput(overrides: Partial<BuildInterimDecisionStateInput> = {}): BuildInterimDecisionStateInput {
  return {
    decisionId: "exec_1",
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
    stageOutputs: {
      research: { summary: "s", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 80, data_gaps: [] },
      icp: { score: 80, criteria_evaluated: [], overall_assessment: "Good", edge_cases: [], confidence: 70 },
      intent: { score: 75, signals: [], trajectory: "stable", false_intent_flags: [], confidence: 75 },
      risk: { score: 20, risks: [], red_flags: [], time_waste_probability: 15, mitigation_strategies: [], confidence: 75 },
    },
    usage: { inputTokens: 800, outputTokens: 400 },
    processingTimeMs: 45000,
    reasoningDepth: 4,
    ...overrides,
  };
}

describe("buildInterimDecisionState", () => {
  it("is version 0 with no parent by default -- a real checkpoint root", () => {
    const state = buildInterimDecisionState(sampleInterimInput());
    expect(state.version).toBe(0);
    expect(state.parentStateId).toBeNull();
  });

  it("derives confidence.overall as the real mean of whatever stage confidences are present", () => {
    const state = buildInterimDecisionState(sampleInterimInput());
    expect(state.confidence.overall).toBeCloseTo((80 + 70 + 75 + 75) / 4, 10);
  });

  it("returns 0 confidence.overall when genuinely no stage has completed yet", () => {
    const state = buildInterimDecisionState(sampleInterimInput({ stageOutputs: {} }));
    expect(state.confidence.overall).toBe(0);
  });

  it("derives a low agentConsensus proxy from a wide spread between real stage confidences", () => {
    const state = buildInterimDecisionState(
      sampleInterimInput({
        stageOutputs: {
          research: { summary: "s", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 95, data_gaps: [] },
          risk: { score: 20, risks: [], red_flags: [], time_waste_probability: 15, mitigation_strategies: [], confidence: 10 },
        },
      }),
    );
    expect(state.confidence.agentConsensus).toBe("low");
  });

  it("uses an explicit, documented WAIT/0 verdict placeholder, never a fabricated real one", () => {
    const state = buildInterimDecisionState(sampleInterimInput());
    expect(state.verdict).toEqual({ label: "WAIT", confidence: 0 });
  });

  it("leaves disagreements honestly empty -- Judge's conflicts don't exist yet", () => {
    const state = buildInterimDecisionState(sampleInterimInput());
    expect(state.disagreements).toEqual([]);
  });

  it("uses the given reasoningDepth for RawCost, not a hardcoded constant", () => {
    const state = buildInterimDecisionState(sampleInterimInput({ reasoningDepth: 4 }));
    expect(state.budget.raw.reasoningDepth).toBe(4);
  });

  it("chains onto a real parent when given one, matching decision-state-graph.ts's own convention", () => {
    const root = buildInterimDecisionState(sampleInterimInput());
    const child = buildInterimDecisionState(
      sampleInterimInput({
        reasoningDepth: 5,
        parent: { version: root.version, transitionHash: root.transitionHash },
        transitionAction: "invoke_capability",
      }),
    );
    expect(child.version).toBe(1);
    expect(child.parentStateId).toBe(root.transitionHash);
    expect(child.transitionHash).toBe(computeTransitionHash(root.transitionHash, child.transition));
    expect(child.transition.action).toBe("invoke_capability");
  });
});
