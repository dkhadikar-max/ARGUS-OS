import { describe, expect, it, vi, beforeEach } from "vitest";

const callAgent = vi.fn();
const runStagesResearchThroughRisk = vi.fn();
vi.mock("../orchestrator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../orchestrator.js")>();
  return { ...actual, callAgent, runStagesResearchThroughRisk };
});

const { runAgentDebatePipelineWithConflict } = await import("./pipeline-with-conflict-orchestrator.js");

function judgeOutput() {
  return {
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
  };
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
  companyContext: null,
};

function stagesResult(overrides: { icpScore?: number; intentScore?: number; timeWasteProbability?: number } = {}) {
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
    usage: { inputTokens: 500, outputTokens: 500 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runAgentDebatePipelineWithConflict", () => {
  it("reuses runStagesResearchThroughRisk unchanged and makes exactly one additional Judge call", async () => {
    runStagesResearchThroughRisk.mockResolvedValue(stagesResult());
    callAgent.mockResolvedValue(judgeOutput());

    await runAgentDebatePipelineWithConflict(sampleInput);

    expect(runStagesResearchThroughRisk).toHaveBeenCalledWith(sampleInput);
    expect(callAgent).toHaveBeenCalledTimes(1);
  });

  it("computes the deterministic conflict signal from the real ICP/Intent/Risk scores and returns it", async () => {
    runStagesResearchThroughRisk.mockResolvedValue(
      stagesResult({ icpScore: 90, intentScore: 20, timeWasteProbability: 30 }),
    );
    callAgent.mockResolvedValue(judgeOutput());

    const result = await runAgentDebatePipelineWithConflict(sampleInput);

    expect(result.conflict.directional).toBe(true); // icp positive (90), intent negative (20)
  });

  it("appends the deterministic conflict analysis to Judge's prompt", async () => {
    runStagesResearchThroughRisk.mockResolvedValue(
      stagesResult({ icpScore: 90, intentScore: 20, timeWasteProbability: 30 }),
    );
    callAgent.mockResolvedValue(judgeOutput());

    await runAgentDebatePipelineWithConflict(sampleInput);

    const [, userPrompt] = callAgent.mock.calls[0] as [unknown, string];
    expect(userPrompt).toContain("DETERMINISTIC CONFLICT ANALYSIS");
    expect(userPrompt).toContain('"directional":true');
  });

  it("assembles the combined output from the real stages plus the augmented Judge call", async () => {
    runStagesResearchThroughRisk.mockResolvedValue(stagesResult());
    callAgent.mockResolvedValue(judgeOutput());

    const result = await runAgentDebatePipelineWithConflict(sampleInput);

    expect(result.output.judge.verdict).toBe("YES");
    expect(result.output.icp.score).toBe(80);
  });
});
