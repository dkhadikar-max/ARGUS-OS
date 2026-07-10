import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppError } from "@argus/shared";

const createMock = vi.fn();

vi.mock("./claude-client.js", () => ({
  anthropic: { messages: { create: createMock } },
  CLAUDE_MODEL: "claude-sonnet-4-6",
}));

// Imported after the mock so orchestrator.ts picks up the mocked client.
const { runAgentDebate } = await import("./orchestrator.js");

function validOutputJson() {
  return JSON.stringify({
    research: {
      summary: "Solid fit.",
      data_points: [],
      unfair_advantages: [],
      hidden_risks: [],
      confidence: 80,
      data_gaps: [],
    },
    icp: { score: 80, criteria_evaluated: [], overall_assessment: "Good", edge_cases: [], confidence: 80 },
    intent: { score: 70, signals: [], trajectory: "stable", false_intent_flags: [], confidence: 75 },
    risk: {
      score: 10,
      risks: [],
      red_flags: [],
      time_waste_probability: 10,
      mitigation_strategies: [],
      confidence: 80,
    },
    judge: {
      verdict: "YES",
      confidence: 82,
      weighted_score: 78,
      agent_consensus: "high",
      conflicts: [],
      reasoning: "Good fit overall.",
      key_evidence: ["signal 1"],
      message: { linkedin: "Hi there", email: null, tone: "professional", personalization_hooks: [] },
      recommended_action: "message_now",
      confidence_explanation: "Data is solid.",
    },
  });
}

const sampleInput = {
  prospectData: {},
  teamIcp: null,
  companyMemory: null,
  intentSignals: null,
  historicalEngagement: [],
  teamHistory: [],
  userPreferences: null,
  teamPatterns: null,
};

beforeEach(() => {
  createMock.mockReset();
});

describe("runAgentDebate", () => {
  it("parses a valid single-call response into AgentDebateOutput", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: validOutputJson() }],
    });

    const { output } = await runAgentDebate(sampleInput);

    expect(output.judge.verdict).toBe("YES");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("strips ```json markdown fences defensively (Bible §8.2 says none should appear)", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "```json\n" + validOutputJson() + "\n```" }],
    });

    const { output } = await runAgentDebate(sampleInput);
    expect(output.judge.verdict).toBe("YES");
  });

  it("retries once on malformed JSON before succeeding", async () => {
    createMock
      .mockResolvedValueOnce({ content: [{ type: "text", text: "not json at all" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: validOutputJson() }] });

    const { output } = await runAgentDebate(sampleInput);

    expect(output.judge.verdict).toBe("YES");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("throws AI_UNAVAILABLE after exhausting retries", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "still not json" }] });

    await expect(runAgentDebate(sampleInput)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    } satisfies Partial<AppError>);
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
