import { describe, expect, it, vi, beforeEach } from "vitest";

const callAgent = vi.fn();
vi.mock("../orchestrator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../orchestrator.js")>();
  return { ...actual, callAgent };
});

const { runAgentDebateWithModelRouting, HAIKU_MODEL } = await import("./model-routing-orchestrator.js");
const { CLAUDE_MODEL } = await import("../claude-client.js");

const sampleInput = {
  prospectData: {},
  teamIcp: null,
  companyMemory: null,
  intentSignals: null,
  historicalEngagement: [],
  teamHistory: [],
  userPreferences: null,
  teamPatterns: null,
  companyContext: null,
};

function outputsByToolName(): Record<string, unknown> {
  return {
    submit_research: { summary: "s", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 80, data_gaps: [] },
    submit_icp: { score: 80, criteria_evaluated: [], overall_assessment: "Good", edge_cases: [], confidence: 80 },
    submit_intent: { score: 75, signals: [], trajectory: "stable", false_intent_flags: [], confidence: 75 },
    submit_risk: {
      score: 20,
      risks: [],
      red_flags: [],
      time_waste_probability: 15,
      mitigation_strategies: [],
      confidence: 80,
    },
    submit_judge: {
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const outputs = outputsByToolName();
  callAgent.mockImplementation(
    async (_system: string, _prompt: string, tool: { name: string }, _schema: unknown, _maxTokens: number, usage: { inputTokens: number; outputTokens: number }) => {
      usage.inputTokens += 100;
      usage.outputTokens += 100;
      return outputs[tool.name];
    },
  );
});

describe("runAgentDebateWithModelRouting", () => {
  it("uses the default CLAUDE_MODEL for every stage when no overrides are given", async () => {
    await runAgentDebateWithModelRouting(sampleInput, {});

    for (const call of callAgent.mock.calls) {
      expect(call[6]).toBe(CLAUDE_MODEL); // 7th positional arg: model
    }
    expect(callAgent).toHaveBeenCalledTimes(5);
  });

  it("routes only the overridden agent to Haiku, leaving the rest on the default model", async () => {
    await runAgentDebateWithModelRouting(sampleInput, { research: HAIKU_MODEL });

    const researchCall = callAgent.mock.calls.find((c) => (c[2] as { name: string }).name === "submit_research");
    const icpCall = callAgent.mock.calls.find((c) => (c[2] as { name: string }).name === "submit_icp");
    const judgeCall = callAgent.mock.calls.find((c) => (c[2] as { name: string }).name === "submit_judge");

    expect(researchCall?.[6]).toBe(HAIKU_MODEL);
    expect(icpCall?.[6]).toBe(CLAUDE_MODEL);
    expect(judgeCall?.[6]).toBe(CLAUDE_MODEL);
  });

  it("supports overriding multiple agents independently, e.g. Research and Intent on Haiku but not ICP or Risk", async () => {
    await runAgentDebateWithModelRouting(sampleInput, { research: HAIKU_MODEL, intent: HAIKU_MODEL });

    const byName = new Map(callAgent.mock.calls.map((c) => [(c[2] as { name: string }).name, c[6]]));

    expect(byName.get("submit_research")).toBe(HAIKU_MODEL);
    expect(byName.get("submit_intent")).toBe(HAIKU_MODEL);
    expect(byName.get("submit_icp")).toBe(CLAUDE_MODEL);
    expect(byName.get("submit_risk")).toBe(CLAUDE_MODEL);
    expect(byName.get("submit_judge")).toBe(CLAUDE_MODEL);
  });

  it("assembles the combined output and accumulates usage across all 5 calls", async () => {
    const result = await runAgentDebateWithModelRouting(sampleInput, { risk: HAIKU_MODEL });

    expect(result.output.judge.verdict).toBe("YES");
    expect(result.output.research.confidence).toBe(80);
    expect(result.usage.inputTokens).toBe(500);
    expect(result.usage.outputTokens).toBe(500);
  });
});
