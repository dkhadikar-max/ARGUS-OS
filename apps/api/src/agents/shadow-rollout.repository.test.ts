import { describe, expect, it, vi, beforeEach } from "vitest";

const prisma = {
  shadowRolloutConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  shadowRolloutTeamOverride: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  auditLog: { findMany: vi.fn() },
};
vi.mock("@argus/database", () => ({ prisma }));

const {
  getRolloutConfig,
  upsertRolloutConfig,
  getTeamOverride,
  listTeamOverrides,
  upsertTeamOverride,
  deleteTeamOverride,
  listRolloutAuditEntries,
} = await import("./shadow-rollout.repository.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRolloutConfig", () => {
  it("looks up the singleton row by key, not a hardcoded id", async () => {
    await getRolloutConfig();
    expect(prisma.shadowRolloutConfig.findUnique).toHaveBeenCalledWith({ where: { key: "SHADOW_ROLLOUT" } });
  });
});

describe("upsertRolloutConfig", () => {
  it("creates with version 1 and increments version on update, both keyed by the same key", async () => {
    await upsertRolloutConfig({ enabled: true, globalPercent: 5 }, "user_1");

    const call = prisma.shadowRolloutConfig.upsert.mock.calls[0]![0];
    expect(call.where).toEqual({ key: "SHADOW_ROLLOUT" });
    expect(call.create).toEqual({ key: "SHADOW_ROLLOUT", enabled: true, globalPercent: 5, updatedBy: "user_1", version: 1 });
    expect(call.update).toEqual({ enabled: true, globalPercent: 5, updatedBy: "user_1", version: { increment: 1 } });
  });
});

describe("getTeamOverride / listTeamOverrides", () => {
  it("getTeamOverride queries by teamId", async () => {
    await getTeamOverride("team_1");
    expect(prisma.shadowRolloutTeamOverride.findUnique).toHaveBeenCalledWith({ where: { teamId: "team_1" } });
  });

  it("listTeamOverrides includes the team name and orders by updatedAt desc", async () => {
    await listTeamOverrides();
    expect(prisma.shadowRolloutTeamOverride.findMany).toHaveBeenCalledWith({
      include: { team: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    });
  });
});

describe("upsertTeamOverride", () => {
  it("creates with version 1 and increments version on update", async () => {
    await upsertTeamOverride("team_1", { percent: 100, reason: "Customer validation", expiresAt: null }, "user_1");

    const call = prisma.shadowRolloutTeamOverride.upsert.mock.calls[0]![0];
    expect(call.where).toEqual({ teamId: "team_1" });
    expect(call.create).toEqual({ teamId: "team_1", percent: 100, reason: "Customer validation", expiresAt: null, updatedBy: "user_1", version: 1 });
    expect(call.update).toEqual({ percent: 100, reason: "Customer validation", expiresAt: null, updatedBy: "user_1", version: { increment: 1 } });
  });
});

describe("deleteTeamOverride", () => {
  it("does not throw when the override never existed (deleteMany, not delete)", async () => {
    prisma.shadowRolloutTeamOverride.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteTeamOverride("nonexistent")).resolves.toEqual({ count: 0 });
    expect(prisma.shadowRolloutTeamOverride.deleteMany).toHaveBeenCalledWith({ where: { teamId: "nonexistent" } });
  });
});

describe("listRolloutAuditEntries", () => {
  it("filters by the two rollout entity types and omits the createdAt filter when before is not given", async () => {
    await listRolloutAuditEntries(50);

    const call = prisma.auditLog.findMany.mock.calls[0]![0];
    expect(call.where).toEqual({ entityType: { in: ["shadow_rollout_config", "shadow_rollout_team_override"] } });
    expect(call.take).toBe(50);
    expect(call.orderBy).toEqual({ createdAt: "desc" });
  });

  it("applies the before filter only when given", async () => {
    const before = new Date("2026-07-31T00:00:00Z");
    await listRolloutAuditEntries(50, before);

    const call = prisma.auditLog.findMany.mock.calls[0]![0];
    expect(call.where.createdAt).toEqual({ lt: before });
  });
});
