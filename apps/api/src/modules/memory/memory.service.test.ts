import { describe, expect, it, vi, beforeEach } from "vitest";

const repo = {
  getCompanyMemory: vi.fn(),
  getMessageDraftsForTeam: vi.fn(),
  getDecisionsForRiskFlags: vi.fn(),
};
vi.mock("./memory.repository.js", () => repo);

const { getCompanyMemoryForTeam } = await import("./memory.service.js");

beforeEach(() => {
  vi.clearAllMocks();
  repo.getMessageDraftsForTeam.mockResolvedValue([]);
  repo.getDecisionsForRiskFlags.mockResolvedValue([]);
});

// A minimal but schema-valid agentDebateOutput -- only `risk.risks` varies
// per test below.
function agentOutputsWithRisks(risks: Array<{ category: string; severity: string; mitigation: string }>) {
  return {
    research: { summary: "s", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 80, data_gaps: [] },
    icp: { score: 80, criteria_evaluated: [], overall_assessment: "a", edge_cases: [], confidence: 80 },
    intent: { score: 80, signals: [], trajectory: "stable", false_intent_flags: [], confidence: 80 },
    risk: {
      score: 30,
      risks: risks.map((r) => ({ ...r, description: "d", evidence: "e" })),
      red_flags: [],
      time_waste_probability: 30,
      mitigation_strategies: [],
      confidence: 80,
    },
    judge: {
      verdict: "YES",
      confidence: 80,
      weighted_score: 80,
      agent_consensus: "high",
      conflicts: [],
      reasoning: "r",
      key_evidence: [],
      message: { linkedin: "m", email: null, tone: "professional", personalization_hooks: [] },
      recommended_action: "message_now",
      confidence_explanation: "c",
    },
  };
}

describe("getCompanyMemoryForTeam", () => {
  it("returns an empty-but-valid shape for a brand-new team with no CompanyMemory row (Bible §5.3 cold-start)", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result).toEqual({
      teamId: "team_1",
      generatedAt: expect.any(String),
      patterns: [],
      riskFlags: [],
      icpAccuracy: null,
      topPerformingMessages: [],
    });
  });

  it("maps the internal pattern shape to Bible §10.5's response shape", async () => {
    repo.getCompanyMemory.mockResolvedValue({
      teamId: "team_1",
      patterns: [
        {
          verdict: "STRONG_YES",
          description: "STRONG_YES decisions convert to meetings at 75% (n=12)",
          sampleSize: 12,
          meetingRate: 0.75,
          updatedAt: "2026-07-10T00:00:00.000Z",
        },
      ],
      riskFlags: [],
      icpHistory: [],
    });

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.patterns).toEqual([
      {
        id: "pattern-STRONG_YES",
        description: "STRONG_YES decisions convert to meetings at 75% (n=12)",
        evidence: "12 decisions, 9 meetings",
        confidence: 95, // 50 + 12*5 = 110, capped at 95
        type: "performance_pattern",
        createdAt: "2026-07-10T00:00:00.000Z",
      },
    ]);
  });

  it("scales pattern confidence with sample size, capped at 95", async () => {
    repo.getCompanyMemory.mockResolvedValue({
      patterns: [
        { verdict: "YES", description: "d", sampleSize: 2, meetingRate: 0.5, updatedAt: "2026-07-10T00:00:00.000Z" },
      ],
    });

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.patterns[0]?.confidence).toBe(60); // 50 + 2*5
  });

  it("always returns icpAccuracy honestly null (not yet computed anywhere)", async () => {
    repo.getCompanyMemory.mockResolvedValue({ patterns: [], riskFlags: [{ fake: "flag" }], icpHistory: [] });

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.icpAccuracy).toBeNull();
  });
});

