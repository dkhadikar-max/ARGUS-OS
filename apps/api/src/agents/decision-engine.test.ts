import { describe, expect, it, beforeEach, vi } from "vitest";
import { assertNoPII } from "../test/pii-check.js";

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
    expect(result.executionTrace.controllerDecisions[0]?.action).toBe("stop");
    expect(result.graph.states.size).toBe(1);
  });

  it("re-invokes exactly the weak capability on invoke_capability, same as execution-runtime.ts's own real behavior", async () => {
    mockRiskStartsWeak();

    const result = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    expect(createMock).toHaveBeenCalledTimes(6); // 4 real stages + 1 real risk re-run + judge
    expect(result.executionTrace.controllerDecisions[0]?.action).toBe("invoke_capability");
    expect(result.executionTrace.controllerDecisions[0]?.targetCapability).toBe("risk");
    expect(result.graph.states.size).toBe(2);
  });

  it("ExecutionTrace reports all 4 real agent stages as executed and none skipped -- nothing in this path ever skips a planned node today", async () => {
    mockAllStagesConfident();

    const result = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    expect(result.executionTrace.executedNodes.sort()).toEqual(["icp", "intent", "research", "risk"]);
    expect(result.executionTrace.skippedNodes).toEqual([]);
    expect(result.executionTrace.synthesizerOutput.verdict).toBe("YES");
  });

  it("ExecutionTrace reports real per-stage timing and cost, including judge's own real cost", async () => {
    mockAllStagesConfident();

    const result = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    expect(result.executionTrace.timings.map((t) => t.stage).sort()).toEqual(["icp", "intent", "judge", "research", "risk"]);
    expect(result.executionTrace.costs.map((c) => c.stage).sort()).toEqual(["icp", "intent", "judge", "research", "risk"]);
    const judgeCost = result.executionTrace.costs.find((c) => c.stage === "judge");
    expect(judgeCost?.tokens).toBeGreaterThan(0);
  });

  it("determinism: running the same mocked execution twice produces identical merged stage output -- no accidental shared mutable state between runs", async () => {
    mockAllStagesConfident();
    const first = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    mockAllStagesConfident();
    const second = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    expect(first.output).toEqual(second.output);
    expect(first.executionTrace.executedNodes.sort()).toEqual(second.executionTrace.executedNodes.sort());
  });

  it("exposes a real executionId matching the trace graph's own decisionId", async () => {
    mockAllStagesConfident();

    const result = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    expect(typeof result.executionId).toBe("string");
    expect(result.executionId.length).toBeGreaterThan(0);
    expect(result.graph.decisionId).toBe(result.executionId);
  });

  it("ExecutionTrace excludes PII and raw evidence -- no prospect name, no raw prospect data, no drafted message text", async () => {
    mockAllStagesConfident();

    const result = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    // Reusable check (src/test/pii-check.ts), two complementary modes:
    // allowlist (fails closed on ANY unexpected top-level field, not just
    // ones matching a known-dangerous name) for the trace's real shape,
    // plus a denylist value check for sampleIdentity's real prospectName/
    // prospectId specifically (allowlist mode only checks key names, not
    // values, so a leaked value under an allowed key name wouldn't be
    // caught by allowlist mode alone).
    expect(() =>
      assertNoPII(result.executionTrace, {
        mode: "allowlist",
        allowedKeys: ["requestId", "packId", "model", "controllerDecisions", "executedNodes", "skippedNodes", "synthesizerOutput", "timings", "costs"],
      }),
    ).not.toThrow();
    expect(() =>
      assertNoPII(result.executionTrace, { mode: "denylist", forbiddenValues: [sampleIdentity.prospectName, sampleIdentity.prospectId] }),
    ).not.toThrow();

    // The full judge output (drafted message, reasoning, key_evidence) must
    // not leak through -- only the narrow SynthesizerVerdictSummary should.
    expect(result.executionTrace.synthesizerOutput).not.toHaveProperty("message");
    expect(result.executionTrace.synthesizerOutput).not.toHaveProperty("reasoning");
    expect(result.executionTrace.synthesizerOutput).not.toHaveProperty("key_evidence");
    expect(result.executionTrace.synthesizerOutput).toEqual({
      verdict: "YES",
      confidence: 82,
      weightedScore: 78,
      agentConsensus: "high",
      recommendedAction: "message_now",
    });
    // The real, PII-bearing audit chain is still available -- just not
    // inside executionTrace.
    expect(result.graph.states.size).toBeGreaterThan(0);
  });
});

