import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ApolloOrganization, ApolloPerson } from "../lib/enrichment/apollo-client.js";
import type { ClearbitCompany } from "../lib/enrichment/clearbit-client.js";

interface CreateManyRow {
  source: string;
  confidence: number;
  data: { dimension: string; value: unknown; agreement: string; otherSource: unknown; signal: string; relevance: string };
}

const tx = {
  evidence: {
    updateMany: vi.fn(),
    createManyAndReturn: vi.fn(),
  },
  evidenceEdge: {
    createMany: vi.fn(),
  },
};
const prisma = {
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
};
vi.mock("@argus/database", () => ({ prisma }));

const { populateEvidenceFromEnrichment } = await import("./evidence-populator.service.js");

function apolloOrg(overrides: Partial<ApolloOrganization> = {}): ApolloOrganization {
  return { industry: null, estimatedNumEmployees: null, totalFunding: null, latestFundingRoundDate: null, ...overrides };
}
function clearbitCo(overrides: Partial<ClearbitCompany> = {}): ClearbitCompany {
  return { employees: null, raised: null, industry: null, ...overrides };
}
function apolloPerson(overrides: Partial<ApolloPerson> = {}): ApolloPerson {
  return { title: null, seniority: null, email: null, emailStatus: null, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.evidence.updateMany.mockResolvedValue({ count: 0 });
  let idCounter = 0;
  // Faithfully echoes back what createManyAndReturn was called with,
  // assigning each row a real-looking id -- matches Postgres's real
  // behavior of returning one row per input row, without assuming
  // anything about *order* beyond "same set" (the tests below correlate
  // by source+dimension, same as the real implementation does).
  tx.evidence.createManyAndReturn.mockImplementation(async ({ data }: { data: CreateManyRow[] }) => data.map((d) => ({ id: `ev_${++idCounter}`, source: d.source, data: d.data })));
  tx.evidenceEdge.createMany.mockResolvedValue({ count: 0 });
});

function createManyRows(): CreateManyRow[] {
  return tx.evidence.createManyAndReturn.mock.calls[0]?.[0]?.data ?? [];
}
function rowFor(dimension: string, source: string): CreateManyRow | undefined {
  return createManyRows().find((r) => r.data.dimension === dimension && r.source === source);
}

