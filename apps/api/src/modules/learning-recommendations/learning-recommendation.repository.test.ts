import { describe, expect, it, vi, beforeEach } from "vitest";

const prisma = {
  learningRecommendation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
};
vi.mock("@argus/database", () => ({ prisma }));

const {
  listLearningRecommendations,
  getLearningRecommendation,
  createLearningRecommendation,
  resolveLearningRecommendation,
} = await import("./learning-recommendation.repository.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listLearningRecommendations", () => {
  it("queries newest-first for the given team", async () => {
    prisma.learningRecommendation.findMany.mockResolvedValue([]);
    await listLearningRecommendations("team_1");
    expect(prisma.learningRecommendation.findMany).toHaveBeenCalledWith({
      where: { teamId: "team_1" },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("getLearningRecommendation", () => {
  it("scopes the lookup by both id and teamId", async () => {
    prisma.learningRecommendation.findFirst.mockResolvedValue(null);
    await getLearningRecommendation("rec_1", "team_1");
    expect(prisma.learningRecommendation.findFirst).toHaveBeenCalledWith({
      where: { id: "rec_1", teamId: "team_1" },
    });
  });
});

describe("createLearningRecommendation", () => {
  it("defaults suggestedChange to null when omitted", async () => {
    prisma.learningRecommendation.create.mockResolvedValue({ id: "rec_1" });

    await createLearningRecommendation({ teamId: "team_1", targetSubsystem: "ICP", rationale: "Lower minimum size" });

    expect(prisma.learningRecommendation.create).toHaveBeenCalledWith({
      data: { teamId: "team_1", targetSubsystem: "ICP", rationale: "Lower minimum size", suggestedChange: null },
    });
  });

  it("passes through an explicit suggestedChange payload", async () => {
    prisma.learningRecommendation.create.mockResolvedValue({ id: "rec_1" });
    const change = { agent: "risk", current: "a", suggested: "b", reason: "c" };

    await createLearningRecommendation({
      teamId: "team_1",
      targetSubsystem: "PROMPTS",
      rationale: "c",
      suggestedChange: change,
    });

    expect(prisma.learningRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ suggestedChange: change }) }),
    );
  });
});

describe("resolveLearningRecommendation", () => {
  it("scopes the update by both id and teamId via updateMany, then re-fetches the row", async () => {
    prisma.learningRecommendation.updateMany.mockResolvedValue({ count: 1 });
    prisma.learningRecommendation.findFirst.mockResolvedValue({ id: "rec_1", status: "ACTIONED" });

    const result = await resolveLearningRecommendation("rec_1", "team_1", "ACTIONED", "admin_1");

    expect(prisma.learningRecommendation.updateMany).toHaveBeenCalledWith({
      where: { id: "rec_1", teamId: "team_1" },
      data: { status: "ACTIONED", reviewedAt: expect.any(Date), reviewedBy: "admin_1" },
    });
    expect(result).toEqual({ id: "rec_1", status: "ACTIONED" });
  });
});
