import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ApolloOrganization, ApolloPerson } from "../lib/enrichment/apollo-client.js";
import type { ClearbitCompany } from "../lib/enrichment/clearbit-client.js";

const tx = {
  evidence: { create: vi.fn(), updateMany: vi.fn() },
  evidenceEdge: { upsert: vi.fn() },
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
  tx.evidence.create.mockImplementation(async () => ({ id: `ev_${++idCounter}` }));
  tx.evidenceEdge.upsert.mockResolvedValue({ id: "edge_1" });
});

describe("populateEvidenceFromEnrichment", () => {
  it("all three inputs null -- no-op, zero Prisma calls", async () => {
    const result = await populateEvidenceFromEnrichment({ prospectId: "p1", apollo: null, clearbit: null, person: null });

    expect(result).toEqual({ evidenceCreated: 0, edgesCreated: 0, staleMarked: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("exactly one prisma.$transaction call regardless of how many dimensions/fields produced writes", async () => {
    await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ estimatedNumEmployees: 100, industry: "SaaS", totalFunding: 5_000_000 }),
      clearbit: clearbitCo({ employees: 95, industry: "saas", raised: 5_100_000 }),
      person: apolloPerson({ title: "VP Sales" }),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("corroborated numeric dimension (companySize within 15% tolerance) -- 2 rows conf 99, 2 bidirectional CORROBORATES edges", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ estimatedNumEmployees: 100 }),
      clearbit: clearbitCo({ employees: 95 }),
      person: null,
    });

    expect(result.evidenceCreated).toBe(2);
    expect(result.edgesCreated).toBe(2);

    expect(tx.evidence.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ type: "FIRMOGRAPHIC", source: "APOLLO", confidence: 99, data: expect.objectContaining({ dimension: "companySize", value: 100, agreement: "corroborated" }) }),
      }),
    );
    expect(tx.evidence.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ type: "FIRMOGRAPHIC", source: "CLEARBIT", confidence: 99, data: expect.objectContaining({ dimension: "companySize", value: 95, agreement: "corroborated" }) }),
      }),
    );

    expect(tx.evidenceEdge.upsert).toHaveBeenCalledTimes(2);
    expect(tx.evidenceEdge.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ create: expect.objectContaining({ fromId: "ev_1", toId: "ev_2", relation: "CORROBORATES" }) }),
    );
    expect(tx.evidenceEdge.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ create: expect.objectContaining({ fromId: "ev_2", toId: "ev_1", relation: "CORROBORATES" }) }),
    );
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
    expect(tx.evidence.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ source: "APOLLO", confidence: 65, data: expect.objectContaining({ agreement: "contradicted" }) }) }),
    );
    expect(tx.evidenceEdge.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ create: expect.objectContaining({ relation: "CONTRADICTS" }) }));
  });

  it("industry corroborated after normalization (case/whitespace-only difference)", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ industry: "SaaS" }),
      clearbit: clearbitCo({ industry: "  saas " }),
      person: null,
    });

    expect(result.edgesCreated).toBe(2);
    expect(tx.evidenceEdge.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ create: expect.objectContaining({ relation: "CORROBORATES" }) }));
  });

  it("industry contradicted (genuinely different values)", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ industry: "Fintech" }),
      clearbit: clearbitCo({ industry: "Healthcare" }),
      person: null,
    });

    expect(result.edgesCreated).toBe(2);
    expect(tx.evidenceEdge.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ create: expect.objectContaining({ relation: "CONTRADICTS", strength: 0.5 }) }),
    );
  });

  it("single-source dimension (only Apollo has a value) -- 1 row, no edge, confidence 85 unadjusted", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ totalFunding: 2_000_000 }),
      clearbit: clearbitCo(),
      person: null,
    });

    expect(result.evidenceCreated).toBe(1);
    expect(result.edgesCreated).toBe(0);
    expect(tx.evidence.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: "APOLLO", confidence: 85, data: expect.objectContaining({ dimension: "companyFunding", value: 2_000_000, agreement: "single-source" }) }) }),
    );
    expect(tx.evidenceEdge.upsert).not.toHaveBeenCalled();
  });

  it("uses the raw Apollo/Clearbit funding numbers, not a formatted string", async () => {
    await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ totalFunding: 1_000_000 }),
      clearbit: clearbitCo({ raised: 1_050_000 }),
      person: null,
    });

    const call = tx.evidence.create.mock.calls[0]?.[0];
    expect(call.data.data.value).toBe(1_000_000);
    expect(typeof call.data.data.value).toBe("number");
  });

  it("estimatedNumEmployees: 0 is treated as present data, not missing (!= null, not truthiness)", async () => {
    const result = await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ estimatedNumEmployees: 0 }),
      clearbit: clearbitCo(),
      person: null,
    });

    expect(result.evidenceCreated).toBe(1);
    expect(tx.evidence.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ data: expect.objectContaining({ value: 0 }) }) }));
  });

  it("Apollo-only person fields -> DEMOGRAPHIC; funding-round date -> FIRMOGRAPHIC", async () => {
    await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ latestFundingRoundDate: "2026-01-15" }),
      clearbit: null,
      person: apolloPerson({ title: "VP Sales", seniority: "vp", email: "a@b.com", emailStatus: "verified" }),
    });

    const creates = tx.evidence.create.mock.calls.map((c) => c[0].data);
    const fundingRow = creates.find((c: { data: { dimension: string } }) => c.data.dimension === "latestFundingRoundDate");
    const titleRow = creates.find((c: { data: { dimension: string } }) => c.data.dimension === "title");

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
    expect(tx.evidence.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ data: expect.objectContaining({ dimension: "title", value: "CEO" }) }) }));
  });

  it("staleness is scoped to (prospectId, dimension, source), not (prospectId, type)", async () => {
    await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ estimatedNumEmployees: 120 }),
      clearbit: null,
      person: null,
    });

    expect(tx.evidence.updateMany).toHaveBeenCalledWith({
      where: { prospectId: "p1", source: "APOLLO", isStale: false, data: { path: ["dimension"], equals: "companySize" } },
      data: { isStale: true },
    });
    // companyIndustry/companyFunding dimensions had no data on either side,
    // so markStalePrior must never be called for them.
    expect(tx.evidence.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ data: { path: ["dimension"], equals: "companyIndustry" } }) }));
  });

  it("confidence clamp: 85 + 15 corroboration boost = 100, capped at 99 (CONFIDENCE_CEILING)", async () => {
    await populateEvidenceFromEnrichment({
      prospectId: "p1",
      apollo: apolloOrg({ estimatedNumEmployees: 100 }),
      clearbit: clearbitCo({ employees: 100 }),
      person: null,
    });

    expect(tx.evidence.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ confidence: 99 }) }));
  });
});
