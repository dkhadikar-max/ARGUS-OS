import { describe, expect, it, vi, beforeEach } from "vitest";

const prisma = { decision: { findMany: vi.fn() } };
vi.mock("@argus/database", () => ({ prisma }));

const getHistoricalPairDisagreementRates = vi.fn();
vi.mock("../conflict/pair-frequency.repository.js", () => ({
  getHistoricalPairDisagreementRates,
  CONFLICT_PAIRS: [
    ["icp", "intent"],
    ["icp", "risk"],
    ["intent", "risk"],
  ],
}));

const { getLabeledDecisionsForTeam } = await import("./complexity-training-data.repository.js");

function agentOutputs(overrides: { icpScore?: number; intentScore?: number; timeWasteProbability?: number } = {}) {
  return {
    research: { summary: "s", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 80, data_gaps: [] },
    icp: { score: overrides.icpScore ?? 80, criteria_evaluated: [], overall_assessment: "Good", edge_cases: [], confidence: 80 },
    intent: { score: overrides.intentScore ?? 75, signals: [], trajectory: "stable", false_intent_flags: [], confidence: 75 },
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
  getHistoricalPairDisagreementRates.mockResolvedValue({ icp_intent: 0.1, icp_risk: 0.1, intent_risk: 0.1 });
});

describe("getLabeledDecisionsForTeam", () => {
  it("queries only decisions with a logged outcome", async () => {
    prisma.decision.findMany.mockResolvedValue([]);

    await getLabeledDecisionsForTeam("team_1");

    expect(prisma.decision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: "team_1", outcome: { isNot: null } } }),
    );
  });

  it("labels a PASS + NO_RESPONSE decision as correct", async () => {
    prisma.decision.findMany.mockResolvedValue([
      { verdict: "PASS", agentOutputs: agentOutputs(), outcome: { type: "NO_RESPONSE" } },
    ]);

    const labeled = await getLabeledDecisionsForTeam("team_1");

    expect(labeled).toHaveLength(1);
    expect(labeled[0]?.correctness).toBe("correct");
  });

  it("excludes ambiguous verdict/outcome pairs (e.g. WAIT) entirely", async () => {
    prisma.decision.findMany.mockResolvedValue([
      { verdict: "WAIT", agentOutputs: agentOutputs(), outcome: { type: "CLOSED_WON" } },
    ]);

    const labeled = await getLabeledDecisionsForTeam("team_1");

    expect(labeled).toHaveLength(0);
  });

  it("skips rows with a null outcome even if the query somehow returns one", async () => {
    prisma.decision.findMany.mockResolvedValue([{ verdict: "PASS", agentOutputs: agentOutputs(), outcome: null }]);

    const labeled = await getLabeledDecisionsForTeam("team_1");

    expect(labeled).toHaveLength(0);
  });

  it("skips rows whose agentOutputs fails schema validation", async () => {
    prisma.decision.findMany.mockResolvedValue([
      { verdict: "PASS", agentOutputs: { not: "valid" }, outcome: { type: "NO_RESPONSE" } },
    ]);

    const labeled = await getLabeledDecisionsForTeam("team_1");

    expect(labeled).toHaveLength(0);
  });

  it("computes real features (not zeros) from the parsed agent scores", async () => {
    prisma.decision.findMany.mockResolvedValue([
      {
        verdict: "STRONG_YES",
        agentOutputs: agentOutputs({ icpScore: 95, intentScore: 10, timeWasteProbability: 10 }),
        outcome: { type: "CLOSED_WON" },
      },
    ]);

    const labeled = await getLabeledDecisionsForTeam("team_1");

    expect(labeled).toHaveLength(1);
    expect(labeled[0]?.features.directional).toBe(1); // icp positive, intent negative
    expect(labeled[0]?.features.cv).toBeGreaterThan(0);
  });
});
