import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request } from "express";

const prisma = { auditLog: { create: vi.fn() } };
vi.mock("@argus/database", () => ({ prisma }));

const logger = { error: vi.fn() };
vi.mock("./logger.js", () => ({ logger }));

const { recordAudit, requestMeta } = await import("./audit.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestMeta", () => {
  it("extracts ip and user-agent from an Express request", () => {
    const req = { ip: "203.0.113.5", header: (name: string) => (name === "user-agent" ? "Mozilla/5.0" : undefined) } as unknown as Request;
    expect(requestMeta(req)).toEqual({ ipAddress: "203.0.113.5", userAgent: "Mozilla/5.0" });
  });
});

describe("recordAudit", () => {
  it("writes entityType/entityId/action/actorId plus before/after state and request meta", async () => {
    prisma.auditLog.create.mockResolvedValue({ id: "audit_1" });

    await recordAudit({
      entityType: "decision",
      entityId: "dec_1",
      action: "created",
      actorId: "user_1",
      afterState: { verdict: "STRONG_YES" },
      meta: { ipAddress: "203.0.113.5", userAgent: "Mozilla/5.0" },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        entityType: "decision",
        entityId: "dec_1",
        action: "created",
        actorId: "user_1",
        beforeState: undefined,
        afterState: { verdict: "STRONG_YES" },
        ipAddress: "203.0.113.5",
        userAgent: "Mozilla/5.0",
      },
    });
  });

  it("defaults ipAddress/userAgent to null when no request meta is given", async () => {
    prisma.auditLog.create.mockResolvedValue({ id: "audit_1" });

    await recordAudit({ entityType: "user", entityId: "user_1", action: "slack_linked", actorId: "user_1" });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipAddress: null, userAgent: null }),
    });
  });

  it("never throws when the write fails — logs instead", async () => {
    prisma.auditLog.create.mockRejectedValue(new Error("db down"));

    await expect(
      recordAudit({ entityType: "decision", entityId: "dec_1", action: "created", actorId: "user_1" }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "decision", entityId: "dec_1", action: "created" }),
      "Audit log write failed",
    );
  });
});
