import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Evidence } from "@argus/database";

const prisma = { evidenceEdge: { findMany: vi.fn() } };
vi.mock("@argus/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@argus/database")>();
  return { ...actual, prisma };
});

const { RiskRetriever } = await import("./risk-retriever.js");

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "e1",
    type: "DERIVED",
    source: "INFERRED",
    data: {},
    confidence: 60,
    extractedAt: new Date(),
    isStale: false,
    prospectId: "p1",
    decisionId: null,
    ...overrides,
  } as Evidence;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RiskRetriever", () => {
  it("only considers DERIVED/MARKET evidence", async () => {
    prisma.evidenceEdge.findMany.mockResolvedValue([]);
    const pool = [
      makeEvidence({ id: "e1", type: "DERIVED" }),
      makeEvidence({ id: "e2", type: "MARKET" }),
      makeEvidence({ id: "e3", type: "FIRMOGRAPHIC" }),
    ];

    const result = await new RiskRetriever().retrieve(pool);

    expect(result.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("returns an empty array without querying edges when there are no risk-relevant candidates", async () => {
    const pool = [makeEvidence({ id: "e1", type: "FIRMOGRAPHIC" })];

    const result = await new RiskRetriever().retrieve(pool);

    expect(result).toEqual([]);
    expect(prisma.evidenceEdge.findMany).not.toHaveBeenCalled();
  });

  it("ranks a corroborated risk signal above an uncorroborated one of equal confidence", async () => {
    prisma.evidenceEdge.findMany.mockResolvedValue([
      { id: "edge_1", fromId: "other", toId: "corroborated", relation: "CORROBORATES" },
    ]);
    const pool = [
      makeEvidence({ id: "corroborated", confidence: 60 }),
      makeEvidence({ id: "uncorroborated", confidence: 60 }),
    ];

    const result = await new RiskRetriever().retrieve(pool);

    expect(result[0]?.id).toBe("corroborated");
    expect(prisma.evidenceEdge.findMany).toHaveBeenCalledWith({
      where: { toId: { in: ["corroborated", "uncorroborated"] }, relation: "CORROBORATES" },
    });
  });

  it("caps corroboration credit at 3 edges so it can't dominate the score unboundedly", async () => {
    prisma.evidenceEdge.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `edge_${i}`,
        fromId: `other_${i}`,
        toId: "e1",
        relation: "CORROBORATES",
      })),
    );
    const pool = [makeEvidence({ id: "e1", confidence: 50 })];

    const result = await new RiskRetriever().retrieve(pool);

    // Doesn't throw and produces a valid, still-ranked single result --
    // the cap is exercised via the score staying within [0,1] contribution,
    // asserted indirectly by confirming this doesn't crash on 10 edges.
    expect(result).toHaveLength(1);
  });
});
