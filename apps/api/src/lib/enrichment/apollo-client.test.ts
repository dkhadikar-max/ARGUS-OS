import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("enrichOrganizationByDomain — not configured", () => {
  it("returns null without making a request when APOLLO_API_KEY is unset", async () => {
    vi.doMock("../../config/env.js", () => ({ env: { APOLLO_API_KEY: undefined } }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { enrichOrganizationByDomain } = await import("./apollo-client.js");
    const result = await enrichOrganizationByDomain("dataflow.io");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("enrichOrganizationByDomain — configured", () => {
  beforeEach(() => {
    vi.doMock("../../config/env.js", () => ({ env: { APOLLO_API_KEY: "test-key" } }));
  });

  it("calls the verified Apollo endpoint with the x-api-key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        organization: {
          industry: "information technology & services",
          estimated_num_employees: 87,
          total_funding: 24_000_000,
          latest_funding_round_date: "2025-01-01T00:00:00.000Z",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { enrichOrganizationByDomain } = await import("./apollo-client.js");
    const result = await enrichOrganizationByDomain("dataflow.io");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.apollo.io/api/v1/organizations/enrich?domain=dataflow.io",
      expect.objectContaining({ method: "GET", headers: { "x-api-key": "test-key" } }),
    );
    expect(result).toEqual({
      industry: "information technology & services",
      estimatedNumEmployees: 87,
      totalFunding: 24_000_000,
      latestFundingRoundDate: "2025-01-01T00:00:00.000Z",
    });
  });

  it("returns null on a 404 (no matching organization) instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { enrichOrganizationByDomain } = await import("./apollo-client.js");
    await expect(enrichOrganizationByDomain("unknown.io")).resolves.toBeNull();
  });

  it("throws on a genuine API failure so the caller can decide how to degrade", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { enrichOrganizationByDomain } = await import("./apollo-client.js");
    await expect(enrichOrganizationByDomain("dataflow.io")).rejects.toThrow(/status 500/);
  });
});

describe("enrichPersonByLinkedInUrl — not configured", () => {
  it("returns null without making a request when APOLLO_API_KEY is unset", async () => {
    vi.doMock("../../config/env.js", () => ({ env: { APOLLO_API_KEY: undefined } }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { enrichPersonByLinkedInUrl } = await import("./apollo-client.js");
    const result = await enrichPersonByLinkedInUrl("https://linkedin.com/in/sarahchen");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("enrichPersonByLinkedInUrl — configured", () => {
  beforeEach(() => {
    vi.doMock("../../config/env.js", () => ({ env: { APOLLO_API_KEY: "test-key" } }));
  });

  it("calls the verified Apollo people/match endpoint with the x-api-key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        person: {
          title: "VP Engineering",
          seniority: "vp",
          email: "sarah@dataflow.io",
          email_status: "verified",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { enrichPersonByLinkedInUrl } = await import("./apollo-client.js");
    const result = await enrichPersonByLinkedInUrl("https://linkedin.com/in/sarahchen");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.apollo.io/api/v1/people/match?linkedin_url=https%3A%2F%2Flinkedin.com%2Fin%2Fsarahchen",
      expect.objectContaining({ method: "POST", headers: { "x-api-key": "test-key" } }),
    );
    expect(result).toEqual({
      title: "VP Engineering",
      seniority: "vp",
      email: "sarah@dataflow.io",
      emailStatus: "verified",
    });
  });

  it("returns null on a 404 (no matching person) instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { enrichPersonByLinkedInUrl } = await import("./apollo-client.js");
    await expect(enrichPersonByLinkedInUrl("https://linkedin.com/in/unknown")).resolves.toBeNull();
  });

  it("returns null when Apollo has no person object in the response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    const { enrichPersonByLinkedInUrl } = await import("./apollo-client.js");
    await expect(enrichPersonByLinkedInUrl("https://linkedin.com/in/sarahchen")).resolves.toBeNull();
  });

  it("throws on a genuine API failure so the caller can decide how to degrade", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { enrichPersonByLinkedInUrl } = await import("./apollo-client.js");
    await expect(enrichPersonByLinkedInUrl("https://linkedin.com/in/sarahchen")).rejects.toThrow(/status 500/);
  });
});
