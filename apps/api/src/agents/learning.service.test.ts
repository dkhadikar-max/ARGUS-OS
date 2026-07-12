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
});
