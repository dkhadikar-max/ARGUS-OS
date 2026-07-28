import { describe, expect, it } from "vitest";
import { runPlan, type CapabilityResolver } from "./executor.js";
import { plan, buildExecutionPlan } from "./planner.js";
import { SALES_LEAD_QUALIFICATION_PACK } from "./decision-pack.js";
import type { ReasoningCapability, AgentStageCapabilityInput, CapabilityOutput, ExecutionContext } from "./reasoning-capability.js";
import type { DecisionAgentInput, StageId } from "./orchestrator.js";

function sampleInput(): DecisionAgentInput {
  return {
    prospectData: {},
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

const fakeCtx: ExecutionContext = {
  identity: { teamId: "team_1", userId: "user_1", prospectId: "p1", prospectName: "Acme Co" },
  budget: { remainingReasoning: 5, remainingLatency: 100_000, remainingCost: 10 },
};

/** A fake capability per stage -- records call order and what priorOutputs
 *  it was actually given, so the test can prove batches ran in the right
 *  order AND that later batches saw real prior output, not just that the
 *  right stages were called. */
function fakeCapabilitiesRecordingOrder(callOrder: string[], priorOutputsSeen: Record<string, unknown>): CapabilityResolver {
  const makeCapability = (stage: string): ReasoningCapability<AgentStageCapabilityInput, unknown> => ({
    id: stage,
    async invoke({ priorOutputs }) {
      callOrder.push(stage);
      priorOutputsSeen[stage] = { ...priorOutputs };
      const output = { stageId: stage, confidence: 77 };
      const result: CapabilityOutput<unknown> = {
        capabilityId: stage,
        outputs: output,
        confidence: 77,
        evidenceProduced: [],
        disagreements: [],
        cost: { tokens: 100, latencyMs: 10, costUsd: 0, reasoningDepth: 1 },
        latencyMs: 10,
      };
      return result;
    },
  });
  const capabilities: Record<string, ReasoningCapability<AgentStageCapabilityInput, unknown>> = {
    research: makeCapability("research"),
    icp: makeCapability("icp"),
    intent: makeCapability("intent"),
    risk: makeCapability("risk"),
  };
  return (stage: StageId) => capabilities[stage] as ReasoningCapability<AgentStageCapabilityInput, unknown>;
}

describe("runPlan", () => {
  it("runs the real Sales pack plan in the correct order: research first, then icp+intent, then risk sees real prior output from all three", async () => {
    const callOrder: string[] = [];
    const priorOutputsSeen: Record<string, unknown> = {};
    const resolver = fakeCapabilitiesRecordingOrder(callOrder, priorOutputsSeen);

    const result = await runPlan(plan(SALES_LEAD_QUALIFICATION_PACK), resolver, sampleInput(), fakeCtx);

    // research must come before icp/intent, which must come before risk --
    // batches run sequentially, so within-batch order (icp vs intent) can
    // vary, but cross-batch order must not.
    expect(callOrder.indexOf("research")).toBeLessThan(callOrder.indexOf("icp"));
    expect(callOrder.indexOf("research")).toBeLessThan(callOrder.indexOf("intent"));
    expect(callOrder.indexOf("icp")).toBeLessThan(callOrder.indexOf("risk"));
    expect(callOrder.indexOf("intent")).toBeLessThan(callOrder.indexOf("risk"));

    // risk is the real proof this isn't just call-order luck: it must have
    // been invoked with research+icp+intent's real outputs already merged in.
    const riskPriorOutputs = priorOutputsSeen.risk as Record<string, { stageId: string } | undefined>;
    expect(riskPriorOutputs.research?.stageId).toBe("research");
    expect(riskPriorOutputs.icp?.stageId).toBe("icp");
    expect(riskPriorOutputs.intent?.stageId).toBe("intent");

    // research itself must have seen nothing yet (it's the root, no deps).
    expect(priorOutputsSeen.research).toEqual({});

    expect(result.stageOutputs.research).toEqual({ stageId: "research", confidence: 77 });
    expect(result.stageOutputs.risk).toEqual({ stageId: "risk", confidence: 77 });
  });

  it("accumulates real CapabilityOutput per stage into capabilityOutputsByStage -- no reconstruction needed", async () => {
    const resolver = fakeCapabilitiesRecordingOrder([], {});

    const result = await runPlan(plan(SALES_LEAD_QUALIFICATION_PACK), resolver, sampleInput(), fakeCtx);

    expect(Object.keys(result.capabilityOutputsByStage).sort()).toEqual(["icp", "intent", "research", "risk"]);
    expect(result.capabilityOutputsByStage.research?.confidence).toBe(77);
    expect(result.capabilityOutputsByStage.research?.cost.tokens).toBe(100);
  });

  it("sums each capability's combined token cost into usage.inputTokens (documented limitation: no real input/output split survives CapabilityOutput.cost)", async () => {
    const resolver = fakeCapabilitiesRecordingOrder([], {});

    const result = await runPlan(plan(SALES_LEAD_QUALIFICATION_PACK), resolver, sampleInput(), fakeCtx);

    expect(result.usage.inputTokens).toBe(400); // 4 stages x 100 tokens each
    expect(result.usage.outputTokens).toBe(0);
  });

  it("throws a clear error if a plan somehow contains judge (must never happen -- judge is not a capability)", async () => {
    // Hand-built via the real buildExecutionPlan constructor, not a hacked
    // toGraph() override -- nextReadyStages() closes over its own
    // nodes/edges at construction time, so a real graph is required for
    // "judge" to actually surface as a ready stage.
    const badPlan = buildExecutionPlan("test", [{ id: "judge", capabilityId: "judge" }], []);
    // A capability that succeeds is required to actually reach
    // mergeStageOutput's judge guard -- a throwing resolver would fail the
    // Promise.all before that guard ever runs, testing the wrong thing.
    const resolver: CapabilityResolver = () => ({
      id: "judge",
      async invoke() {
        return {
          capabilityId: "judge",
          outputs: { verdict: "YES" },
          confidence: 90,
          evidenceProduced: [],
          disagreements: [],
          cost: { tokens: 10, latencyMs: 1, costUsd: 0, reasoningDepth: 1 },
          latencyMs: 1,
        };
      },
    });

    await expect(runPlan(badPlan, resolver, sampleInput(), fakeCtx)).rejects.toThrow(/judge is not a capability/);
  });
});
