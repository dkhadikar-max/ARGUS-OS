import { describe, expect, it } from "vitest";
import type { Evidence } from "@argus/database";
import { RETRIEVER_CAPABILITIES, wrapRetrieverAsCapability, type ReasoningCapability } from "./reasoning-capability.js";
import type { Retriever } from "./retrievers/types.js";

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

describe("wrapRetrieverAsCapability", () => {
  it("passes evidencePool/topK through to the real retriever and returns its output as both outputs and evidenceProduced", async () => {
    const pool = [makeEvidence({ id: "e1" }), makeEvidence({ id: "e2" })];
    const fakeRetriever: Retriever = { retrieve: async (evidencePool, topK) => evidencePool.slice(0, topK ?? evidencePool.length) };
    const capability = wrapRetrieverAsCapability("fake", fakeRetriever);

    const output = await capability.invoke({ evidencePool: pool, topK: 1 });

    expect(output.capabilityId).toBe("fake");
    expect(output.outputs).toEqual([pool[0]]);
    expect(output.evidenceProduced).toEqual([pool[0]]);
  });

  it("reports confidence 100 when evidence was found, 0 when none was", async () => {
    const found: Retriever = { retrieve: async () => [makeEvidence()] };
    const empty: Retriever = { retrieve: async () => [] };

    const foundOutput = await wrapRetrieverAsCapability("found", found).invoke({ evidencePool: [] });
    const emptyOutput = await wrapRetrieverAsCapability("empty", empty).invoke({ evidencePool: [] });

    expect(foundOutput.confidence).toBe(100);
    expect(emptyOutput.confidence).toBe(0);
  });

  it("reports zero disagreements and zero real cost (no LLM call happens in a retriever)", async () => {
    const retriever: Retriever = { retrieve: async () => [makeEvidence()] };
    const output = await wrapRetrieverAsCapability("id", retriever).invoke({ evidencePool: [] });

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
    const output = await wrapRetrieverAsCapability("slow", slowRetriever).invoke({ evidencePool: [] });

    expect(output.latencyMs).toBeGreaterThanOrEqual(15);
    expect(output.cost.latencyMs).toBe(output.latencyMs);
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

    const output = await capability.invoke({ evidencePool: pool });

    expect(output.outputs.map((e) => e.id)).toEqual(["firmo"]);
  });
});
