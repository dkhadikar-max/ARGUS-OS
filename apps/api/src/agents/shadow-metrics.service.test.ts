import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DisagreementCategory } from "./decision-disagreement.js";

const prisma = {
  shadowDecision: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
};
vi.mock("@argus/database", () => ({ prisma }));

const { getShadowMetricsSummary } = await import("./shadow-metrics.service.js");

function row(overrides: { verdictAgreement?: boolean; confidenceDelta?: number; inferenceCostUsd?: number; disagreementCategories?: DisagreementCategory[] } = {}) {
  return {
    verdictAgreement: overrides.verdictAgreement ?? true,
    confidenceDelta: overrides.confidenceDelta ?? 0,
    inferenceCostUsd: overrides.inferenceCostUsd ?? 0.1,
    disagreementCategories: overrides.disagreementCategories ?? [],
    createdAt: new Date("2026-07-30T00:00:00Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.shadowDecision.findMany.mockResolvedValue([]);
  prisma.$queryRaw.mockResolvedValue([]);
});

describe("getShadowMetricsSummary", () => {
  it("empty window -- real zero values, never NaN", async () => {
    const summary = await getShadowMetricsSummary("team_1", 7);

    expect(summary.totalShadowDecisions).toBe(0);
    expect(summary.verdictAgreementRate).toBe(0);
    expect(summary.avgConfidenceDelta).toBe(0);
    expect(summary.p50ConfidenceDelta).toBe(0);
    expect(summary.avgCostUsd).toBe(0);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.volumeByDay).toEqual([]);
    for (const entry of summary.disagreementBreakdown) {
      expect(entry.count).toBe(0);
    }
  });

  it("verdictAgreementRate reflects the real ratio of agreeing rows", async () => {
    prisma.shadowDecision.findMany.mockResolvedValue([
      row({ verdictAgreement: true }),
      row({ verdictAgreement: true }),
      row({ verdictAgreement: true }),
      row({ verdictAgreement: false }),
    ]);

    const summary = await getShadowMetricsSummary("team_1", 7);

    expect(summary.totalShadowDecisions).toBe(4);
    expect(summary.verdictAgreementRate).toBe(0.75);
  });

  it("confidence delta avg/p50 computed from real values", async () => {
    prisma.shadowDecision.findMany.mockResolvedValue([
      row({ confidenceDelta: 0 }),
      row({ confidenceDelta: 2 }),
      row({ confidenceDelta: 4 }),
      row({ confidenceDelta: 10 }),
    ]);

    const summary = await getShadowMetricsSummary("team_1", 7);

    expect(summary.avgConfidenceDelta).toBe(4); // (0+2+4+10)/4
    expect(summary.p50ConfidenceDelta).toBe(2); // sorted [0,2,4,10]; ceil(0.5*4)-1 = index 1 -> 2
  });

  it("cost avg/total computed from real inferenceCostUsd values", async () => {
    prisma.shadowDecision.findMany.mockResolvedValue([row({ inferenceCostUsd: 0.1 }), row({ inferenceCostUsd: 0.3 })]);

    const summary = await getShadowMetricsSummary("team_1", 7);

    expect(summary.totalCostUsd).toBeCloseTo(0.4, 10);
    expect(summary.avgCostUsd).toBeCloseTo(0.2, 10);
  });

  it("disagreementBreakdown counts each category across rows, including rows with multiple categories", async () => {
    prisma.shadowDecision.findMany.mockResolvedValue([
      row({ disagreementCategories: ["verdict_mismatch", "controller_action_mismatch"] }),
      row({ disagreementCategories: ["verdict_mismatch"] }),
      row({ disagreementCategories: [] }),
    ]);

    const summary = await getShadowMetricsSummary("team_1", 7);

    const verdictMismatch = summary.disagreementBreakdown.find((b) => b.category === "verdict_mismatch");
    const controllerMismatch = summary.disagreementBreakdown.find((b) => b.category === "controller_action_mismatch");
    const runtimeError = summary.disagreementBreakdown.find((b) => b.category === "runtime_error");

    expect(verdictMismatch?.count).toBe(2);
    expect(controllerMismatch?.count).toBe(1);
    expect(runtimeError?.count).toBe(0);
  });

  it("volumeByDay maps the real date-bucketed raw query result (Date -> ISO date string, bigint -> number)", async () => {
    prisma.$queryRaw.mockResolvedValue([
      { day: new Date("2026-07-29T00:00:00Z"), count: 3n },
      { day: new Date("2026-07-30T00:00:00Z"), count: 5n },
    ]);

    const summary = await getShadowMetricsSummary("team_1", 7);

    expect(summary.volumeByDay).toEqual([
      { day: "2026-07-29", count: 3 },
      { day: "2026-07-30", count: 5 },
    ]);
  });

  it("scopes the query to the given teamId", async () => {
    await getShadowMetricsSummary("team_42", 7);

    expect(prisma.shadowDecision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ teamId: "team_42" }) }),
    );
  });

  describe("cross-team mode (teamId undefined -- Admin API Increment A)", () => {
    it("omits teamId from the where clause entirely when teamId is undefined", async () => {
      await getShadowMetricsSummary(undefined, 7);

      const where = prisma.shadowDecision.findMany.mock.calls[0]![0].where;
      expect(where).not.toHaveProperty("teamId");
      expect(where).toHaveProperty("createdAt");
    });

    it("uses the no-teamId $queryRaw branch for volume-by-day when teamId is undefined", async () => {
      await getShadowMetricsSummary(undefined, 7);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      // The tagged-template call's first argument is the strings array --
      // the no-teamId branch's query text has no "teamId" reference at all.
      const strings = prisma.$queryRaw.mock.calls[0]![0] as TemplateStringsArray;
      expect(strings.join("")).not.toContain("teamId");
    });

    it("a defined teamId still produces the single-team $queryRaw branch (regression check)", async () => {
      await getShadowMetricsSummary("team_1", 7);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const strings = prisma.$queryRaw.mock.calls[0]![0] as TemplateStringsArray;
      expect(strings.join("")).toContain("teamId");
    });
  });
});
