import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("enrichCompanyByDomain — not configured", () => {
  it("returns null without making a request when CLEARBIT_API_KEY is unset", async () => {
    vi.doMock("../../config/env.js", () => ({ env: { CLEARBIT_API_KEY: undefined } }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { enrichCompanyByDomain } = await import("./clearbit-client.js");
    const result = await enrichCompanyByDomain("dataflow.io");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("enrichCompanyByDomain — configured", () => {
  beforeEach(() => {
    vi.doMock("../../config/env.js", () => ({ env: { CLEARBIT_API_KEY: "test-key" } }));
  });

  it("authenticates with HTTP Basic auth, not Bearer (verified against Clearbit's own client source)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ employees: 87, raised: 24_000_000, category: { industry: "Software" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { enrichCompanyByDomain } = await import("./clearbit-client.js");
    await enrichCompanyByDomain("dataflow.io");

    const expectedAuth = `Basic ${Buffer.from("test-key:").toString("base64")}`;
    expect(fetchMock).toHaveBeenCalledWith(
      "https://company.clearbit.com/v2/companies/find?domain=dataflow.io",
      expect.objectContaining({ method: "GET", headers: { Authorization: expectedAuth } }),
    );
  });

  it("maps category.industry, employees, and raised from the real response shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ employees: 87, raised: 24_000_000, category: { industry: "Software" } }),
    }));
    const { enrichCompanyByDomain } = await import("./clearbit-client.js");
    const result = await enrichCompanyByDomain("dataflow.io");
    expect(result).toEqual({ employees: 87, raised: 24_000_000, industry: "Software" });
  });

  it("falls back to metrics.employees/raised and categories[0] for older response shapes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ metrics: { employees: 200, raised: 1_500_000_000 }, categories: ["Transportation"] }),
    }));
    const { enrichCompanyByDomain } = await import("./clearbit-client.js");
    const result = await enrichCompanyByDomain("uber.com");
    expect(result).toEqual({ employees: 200, raised: 1_500_000_000, industry: "Transportation" });
  });

  it("returns null on a 404 (no matching company) instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { enrichCompanyByDomain } = await import("./clearbit-client.js");
    await expect(enrichCompanyByDomain("unknown.io")).resolves.toBeNull();
  });

  it("throws on a genuine API failure so the caller can decide how to degrade", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { enrichCompanyByDomain } = await import("./clearbit-client.js");
    await expect(enrichCompanyByDomain("dataflow.io")).rejects.toThrow(/status 500/);
  });
});
