import { describe, expect, it } from "vitest";
import type { Evidence } from "@argus/database";
import { ResearchRetriever } from "./research-retriever.js";

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

describe("ResearchRetriever", () => {
  it("filters out evidence types outside its scope (e.g. INTENT)", async () => {
    const pool = [makeEvidence({ id: "e1", type: "FIRMOGRAPHIC" }), makeEvidence({ id: "e2", type: "INTENT" })];

    const result = await new ResearchRetriever().retrieve(pool);

    expect(result.map((e) => e.id)).toEqual(["e1"]);
  });

  it("ranks higher-confidence, more-recent evidence above lower-confidence, stale evidence", async () => {
    const now = new Date();
    const stale = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000);
    const pool = [
      makeEvidence({ id: "low", confidence: 30, extractedAt: stale }),
      makeEvidence({ id: "high", confidence: 90, extractedAt: now }),
    ];

    const result = await new ResearchRetriever().retrieve(pool);

    expect(result[0]?.id).toBe("high");
  });

  it("respects the topK limit", async () => {
    const pool = Array.from({ length: 10 }, (_, i) => makeEvidence({ id: `e${i}` }));

    const result = await new ResearchRetriever().retrieve(pool, 3);

    expect(result).toHaveLength(3);
  });
});
