import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import type { AuthContext } from "./auth.js";

const redis = { incr: vi.fn(), expire: vi.fn(), ttl: vi.fn() };
vi.mock("../lib/redis.js", () => ({ redis }));

const { rateLimit } = await import("./rate-limit.js");

function mockRes() {
  const headers: Record<string, unknown> = {};
  return { setHeader: (k: string, v: unknown) => { headers[k] = v; }, headers } as unknown as Response & {
    headers: Record<string, unknown>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rateLimit", () => {
  it("passes through and sets headers when under the limit", async () => {
    redis.incr.mockResolvedValue(5);
    redis.ttl.mockResolvedValue(3000);

    const req = { auth: { type: "user", teamId: "team_1", planTier: "FREE" } as AuthContext } as Request;
    const res = mockRes();
    const next = vi.fn();

    await rateLimit("decisions")(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.headers["X-RateLimit-Limit"]).toBe(100); // Bible §19.1 free tier
    expect(res.headers["X-RateLimit-Remaining"]).toBe(95);
  });

  it("sets a 1-hour expiry only on the first request in the window", async () => {
    redis.incr.mockResolvedValue(1);
    redis.ttl.mockResolvedValue(3600);

    const req = { auth: { type: "user", teamId: "team_1", planTier: "FREE" } as AuthContext } as Request;
    await rateLimit("decisions")(req, mockRes(), vi.fn());

    expect(redis.expire).toHaveBeenCalledWith(expect.stringContaining("team_1"), 3600);
  });

  it("rejects with RATE_LIMITED once the plan's hourly limit is exceeded", async () => {
    redis.incr.mockResolvedValue(101);
    redis.ttl.mockResolvedValue(1800);

    const req = { auth: { type: "user", teamId: "team_1", planTier: "FREE" } as AuthContext } as Request;
    const next = vi.fn();
    await rateLimit("decisions")(req, mockRes(), next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("gives paid plans the higher 500/hour limit (Bible §19.1)", async () => {
    redis.incr.mockResolvedValue(200);
    redis.ttl.mockResolvedValue(1800);

    const req = { auth: { type: "user", teamId: "team_2", planTier: "PRO" } as AuthContext } as Request;
    const res = mockRes();
    await rateLimit("decisions")(req, res, vi.fn());

    expect(res.headers["X-RateLimit-Limit"]).toBe(500);
  });

  it("rejects unauthenticated requests before touching Redis", async () => {
    const req = {} as Request;
    const next = vi.fn();
    await rateLimit("decisions")(req, mockRes(), next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
    expect(redis.incr).not.toHaveBeenCalled();
  });
});
