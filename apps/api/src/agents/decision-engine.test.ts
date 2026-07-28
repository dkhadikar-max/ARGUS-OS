import { describe, expect, it, beforeEach, vi } from "vitest";

const createMock = vi.fn();

vi.mock("./claude-client.js", () => ({
  anthropic: { messages: { create: createMock } },
  CLAUDE_MODEL: "claude-sonnet-4-6",
}));

// Imported after the mock, same reason execution-runtime.test.ts does this:
// so both modules' orchestrator.js import picks up the mocked client.
const { evaluate } = await import("./decision-engine.js");
const { runAgentDebateWithController } = await import("./execution-runtime.js");
const { SALES_LEAD_QUALIFICATION_PACK } = await import("./decision-pack.js");

function researchOutput(confidence = 80) {
  return { summary: "Solid fit.", data_points: [], unfair_advantages: [], hidden_risks: [], confidence, data_gaps: [] };
}
function icpOutput(confidence = 80) {
  return { score: 80, criteria_evaluated: [], overall_assessment: "Good", edge_cases: [], confidence };
}
function intentOutput(confidence = 75) {
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

describe("evaluate (DecisionEngine)", () => {
  it("stops at the checkpoint when every stage is confident -- same 5 real calls as the fixed pipeline", async () => {
    mockAllStagesConfident();

    const result = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    expect(createMock).toHaveBeenCalledTimes(5);
    expect(result.output.judge.verdict).toBe("YES");
    expect(result.executionTrace.controllerDecision.action).toBe("stop");
    expect(result.executionTrace.graph.states.size).toBe(1);
  });

  it("re-invokes exactly the weak capability on invoke_capability, same as execution-runtime.ts's own real behavior", async () => {
    mockRiskStartsWeak();

    const result = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    expect(createMock).toHaveBeenCalledTimes(6); // 4 real stages + 1 real risk re-run + judge
    expect(result.executionTrace.controllerDecision.action).toBe("invoke_capability");
    expect(result.executionTrace.controllerDecision.targetCapability).toBe("risk");
    expect(result.executionTrace.graph.states.size).toBe(2);
  });

  it("exposes a real executionId matching the trace graph's own decisionId", async () => {
    mockAllStagesConfident();

    const result = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    expect(typeof result.executionId).toBe("string");
    expect(result.executionId.length).toBeGreaterThan(0);
    expect(result.executionTrace.graph.decisionId).toBe(result.executionId);
  });

  it("PARITY: produces the same real AgentDebateOutput as runAgentDebateWithController against identical mocked responses -- the actual proof of 'no behavior change'", async () => {
    mockAllStagesConfident();
    const engineResult = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    mockAllStagesConfident();
    const runtimeResult = await runAgentDebateWithController(sampleInput, sampleIdentity);

    expect(engineResult.output).toEqual(runtimeResult.output);
  });

  it("PARITY: matches on the invoke_capability path too, not just the happy path", async () => {
    mockRiskStartsWeak();
    const engineResult = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    mockRiskStartsWeak();
    const runtimeResult = await runAgentDebateWithController(sampleInput, sampleIdentity);

    expect(engineResult.output).toEqual(runtimeResult.output);
    expect(engineResult.executionTrace.controllerDecision.action).toBe(runtimeResult.executionTrace.controllerDecision.action);
    expect(engineResult.executionTrace.controllerDecision.targetCapability).toBe(runtimeResult.executionTrace.controllerDecision.targetCapability);
  });
});
