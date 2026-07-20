import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppError } from "@argus/shared";

const createMock = vi.fn();

vi.mock("./claude-client.js", () => ({
  anthropic: { messages: { create: createMock } },
  CLAUDE_MODEL: "claude-sonnet-4-6",
}));

// Imported after the mock so orchestrator.ts picks up the mocked client.
const { runAgentDebate } = await import("./orchestrator.js");

function researchOutput() {
  return { summary: "Solid fit.", data_points: [], unfair_advantages: [], hidden_risks: [], confidence: 80, data_gaps: [] };
}
function icpOutput() {
  return { score: 80, criteria_evaluated: [], overall_assessment: "Good", edge_cases: [], confidence: 80 };
}
function intentOutput() {
  return { score: 70, signals: [], trajectory: "stable", false_intent_flags: [], confidence: 75 };
}
function riskOutput() {
  return { score: 10, risks: [], red_flags: [], time_waste_probability: 10, mitigation_strategies: [], confidence: 80 };
}
function judgeOutput() {
  return {
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
  };
}

function toolUseResponse(toolName: string, input: unknown) {
  return {
    content: [{ type: "tool_use" as const, id: "toolu_1", name: toolName, input }],
    stop_reason: "tool_use" as const,
    usage: { input_tokens: 100, output_tokens: 100 },
  };
}

interface CreateParams {
  // orchestrator.ts always constructs this as a single-element tuple
  // (`tools: [tool]`), so typing it that way (rather than a general array)
  // avoids every call site needing an unnecessary possibly-undefined check.
  tools: [{ name: string }];
  messages: [{ content: string }];
}

const OUTPUT_BY_TOOL: Record<string, unknown> = {
  submit_research: researchOutput(),
  submit_icp: icpOutput(),
  submit_intent: intentOutput(),
  submit_risk: riskOutput(),
  submit_judge: judgeOutput(),
};

/** ICP/Intent run concurrently (Promise.all), so a test that queues mocked
 *  responses via mockResolvedValueOnce in a fixed order is fragile -- it
 *  bakes in an assumption about microtask interleaving that a harmless
 *  internal refactor could silently invalidate. Keying off the requested
 *  tool's name instead is robust to whatever order the calls actually land
 *  in, and only requires each stage's real behavior to be correct. */
function mockAllStagesSucceed() {
  createMock.mockImplementation(async (params: CreateParams) => {
    const toolName = params.tools[0].name;
    return toolUseResponse(toolName, OUTPUT_BY_TOOL[toolName]);
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
  companyContext: null,
};

beforeEach(() => {
  createMock.mockReset();
});

describe("runAgentDebate", () => {
  it("runs the pipeline (research, icp+intent, risk, judge) as 5 separate calls and assembles the combined output", async () => {
    mockAllStagesSucceed();

    const { output } = await runAgentDebate(sampleInput);

    expect(output.judge.verdict).toBe("YES");
    expect(output.research.summary).toBe("Solid fit.");
    expect(createMock).toHaveBeenCalledTimes(5);
  });

  it("threads each stage's real output into later stages' prompts instead of a self-reference placeholder", async () => {
    mockAllStagesSucceed();

    await runAgentDebate(sampleInput);

    const calls = createMock.mock.calls as Array<[CreateParams]>;
    const riskCall = calls.find(([params]) => params.tools[0].name === "submit_risk")?.[0];
    const judgeCall = calls.find(([params]) => params.tools[0].name === "submit_judge")?.[0];

    // Risk's own prompt (Bible §8.6) takes research+icp+intent as input.
    expect(riskCall?.messages[0].content).toContain(JSON.stringify(researchOutput()));
    expect(riskCall?.messages[0].content).toContain(JSON.stringify(icpOutput()));
    expect(riskCall?.messages[0].content).toContain(JSON.stringify(intentOutput()));
    // Judge's own prompt (Bible §8.7) takes all four prior outputs.
    expect(judgeCall?.messages[0].content).toContain(JSON.stringify(riskOutput()));
  });

  it("falls back to parsing a plain-text response if no tool_use block is present", async () => {
    createMock.mockImplementation(async (params: CreateParams) => {
      const toolName = params.tools[0].name;
      if (toolName === "submit_research") {
        return {
          content: [{ type: "text", text: "```json\n" + JSON.stringify(researchOutput()) + "\n```" }],
          stop_reason: "end_turn" as const,
          usage: { input_tokens: 100, output_tokens: 100 },
        };
      }
      return toolUseResponse(toolName, OUTPUT_BY_TOOL[toolName]);
    });

    const { output } = await runAgentDebate(sampleInput);
    expect(output.judge.verdict).toBe("YES");
  });

  it("retries only the failing stage, without discarding or re-rolling stages that already succeeded", async () => {
    let icpAttempts = 0;
    createMock.mockImplementation(async (params: CreateParams) => {
      const toolName = params.tools[0].name;
      if (toolName === "submit_icp") {
        icpAttempts += 1;
        return icpAttempts === 1 ? toolUseResponse("submit_icp", { not: "valid" }) : toolUseResponse("submit_icp", icpOutput());
      }
      return toolUseResponse(toolName, OUTPUT_BY_TOOL[toolName]);
    });

    const { output } = await runAgentDebate(sampleInput);

    expect(output.judge.verdict).toBe("YES");
    expect(icpAttempts).toBe(2);
    expect(createMock).toHaveBeenCalledTimes(6); // 5 stages + 1 retry, not 10 (a full-debate retry)
  });

  it("throws AI_UNAVAILABLE after a stage exhausts its own retries, without ever calling risk or judge", async () => {
    createMock.mockImplementation(async (params: CreateParams) => {
      const toolName = params.tools[0].name;
      if (toolName === "submit_risk" || toolName === "submit_judge") {
        throw new Error(`${toolName} should never be called once icp has exhausted its retries`);
      }
      if (toolName === "submit_icp") {
        return toolUseResponse("submit_icp", { not: "valid" }); // always malformed
      }
      return toolUseResponse(toolName, OUTPUT_BY_TOOL[toolName]);
    });

    await expect(runAgentDebate(sampleInput)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    } satisfies Partial<AppError>);
    // research(1) + icp attempt 1 + icp attempt 2 (exhausted) + intent(1, ran
    // concurrently with icp before its failure surfaced) = 4.
    expect(createMock).toHaveBeenCalledTimes(4);
  });
});
