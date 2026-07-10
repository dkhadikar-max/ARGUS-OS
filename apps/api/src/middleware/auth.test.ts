import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { createHash } from "node:crypto";

const prisma = {
  apiKey: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
};
vi.mock("@argus/database", () => ({ prisma }));

const jwtVerify = vi.fn();
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "jwks-instance"),
  jwtVerify,
}));

const { requireAuth } = await import("./auth.js");

function mockReq(headers: Record<string, string>): Request {
  return { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAuth — x-api-key", () => {
  it("authenticates a valid, non-revoked API key", async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      id: "key_1",
      teamId: "team_1",
      revokedAt: null,
      team: { plan: "PRO" },
    });
    prisma.apiKey.update.mockResolvedValue({});

    const req = mockReq({ "x-api-key": "argus_live_abc123" });
    const next = vi.fn();
    await requireAuth(req, {} as Response, next);

    expect(req.auth).toEqual({
      type: "api_key",
      teamId: "team_1",
      planTier: "PRO",
      apiKeyId: "key_1",
    });
    expect(next).toHaveBeenCalledWith();

    const expectedHash = createHash("sha256").update("argus_live_abc123").digest("hex");
    expect(prisma.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash: expectedHash } }),
    );
  });

  it("rejects a revoked API key with UNAUTHORIZED", async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      id: "key_1",
      teamId: "team_1",
      revokedAt: new Date(),
      team: { plan: "PRO" },
    });

    const req = mockReq({ "x-api-key": "argus_live_revoked" });
    const next = vi.fn();
    await requireAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects an unknown API key with UNAUTHORIZED", async () => {
    prisma.apiKey.findUnique.mockResolvedValue(null);

    const req = mockReq({ "x-api-key": "argus_live_unknown" });
    const next = vi.fn();
    await requireAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("requireAuth — Bearer JWT", () => {
  it("authenticates a valid Clerk JWT for a user with a team", async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: "user_1" } });
    prisma.user.findUnique.mockResolvedValue({
      id: "user_1",
      role: "SDR",
      team: { id: "team_1", plan: "STARTER" },
    });

    const req = mockReq({ authorization: "Bearer valid.jwt.token" });
    const next = vi.fn();
    await requireAuth(req, {} as Response, next);

    expect(req.auth).toEqual({
      type: "user",
      userId: "user_1",
      role: "SDR",
      teamId: "team_1",
      planTier: "STARTER",
    });
  });

  it("rejects a user with no team as FORBIDDEN", async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: "user_1" } });
    prisma.user.findUnique.mockResolvedValue({ id: "user_1", role: "SDR", team: null });

    const req = mockReq({ authorization: "Bearer valid.jwt.token" });
    const next = vi.fn();
    await requireAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when neither header is present", async () => {
    const req = mockReq({});
    const next = vi.fn();
    await requireAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
