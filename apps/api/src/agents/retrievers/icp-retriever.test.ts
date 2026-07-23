import { describe, expect, it } from "vitest";
import type { Evidence } from "@argus/database";
import { ICPRetriever } from "./icp-retriever.js";

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

describe("ICPRetriever", () => {
  it("only considers firmographic/technographic/demographic evidence", async () => {
    const pool = [
      makeEvidence({ id: "e1", type: "TECHNOGRAPHIC" }),
      makeEvidence({ id: "e2", type: "MARKET" }),
      makeEvidence({ id: "e3", type: "INTENT" }),
    ];

    const result = await new ICPRetriever().retrieve(pool);

    expect(result.map((e) => e.id)).toEqual(["e1"]);
  });

  it("weights confidence more heavily than recency", async () => {
    const now = new Date();
    const oldButConfident = new Date(now.getTime() - 80 * 24 * 60 * 60 * 1000);
    const pool = [
      makeEvidence({ id: "fresh-low-confidence", confidence: 40, extractedAt: now }),
      makeEvidence({ id: "old-high-confidence", confidence: 95, extractedAt: oldButConfident }),
    ];

    const result = await new ICPRetriever().retrieve(pool);

    expect(result[0]?.id).toBe("old-high-confidence");
  });
});
