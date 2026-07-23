import { describe, expect, it } from "vitest";
import type { Evidence } from "@argus/database";
import { IntentRetriever } from "./intent-retriever.js";

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "e1",
    type: "INTENT",
    source: "LINKEDIN",
    data: {},
    confidence: 70,
    extractedAt: new Date(),
    isStale: false,
    prospectId: "p1",
    decisionId: null,
    ...overrides,
  } as Evidence;
}

describe("IntentRetriever", () => {
  it("only considers INTENT-type evidence", async () => {
    const pool = [makeEvidence({ id: "e1", type: "INTENT" }), makeEvidence({ id: "e2", type: "FIRMOGRAPHIC" })];

    const result = await new IntentRetriever().retrieve(pool);

    expect(result.map((e) => e.id)).toEqual(["e1"]);
  });

  it("prioritizes recency over confidence -- fresh-but-uncertain beats stale-but-confident", async () => {
    const now = new Date();
    const stale = new Date(now.getTime() - 85 * 24 * 60 * 60 * 1000);
    const pool = [
      makeEvidence({ id: "fresh", confidence: 55, extractedAt: now }),
      makeEvidence({ id: "stale-confident", confidence: 95, extractedAt: stale }),
    ];

    const result = await new IntentRetriever().retrieve(pool);

    expect(result[0]?.id).toBe("fresh");
  });
});
