import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type { AuthContext } from "../../middleware/auth.js";

const outcomeService = { createOutcome: vi.fn(), listOutcomesForTeam: vi.fn() };
vi.mock("./outcome.service.js", () => outcomeService);

const requestMeta = vi.fn(() => ({}));
vi.mock("../../lib/audit.js", () => ({ requestMeta }));

const { listOutcomesHandler } = await import("./outcome.controller.js");

function mockReq(auth: AuthContext | undefined, query: Record<string, string>): Request {
  return { auth, query } as unknown as Request;
}

function mockRes() {
  const res = { statusCode: 0, body: undefined as unknown };
  return {
    ...res,
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      res.body = payload;
      return this;
    },
  } as unknown as Response & { statusCode: number; body: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listOutcomesHandler — cross-team authorization", () => {
  it("rejects a mismatched teamId for JWT/user auth", async () => {
    const req = mockReq({ type: "user", userId: "u1", teamId: "team_1", planTier: "FREE" }, { teamId: "team_2" });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await listOutcomesHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(outcomeService.listOutcomesForTeam).not.toHaveBeenCalled();
  });

  it("rejects a mismatched teamId for api_key auth too (previously unchecked -- a real cross-tenant data leak)", async () => {
    const req = mockReq(
      { type: "api_key", teamId: "team_1", planTier: "PRO", apiKeyId: "key_1" },
      { teamId: "team_2" },
    );
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await listOutcomesHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(outcomeService.listOutcomesForTeam).not.toHaveBeenCalled();
  });

  it("allows a matching teamId for api_key auth", async () => {
    outcomeService.listOutcomesForTeam.mockResolvedValue({ data: [] });
    const req = mockReq(
      { type: "api_key", teamId: "team_1", planTier: "PRO", apiKeyId: "key_1" },
      { teamId: "team_1" },
    );
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await listOutcomesHandler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(outcomeService.listOutcomesForTeam).toHaveBeenCalled();
  });
});
