import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import type { AuthContext } from "../../middleware/auth.js";

const adminService = {
  getShadowMetrics: vi.fn(),
  listShadowDecisions: vi.fn(),
  getShadowDecisionDetail: vi.fn(),
  getShadowHealth: vi.fn(),
  getShadowLiveMetrics: vi.fn(),
  getShadowRollout: vi.fn(),
  updateShadowRolloutConfig: vi.fn(),
  upsertShadowRolloutTeamOverride: vi.fn(),
  deleteShadowRolloutTeamOverride: vi.fn(),
  getShadowRolloutAudit: vi.fn(),
  previewShadowRollout: vi.fn(),
};
vi.mock("./admin.service.js", () => adminService);

const recordAudit = vi.fn();
const requestMeta = vi.fn(() => ({ ipAddress: "127.0.0.1", userAgent: "test" }));
vi.mock("../../lib/audit.js", () => ({ recordAudit, requestMeta }));

const {
  getShadowMetricsHandler,
  listShadowDecisionsHandler,
  getShadowDecisionDetailHandler,
  getShadowHealthHandler,
  getShadowLiveMetricsHandler,
  getShadowRolloutHandler,
  updateShadowRolloutConfigHandler,
  upsertShadowRolloutTeamOverrideHandler,
  deleteShadowRolloutTeamOverrideHandler,
  getShadowRolloutAuditHandler,
  previewShadowRolloutHandler,
} = await import("./admin.controller.js");