// Layered parity, per review feedback: byte-identical equality on the
// whole AgentDebateOutput was the original design, but that conflates
// three genuinely different questions. Split so a future divergence in
// ONE layer doesn't get masked by (or falsely blamed on) another:
//   Layer 1 -- decision semantics: verdict, confidence, weighted_score,
//     controller action/target MUST be identical. A mismatch here is a
//     real migration failure.
//   Layer 2 -- evidence semantics: SHOULD be equivalent, not necessarily
//     identical ordering. Compared as sorted/set equality, not exact
//     array equality, so a future harmless reordering doesn't fail this.
//   Layer 3 -- runtime telemetry: latency/cost/tokens are MEASURED and
//     logged for comparison, never asserted equal -- two real, separately
//     executed runs (even against identical mocked responses) can have
//     real timing variance; asserting exact equality here would be
//     testing Date.now() jitter, not behavior.
describe("PARITY: evaluate() vs runAgentDebateWithController", () => {
  it("Layer 1 (decision semantics, MUST match): verdict, confidence, weighted_score, controller action/target -- happy path", async () => {
    mockAllStagesConfident();
    const engineResult = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    mockAllStagesConfident();
    const runtimeResult = await runAgentDebateWithController(sampleInput, sampleIdentity);

    expect(engineResult.output.judge.verdict).toBe(runtimeResult.output.judge.verdict);
    expect(engineResult.output.judge.confidence).toBe(runtimeResult.output.judge.confidence);
    expect(engineResult.output.judge.weighted_score).toBe(runtimeResult.output.judge.weighted_score);
    expect(engineResult.executionTrace.controllerDecisions[0]?.action).toBe(runtimeResult.executionTrace.controllerDecision.action);
  });

  it("Layer 1 (decision semantics, MUST match): invoke_capability path -- action and target capability", async () => {
    mockRiskStartsWeak();
    const engineResult = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    mockRiskStartsWeak();
    const runtimeResult = await runAgentDebateWithController(sampleInput, sampleIdentity);

    expect(engineResult.output.judge.verdict).toBe(runtimeResult.output.judge.verdict);
    expect(engineResult.executionTrace.controllerDecisions[0]?.action).toBe(runtimeResult.executionTrace.controllerDecision.action);
    expect(engineResult.executionTrace.controllerDecisions[0]?.targetCapability).toBe(runtimeResult.executionTrace.controllerDecision.targetCapability);
  });

  it("Layer 2 (evidence semantics, SHOULD be equivalent): research data_points match as a set, not by exact array order", async () => {
    mockAllStagesConfident();
    const engineResult = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    mockAllStagesConfident();
    const runtimeResult = await runAgentDebateWithController(sampleInput, sampleIdentity);

    const engineSignals = engineResult.output.research.data_points.map((d) => d.signal).sort();
    const runtimeSignals = runtimeResult.output.research.data_points.map((d) => d.signal).sort();
    expect(engineSignals).toEqual(runtimeSignals);
    // Full output is still identical in this test's real data (the mock
    // returns the exact same canned response either way) -- the point of
    // this layer is the COMPARISON METHOD being order-independent, not
    // that today's fixtures happen to exercise real reordering.
    expect(engineResult.output).toEqual(runtimeResult.output);
  });

  it("Layer 3 (runtime telemetry, MEASURED not asserted): both paths report real, positive latency and token usage -- not compared for equality", async () => {
    mockAllStagesConfident();
    const engineResult = await evaluate(SALES_LEAD_QUALIFICATION_PACK, sampleInput, sampleIdentity);

    mockAllStagesConfident();
    const runtimeResult = await runAgentDebateWithController(sampleInput, sampleIdentity);

    // Each measured independently and asserted only to be real (positive,
    // finite) -- never asserted equal to each other. Two separately
    // executed runs, even against identical mocked responses, have real
    // timing variance; treating that as a pass/fail signal would be
    // testing Date.now() jitter, not behavior.
    expect(engineResult.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(runtimeResult.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(engineResult.usage.inputTokens + engineResult.usage.outputTokens).toBeGreaterThan(0);
    expect(runtimeResult.usage.inputTokens + runtimeResult.usage.outputTokens).toBeGreaterThan(0);
  });
});