describe("getCompanyMemoryForTeam — topPerformingMessages", () => {
  it("returns an empty array when no message drafts have a logged outcome yet", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getMessageDraftsForTeam.mockResolvedValue([
      { personalizationHooks: ["K8s scaling post"], decision: { outcome: null } },
    ]);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.topPerformingMessages).toEqual([]);
  });

  it("groups by the exact personalization hook string across drafts and computes a reply rate (Bible §10.5's own worked example shape)", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getMessageDraftsForTeam.mockResolvedValue([
      { personalizationHooks: ["K8s scaling post"], decision: { outcome: { type: "MEETING_BOOKED" } } },
      { personalizationHooks: ["K8s scaling post"], decision: { outcome: { type: "REPLIED_NO_MEETING" } } },
      { personalizationHooks: ["K8s scaling post"], decision: { outcome: { type: "NO_RESPONSE" } } },
    ]);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.topPerformingMessages).toEqual([
      { pattern: "K8s scaling post", replyRate: 2 / 3, sampleSize: 3 },
    ]);
  });

  it("excludes hooks below the minimum sample size so a single lucky message can't look like a top performer", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getMessageDraftsForTeam.mockResolvedValue([
      { personalizationHooks: ["Rare hook"], decision: { outcome: { type: "MEETING_BOOKED" } } },
    ]);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.topPerformingMessages).toEqual([]);
  });

  it("treats CLOSED_LOST/DISQUALIFIED/SNOOZED as not-a-reply, not as a positive signal", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getMessageDraftsForTeam.mockResolvedValue([
      { personalizationHooks: ["Series B stage"], decision: { outcome: { type: "CLOSED_LOST" } } },
      { personalizationHooks: ["Series B stage"], decision: { outcome: { type: "DISQUALIFIED" } } },
      { personalizationHooks: ["Series B stage"], decision: { outcome: { type: "SNOOZED" } } },
    ]);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.topPerformingMessages).toEqual([
      { pattern: "Series B stage", replyRate: 0, sampleSize: 3 },
    ]);
  });

  it("sorts by reply rate descending and caps at 10 results", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    // 12 distinct hooks, each with 3 drafts (meets MIN_SAMPLE_SIZE) and an
    // increasing number of replies -- hook-0 has 0/3 replies, hook-11 has
    // (a capped) 3/3, so there's a clear, unambiguous ranking to assert on.
    const drafts: Array<{ personalizationHooks: string[]; decision: { outcome: { type: string } | null } }> = [];
    for (let i = 0; i < 12; i += 1) {
      const repliedCount = Math.min(i, 3);
      for (let j = 0; j < 3; j += 1) {
        drafts.push({
          personalizationHooks: [`hook-${i}`],
          decision: { outcome: { type: j < repliedCount ? "MEETING_BOOKED" : "NO_RESPONSE" } },
        });
      }
    }
    repo.getMessageDraftsForTeam.mockResolvedValue(drafts);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.topPerformingMessages).toHaveLength(10);
    for (let i = 1; i < result.topPerformingMessages.length; i += 1) {
      expect(result.topPerformingMessages[i - 1]!.replyRate).toBeGreaterThanOrEqual(
        result.topPerformingMessages[i]!.replyRate,
      );
    }
  });
});

