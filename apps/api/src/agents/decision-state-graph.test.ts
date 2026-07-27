import { describe, expect, it } from "vitest";
import {
  appendState,
  createDecisionStateGraph,
  getCurrentState,
  getPath,
  getRootState,
  getStateAtVersion,
} from "./decision-state-graph.js";
import { buildDecisionState, computeTransitionHash, type BuildDecisionStateInput, type DecisionState } from "./decision-state.js";
import type { AgentDebateOutput } from "@argus/shared";

function sampleOutput(): AgentDebateOutput {
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

/** No real version-1 DecisionState exists anywhere (no Controller loop
 *  produces one) -- this builds a synthetic-but-contract-valid one from a
 *  real root, following appendState's own documented rules exactly, to
 *  prove the multi-version logic is correct ahead of real data existing. */
function buildSyntheticNextState(root: DecisionState): DecisionState {
  const transition = {
    fromVersion: 0,
    toVersion: 1,
    action: "run_fixed_pipeline" as const,
    timestamp: new Date().toISOString(),
    latencyMs: 1000,
    cost: { tokens: 100, latencyMs: 1000, costUsd: 0.01, reasoningDepth: 1 },
    rationale: "Synthetic test transition -- not a real Controller action.",
  };
  return {
    ...root,
    version: 1,
    parentStateId: root.transitionHash,
    transitionHash: computeTransitionHash(root.transitionHash, transition),
    transition,
  };
}

describe("createDecisionStateGraph", () => {
  it("builds a single-node graph from a real root state", () => {
    const root = buildDecisionState(sampleInput());
    const graph = createDecisionStateGraph(root);
    expect(graph.decisionId).toBe(root.id);
    expect(graph.states.size).toBe(1);
  });

  it("throws if given a non-root state (version != 0)", () => {
    const root = buildDecisionState(sampleInput());
    const next = buildSyntheticNextState(root);
    expect(() => createDecisionStateGraph(next)).toThrow(/requires a real root state/);
  });
});

describe("getRootState / getCurrentState / getStateAtVersion", () => {
  it("all agree on the single node in a fresh graph", () => {
    const root = buildDecisionState(sampleInput());
    const graph = createDecisionStateGraph(root);
    expect(getRootState(graph)).toEqual(root);
    expect(getCurrentState(graph)).toEqual(root);
    expect(getStateAtVersion(graph, 0)).toEqual(root);
    expect(getStateAtVersion(graph, 1)).toBeUndefined();
  });
});

describe("getPath", () => {
  it("returns [rootState] for getPath(0, 0) on a single-node graph", () => {
    const root = buildDecisionState(sampleInput());
    const graph = createDecisionStateGraph(root);
    expect(getPath(graph, 0, 0)).toEqual([root]);
  });

  it("throws when fromVersion > toVersion", () => {
    const root = buildDecisionState(sampleInput());
    const graph = createDecisionStateGraph(root);
    expect(() => getPath(graph, 1, 0)).toThrow(/fromVersion must be <= toVersion/);
  });

  it("throws when a version in range is missing", () => {
    const root = buildDecisionState(sampleInput());
    const graph = createDecisionStateGraph(root);
    expect(() => getPath(graph, 0, 1)).toThrow(/no state at version 1/);
  });

  it("returns the full real path once a second version has been appended", () => {
    const root = buildDecisionState(sampleInput());
    const graph = createDecisionStateGraph(root);
    const next = buildSyntheticNextState(root);
    const graph2 = appendState(graph, next);
    expect(getPath(graph2, 0, 1)).toEqual([root, next]);
  });
});

describe("appendState", () => {
  it("appends a valid next state and returns a NEW graph, immutably", () => {
    const root = buildDecisionState(sampleInput());
    const graph = createDecisionStateGraph(root);
    const next = buildSyntheticNextState(root);

    const graph2 = appendState(graph, next);

    expect(graph2).not.toBe(graph);
    expect(graph.states.size).toBe(1); // original untouched
    expect(getCurrentState(graph)).toEqual(root);
    expect(graph2.states.size).toBe(2);
    expect(getCurrentState(graph2)).toEqual(next);
  });

  it("rejects a state whose id doesn't match the graph's decisionId", () => {
    const root = buildDecisionState(sampleInput());
    const graph = createDecisionStateGraph(root);
    const next = { ...buildSyntheticNextState(root), id: "dec_wrong" };
    expect(() => appendState(graph, next)).toThrow(/doesn't match graph.decisionId/);
  });

  it("rejects a state whose version isn't exactly current + 1", () => {
    const root = buildDecisionState(sampleInput());
    const graph = createDecisionStateGraph(root);
    const next = { ...buildSyntheticNextState(root), version: 2 };
    expect(() => appendState(graph, next)).toThrow(/expected version 1, got 2/);
  });

  it("rejects a state whose parentStateId doesn't match the current state's transitionHash", () => {
    const root = buildDecisionState(sampleInput());
    const graph = createDecisionStateGraph(root);
    const next = { ...buildSyntheticNextState(root), parentStateId: "wrong-hash" };
    expect(() => appendState(graph, next)).toThrow(/parentStateId must equal/);
  });

  it("rejects a state whose transitionHash doesn't match computeTransitionHash", () => {
    const root = buildDecisionState(sampleInput());
    const graph = createDecisionStateGraph(root);
    const next = { ...buildSyntheticNextState(root), transitionHash: "wrong-hash" };
    expect(() => appendState(graph, next)).toThrow(/transitionHash doesn't match/);
  });
});
