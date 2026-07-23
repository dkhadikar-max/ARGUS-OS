import { describe, expect, it, vi, beforeEach } from "vitest";

const prisma = { decision: { findMany: vi.fn() } };
vi.mock("@argus/database", () => ({ prisma }));

const { getHistoricalPairDisagreementRates } = await import("./pair-frequency.repository.js");

function agentOutputs(overrides: { icpScore?: number; intentScore?: number; timeWasteProbability?: number } = {}) {
  return {
    research: { summary: "s", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 80, data_gaps: [] },
    icp: {
      score: overrides.icpScore ?? 80,
      criteria_evaluated: [],
      overall_assessment: "Good",
      edge_cases: [],
      confidence: 80,
    },
    intent: {
      score: overrides.intentScore ?? 75,
      signals: [],
      trajectory: "stable",
      false_intent_flags: [],
      confidence: 75,
    },
    risk: {
      score: 20,
      risks: [],
      red_flags: [],
      time_waste_probability: overrides.timeWasteProbability ?? 15,
      mitigation_strategies: [],
      confidence: 80,
    },
    judge: {
      verdict: "YES",
      confidence: 80,
      weighted_score: 78,
      agent_consensus: "high",
      conflicts: [],
      reasoning: "r",
      key_evidence: [],
      message: { linkedin: "hi", email: null, tone: "professional", personalization_hooks: [] },
      recommended_action: "message_now",
      confidence_explanation: "c",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getHistoricalPairDisagreementRates", () => {
  it("returns the default 0.10 prior for every pair when there's no history", async () => {
    prisma.decision.findMany.mockResolvedValue([]);

    const rates = await getHistoricalPairDisagreementRates("team_1");

    expect(rates).toEqual({ icp_intent: 0.1, icp_risk: 0.1, intent_risk: 0.1 });
  });

  it("computes the disagreement rate as disagreements / total for a pair", async () => {
    // 4 decisions: icp/intent disagree in 1 of them (icp positive, intent negative).
    prisma.decision.findMany.mockResolvedValue([
      { agentOutputs: agentOutputs({ icpScore: 90, intentScore: 20 }) }, // icp positive, intent negative -> disagree
      { agentOutputs: agentOutputs({ icpScore: 90, intentScore: 85 }) }, // both positive -> agree
      { agentOutputs: agentOutputs({ icpScore: 90, intentScore: 88 }) }, // both positive -> agree
      { agentOutputs: agentOutputs({ icpScore: 90, intentScore: 82 }) }, // both positive -> agree
    ]);

    const rates = await getHistoricalPairDisagreementRates("team_1");

    expect(rates["icp_intent"]).toBeCloseTo(0.25);
  });

  it("skips rows whose agentOutputs fails schema validation instead of counting them", async () => {
    prisma.decision.findMany.mockResolvedValue([
      { agentOutputs: agentOutputs() },
      { agentOutputs: { not: "a valid debate output" } },
      { agentOutputs: null },
    ]);

    const rates = await getHistoricalPairDisagreementRates("team_1");

    // Only the one valid row counts toward the total.
    expect(rates["icp_intent"]).toBe(0); // the one valid row has icp/intent both positive -> no disagreement
  });
});