describe("getCompanyMemoryForTeam — riskFlags", () => {
  it("returns an empty array when no decisions have a parseable risk assessment yet", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getDecisionsForRiskFlags.mockResolvedValue([
      { agentOutputs: null, outcome: null },
      { agentOutputs: { not: "valid" }, outcome: null },
    ]);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.riskFlags).toEqual([]);
  });

  it("normalizes a risk category into one of the Risk Agent's own 6 themes, keyed off its keywords", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getDecisionsForRiskFlags.mockResolvedValue([
      { agentOutputs: agentOutputsWithRisks([{ category: "No budget confirmed", severity: "moderate", mitigation: "Ask about budget in first call" }]), outcome: null },
      { agentOutputs: agentOutputsWithRisks([{ category: "Budget constraints unclear", severity: "minor", mitigation: "Confirm budget range" }]), outcome: null },
      { agentOutputs: agentOutputsWithRisks([{ category: "Tight budget cycle", severity: "moderate", mitigation: "Time outreach to fiscal year" }]), outcome: null },
    ]);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.riskFlags).toHaveLength(1);
    expect(result.riskFlags[0]?.condition).toBe("Budget");
    expect(result.riskFlags[0]?.occurrenceRate).toBe(1); // all 3 assessed decisions had a Budget-themed risk
  });

  it("falls back to the raw category text when no known theme keyword matches", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getDecisionsForRiskFlags.mockResolvedValue([
      { agentOutputs: agentOutputsWithRisks([{ category: "Unusual procurement process", severity: "moderate", mitigation: "m" }]), outcome: null },
      { agentOutputs: agentOutputsWithRisks([{ category: "Unusual procurement process", severity: "moderate", mitigation: "m" }]), outcome: null },
      { agentOutputs: agentOutputsWithRisks([{ category: "Unusual procurement process", severity: "moderate", mitigation: "m" }]), outcome: null },
    ]);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.riskFlags[0]?.condition).toBe("Unusual procurement process");
  });

  it("excludes categories below the minimum sample size", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getDecisionsForRiskFlags.mockResolvedValue([
      { agentOutputs: agentOutputsWithRisks([{ category: "Budget", severity: "moderate", mitigation: "m" }]), outcome: null },
      { agentOutputs: agentOutputsWithRisks([{ category: "Budget", severity: "moderate", mitigation: "m" }]), outcome: null },
    ]);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.riskFlags).toEqual([]);
  });

  it("computes falsePositiveRate from decisions where the flagged category still led to a reply", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getDecisionsForRiskFlags.mockResolvedValue([
      { agentOutputs: agentOutputsWithRisks([{ category: "Authority", severity: "moderate", mitigation: "m" }]), outcome: { type: "MEETING_BOOKED" } },
      { agentOutputs: agentOutputsWithRisks([{ category: "Authority", severity: "moderate", mitigation: "m" }]), outcome: { type: "NO_RESPONSE" } },
      { agentOutputs: agentOutputsWithRisks([{ category: "Authority", severity: "moderate", mitigation: "m" }]), outcome: null },
    ]);

    const result = await getCompanyMemoryForTeam("team_1");

    // 2 of 3 occurrences have a logged outcome; 1 of those 2 still replied.
    expect(result.riskFlags[0]?.falsePositiveRate).toBe(0.5);
  });

  it("takes the highest severity seen across occurrences of the same category", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getDecisionsForRiskFlags.mockResolvedValue([
      { agentOutputs: agentOutputsWithRisks([{ category: "Timing", severity: "minor", mitigation: "m" }]), outcome: null },
      { agentOutputs: agentOutputsWithRisks([{ category: "Timing", severity: "dealbreaker", mitigation: "m" }]), outcome: null },
      { agentOutputs: agentOutputsWithRisks([{ category: "Timing", severity: "moderate", mitigation: "m" }]), outcome: null },
    ]);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.riskFlags[0]?.severity).toBe("dealbreaker");
  });

  it("counts a category once per decision even if it appears twice in the same decision's risk list", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);
    repo.getDecisionsForRiskFlags.mockResolvedValue([
      {
        agentOutputs: agentOutputsWithRisks([
          { category: "Competition", severity: "moderate", mitigation: "m" },
          { category: "Competitive displacement", severity: "moderate", mitigation: "m" },
        ]),
        outcome: null,
      },
      { agentOutputs: agentOutputsWithRisks([{ category: "Competition", severity: "moderate", mitigation: "m" }]), outcome: null },
      { agentOutputs: agentOutputsWithRisks([{ category: "Competition", severity: "moderate", mitigation: "m" }]), outcome: null },
    ]);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.riskFlags).toHaveLength(1);
    expect(result.riskFlags[0]?.occurrenceRate).toBe(1); // 3 decisions, not 4 risk-item occurrences
  });
});
