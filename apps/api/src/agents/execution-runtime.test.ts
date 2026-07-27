import { describe, expect, it, beforeEach, vi } from "vitest";

const createMock = vi.fn();

vi.mock("./claude-client.js", () => ({
  anthropic: { messages: { create: createMock } },
  CLAUDE_MODEL: "claude-sonnet-4-6",
}));

// Imported after the mock so execution-runtime.ts's orchestrator.js import
// picks up the mocked client -- same pattern orchestrator.test.ts itself uses.
const { runAgentDebateWithController } = await import("./execution-runtime.js");

function researchOutput(confidence = 80) {
  return { summary: "Solid fit.", data_points: [], unfair_advantages: [], hidden_risks: [], confidence, data_gaps: [] };
}
function icpOutput(confidence = 80) {
  return { score: 80, criteria_evaluated: [], overall_assessment: "Good", edge_cases: [], confidence };
}
function intentOutput(confidence = 80) {
  return { score: 70, signals: [], trajectory: "stable", false_intent_flags: [], confidence };
}
function riskOutput(confidence = 80) {
  return { score: 10, risks: [], red_flags: [], time_waste_probability: 10, mitigation_strategies: [], confidence };
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
  tools: [{ name: string }];
  messages: [{ content: string }];
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

const sampleIdentity = { teamId: "team_1", userId: "user_1", prospectId: "prospect_1", prospectName: "Jane Prospect" };

beforeEach(() => {
  createMock.mockReset();
});

/** Every real stage confident and consistent -- decide() should stop at the
 *  one checkpoint, so Judge is the only 5th call, same call count as the
 *  fixed pipeline. */
function mockAllStagesConfident() {
  const outputByTool: Record<string, unknown> = {
    submit_research: researchOutput(80),
    submit_icp: icpOutput(80),
    submit_intent: intentOutput(75),
    submit_risk: riskOutput(80),
    submit_judge: judgeOutput(),
  };
  createMock.mockImplementation(async (params: CreateParams) => {
    const toolName = params.tools[0].name;
    return toolUseResponse(toolName, outputByTool[toolName]);
  });
}

/** Risk comes back with a real confidence gap (20) against the other three
 *  (80/80/75) -- mean is 63.75, below the default confidenceThreshold (70),
 *  and risk (20) is below the default capabilityConfidenceThreshold (50),
 *  so decide() should return invoke_capability targeting "risk". The
 *  second, real risk call (mocked separately) returns a healthier 85. */
function mockRiskStartsWeak() {
  let riskCallCount = 0;
  createMock.mockImplementation(async (params: CreateParams) => {
    const toolName = params.tools[0].name;
    if (toolName === "submit_risk") {
      riskCallCount += 1;
      return toolUseResponse(toolName, riskCallCount === 1 ? riskOutput(20) : riskOutput(85));
    }
    const outputByTool: Record<string, unknown> = {
      submit_research: researchOutput(80),
      submit_icp: icpOutput(80),
      submit_intent: intentOutput(75),
      submit_judge: judgeOutput(),
    };
    return toolUseResponse(toolName, outputByTool[toolName]);
  });
}

describe("runAgentDebateWithController", () => {
  it("stops at the checkpoint when every stage is confident -- same 5 real calls as the fixed pipeline", async () => {
    mockAllStagesConfident();

    const result = await runAgentDebateWithController(sampleInput, sampleIdentity);

    expect(createMock).toHaveBeenCalledTimes(5);
    expect(result.output.judge.verdict).toBe("YES");
    expect(result.executionTrace.controllerDecision.action).toBe("stop");
    expect(result.executionTrace.graph.states.size).toBe(1);
  });

  it("returns the same {output, processingTimeMs, usage} shape runAgentDebate produces, validated against the real schema", async () => {
    mockAllStagesConfident();

    const result = await runAgentDebateWithController(sampleInput, sampleIdentity);

    expect(typeof result.processingTimeMs).toBe("number");
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.output.research.summary).toBe("Solid fit.");
  });

  it("invokes the weak capability a real second time when the Controller identifies one -- 6 real calls total", async () => {
    mockRiskStartsWeak();

    const result = await runAgentDebateWithController(sampleInput, sampleIdentity);

    expect(createMock).toHaveBeenCalledTimes(6);
    expect(result.executionTrace.controllerDecision.action).toBe("invoke_capability");
    expect(result.executionTrace.controllerDecision.targetCapability).toBe("risk");
  });

  it("uses the SECOND real risk call's output in the final result, not the first weak one", async () => {
    mockRiskStartsWeak();

    const result = await runAgentDebateWithController(sampleInput, sampleIdentity);

    expect(result.output.risk.confidence).toBe(85);
  });

  it("appends a real, integrity-checked version-1 DecisionState when a capability is genuinely re-invoked", async () => {
    mockRiskStartsWeak();

    const result = await runAgentDebateWithController(sampleInput, sampleIdentity);

    const { graph } = result.executionTrace;
    expect(graph.states.size).toBe(2);
    const v0 = graph.states.get(0)!;
    const v1 = graph.states.get(1)!;
    expect(v1.parentStateId).toBe(v0.transitionHash);
    expect(v1.transition.action).toBe("invoke_capability");
    expect(v0.budget.raw.reasoningDepth).toBe(4);
    expect(v1.budget.raw.reasoningDepth).toBe(5);
  });

  it("threads the real re-invoked risk prompt with the same prior research/icp/intent context", async () => {
    mockRiskStartsWeak();

    await runAgentDebateWithController(sampleInput, sampleIdentity);

    const riskCalls = (createMock.mock.calls as Array<[CreateParams]>).filter(([params]) => params.tools[0].name === "submit_risk");
    expect(riskCalls).toHaveLength(2);
    for (const [params] of riskCalls) {
      expect(params.messages[0].content).toContain(JSON.stringify(researchOutput(80)));
    }
  });

  // Bug fix (Critical #2): the real tokens spent on the 4 successful stages
  // (and, when applicable, a real re-invocation) must not disappear when
  // the final Judge call fails -- this is execution-runtime.ts's own use of
  // attachUsageAndRethrow, separate from orchestrator.ts's.
  it("attaches the real usage accumulated so far when the final Judge call exhausts its retries", async () => {
    createMock.mockImplementation(async (params: CreateParams) => {
      const toolName = params.tools[0].name;
      if (toolName === "submit_judge") {
        return toolUseResponse("submit_judge", { not: "valid" }); // always malformed
      }
      const outputByTool: Record<string, unknown> = {
        submit_research: researchOutput(80),
        submit_icp: icpOutput(80),
        submit_intent: intentOutput(75),
        submit_risk: riskOutput(80),
      };
      return toolUseResponse(toolName, outputByTool[toolName]);
    });

    await expect(runAgentDebateWithController(sampleInput, sampleIdentity)).rejects.toMatchObject({
      extra: { usage: { inputTokens: 600, outputTokens: 600 } }, // 4 real stages + 2 judge attempts
    });
  });
});
