import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Prospect } from "@argus/database";

const enrichOrganizationByDomain = vi.fn();
const enrichPersonByLinkedInUrl = vi.fn();
vi.mock("./apollo-client.js", () => ({ enrichOrganizationByDomain, enrichPersonByLinkedInUrl }));

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
    linkedInUrl: "https://linkedin.com/in/sarahchen",
    title: null,
    email: null,
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
  enrichPersonByLinkedInUrl.mockResolvedValue(null);
});

describe("enrichProspect", () => {
  it("skips company-level lookups (but still attempts person lookup) when the prospect has no companyDomain", async () => {
    const p = prospect({ companyDomain: null });
    await enrichProspect(p);
    expect(enrichOrganizationByDomain).not.toHaveBeenCalled();
    expect(enrichCompanyByDomain).not.toHaveBeenCalled();
    expect(enrichPersonByLinkedInUrl).toHaveBeenCalledWith("https://linkedin.com/in/sarahchen");
  });

  it("skips re-enrichment (including person lookup) within the 30-day staleness window (Bible §9.1 lastEnrichedAt)", async () => {
    const recentlyEnriched = prospect({ lastEnrichedAt: new Date(Date.now() - 1000) });
    const result = await enrichProspect(recentlyEnriched);
    expect(result).toEqual({ prospect: recentlyEnriched, apollo: null, clearbit: null, person: null });
    expect(enrichOrganizationByDomain).not.toHaveBeenCalled();
    expect(enrichPersonByLinkedInUrl).not.toHaveBeenCalled();
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

  it("fills in title and email from Apollo's person match only when the prospect doesn't already have them", async () => {
    const p = prospect({ title: null, email: null });
    enrichOrganizationByDomain.mockResolvedValue(null);
    enrichCompanyByDomain.mockResolvedValue(null);
    enrichPersonByLinkedInUrl.mockResolvedValue({
      title: "VP Engineering",
      seniority: "vp",
      email: "sarah@dataflow.io",
      emailStatus: "verified",
    });
    prisma.prospect.update.mockResolvedValue({ ...p, title: "VP Engineering", email: "sarah@dataflow.io" });

    const result = await enrichProspect(p);

    expect(prisma.prospect.update).toHaveBeenCalledWith({
      where: { id: "prospect_1" },
      data: expect.objectContaining({ title: "VP Engineering", email: "sarah@dataflow.io" }),
    });
    expect(result.person?.seniority).toBe("vp");
  });

  it("never overwrites an already-known title or email with Apollo's person match (live scrape/existing data wins)", async () => {
    const p = prospect({ title: "Director of Platform", email: "sarah.existing@dataflow.io" });
    enrichOrganizationByDomain.mockResolvedValue(null);
    enrichCompanyByDomain.mockResolvedValue(null);
    enrichPersonByLinkedInUrl.mockResolvedValue({
      title: "VP Engineering",
      seniority: "vp",
      email: "sarah@dataflow.io",
      emailStatus: "verified",
    });
    prisma.prospect.update.mockResolvedValue(p);

    await enrichProspect(p);

    expect(prisma.prospect.update).toHaveBeenCalledWith({
      where: { id: "prospect_1" },
      data: expect.objectContaining({ title: "Director of Platform", email: "sarah.existing@dataflow.io" }),
    });
  });

  it("degrades gracefully when Apollo person enrichment fails but org enrichment succeeds (Bible §16.1 Risk #4)", async () => {
    const p = prospect();
    enrichOrganizationByDomain.mockResolvedValue({
      industry: "SaaS",
      estimatedNumEmployees: 50,
      totalFunding: null,
      latestFundingRoundDate: null,
    });
    enrichCompanyByDomain.mockResolvedValue(null);
    enrichPersonByLinkedInUrl.mockRejectedValue(new Error("Apollo person match is down"));
    prisma.prospect.update.mockResolvedValue({ ...p, companyIndustry: "SaaS" });

    const result = await enrichProspect(p);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ prospectId: "prospect_1" }),
      expect.stringContaining("Apollo person enrichment failed"),
    );
    expect(result.person).toBeNull();
    expect(result.apollo?.industry).toBe("SaaS");
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

  it("leaves the prospect untouched when every provider fails or finds nothing", async () => {
    const p = prospect();
    enrichOrganizationByDomain.mockRejectedValue(new Error("down"));
    enrichCompanyByDomain.mockRejectedValue(new Error("down"));
    enrichPersonByLinkedInUrl.mockResolvedValue(null);

    const result = await enrichProspect(p);

    expect(result).toEqual({ prospect: p, apollo: null, clearbit: null, person: null });
    expect(prisma.prospect.update).not.toHaveBeenCalled();
  });
});
