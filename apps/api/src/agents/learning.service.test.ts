import { describe, expect, it, vi, beforeEach } from "vitest";

const createMock = vi.fn();
vi.mock("./claude-client.js", () => ({
  anthropic: { messages: { create: createMock } },
  CLAUDE_MODEL: "claude-sonnet-4-6",
}));

const getTeamOutcomeHistory = vi.fn();
vi.mock("../modules/decisions/decision.repository.js", () => ({ getTeamOutcomeHistory }));

const getIcp = vi.fn();
vi.mock("../modules/icp/icp.repository.js", () => ({ getIcp }));

const upsertLearningInsights = vi.fn();
vi.mock("../modules/memory/memory.repository.js", () => ({ upsertLearningInsights }));

const createLearningRecommendation = vi.fn();
vi.mock("../modules/learning-recommendations/learning-recommendation.repository.js", () => ({
  createLearningRecommendation,
}));

const { runLearningAgent } = await import("./learning.service.js");

function validReportToolUse() {
  return {
    type: "tool_use" as const,
    id: "toolu_1",
    name: "submit_learning_report",
    input: {
      accuracy_by_verdict: { STRONG_YES: 90, YES: 70 },
      systematic_errors: [],
      patterns: [],
      prompt_adjustments: [],
      icp_recommendations: [],
      priority: "medium",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getIcp.mockResolvedValue(null);
  createLearningRecommendation.mockResolvedValue({ id: "rec_1" });
});

describe("runLearningAgent", () => {
  it("returns null without calling Claude when the team has no decisions with outcomes", async () => {
    getTeamOutcomeHistory.mockResolvedValue([]);
    const result = await runLearningAgent("team_1");
    expect(result).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("parses a valid tool_use response and stores it on CompanyMemory", async () => {
    getTeamOutcomeHistory.mockResolvedValue([
      { verdict: "STRONG_YES", confidence: 90, weightedScore: 95, outcome: { type: "MEETING_BOOKED" } },
    ]);
    createMock.mockResolvedValueOnce({ content: [validReportToolUse()] });

    const result = await runLearningAgent("team_1");

    expect(result?.priority).toBe("medium");
    expect(upsertLearningInsights).toHaveBeenCalledWith(
      "team_1",
      expect.objectContaining({ priority: "medium", generatedAt: expect.any(String) }),
    );
  });

  it("retries once on a malformed tool_use input before succeeding", async () => {
    getTeamOutcomeHistory.mockResolvedValue([
      { verdict: "YES", confidence: 70, weightedScore: 75, outcome: { type: "NO_RESPONSE" } },
    ]);
    createMock
      .mockResolvedValueOnce({ content: [{ type: "tool_use", id: "toolu_bad", name: "submit_learning_report", input: { not: "valid" } }] })
      .mockResolvedValueOnce({ content: [validReportToolUse()] });

    const result = await runLearningAgent("team_1");

    expect(result?.priority).toBe("medium");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("returns null (not a thrown error) after exhausting retries", async () => {
    getTeamOutcomeHistory.mockResolvedValue([
      { verdict: "YES", confidence: 70, weightedScore: 75, outcome: { type: "NO_RESPONSE" } },
    ]);
    createMock.mockResolvedValue({
      content: [{ type: "tool_use", id: "toolu_bad", name: "submit_learning_report", input: { not: "valid" } }],
    });

    const result = await runLearningAgent("team_1");

    expect(result).toBeNull();
    expect(upsertLearningInsights).not.toHaveBeenCalled();
  });

  // v4 roadmap Phase 8 (Learning Wiring) -- additive alongside the existing
  // CompanyMemory.learningInsights write above, not instead of it.
  describe("Learning recommendation creation", () => {
    it("creates one ICP recommendation row per icp_recommendations string", async () => {
      getTeamOutcomeHistory.mockResolvedValue([
        { verdict: "STRONG_YES", confidence: 90, weightedScore: 95, outcome: { type: "MEETING_BOOKED" } },
      ]);
      createMock.mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "submit_learning_report",
            input: {
              accuracy_by_verdict: {},
              systematic_errors: [],
              patterns: [],
              prompt_adjustments: [],
              icp_recommendations: ["Lower minimum_size from 10 to 5", "Drop the funding-stage criterion"],
              priority: "medium",
            },
          },
        ],
      });

      await runLearningAgent("team_1");

      expect(createLearningRecommendation).toHaveBeenCalledWith({
        teamId: "team_1",
        targetSubsystem: "ICP",
        rationale: "Lower minimum_size from 10 to 5",
      });
      expect(createLearningRecommendation).toHaveBeenCalledWith({
        teamId: "team_1",
        targetSubsystem: "ICP",
        rationale: "Drop the funding-stage criterion",
      });
    });

    it("creates one PROMPTS recommendation row per prompt_adjustments entry, with the full entry as suggestedChange", async () => {
      getTeamOutcomeHistory.mockResolvedValue([
        { verdict: "STRONG_YES", confidence: 90, weightedScore: 95, outcome: { type: "MEETING_BOOKED" } },
      ]);
      const adjustment = {
        agent: "risk",
        current: "Be paranoid but fair",
        suggested: "Weight budget-freeze signals higher",
        reason: "Risk agent under-weighted budget freezes in 8 of 10 missed HARD_PASS calls",
      };
      createMock.mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "submit_learning_report",
            input: {
              accuracy_by_verdict: {},
              systematic_errors: [],
              patterns: [],
              prompt_adjustments: [adjustment],
              icp_recommendations: [],
              priority: "medium",
            },
          },
        ],
      });

      await runLearningAgent("team_1");

      expect(createLearningRecommendation).toHaveBeenCalledWith({
        teamId: "team_1",
        targetSubsystem: "PROMPTS",
        rationale: adjustment.reason,
        suggestedChange: adjustment,
      });
    });

    it("is best-effort: a recommendation-creation failure doesn't fail the learning run", async () => {
      getTeamOutcomeHistory.mockResolvedValue([
        { verdict: "STRONG_YES", confidence: 90, weightedScore: 95, outcome: { type: "MEETING_BOOKED" } },
      ]);
      createMock.mockResolvedValueOnce({
        content: [
          {
            ...validReportToolUse(),
            input: { ...validReportToolUse().input, icp_recommendations: ["Some suggestion"] },
          },
        ],
      });
      createLearningRecommendation.mockRejectedValue(new Error("db unavailable"));

      const result = await runLearningAgent("team_1");

      expect(result?.priority).toBe("medium");
      expect(upsertLearningInsights).toHaveBeenCalled();
    });
  });
});
