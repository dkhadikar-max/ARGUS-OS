import { describe, expect, it } from "vitest";
import type { Evidence } from "@argus/database";
import {
  RETRIEVER_CAPABILITIES,
  wrapRetrieverAsCapability,
  wrapAgentStageAsCapability,
  createCallAgentStageExecutor,
  type ReasoningCapability,
  type ExecutionContext,
  type StageExecutor,
  type StageExecutionResult,
} from "./reasoning-capability.js";
import { AGENT_STAGE_CAPABILITIES, SALES_LEAD_QUALIFICATION_PACK } from "./decision-pack.js";
import type { Retriever } from "./retrievers/types.js";
import type { LLMProvider, LLMCallParams, LLMCallResult } from "./providers/llm-provider.interface.js";
import type { DecisionAgentInput } from "./orchestrator.js";

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "e1",
    type: "FIRMOGRAPHIC",
    source: "APOLLO",
    data: {},
    confidence: 80,
    extractedAt: new Date(),
    isStale: false,
    prospectId: "p1",
    decisionId: null,
    ...overrides,
  } as Evidence;
}

function fakeCtx(): ExecutionContext {
  return {
    identity: { teamId: "team_1", userId: "user_1", prospectId: "p1", prospectName: "Acme Co" },
    budget: { remainingReasoning: 5, remainingLatency: 100_000, remainingCost: 10 },
  };
}

function sampleInput(): DecisionAgentInput {
  return {
    prospectData: { company: { name: "Acme Co" } },
    teamIcp: null,
    companyMemory: null,
    intentSignals: null,
    historicalEngagement: null,
    teamHistory: null,
    userPreferences: null,
    teamPatterns: null,
    companyContext: null,
  };
}

describe("wrapRetrieverAsCapability", () => {
  it("passes evidencePool/topK through to the real retriever and returns its output as both outputs and evidenceProduced", async () => {
    const pool = [makeEvidence({ id: "e1" }), makeEvidence({ id: "e2" })];
    const fakeRetriever: Retriever = { retrieve: async (evidencePool, topK) => evidencePool.slice(0, topK ?? evidencePool.length) };
    const capability = wrapRetrieverAsCapability("fake", fakeRetriever);

    const output = await capability.invoke({ evidencePool: pool, topK: 1 }, fakeCtx());

    expect(output.capabilityId).toBe("fake");
    expect(output.outputs).toEqual([pool[0]]);
    expect(output.evidenceProduced).toEqual([pool[0]]);
  });

  it("reports confidence 100 when evidence was found, 0 when none was", async () => {
    const found: Retriever = { retrieve: async () => [makeEvidence()] };
    const empty: Retriever = { retrieve: async () => [] };

    const foundOutput = await wrapRetrieverAsCapability("found", found).invoke({ evidencePool: [] }, fakeCtx());
    const emptyOutput = await wrapRetrieverAsCapability("empty", empty).invoke({ evidencePool: [] }, fakeCtx());

    expect(foundOutput.confidence).toBe(100);
    expect(emptyOutput.confidence).toBe(0);
  });

  it("reports zero disagreements and zero real cost (no LLM call happens in a retriever)", async () => {
    const retriever: Retriever = { retrieve: async () => [makeEvidence()] };
    const output = await wrapRetrieverAsCapability("id", retriever).invoke({ evidencePool: [] }, fakeCtx());

    expect(output.disagreements).toEqual([]);
    expect(output.cost.tokens).toBe(0);
    expect(output.cost.costUsd).toBe(0);
    expect(output.cost.reasoningDepth).toBe(0);
    expect(output.advisory).toBeUndefined();
  });

  it("measures real wall-clock latency around the retrieve() call", async () => {
    const slowRetriever: Retriever = {
      retrieve: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return [];
      },
    };
    const output = await wrapRetrieverAsCapability("slow", slowRetriever).invoke({ evidencePool: [] }, fakeCtx());

    expect(output.latencyMs).toBeGreaterThanOrEqual(15);
    expect(output.cost.latencyMs).toBe(output.latencyMs);
  });

  it("accepts ExecutionContext but doesn't use it (no per-retriever budget/identity concept exists today)", async () => {
    const retriever: Retriever = { retrieve: async () => [] };
    const capability = wrapRetrieverAsCapability("id", retriever);

    // Different ctx values produce identical output -- proves ctx is truly unused, not silently load-bearing.
    const a = await capability.invoke({ evidencePool: [] }, fakeCtx());
    const b = await capability.invoke({ evidencePool: [] }, { identity: { teamId: "other", userId: "x", prospectId: "y", prospectName: "z" }, budget: { remainingReasoning: 0, remainingLatency: 0, remainingCost: 0 } });

    expect(a).toEqual(b);
  });
});

