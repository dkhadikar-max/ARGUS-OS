import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import type { AuthContext } from "../../middleware/auth.js";

const adminService = { getShadowMetrics: vi.fn(), listShadowDecisions: vi.fn() };
vi.mock("./admin.service.js", () => adminService);

const recordAudit = vi.fn();
const requestMeta = vi.fn(() => ({ ipAddress: "127.0.0.1", userAgent: "test" }));
vi.mock("../../lib/audit.js", () => ({ recordAudit, requestMeta }));

const { getShadowMetricsHandler, listShadowDecisionsHandler } = await import("./admin.controller.js");

function mockReq(auth: AuthContext | undefined, query: Record<string, unknown>): Request {
  return { auth, query } as unknown as Request;
}

function mockRes() {
  const res: { statusCode: number; body: unknown; status: (code: number) => typeof res; json: (payload: unknown) => typeof res } = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

const auth: AuthContext = { type: "user", userId: "admin_1", email: "dev@argus.dev", teamId: "team_1", planTier: "FREE" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getShadowMetricsHandler", () => {
  it("calls the service, responds 200, and records an audit entry", async () => {
    adminService.getShadowMetrics.mockResolvedValue({ scope: { teamId: null, sinceDays: 7 }, totalShadowDecisions: 0 });
    const req = mockReq(auth, { sinceDays: 7 });
    const res = mockRes();
    const next = vi.fn();

    await getShadowMetricsHandler(req, res, next);

    expect(adminService.getShadowMetrics).toHaveBeenCalledWith({ sinceDays: 7 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ scope: { teamId: null, sinceDays: 7 }, totalShadowDecisions: 0 });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "admin_shadow_metrics", action: "viewed", actorId: "admin_1", entityId: "all-teams" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("uses query.teamId as entityId when provided", async () => {
    adminService.getShadowMetrics.mockResolvedValue({});
    const req = mockReq(auth, { teamId: "team_42", sinceDays: 7 });
    const res = mockRes();

    await getShadowMetricsHandler(req, res, vi.fn());

    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "team_42" }));
  });

  it("calls next(err) instead of throwing when the service rejects", async () => {
    adminService.getShadowMetrics.mockRejectedValue(new Error("db down"));
    const req = mockReq(auth, { sinceDays: 7 });
    const res = mockRes();
    const next = vi.fn();

    await getShadowMetricsHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("calls next(UNAUTHORIZED) when req.auth is missing (defense-in-depth)", async () => {
    const req = mockReq(undefined, {});
    const res = mockRes();
    const next = vi.fn();

    await getShadowMetricsHandler(req, res, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("listShadowDecisionsHandler", () => {
  it("calls the service, responds 200, and records an audit entry with resultCount", async () => {
    adminService.listShadowDecisions.mockResolvedValue({ data: [{ id: "sd_1" }], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } });
    const req = mockReq(auth, { limit: 20, offset: 0 });
    const res = mockRes();
    const next = vi.fn();

    await listShadowDecisionsHandler(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "admin_shadow_decisions", action: "viewed", actorId: "admin_1", afterState: expect.objectContaining({ resultCount: 1 }) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next(err) instead of throwing when the service rejects", async () => {
    adminService.listShadowDecisions.mockRejectedValue(new Error("db down"));
    const req = mockReq(auth, {});
    const res = mockRes();
    const next = vi.fn();

    await listShadowDecisionsHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