describe("populateEvidenceFromEnrichment", () => {
  it("all three inputs null -- no-op, zero Prisma calls", async () => {
    const result = await populateEvidenceFromEnrichment({ prospectId: "p1", apollo: null, clearbit: null, person: null });

    expect(result).toEqual({ evidenceCreated: 0, edgesCreated: 0, staleMarked: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("issues exactly 3 round-trips total, regardless of how many dimensions/fields produced writes (the actual optimization target)", async () => {
    await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ estimatedNumEmployees: 100, industry: "SaaS", totalFunding: 5_000_000, latestFundingRoundDate: "2026-01-01" }),
      clearbit: clearbitCo({ employees: 95, industry: "fintech", raised: 5_100_000 }),
      person: apolloPerson({ title: "VP Sales", seniority: "vp", email: "a@b.com", emailStatus: "verified" }),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.evidence.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.evidence.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(tx.evidenceEdge.createMany).toHaveBeenCalledTimes(1);
  });

  it("corroborated numeric dimension (companySize within 15% tolerance) -- 2 rows conf 99, 2 bidirectional CORROBORATES edges, batched", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ estimatedNumEmployees: 100 }),
      clearbit: clearbitCo({ employees: 95 }),
      person: null,
    });

    expect(result.evidenceCreated).toBe(2);
    expect(result.edgesCreated).toBe(2);
    expect(tx.evidence.createManyAndReturn).toHaveBeenCalledTimes(1);

    const apolloRow = rowFor("companySize", "APOLLO");
    const clearbitRow = rowFor("companySize", "CLEARBIT");
    expect(apolloRow).toMatchObject({ confidence: 99, data: expect.objectContaining({ value: 100, agreement: "corroborated" }) });
    expect(clearbitRow).toMatchObject({ confidence: 99, data: expect.objectContaining({ value: 95, agreement: "corroborated" }) });

    expect(tx.evidenceEdge.createMany).toHaveBeenCalledTimes(1);
    const edgeRows = tx.evidenceEdge.createMany.mock.calls[0]?.[0]?.data;
    expect(edgeRows).toHaveLength(2);
    expect(edgeRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "CORROBORATES" }),
        expect.objectContaining({ relation: "CORROBORATES" }),
      ]),
    );
    // Both directions present -- every edge's fromId/toId is one of the two real ids created above.
    const realIds = [apolloRow, clearbitRow].map((r) => createManyRows().indexOf(r!)).map((i) => `ev_${i + 1}`);
    for (const edge of edgeRows) {
      expect(realIds).toContain(edge.fromId);
      expect(realIds).toContain(edge.toId);
      expect(edge.fromId).not.toBe(edge.toId);
    }
  });

  it("contradicted numeric dimension (companySize outside tolerance) -- 2 rows conf 65, 2 CONTRADICTS edges", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ estimatedNumEmployees: 100 }),
      clearbit: clearbitCo({ employees: 400 }),
      person: null,
    });

    expect(result.evidenceCreated).toBe(2);
    expect(result.edgesCreated).toBe(2);
    expect(rowFor("companySize", "APOLLO")).toMatchObject({ confidence: 65, data: expect.objectContaining({ agreement: "contradicted" }) });
    const edgeRows = tx.evidenceEdge.createMany.mock.calls[0]?.[0]?.data;
    expect(edgeRows.every((e: { relation: string }) => e.relation === "CONTRADICTS")).toBe(true);
  });

  it("industry corroborated after normalization (case/whitespace-only difference)", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ industry: "SaaS" }),
      clearbit: clearbitCo({ industry: "  saas " }),
      person: null,
    });

    expect(result.edgesCreated).toBe(2);
    const edgeRows = tx.evidenceEdge.createMany.mock.calls[0]?.[0]?.data;
    expect(edgeRows.every((e: { relation: string }) => e.relation === "CORROBORATES")).toBe(true);
  });

  it("industry contradicted (genuinely different values)", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ industry: "Fintech" }),
      clearbit: clearbitCo({ industry: "Healthcare" }),
      person: null,
    });

    expect(result.edgesCreated).toBe(2);
    const edgeRows = tx.evidenceEdge.createMany.mock.calls[0]?.[0]?.data;
    expect(edgeRows.every((e: { relation: string; strength: number }) => e.relation === "CONTRADICTS" && e.strength === 0.5)).toBe(true);
  });

  it("single-source dimension (only Apollo has a value) -- 1 row, no edge call at all, confidence 85 unadjusted", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ totalFunding: 2_000_000 }),
      clearbit: clearbitCo(),
      person: null,
    });

    expect(result.evidenceCreated).toBe(1);
    expect(result.edgesCreated).toBe(0);
    expect(rowFor("companyFunding", "APOLLO")).toMatchObject({ confidence: 85, data: expect.objectContaining({ value: 2_000_000, agreement: "single-source" }) });
    expect(tx.evidenceEdge.createMany).not.toHaveBeenCalled();
  });

  it("uses the raw Apollo/Clearbit funding numbers, not a formatted string", async () => {
    await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ totalFunding: 1_000_000 }),
      clearbit: clearbitCo({ raised: 1_050_000 }),
      person: null,
    });

    const row = rowFor("companyFunding", "APOLLO");
    expect(row?.data.value).toBe(1_000_000);
    expect(typeof row?.data.value).toBe("number");
  });

  it("estimatedNumEmployees: 0 is treated as present data, not missing (!= null, not truthiness)", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ estimatedNumEmployees: 0 }),
      clearbit: clearbitCo(),
      person: null,
    });

    expect(result.evidenceCreated).toBe(1);
    expect(rowFor("companySize", "APOLLO")?.data.value).toBe(0);
  });

  it("Apollo-only person fields -> DEMOGRAPHIC; funding-round date -> FIRMOGRAPHIC", async () => {
    await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ latestFundingRoundDate: "2026-01-15" }),
      clearbit: null,
      person: apolloPerson({ title: "VP Sales", seniority: "vp", email: "a@b.com", emailStatus: "verified" }),
    });

    const call = tx.evidence.createManyAndReturn.mock.calls[0]?.[0]?.data;
    const fundingRow = call.find((r: { data: { dimension: string } }) => r.data.dimension === "latestFundingRoundDate");
    const titleRow = call.find((r: { data: { dimension: string } }) => r.data.dimension === "title");

    expect(fundingRow.type).toBe("FIRMOGRAPHIC");
    expect(titleRow.type).toBe("DEMOGRAPHIC");
    expect(titleRow.confidence).toBe(85);
  });

  it("apollo and clearbit both null but person present -- still processes Apollo-only person fields", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: null,
      clearbit: null,
      person: apolloPerson({ title: "CEO" }),
    });

    expect(result.evidenceCreated).toBe(1);
    expect(rowFor("title", "APOLLO")?.data.value).toBe("CEO");
  });

  it("staleness is scoped to (prospectId, dimension, source), not (prospectId, type), in one batched updateMany", async () => {
    await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ estimatedNumEmployees: 120 }),
      clearbit: null,
      person: null,
    });

    expect(tx.evidence.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.evidence.updateMany).toHaveBeenCalledWith({
      where: {
        prospectId: "p1",
        isStale: false,
        OR: [{ source: "APOLLO", data: { path: ["dimension"], equals: "companySize" } }],
      },
      data: { isStale: true },
    });
  });

  it("confidence clamp: 85 + 15 corroboration boost = 100, capped at 99 (CONFIDENCE_CEILING)", async () => {
    await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ estimatedNumEmployees: 100 }),
      clearbit: clearbitCo({ employees: 100 }),
      person: null,
    });

    expect(rowFor("companySize", "APOLLO")?.confidence).toBe(99);
  });
});
