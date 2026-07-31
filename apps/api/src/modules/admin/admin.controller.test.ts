import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import type { AuthContext } from "../../middleware/auth.js";

const adminService = { getShadowMetrics: vi.fn(), listShadowDecisions: vi.fn(), getShadowDecisionDetail: vi.fn(), getShadowHealth: vi.fn() };
vi.mock("./admin.service.js", () => adminService);

const recordAudit = vi.fn();
const requestMeta = vi.fn(() => ({ ipAddress: "127.0.0.1", userAgent: "test" }));
vi.mock("../../lib/audit.js", () => ({ recordAudit, requestMeta }));

const { getShadowMetricsHandler, listShadowDecisionsHandler, getShadowDecisionDetailHandler, getShadowHealthHandler } = await import("./admin.controller.js");

function mockReq(auth: AuthContext | undefined, query: Record<string, unknown>, params: Record<string, unknown> = {}): Request {
  return { auth, query, params } as unknown as Request;
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

describe("getShadowDecisionDetailHandler", () => {
  it("calls the service with the real id, responds 200, and audits with the specific decisionId (not all-teams)", async () => {
    adminService.getShadowDecisionDetail.mockResolvedValue({ id: "sd_1", teamId: "team_1", decisionId: "dec_1" });
    const req = mockReq(auth, {}, { id: "sd_1" });
    const res = mockRes();
    const next = vi.fn();

    await getShadowDecisionDetailHandler(req, res, next);

    expect(adminService.getShadowDecisionDetail).toHaveBeenCalledWith("sd_1");
    expect(res.statusCode).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "admin_shadow_decision_detail", action: "viewed", actorId: "admin_1", entityId: "sd_1", afterState: { teamId: "team_1", decisionId: "dec_1" } }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next(NOT_FOUND) when the service returns null, and never audits a nonexistent row", async () => {
    adminService.getShadowDecisionDetail.mockResolvedValue(null);
    const req = mockReq(auth, {}, { id: "nonexistent" });
    const res = mockRes();
    const next = vi.fn();

    await getShadowDecisionDetailHandler(req, res, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "NOT_FOUND" });
    expect(recordAudit).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(0);
  });

  it("calls next(err) instead of throwing when the service rejects", async () => {
    adminService.getShadowDecisionDetail.mockRejectedValue(new Error("db down"));
    const req = mockReq(auth, {}, { id: "sd_1" });
    const res = mockRes();
    const next = vi.fn();

    await getShadowDecisionDetailHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("getShadowHealthHandler", () => {
  it("calls the service, responds 200, and records an audit entry", async () => {
    adminService.getShadowHealth.mockResolvedValue({
      scope: { teamId: null },
      enabled: true,
      samplePercent: 5,
      circuitBreakerState: "closed",
      lastDecisionAt: null,
      verdictAgreementRate24h: 0,
      totalShadowDecisions24h: 0,
      recentErrorCount1h: 0,
    });
    const req = mockReq(auth, {});
    const res = mockRes();
    const next = vi.fn();

    await getShadowHealthHandler(req, res, next);

    expect(adminService.getShadowHealth).toHaveBeenCalledWith({});
    expect(res.statusCode).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "admin_shadow_health", action: "viewed", actorId: "admin_1", entityId: "all-teams" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("uses query.teamId as entityId when provided", async () => {
    adminService.getShadowHealth.mockResolvedValue({});
    const req = mockReq(auth, { teamId: "team_42" });
    const res = mockRes();

    await getShadowHealthHandler(req, res, vi.fn());

    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "team_42" }));
  });

  it("calls next(err) instead of throwing when the service rejects", async () => {
    adminService.getShadowHealth.mockRejectedValue(new Error("db down"));
    const req = mockReq(auth, {});
    const res = mockRes();
    const next = vi.fn();

    await getShadowHealthHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("calls next(UNAUTHORIZED) when req.auth is missing (defense-in-depth)", async () => {
    const req = mockReq(undefined, {});
    const res = mockRes();
    const next = vi.fn();

    await getShadowHealthHandler(req, res, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
