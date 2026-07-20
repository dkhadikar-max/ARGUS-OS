import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { errors as joseErrors } from "jose";

const prisma = {
  apiKey: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
};
vi.mock("@argus/database", () => ({ prisma }));

const { jwtVerify } = vi.hoisted(() => ({ jwtVerify: vi.fn() }));
vi.mock("jose", async (importOriginal) => {
  // Keeps jose's real `errors` classes (JWTExpired, JWKSTimeout, ...) intact
  // -- auth.ts checks `instanceof errors.JWTExpired` etc. to decide whether
  // a jwtVerify failure is a real invalid-token 401 or a JWKS-fetch/infra
  // failure that should surface as a genuine 500, so the tests need real
  // error instances, not plain Errors, to exercise that branch correctly.
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(() => "jwks-instance"),
    jwtVerify,
  };
});

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

  it("attributes the request to the acting user when x-acting-user-id belongs to the same team (Slack Bot)", async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      id: "key_1",
      teamId: "team_1",
      revokedAt: null,
      team: { plan: "PRO" },
    });
    prisma.user.findFirst.mockResolvedValue({ id: "user_1", role: "SDR", teamId: "team_1" });

    const req = mockReq({ "x-api-key": "argus_live_abc123", "x-acting-user-id": "user_1" });
    const next = vi.fn();
    await requireAuth(req, {} as Response, next);

    expect(req.auth).toEqual({
      type: "api_key",
      teamId: "team_1",
      planTier: "PRO",
      apiKeyId: "key_1",
      userId: "user_1",
      role: "SDR",
    });
  });

  it("rejects x-acting-user-id for a user outside the key's team as FORBIDDEN", async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      id: "key_1",
      teamId: "team_1",
      revokedAt: null,
      team: { plan: "PRO" },
    });
    prisma.user.findFirst.mockResolvedValue(null); // not found scoped to team_1

    const req = mockReq({ "x-api-key": "argus_live_abc123", "x-acting-user-id": "user_from_other_team" });
    const next = vi.fn();
    await requireAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "FORBIDDEN" });
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

  // Clerk's default session token expires in ~60s, making this the single
  // most common real-world failure -- jose throws its own JWTExpired class
  // here, which must become a 401 AppError rather than an unhandled 500
  // (callers like apps/extension's background worker specifically check
  // for 401 to clear a stale cached token).
  it("rejects an expired JWT with UNAUTHORIZED instead of throwing raw", async () => {
    jwtVerify.mockRejectedValue(new joseErrors.JWTExpired('"exp" claim timestamp check failed', {}));

    const req = mockReq({ authorization: "Bearer expired.jwt.token" });
    const next = vi.fn();
    await requireAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a JWT with a bad signature with UNAUTHORIZED", async () => {
    jwtVerify.mockRejectedValue(new joseErrors.JWSSignatureVerificationFailed());

    const req = mockReq({ authorization: "Bearer tampered.jwt.token" });
    const next = vi.fn();
    await requireAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });

  // A JWKS-fetch failure (Clerk's signing-key endpoint down/timing out) is
  // an infra problem, not proof the token itself is bad -- it must NOT be
  // rewritten into the same 401 as an expired token, or every request
  // during a Clerk outage looks like "your session expired" and the
  // extension wrongly clears every active user's still-valid token.
  it("does not convert a JWKS-fetch failure into UNAUTHORIZED", async () => {
    jwtVerify.mockRejectedValue(new joseErrors.JWKSTimeout());

    const req = mockReq({ authorization: "Bearer valid.jwt.token" });
    const next = vi.fn();
    await requireAuth(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).not.toMatchObject({ code: "UNAUTHORIZED" });
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(joseErrors.JWKSTimeout);
  });
});
