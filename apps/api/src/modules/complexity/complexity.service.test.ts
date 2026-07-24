import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthContext } from "../../middleware/auth.js";

const repo = {
  getActiveComplexityWeights: vi.fn(),
  getPendingComplexityWeights: vi.fn(),
  getComplexityWeightsByVersion: vi.fn(),
  createPendingComplexityWeights: vi.fn(),
  approveComplexityWeights: vi.fn(),
  rejectComplexityWeights: vi.fn(),
};
vi.mock("./complexity.repository.js", () => repo);

const getLabeledDecisionsForTeam = vi.fn();
vi.mock("../../agents/complexity/complexity-training-data.repository.js", () => ({ getLabeledDecisionsForTeam }));

const recordAudit = vi.fn();
vi.mock("../../lib/audit.js", () => ({ recordAudit }));

const {
  getComplexityWeightStateForTeam,
  recomputeComplexityWeightsForTeam,
  approveComplexityWeightsForTeam,
  rejectComplexityWeightsForTeam,
} = await import("./complexity.service.js");

const adminAuth: AuthContext = { type: "user", userId: "user_1", role: "ADMIN", teamId: "team_1", planTier: "PRO" };
const sdrAuth: AuthContext = { type: "user", userId: "user_2", role: "SDR", teamId: "team_1", planTier: "PRO" };

const sampleWeights = { cv: 0.5, directional: 0.3, maxSurprise: 0.2 };

function labeled(correctness: "correct" | "wrong", cv: number, directional: number, maxSurprise: number) {
  return { correctness, features: { cv, directional, maxSurprise } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getComplexityWeightStateForTeam", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(getComplexityWeightStateForTeam(sdrAuth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns null active/pending when neither exists yet", async () => {
    repo.getActiveComplexityWeights.mockResolvedValue(null);
    repo.getPendingComplexityWeights.mockResolvedValue(null);

    const result = await getComplexityWeightStateForTeam(adminAuth);

    expect(result).toEqual({ teamId: "team_1", active: null, pending: null });
  });

  it("maps both active and pending rows into the response shape", async () => {
    repo.getActiveComplexityWeights.mockResolvedValue({
      version: 1,
      weights: sampleWeights,
      sampleSize: 40,
      status: "ACTIVE",
      createdAt: new Date("2026-07-01T00:00:00Z"),
      createdBy: "user_1",
      approvedAt: new Date("2026-07-01T00:00:00Z"),
      approvedBy: "user_1",
    });
    repo.getPendingComplexityWeights.mockResolvedValue(null);

    const result = await getComplexityWeightStateForTeam(adminAuth);

    expect(result.active?.version).toBe(1);
    expect(result.active?.sampleSize).toBe(40);
  });
});

describe("recomputeComplexityWeightsForTeam", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(recomputeComplexityWeightsForTeam(sdrAuth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getLabeledDecisionsForTeam).not.toHaveBeenCalled();
  });

  it("returns insufficient_data without creating a version when there isn't enough real data", async () => {
    getLabeledDecisionsForTeam.mockResolvedValue([
      labeled("correct", 0.1, 0, 0.1),
      labeled("wrong", 0.8, 1, 0.8),
    ]);

    const result = await recomputeComplexityWeightsForTeam(adminAuth);

    expect(result.status).toBe("insufficient_data");
    expect(repo.createPendingComplexityWeights).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("creates a pending version and records an audit entry when there's enough signal", async () => {
    getLabeledDecisionsForTeam.mockResolvedValue([
      ...Array.from({ length: 10 }, () => labeled("correct" as const, 0.1, 0, 0.1)),
      ...Array.from({ length: 10 }, () => labeled("wrong" as const, 0.9, 0, 0.15)),
    ]);
    repo.createPendingComplexityWeights.mockResolvedValue({
      version: 1,
      weights: sampleWeights,
      sampleSize: 20,
      status: "PENDING",
      createdAt: new Date(),
      createdBy: "user_1",
      approvedAt: null,
      approvedBy: null,
    });

    const result = await recomputeComplexityWeightsForTeam(adminAuth);

    expect(repo.createPendingComplexityWeights).toHaveBeenCalledWith("team_1", expect.any(Object), 20, "user_1");
    expect(result.status).toBe("proposed");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "recomputed" }));
  });
});

describe("approveComplexityWeightsForTeam", () => {
  it("throws NOT_FOUND if the target version isn't PENDING", async () => {
    repo.getComplexityWeightsByVersion.mockResolvedValue({ version: 2, status: "ACTIVE" });

    await expect(approveComplexityWeightsForTeam(adminAuth, 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.approveComplexityWeights).not.toHaveBeenCalled();
  });

  it("approves a pending version and records an audit entry", async () => {
    repo.getComplexityWeightsByVersion.mockResolvedValue({ version: 2, status: "PENDING" });
    repo.approveComplexityWeights.mockResolvedValue({
      version: 2,
      weights: sampleWeights,
      sampleSize: 25,
      status: "ACTIVE",
      createdAt: new Date(),
      createdBy: "user_1",
      approvedAt: new Date(),
      approvedBy: "user_1",
    });

    const result = await approveComplexityWeightsForTeam(adminAuth, 2);

    expect(repo.approveComplexityWeights).toHaveBeenCalledWith("team_1", 2, "user_1");
    expect(result.status).toBe("ACTIVE");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "approved" }));
  });
});

describe("rejectComplexityWeightsForTeam", () => {
  it("throws NOT_FOUND if the target version isn't PENDING", async () => {
    repo.getComplexityWeightsByVersion.mockResolvedValue(null);

    await expect(rejectComplexityWeightsForTeam(adminAuth, 5)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.rejectComplexityWeights).not.toHaveBeenCalled();
  });

  it("rejects a pending version and records an audit entry", async () => {
    repo.getComplexityWeightsByVersion.mockResolvedValue({ version: 2, status: "PENDING" });
    repo.rejectComplexityWeights.mockResolvedValue({
      version: 2,
      weights: sampleWeights,
      sampleSize: 25,
      status: "REJECTED",
      createdAt: new Date(),
      createdBy: "user_1",
      approvedAt: new Date(),
      approvedBy: "admin_1",
    });

    const result = await rejectComplexityWeightsForTeam(adminAuth, 2);

    expect(repo.rejectComplexityWeights).toHaveBeenCalledWith("team_1", 2, "user_1");
    expect(result.status).toBe("REJECTED");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "rejected" }));
  });
});