describe("RETRIEVER_CAPABILITIES", () => {
  it("has exactly the 4 real retriever stages, each with a matching id", () => {
    expect(Object.keys(RETRIEVER_CAPABILITIES).sort()).toEqual(["icp", "intent", "research", "risk"]);
    for (const [stage, capability] of Object.entries(RETRIEVER_CAPABILITIES)) {
      expect(capability.id).toBe(stage);
    }
  });

  it("delegates to the real ResearchRetriever's own filtering logic (type-scoped to research)", async () => {
    const capability: ReasoningCapability<{ evidencePool: Evidence[] }, Evidence[]> = RETRIEVER_CAPABILITIES.research;
    const pool = [makeEvidence({ id: "firmo", type: "FIRMOGRAPHIC" }), makeEvidence({ id: "intent-signal", type: "INTENT" })];

    const output = await capability.invoke({ evidencePool: pool }, fakeCtx());

    expect(output.outputs.map((e) => e.id)).toEqual(["firmo"]);
  });
});

function sampleResearchOutput() {
  return {
    summary: "A promising SaaS prospect",
    data_points: [{ type: "firmographic" as const, signal: "50 employees", relevance: "size fit" }],
    unfair_advantages: ["fast growth"],
    hidden_risks: [],
    confidence: 82,
    data_gaps: [],
  };
}

describe("wrapAgentStageAsCapability", () => {
  it("returns a real CapabilityOutput built from the executor's real result -- strongly typed, not unknown", async () => {
    // Cast: this fake only returns a research-shaped output, which is
    // correct for what this test exercises (always stage "research"), but
    // narrower than StageExecutor's real generic contract (any AgentStageId
    // -> its own matching output shape) -- a real executor (createCallAgentStageExecutor)
    // has to satisfy that generically; this fake deliberately doesn't need to.
    const fakeExecutor = {
      async execute(stage: "research") {
        expect(stage).toBe("research");
        return { output: sampleResearchOutput(), usage: { inputTokens: 100, outputTokens: 50 }, durationMs: 1234 } satisfies StageExecutionResult<ReturnType<typeof sampleResearchOutput>>;
      },
    } as unknown as StageExecutor;
    const capability = wrapAgentStageAsCapability("research", SALES_LEAD_QUALIFICATION_PACK, fakeExecutor);

    const output = await capability.invoke({ input: sampleInput(), priorOutputs: {} }, fakeCtx());

    expect(output.capabilityId).toBe("research");
    expect(output.outputs.summary).toBe("A promising SaaS prospect"); // strongly typed -- .summary is real, not a cast at the call site
    expect(output.confidence).toBe(82); // read from the real output's own .confidence field
    expect(output.disagreements).toEqual([]);
    expect(output.cost.tokens).toBe(150);
    expect(output.cost.latencyMs).toBe(1234);
    expect(output.latencyMs).toBe(1234);
  });

  it("accepts ExecutionContext but doesn't consult it yet (not wired into any real decision -- see module comment)", async () => {
    const fakeExecutor = {
      async execute() {
        return { output: sampleResearchOutput(), usage: { inputTokens: 0, outputTokens: 0 }, durationMs: 0 };
      },
    } as unknown as StageExecutor;
    const capability = wrapAgentStageAsCapability("research", SALES_LEAD_QUALIFICATION_PACK, fakeExecutor);

    const a = await capability.invoke({ input: sampleInput(), priorOutputs: {} }, fakeCtx());
    const b = await capability.invoke(
      { input: sampleInput(), priorOutputs: {} },
      { identity: { teamId: "other", userId: "x", prospectId: "y", prospectName: "z" }, budget: { remainingReasoning: 0, remainingLatency: 0, remainingCost: 0 } },
    );

    expect(a).toEqual(b);
  });
});

describe("createCallAgentStageExecutor", () => {
  it("calls the real callAgent/buildStagePrompt plumbing against a real DecisionPack, via an injected LLMProvider -- zero live API calls", async () => {
    const fakeProvider: LLMProvider = {
      call: async (params: LLMCallParams): Promise<LLMCallResult> => {
        expect(params.tool.name).toBe("submit_research"); // the real RESEARCH_TOOL, from the real pack
        return { toolInput: sampleResearchOutput(), textContent: null, stopReason: "tool_use", inputTokens: 42, outputTokens: 17 };
      },
    };
    const executor = createCallAgentStageExecutor(fakeProvider);

    const result = await executor.execute("research", SALES_LEAD_QUALIFICATION_PACK, sampleInput(), {});

    expect(result.output.summary).toBe("A promising SaaS prospect");
    expect(result.usage).toEqual({ inputTokens: 42, outputTokens: 17 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("AGENT_STAGE_CAPABILITIES (decision-pack.ts)", () => {
  it("has exactly the 4 real agent stages (not judge), each with a matching id", () => {
    expect(Object.keys(AGENT_STAGE_CAPABILITIES).sort()).toEqual(["icp", "intent", "research", "risk"]);
    for (const [stage, capability] of Object.entries(AGENT_STAGE_CAPABILITIES)) {
      expect(capability.id).toBe(stage);
    }
  });
});
