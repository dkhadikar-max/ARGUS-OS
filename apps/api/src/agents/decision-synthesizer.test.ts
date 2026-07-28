import { describe, expect, it } from "vitest";
import { createCallAgentDecisionSynthesizer } from "./decision-synthesizer.js";
import { SALES_LEAD_QUALIFICATION_PACK } from "./decision-pack.js";
import type { LLMProvider, LLMCallParams, LLMCallResult } from "./providers/llm-provider.interface.js";
import type { DecisionAgentInput } from "./orchestrator.js";
import type { ExecutionContext } from "./reasoning-capability.js";

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

function sampleJudgeOutput() {
  return {
    verdict: "YES" as const,
    confidence: 82,
    weighted_score: 78,
    agent_consensus: "high" as const,
    conflicts: [],
    reasoning: "Good fit overall.",
    key_evidence: ["signal 1"],
    message: { linkedin: "Hi there", email: null, tone: "professional" as const, personalization_hooks: [] },
    recommended_action: "message_now" as const,
    confidence_explanation: "Data is solid.",
  };
}

const fakeCtx: ExecutionContext = {
  identity: { teamId: "team_1", userId: "user_1", prospectId: "p1", prospectName: "Acme Co" },
  budget: { remainingReasoning: 5, remainingLatency: 100_000, remainingCost: 10 },
};

describe("createCallAgentDecisionSynthesizer", () => {
  it("calls the real callAgent/buildStagePrompt plumbing against the real Sales pack, via an injected LLMProvider -- zero live API calls", async () => {
    const fakeProvider: LLMProvider = {
      call: async (params: LLMCallParams): Promise<LLMCallResult> => {
        expect(params.tool.name).toBe("submit_judge"); // the real JUDGE_TOOL, from the real pack
        return { toolInput: sampleJudgeOutput(), textContent: null, stopReason: "tool_use", inputTokens: 55, outputTokens: 40 };
      },
    };
    const synthesizer = createCallAgentDecisionSynthesizer(SALES_LEAD_QUALIFICATION_PACK, fakeProvider);

    const result = await synthesizer.synthesize({ input: sampleInput(), stageOutputs: {} }, fakeCtx);

    expect(result.output.verdict).toBe("YES");
    expect(result.usage).toEqual({ inputTokens: 55, outputTokens: 40 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
