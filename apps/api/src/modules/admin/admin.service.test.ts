import { describe, expect, it, vi, beforeEach } from "vitest";

const getShadowMetricsSummary = vi.fn();
vi.mock("../../agents/shadow-metrics.service.js", () => ({ getShadowMetricsSummary }));

const listShadowDecisionsRepo = vi.fn();
vi.mock("./admin.repository.js", () => ({ listShadowDecisions: listShadowDecisionsRepo }));

const { getShadowMetrics, listShadowDecisions } = await import("./admin.service.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getShadowMetrics", () => {
  it("passes teamId/sinceDays straight through to getShadowMetricsSummary", async () => {
    getShadowMetricsSummary.mockResolvedValue({
      totalShadowDecisions: 0,
      verdictAgreementRate: 0,
      avgConfidenceDelta: 0,
      p50ConfidenceDelta: 0,
      avgCostUsd: 0,
      totalCostUsd: 0,
      disagreementBreakdown: [],
      volumeByDay: [],
    });

    await getShadowMetrics({ teamId: "team_1", sinceDays: 14 });

    expect(getShadowMetricsSummary).toHaveBeenCalledWith("team_1", 14);
  });

  it("sets scope.teamId to null when query omits teamId", async () => {
    getShadowMetricsSummary.mockResolvedValue({
      totalShadowDecisions: 0,
      verdictAgreementRate: 0,
      avgConfidenceDelta: 0,
      p50ConfidenceDelta: 0,
      avgCostUsd: 0,
      totalCostUsd: 0,
      disagreementBreakdown: [],
      volumeByDay: [],
    });

    const result = await getShadowMetrics({ sinceDays: 7 } as never);

    expect(getShadowMetricsSummary).toHaveBeenCalledWith(undefined, 7);
    expect(result.scope).toEqual({ teamId: null, sinceDays: 7 });
  });
});

describe("listShadowDecisions", () => {
  function repoRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "sd_1",
      teamId: "team_1",
      team: { name: "DataFlow Inc." },
      decisionId: "dec_1",
      prospectId: "prospect_1",
      verdict: "WAIT",
      confidence: 52,
      reasoning: "shadow reasoning",
      verdictAgreement: false,
      confidenceDelta: 3,
      disagreementCategories: ["verdict_mismatch"],
      inferenceCostUsd: 0.1,
      processingTimeMs: 90000,
      createdAt: new Date("2026-07-30T12:00:00Z"),
      decision: {
        verdict: "PASS",
        confidence: 54,
        reasoning: "live reasoning",
        recommendedAction: "wait_for_signal",
        createdAt: new Date("2026-07-30T11:58:00Z"),
      },
      ...overrides,
    };
  }

  it("flattens a repository row into the response shape, including teamName and liveDecision", async () => {
    listShadowDecisionsRepo.mockResolvedValue({ rows: [repoRow()], total: 1 });

    const result = await listShadowDecisions({ limit: 20, offset: 0 } as never);

    expect(result.data[0]).toEqual({
      id: "sd_1",
      teamId: "team_1",
      teamName: "DataFlow Inc.",
      decisionId: "dec_1",
      prospectId: "prospect_1",
      shadowVerdict: "WAIT",
      shadowConfidence: 52,
      shadowReasoning: "shadow reasoning",
      liveDecision: {
        verdict: "PASS",
        confidence: 54,
        reasoning: "live reasoning",
        recommendedAction: "wait_for_signal",
        createdAt: "2026-07-30T11:58:00.000Z",
      },
      verdictAgreement: false,
      confidenceDelta: 3,
      disagreementCategories: ["verdict_mismatch"],
      inferenceCostUsd: 0.1,
      processingTimeMs: 90000,
      createdAt: "2026-07-30T12:00:00.000Z",
    });
  });

  it("computes pagination.hasMore correctly at the boundary", async () => {
    listShadowDecisionsRepo.mockResolvedValue({ rows: [repoRow()], total: 1 });
    const exact = await listShadowDecisions({ limit: 20, offset: 0 } as never);
    expect(exact.pagination.hasMore).toBe(false); // offset(0) + rows(1) === total(1)

    listShadowDecisionsRepo.mockResolvedValue({ rows: [repoRow()], total: 5 });
    const more = await listShadowDecisions({ limit: 1, offset: 0 } as never);
    expect(more.pagination.hasMore).toBe(true); // 0 + 1 < 5
  });
});
