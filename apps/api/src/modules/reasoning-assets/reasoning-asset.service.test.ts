import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthContext } from "../../middleware/auth.js";

const repo = {
  getReasoningAssetById: vi.fn(),
  findReasoningAsset: vi.fn(),
  listReasoningAssetsForTeam: vi.fn(),
  upsertReasoningAsset: vi.fn(),
  recordEffectivenessScore: vi.fn(),
};
vi.mock("./reasoning-asset.repository.js", () => repo);

const recordAudit = vi.fn();
vi.mock("../../lib/audit.js", () => ({ recordAudit }));

const { listReasoningAssetsForAuthTeam, registerReasoningAssetForTeam, recordEffectivenessScoreForAsset } =
  await import("./reasoning-asset.service.js");

const adminAuth: AuthContext = { type: "user", userId: "user_1", role: "ADMIN", teamId: "team_1", planTier: "PRO" };
const sdrAuth: AuthContext = { type: "user", userId: "user_2", role: "SDR", teamId: "team_1", planTier: "PRO" };

const sampleRow = {
  id: "asset_1",
  assetType: "RETRIEVER",
  assetKey: "icp_retriever",
  label: "ICP Retriever",
  teamId: "team_1",
  ownerId: "user_1",
  effectivenessScore: null,
  lastEvaluatedAt: null,
  approvedAt: null,
  approvedBy: null,
  createdAt: new Date("2026-07-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listReasoningAssetsForAuthTeam", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(listReasoningAssetsForAuthTeam(sdrAuth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps rows into the response shape", async () => {
    repo.listReasoningAssetsForTeam.mockResolvedValue([sampleRow]);

    const result = await listReasoningAssetsForAuthTeam(adminAuth);

    expect(repo.listReasoningAssetsForTeam).toHaveBeenCalledWith("team_1", undefined);
    expect(result).toHaveLength(1);
    expect(result[0]?.assetKey).toBe("icp_retriever");
    expect(result[0]?.effectivenessScore).toBeNull();
  });

  it("passes an assetType filter through to the repository", async () => {
    repo.listReasoningAssetsForTeam.mockResolvedValue([]);

    await listReasoningAssetsForAuthTeam(adminAuth, "RETRIEVER");

    expect(repo.listReasoningAssetsForTeam).toHaveBeenCalledWith("team_1", "RETRIEVER");
  });
});

describe("registerReasoningAssetForTeam", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(
      registerReasoningAssetForTeam(sdrAuth, { assetType: "RETRIEVER", assetKey: "icp_retriever", label: "ICP Retriever" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.upsertReasoningAsset).not.toHaveBeenCalled();
  });

  it("defaults ownerId to the caller's own userId when not provided", async () => {
    repo.upsertReasoningAsset.mockResolvedValue(sampleRow);

    await registerReasoningAssetForTeam(adminAuth, { assetType: "RETRIEVER", assetKey: "icp_retriever", label: "ICP Retriever" });

    expect(repo.upsertReasoningAsset).toHaveBeenCalledWith("team_1", "RETRIEVER", "icp_retriever", "ICP Retriever", "user_1");
  });

  it("uses an explicitly-provided ownerId instead of the caller's own", async () => {
    repo.upsertReasoningAsset.mockResolvedValue(sampleRow);

    await registerReasoningAssetForTeam(adminAuth, {
      assetType: "RETRIEVER",
      assetKey: "icp_retriever",
      label: "ICP Retriever",
      ownerId: "user_5",
    });

    expect(repo.upsertReasoningAsset).toHaveBeenCalledWith("team_1", "RETRIEVER", "icp_retriever", "ICP Retriever", "user_5");
  });

  it("records an audit entry on registration", async () => {
    repo.upsertReasoningAsset.mockResolvedValue(sampleRow);

    await registerReasoningAssetForTeam(adminAuth, { assetType: "RETRIEVER", assetKey: "icp_retriever", label: "ICP Retriever" });

    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "registered" }));
  });
});

describe("recordEffectivenessScoreForAsset", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(recordEffectivenessScoreForAsset(sdrAuth, "asset_1", 0.8)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.recordEffectivenessScore).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the asset doesn't exist", async () => {
    repo.getReasoningAssetById.mockResolvedValue(null);

    await expect(recordEffectivenessScoreForAsset(adminAuth, "asset_1", 0.8)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when the asset belongs to a different team", async () => {
    repo.getReasoningAssetById.mockResolvedValue({ ...sampleRow, teamId: "team_2" });

    await expect(recordEffectivenessScoreForAsset(adminAuth, "asset_1", 0.8)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.recordEffectivenessScore).not.toHaveBeenCalled();
  });

  it("records the score and an audit entry for an asset owned by the caller's team", async () => {
    repo.getReasoningAssetById.mockResolvedValue(sampleRow);
    repo.recordEffectivenessScore.mockResolvedValue({
      ...sampleRow,
      effectivenessScore: 0.8,
      lastEvaluatedAt: new Date("2026-07-24T00:00:00Z"),
    });

    const result = await recordEffectivenessScoreForAsset(adminAuth, "asset_1", 0.8);

    expect(repo.recordEffectivenessScore).toHaveBeenCalledWith("asset_1", 0.8);
    expect(result.effectivenessScore).toBe(0.8);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "effectiveness_recorded" }));
  });
});
