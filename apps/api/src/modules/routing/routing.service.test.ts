import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthContext } from "../../middleware/auth.js";

const repo = {
  getActiveRoutingThresholdVersion: vi.fn(),
  getPendingRoutingThresholdVersion: vi.fn(),
  getRoutingThresholdVersionByNumber: vi.fn(),
  createPendingRoutingThresholdVersion: vi.fn(),
  approveRoutingThresholdVersion: vi.fn(),
  rejectRoutingThresholdVersion: vi.fn(),
};
vi.mock("./routing.repository.js", () => repo);

const recordAudit = vi.fn();
vi.mock("../../lib/audit.js", () => ({ recordAudit }));

const {
  getRoutingThresholdStateForTeam,
  proposeRoutingThresholdsForTeam,
  approveRoutingThresholdsForTeam,
  rejectRoutingThresholdsForTeam,
} = await import("./routing.service.js");

const adminAuth: AuthContext = { type: "user", userId: "user_1", role: "ADMIN", teamId: "team_1", planTier: "PRO" };
const sdrAuth: AuthContext = { type: "user", userId: "user_2", role: "SDR", teamId: "team_1", planTier: "PRO" };

const sampleThresholds = { cvThreshold: 0.2, maxSurpriseThreshold: 0.6 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRoutingThresholdStateForTeam", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(getRoutingThresholdStateForTeam(sdrAuth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns null active/pending when neither exists yet", async () => {
    repo.getActiveRoutingThresholdVersion.mockResolvedValue(null);
    repo.getPendingRoutingThresholdVersion.mockResolvedValue(null);

    const result = await getRoutingThresholdStateForTeam(adminAuth);

    expect(result).toEqual({ teamId: "team_1", active: null, pending: null });
  });

  it("maps both active and pending rows into the response shape", async () => {
    repo.getActiveRoutingThresholdVersion.mockResolvedValue({
      version: 1,
      thresholds: sampleThresholds,
      status: "ACTIVE",
      createdAt: new Date("2026-07-01T00:00:00Z"),
      createdBy: "user_1",
      approvedAt: new Date("2026-07-01T00:00:00Z"),
      approvedBy: "user_1",
    });
    repo.getPendingRoutingThresholdVersion.mockResolvedValue({
      version: 2,
      thresholds: { cvThreshold: 0.1, maxSurpriseThreshold: 0.5 },
      status: "PENDING",
      createdAt: new Date("2026-07-10T00:00:00Z"),
      createdBy: "user_1",
      approvedAt: null,
      approvedBy: null,
    });

    const result = await getRoutingThresholdStateForTeam(adminAuth);

    expect(result.active?.version).toBe(1);
    expect(result.pending?.version).toBe(2);
  });
});

describe("proposeRoutingThresholdsForTeam", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(
      proposeRoutingThresholdsForTeam(sdrAuth, { thresholds: sampleThresholds }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.createPendingRoutingThresholdVersion).not.toHaveBeenCalled();
  });

  it("creates a pending version and records an audit entry", async () => {
    repo.createPendingRoutingThresholdVersion.mockResolvedValue({
      version: 3,
      thresholds: sampleThresholds,
      status: "PENDING",
      createdAt: new Date(),
      createdBy: "user_1",
      approvedAt: null,
      approvedBy: null,
    });

    const result = await proposeRoutingThresholdsForTeam(adminAuth, { thresholds: sampleThresholds });

    expect(repo.createPendingRoutingThresholdVersion).toHaveBeenCalledWith("team_1", sampleThresholds, "user_1");
    expect(result.status).toBe("PENDING");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "proposed" }));
  });
});

describe("approveRoutingThresholdsForTeam", () => {
  it("throws NOT_FOUND if the target version isn't PENDING", async () => {
    repo.getRoutingThresholdVersionByNumber.mockResolvedValue({ version: 2, status: "ACTIVE" });

    await expect(approveRoutingThresholdsForTeam(adminAuth, 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.approveRoutingThresholdVersion).not.toHaveBeenCalled();
  });

  it("approves a pending version and records an audit entry", async () => {
    repo.getRoutingThresholdVersionByNumber.mockResolvedValue({ version: 2, status: "PENDING" });
    repo.approveRoutingThresholdVersion.mockResolvedValue({
      version: 2,
      thresholds: sampleThresholds,
      status: "ACTIVE",
      createdAt: new Date(),
      createdBy: "user_1",
      approvedAt: new Date(),
      approvedBy: "user_1",
    });

    const result = await approveRoutingThresholdsForTeam(adminAuth, 2);

    expect(repo.approveRoutingThresholdVersion).toHaveBeenCalledWith("team_1", 2, "user_1");
    expect(result.status).toBe("ACTIVE");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "approved" }));
  });
});

describe("rejectRoutingThresholdsForTeam", () => {
  it("throws NOT_FOUND if the target version isn't PENDING", async () => {
    repo.getRoutingThresholdVersionByNumber.mockResolvedValue(null);

    await expect(rejectRoutingThresholdsForTeam(adminAuth, 5)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.rejectRoutingThresholdVersion).not.toHaveBeenCalled();
  });

  it("rejects a pending version and records an audit entry", async () => {
    repo.getRoutingThresholdVersionByNumber.mockResolvedValue({ version: 2, status: "PENDING" });
    repo.rejectRoutingThresholdVersion.mockResolvedValue({
      version: 2,
      thresholds: sampleThresholds,
      status: "REJECTED",
      createdAt: new Date(),
      createdBy: "user_1",
      approvedAt: new Date(),
      approvedBy: "admin_1",
    });

    const result = await rejectRoutingThresholdsForTeam(adminAuth, 2);

    expect(repo.rejectRoutingThresholdVersion).toHaveBeenCalledWith("team_1", 2, "user_1");
    expect(result.status).toBe("REJECTED");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "rejected" }));
  });
});
