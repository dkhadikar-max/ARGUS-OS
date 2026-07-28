import { describe, expect, it } from "vitest";
import { priorityWeight, scoreRecommendedAction, selectBestAdvisory } from "./advisory-scoring.js";
import type { CapabilityOutput, ExecutionContext, RecommendedAction } from "./reasoning-capability.js";
import { RETRIEVER_CAPABILITIES } from "./reasoning-capability.js";

const fakeCtx: ExecutionContext = {
  identity: { teamId: "team_1", userId: "user_1", prospectId: "p1", prospectName: "Acme Co" },
  budget: { remainingReasoning: 5, remainingLatency: 100_000, remainingCost: 10 },
};

function action(overrides: Partial<RecommendedAction> = {}): RecommendedAction {
  return {
    action: "invoke_capability",
    priority: "high",
    rationale: "Test rationale.",
    expectedConfidenceGain: 15,
    ...overrides,
  };
}

function outputWithAdvisory(overrides: {
  confidence?: number;
  recommendedNextActions?: RecommendedAction[];
}): CapabilityOutput<unknown> {
  return {
    capabilityId: "test",
    outputs: undefined,
    confidence: 80,
    evidenceProduced: [],
    disagreements: [],
    cost: { tokens: 0, latencyMs: 0, costUsd: 0, reasoningDepth: 0 },
    latencyMs: 0,
    advisory: {
      recommendedNextActions: overrides.recommendedNextActions ?? [action()],
      reasoning: "Test advisory reasoning.",
      confidence: overrides.confidence ?? 90,
    },
  };
}

describe("priorityWeight", () => {
  it("matches Controller spec v3.0 Section 3.3's own stated weights", () => {
    expect(priorityWeight("critical")).toBe(2.0);
    expect(priorityWeight("high")).toBe(1.5);
    expect(priorityWeight("medium")).toBe(1.0);
    expect(priorityWeight("low")).toBe(0.5);
  });
});

describe("scoreRecommendedAction", () => {
  it("computes expectedConfidenceGain * (advisoryConfidence/100) * priorityWeight(priority)", () => {
    const result = scoreRecommendedAction(action({ priority: "high", expectedConfidenceGain: 15 }), 92);
    expect(result?.score).toBeCloseTo(15 * 0.92 * 1.5, 10);
    expect(result?.advisoryConfidence).toBe(92);
  });

  it("returns null when expectedConfidenceGain is absent -- unscoreable, not worthless", () => {
    const { expectedConfidenceGain: _drop, ...withoutGain } = action();
    expect(scoreRecommendedAction(withoutGain, 90)).toBeNull();
  });

  it("preserves the original action's fields alongside the new score/advisoryConfidence", () => {
    const result = scoreRecommendedAction(action({ rationale: "Specific reason", capabilityId: "verifier" }), 90);
    expect(result?.rationale).toBe("Specific reason");
    expect(result?.capabilityId).toBe("verifier");
  });
});

describe("selectBestAdvisory", () => {
  it("returns null for an empty list", () => {
    expect(selectBestAdvisory([])).toBeNull();
  });

  it("returns null against real capability outputs today -- no real capability emits an advisory yet", async () => {
    const outputs = await Promise.all(
      Object.values(RETRIEVER_CAPABILITIES).map((capability) => capability.invoke({ evidencePool: [] }, fakeCtx)),
    );
    expect(selectBestAdvisory(outputs)).toBeNull();
  });

  it("returns null when an advisory exists but none of its actions are scoreable", () => {
    const { expectedConfidenceGain: _drop, ...unscoreable } = action();
    const outputs = [outputWithAdvisory({ recommendedNextActions: [unscoreable] })];
    expect(selectBestAdvisory(outputs)).toBeNull();
  });

  it("picks the single highest-scoring recommendation across multiple advisories", () => {
    const low = outputWithAdvisory({
      confidence: 60,
      recommendedNextActions: [action({ priority: "low", expectedConfidenceGain: 10, rationale: "low-scoring" })],
    });
    const high = outputWithAdvisory({
      confidence: 95,
      recommendedNextActions: [action({ priority: "critical", expectedConfidenceGain: 20, rationale: "high-scoring" })],
    });

    const best = selectBestAdvisory([low, high]);

    expect(best?.rationale).toBe("high-scoring");
    expect(best?.score).toBeCloseTo(20 * 0.95 * 2.0, 10);
  });
});
