import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Prospect } from "@argus/database";

const enrichOrganizationByDomain = vi.fn();
vi.mock("./apollo-client.js", () => ({ enrichOrganizationByDomain }));

const enrichCompanyByDomain = vi.fn();
vi.mock("./clearbit-client.js", () => ({ enrichCompanyByDomain }));

const prisma = { prospect: { update: vi.fn() } };
vi.mock("@argus/database", () => ({ prisma }));

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
vi.mock("../logger.js", () => ({ logger }));

const { enrichProspect } = await import("./enrichment.service.js");

function prospect(overrides: Partial<Record<string, unknown>> = {}): Prospect {
  return {
    id: "prospect_1",
    companyDomain: "dataflow.io",
    companySize: null,
    companyIndustry: null,
    companyFunding: null,
    lastEnrichedAt: null,
    ...overrides,
  } as unknown as Prospect;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enrichProspect", () => {
  it("skips enrichment entirely when the prospect has no companyDomain", async () => {
    const p = prospect({ companyDomain: null });
    const result = await enrichProspect(p);
    expect(result).toEqual({ prospect: p, apollo: null, clearbit: null });
    expect(enrichOrganizationByDomain).not.toHaveBeenCalled();
  });

  it("skips re-enrichment within the 30-day staleness window (Bible §9.1 lastEnrichedAt)", async () => {
    const recentlyEnriched = prospect({ lastEnrichedAt: new Date(Date.now() - 1000) });
    const result = await enrichProspect(recentlyEnriched);
    expect(result.apollo).toBeNull();
    expect(enrichOrganizationByDomain).not.toHaveBeenCalled();
  });

  it("re-enriches once the 30-day window has passed", async () => {
    const stale = prospect({ lastEnrichedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) });
    enrichOrganizationByDomain.mockResolvedValue(null);
    enrichCompanyByDomain.mockResolvedValue(null);
    await enrichProspect(stale);
    expect(enrichOrganizationByDomain).toHaveBeenCalledWith("dataflow.io");
  });

  it("merges Apollo data into the Prospect record and stamps lastEnrichedAt", async () => {
    const p = prospect();
    enrichOrganizationByDomain.mockResolvedValue({
      industry: "information technology & services",
      estimatedNumEmployees: 87,
      totalFunding: 24_000_000,
      latestFundingRoundDate: null,
    });
    enrichCompanyByDomain.mockResolvedValue(null);
    prisma.prospect.update.mockResolvedValue({ ...p, companySize: "87" });

    const result = await enrichProspect(p);

    expect(prisma.prospect.update).toHaveBeenCalledWith({
      where: { id: "prospect_1" },
      data: expect.objectContaining({
        companySize: "87",
        companyIndustry: "information technology & services",
        companyFunding: "$24,000,000",
      }),
    });
    expect(result.apollo?.estimatedNumEmployees).toBe(87);
  });

  it("degrades gracefully when Apollo fails but Clearbit succeeds (Bible §16.1 Risk #4)", async () => {
    const p = prospect();
    enrichOrganizationByDomain.mockRejectedValue(new Error("Apollo is down"));
    enrichCompanyByDomain.mockResolvedValue({ employees: 200, raised: 1_500_000_000, industry: "Transportation" });
    prisma.prospect.update.mockResolvedValue({ ...p, companySize: "200" });

    const result = await enrichProspect(p);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ prospectId: "prospect_1" }),
      expect.stringContaining("Apollo enrichment failed"),
    );
    expect(result.clearbit?.employees).toBe(200);
    expect(prisma.prospect.update).toHaveBeenCalled();
  });

  it("leaves the prospect untouched when both providers fail", async () => {
    const p = prospect();
    enrichOrganizationByDomain.mockRejectedValue(new Error("down"));
    enrichCompanyByDomain.mockRejectedValue(new Error("down"));

    const result = await enrichProspect(p);

    expect(result).toEqual({ prospect: p, apollo: null, clearbit: null });
    expect(prisma.prospect.update).not.toHaveBeenCalled();
  });
});
