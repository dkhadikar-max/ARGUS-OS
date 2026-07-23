import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthContext } from "../../middleware/auth.js";

const repo = {
  listLearningRecommendations: vi.fn(),
  getLearningRecommendation: vi.fn(),
  resolveLearningRecommendation: vi.fn(),
};
vi.mock("./learning-recommendation.repository.js", () => repo);

const recordAudit = vi.fn();
vi.mock("../../lib/audit.js", () => ({ recordAudit }));

const { listLearningRecommendationsForTeam, resolveLearningRecommendationForTeam } = await import(
  "./learning-recommendation.service.js"
);

const adminAuth: AuthContext = { type: "user", userId: "user_1", role: "ADMIN", teamId: "team_1", planTier: "PRO" };
const sdrAuth: AuthContext = { type: "user", userId: "user_2", role: "SDR", teamId: "team_1", planTier: "PRO" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listLearningRecommendationsForTeam", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(listLearningRecommendationsForTeam(sdrAuth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps repository rows into the response shape", async () => {
    repo.listLearningRecommendations.mockResolvedValue([
      {
        id: "rec_1",
        targetSubsystem: "ICP",
        rationale: "Lower minimum size",
        suggestedChange: null,
        status: "PENDING",
        createdAt: new Date("2026-07-20T00:00:00Z"),
        reviewedAt: null,
        reviewedBy: null,
      },
    ]);

    const result = await listLearningRecommendationsForTeam(adminAuth);

    expect(result.teamId).toBe("team_1");
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({ id: "rec_1", targetSubsystem: "ICP", status: "PENDING" });
  });
});

describe("resolveLearningRecommendationForTeam", () => {
  it("rejects non-admin roles with FORBIDDEN", async () => {
    await expect(
      resolveLearningRecommendationForTeam(sdrAuth, "rec_1", { status: "ACTIONED" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when the recommendation doesn't exist for this team", async () => {
    repo.getLearningRecommendation.mockResolvedValue(null);

    await expect(
      resolveLearningRecommendationForTeam(adminAuth, "rec_1", { status: "ACTIONED" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.resolveLearningRecommendation).not.toHaveBeenCalled();
  });

  it("resolves the recommendation and records an audit entry", async () => {
    repo.getLearningRecommendation.mockResolvedValue({ id: "rec_1", targetSubsystem: "ICP" });
    repo.resolveLearningRecommendation.mockResolvedValue({
      id: "rec_1",
      targetSubsystem: "ICP",
      rationale: "Lower minimum size",
      suggestedChange: null,
      status: "ACTIONED",
      createdAt: new Date(),
      reviewedAt: new Date(),
      reviewedBy: "user_1",
    });

    const result = await resolveLearningRecommendationForTeam(adminAuth, "rec_1", { status: "ACTIONED" });

    expect(repo.resolveLearningRecommendation).toHaveBeenCalledWith("rec_1", "team_1", "ACTIONED", "user_1");
    expect(result.status).toBe("ACTIONED");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "actioned" }));
  });
});
