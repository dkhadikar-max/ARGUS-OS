import { describe, expect, it, vi, beforeEach } from "vitest";

const callAgent = vi.fn();
vi.mock("../orchestrator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../orchestrator.js")>();
  return { ...actual, callAgent };
});

const { runAgentDebateSingleCall } = await import("./single-call-orchestrator.js");

function fullDebateOutput() {
  return {
    research: { summary: "s", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 80, data_gaps: [] },
    icp: { score: 80, criteria_evaluated: [], overall_assessment: "Good", edge_cases: [], confidence: 80 },
    intent: { score: 70, signals: [], trajectory: "stable", false_intent_flags: [], confidence: 75 },
    risk: { score: 10, risks: [], red_flags: [], time_waste_probability: 10, mitigation_strategies: [], confidence: 80 },
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
  };
}

const sampleInput = {
  prospectData: { profile: { name: "n" } },
  teamIcp: null,
  companyMemory: null,
  intentSignals: null,
  historicalEngagement: [],
  teamHistory: [],
  userPreferences: null,
  teamPatterns: null,
  companyContext: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runAgentDebateSingleCall", () => {
  it("makes exactly one callAgent call (not 5) and returns the parsed combined output", async () => {
    callAgent.mockResolvedValue(fullDebateOutput());

    const result = await runAgentDebateSingleCall(sampleInput);

    expect(callAgent).toHaveBeenCalledTimes(1);
    expect(result.output.judge.verdict).toBe("YES");
    expect(result.output.research.summary).toBe("s");
  });

  it("uses a single combined tool schema requiring all 5 sections", async () => {
    callAgent.mockResolvedValue(fullDebateOutput());

    await runAgentDebateSingleCall(sampleInput);

    const [, , tool] = callAgent.mock.calls[0] as [unknown, unknown, { name: string; input_schema: { required: string[] } }];
    expect(tool.name).toBe("submit_full_debate");
    expect(tool.input_schema.required).toEqual(["research", "icp", "intent", "risk", "judge"]);
  });

  it("includes all 5 agents' verbatim prompt text in the single combined user prompt", async () => {
    callAgent.mockResolvedValue(fullDebateOutput());

    await runAgentDebateSingleCall(sampleInput);

    const [, userPrompt] = callAgent.mock.calls[0] as [unknown, string];
    expect(userPrompt).toContain('<agent name="research">');
    expect(userPrompt).toContain('<agent name="icp">');
    expect(userPrompt).toContain('<agent name="intent">');
    expect(userPrompt).toContain('<agent name="risk">');
    expect(userPrompt).toContain('<agent name="judge">');
  });

  it("resolves prior-stage output placeholders to a self-reference note, not fabricated JSON", async () => {
    callAgent.mockResolvedValue(fullDebateOutput());

    await runAgentDebateSingleCall(sampleInput);

    const [, userPrompt] = callAgent.mock.calls[0] as [unknown, string];
    expect(userPrompt).toContain("produced in this same response");
  });

  it("reports usage from the single call", async () => {
    callAgent.mockResolvedValue(fullDebateOutput());

    const result = await runAgentDebateSingleCall(sampleInput);

    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