function mockReq(
  auth: AuthContext | undefined,
  query: Record<string, unknown>,
  params: Record<string, unknown> = {},
  body: Record<string, unknown> = {},
): Request {
  return { auth, query, params, body } as unknown as Request;
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
      globalPercent: 5,
      activeOverrideCount: 0,
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

describe("getShadowLiveMetricsHandler", () => {
  it("calls the service and responds 200", async () => {
    const payload = {
      enabled: true,
      globalPercent: 5,
      maxConcurrent: 2,
      inFlightCount: 0,
      circuitBreakerState: "closed",
      timeoutThresholdMs: 180_000,
      timeoutCount1h: 0,
      dropCount1h: 0,
      errorCount1h: 0,
      totalAttempted1h: 0,
      errorRate1h: null,
      p95LatencyMs1h: null,
      hasQueue: false,
    };
    adminService.getShadowLiveMetrics.mockResolvedValue(payload);
    const req = mockReq(auth, {});
    const res = mockRes();
    const next = vi.fn();

    await getShadowLiveMetricsHandler(req, res, next);

    expect(adminService.getShadowLiveMetrics).toHaveBeenCalledWith();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(payload);
    expect(next).not.toHaveBeenCalled();
  });

  it("deliberately does NOT call recordAudit -- this endpoint is designed to be polled and carries no cross-tenant content", async () => {
    adminService.getShadowLiveMetrics.mockResolvedValue({});
    const req = mockReq(auth, {});
    const res = mockRes();

    await getShadowLiveMetricsHandler(req, res, vi.fn());

    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("requires authentication -- calls next(err) when req.auth is missing", async () => {
    const req = mockReq(undefined, {});
    const res = mockRes();
    const next = vi.fn();

    await getShadowLiveMetricsHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(adminService.getShadowLiveMetrics).not.toHaveBeenCalled();
  });

  it("calls next(err) when the service rejects", async () => {
    adminService.getShadowLiveMetrics.mockRejectedValue(new Error("boom"));
    const req = mockReq(auth, {});
    const res = mockRes();
    const next = vi.fn();

    await getShadowLiveMetricsHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

function rolloutStatus() {
  return { enabled: true, globalPercent: 5, version: 1, teamOverrides: [] };
}

describe("getShadowRolloutHandler", () => {
  it("calls the service, responds 200, and records an audit entry with entityId 'global'", async () => {
    adminService.getShadowRollout.mockResolvedValue(rolloutStatus());
    const req = mockReq(auth, {});
    const res = mockRes();
    const next = vi.fn();

    await getShadowRolloutHandler(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "shadow_rollout_config", action: "viewed", actorId: "admin_1", entityId: "global" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next(UNAUTHORIZED) when req.auth is missing", async () => {
    const req = mockReq(undefined, {});
    const res = mockRes();
    const next = vi.fn();

    await getShadowRolloutHandler(req, res, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("updateShadowRolloutConfigHandler", () => {
  it("calls the service with the real body, responds 200 with the fresh status, and audits with both beforeState and afterState", async () => {
    adminService.updateShadowRolloutConfig.mockResolvedValue({
      before: { enabled: false, globalPercent: 0, version: 1 },
      after: { enabled: true, globalPercent: 5, version: 2 },
    });
    adminService.getShadowRollout.mockResolvedValue(rolloutStatus());
    const req = mockReq(auth, {}, {}, { enabled: true, globalPercent: 5 });
    const res = mockRes();
    const next = vi.fn();

    await updateShadowRolloutConfigHandler(req, res, next);

    expect(adminService.updateShadowRolloutConfig).toHaveBeenCalledWith({ enabled: true, globalPercent: 5 }, "admin_1");
    expect(res.statusCode).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "shadow_rollout_config",
        action: "updated",
        entityId: "global",
        beforeState: { enabled: false, globalPercent: 0, version: 1 },
        afterState: { enabled: true, globalPercent: 5, version: 2 },
      }),
    );
  });

  it("beforeState is null when there was no prior config row", async () => {
    adminService.updateShadowRolloutConfig.mockResolvedValue({ before: null, after: { enabled: true, globalPercent: 5, version: 1 } });
    adminService.getShadowRollout.mockResolvedValue(rolloutStatus());
    const req = mockReq(auth, {}, {}, { enabled: true, globalPercent: 5 });
    const res = mockRes();

    await updateShadowRolloutConfigHandler(req, res, vi.fn());

    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ beforeState: null }));
  });

  it("calls next(err) instead of throwing when the service rejects (e.g. VALIDATION_ERROR)", async () => {
    adminService.updateShadowRolloutConfig.mockRejectedValue(new Error("VALIDATION_ERROR"));
    const req = mockReq(auth, {}, {}, { enabled: true, globalPercent: 5 });
    const res = mockRes();
    const next = vi.fn();

    await updateShadowRolloutConfigHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("upsertShadowRolloutTeamOverrideHandler", () => {
  it("calls the service with the real teamId/body, responds 200, and audits with both before/after", async () => {
    adminService.upsertShadowRolloutTeamOverride.mockResolvedValue({
      before: null,
      after: { percent: 100, reason: "Customer validation", expiresAt: null, version: 1 },
    });
    adminService.getShadowRollout.mockResolvedValue(rolloutStatus());
    const req = mockReq(auth, {}, { teamId: "team_1" }, { percent: 100, reason: "Customer validation" });
    const res = mockRes();
    const next = vi.fn();

    await upsertShadowRolloutTeamOverrideHandler(req, res, next);

    expect(adminService.upsertShadowRolloutTeamOverride).toHaveBeenCalledWith("team_1", { percent: 100, reason: "Customer validation" }, "admin_1");
    expect(res.statusCode).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "shadow_rollout_team_override", action: "updated", entityId: "team_1", beforeState: null }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe("deleteShadowRolloutTeamOverrideHandler", () => {
  it("calls the service with the real teamId, responds 200, and audits action 'deleted'", async () => {
    adminService.deleteShadowRolloutTeamOverride.mockResolvedValue({ count: 1 });
    adminService.getShadowRollout.mockResolvedValue(rolloutStatus());
    const req = mockReq(auth, {}, { teamId: "team_1" });
    const res = mockRes();
    const next = vi.fn();

    await deleteShadowRolloutTeamOverrideHandler(req, res, next);

    expect(adminService.deleteShadowRolloutTeamOverride).toHaveBeenCalledWith("team_1");
    expect(res.statusCode).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "shadow_rollout_team_override", action: "deleted", entityId: "team_1" }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe("getShadowRolloutAuditHandler", () => {
  it("calls the service, responds 200, and audits with the result count", async () => {
    adminService.getShadowRolloutAudit.mockResolvedValue({ entries: [{ id: "audit_1" }], nextBefore: null });
    const req = mockReq(auth, { limit: 50 });
    const res = mockRes();
    const next = vi.fn();

    await getShadowRolloutAuditHandler(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "admin_shadow_rollout_audit", action: "viewed", afterState: expect.objectContaining({ resultCount: 1 }) }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe("previewShadowRolloutHandler", () => {
  it("calls the service with prospectId/teamId, responds 200, and audits with the sampled result", async () => {
    const preview = { enabled: true, globalPercent: 5, override: null, effectivePercent: 5, bucket: 17, sampled: true };
    adminService.previewShadowRollout.mockResolvedValue(preview);
    const req = mockReq(auth, { prospectId: "prospect_1", teamId: "team_1" });
    const res = mockRes();
    const next = vi.fn();

    await previewShadowRolloutHandler(req, res, next);

    expect(adminService.previewShadowRollout).toHaveBeenCalledWith("prospect_1", "team_1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(preview);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "admin_shadow_rollout_preview", entityId: "team_1", afterState: expect.objectContaining({ sampled: true }) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next(UNAUTHORIZED) when req.auth is missing", async () => {
    const req = mockReq(undefined, { prospectId: "prospect_1", teamId: "team_1" });
    const res = mockRes();
    const next = vi.fn();

    await previewShadowRolloutHandler(req, res, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
