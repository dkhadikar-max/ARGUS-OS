import { describe, expect, it, vi, beforeEach } from "vitest";

const repo = { getCompanyMemory: vi.fn() };
vi.mock("./memory.repository.js", () => repo);

const { getCompanyMemoryForTeam } = await import("./memory.service.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCompanyMemoryForTeam", () => {
  it("returns an empty-but-valid shape for a brand-new team with no CompanyMemory row (Bible §5.3 cold-start)", async () => {
    repo.getCompanyMemory.mockResolvedValue(null);

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result).toEqual({
      teamId: "team_1",
      generatedAt: expect.any(String),
      patterns: [],
      riskFlags: [],
      icpAccuracy: null,
      topPerformingMessages: [],
    });
  });

  it("maps the internal pattern shape to Bible §10.5's response shape", async () => {
    repo.getCompanyMemory.mockResolvedValue({
      teamId: "team_1",
      patterns: [
        {
          verdict: "STRONG_YES",
          description: "STRONG_YES decisions convert to meetings at 75% (n=12)",
          sampleSize: 12,
          meetingRate: 0.75,
          updatedAt: "2026-07-10T00:00:00.000Z",
        },
      ],
      riskFlags: [],
      icpHistory: [],
    });

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.patterns).toEqual([
      {
        id: "pattern-STRONG_YES",
        description: "STRONG_YES decisions convert to meetings at 75% (n=12)",
        evidence: "12 decisions, 9 meetings",
        confidence: 95, // 50 + 12*5 = 110, capped at 95
        type: "performance_pattern",
        createdAt: "2026-07-10T00:00:00.000Z",
      },
    ]);
  });

  it("scales pattern confidence with sample size, capped at 95", async () => {
    repo.getCompanyMemory.mockResolvedValue({
      patterns: [
        { verdict: "YES", description: "d", sampleSize: 2, meetingRate: 0.5, updatedAt: "2026-07-10T00:00:00.000Z" },
      ],
    });

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.patterns[0]?.confidence).toBe(60); // 50 + 2*5
  });

  it("always returns riskFlags/icpAccuracy/topPerformingMessages honestly empty (not yet computed anywhere)", async () => {
    repo.getCompanyMemory.mockResolvedValue({ patterns: [], riskFlags: [{ fake: "flag" }], icpHistory: [] });

    const result = await getCompanyMemoryForTeam("team_1");

    expect(result.riskFlags).toEqual([]);
    expect(result.icpAccuracy).toBeNull();
    expect(result.topPerformingMessages).toEqual([]);
  });
});
