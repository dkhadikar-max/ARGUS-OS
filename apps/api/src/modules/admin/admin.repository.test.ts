import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AdminListShadowDecisionsQuery } from "@argus/shared";

const prisma = {
  shadowDecision: { findMany: vi.fn(), count: vi.fn() },
};
vi.mock("@argus/database", () => ({ prisma }));

const { listShadowDecisions } = await import("./admin.repository.js");

function query(overrides: Partial<AdminListShadowDecisionsQuery> = {}): AdminListShadowDecisionsQuery {
  return { limit: 20, offset: 0, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.shadowDecision.findMany.mockResolvedValue([]);
  prisma.shadowDecision.count.mockResolvedValue(0);
});

describe("listShadowDecisions", () => {
  it("omits teamId from where when not provided (cross-team by default)", async () => {
    await listShadowDecisions(query());

    const call = prisma.shadowDecision.findMany.mock.calls[0]![0];
    expect(call.where).not.toHaveProperty("teamId");
  });

  it("includes teamId in where when provided", async () => {
    await listShadowDecisions(query({ teamId: "team_1" }));

    const call = prisma.shadowDecision.findMany.mock.calls[0]![0];
    expect(call.where.teamId).toBe("team_1");
  });

  it("builds createdAt range only when from/to are present", async () => {
    await listShadowDecisions(query());
    expect(prisma.shadowDecision.findMany.mock.calls[0]![0].where).not.toHaveProperty("createdAt");

    vi.clearAllMocks();
    prisma.shadowDecision.findMany.mockResolvedValue([]);
    prisma.shadowDecision.count.mockResolvedValue(0);
    await listShadowDecisions(query({ from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" }));
    const where = prisma.shadowDecision.findMany.mock.calls[0]![0].where;
    expect(where.createdAt.gte).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(where.createdAt.lte).toEqual(new Date("2026-07-31T00:00:00.000Z"));
  });

  it("passes verdict and verdictAgreement through to where only when defined", async () => {
    await listShadowDecisions(query({ verdict: "YES", verdictAgreement: false }));

    const where = prisma.shadowDecision.findMany.mock.calls[0]![0].where;
    expect(where.verdict).toBe("YES");
    expect(where.verdictAgreement).toBe(false);
  });

  it("select never requests agentOutputs or executionTrace", async () => {
    await listShadowDecisions(query());

    const select = prisma.shadowDecision.findMany.mock.calls[0]![0].select;
    expect(select).not.toHaveProperty("agentOutputs");
    expect(select).not.toHaveProperty("executionTrace");
  });

  it("includes the paired live Decision via a select-scoped nested object", async () => {
    await listShadowDecisions(query());

    const select = prisma.shadowDecision.findMany.mock.calls[0]![0].select;
    expect(select.decision).toEqual({
      select: { verdict: true, confidence: true, reasoning: true, recommendedAction: true, createdAt: true },
    });
  });

  it("applies limit/offset and orders by createdAt desc", async () => {
    await listShadowDecisions(query({ limit: 10, offset: 5 }));

    expect(prisma.shadowDecision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 5, orderBy: { createdAt: "desc" } }),
    );
  });

  it("returns rows and total from a parallel findMany + count using the same where", async () => {
    const fakeRows = [{ id: "sd_1" }];
    prisma.shadowDecision.findMany.mockResolvedValue(fakeRows);
    prisma.shadowDecision.count.mockResolvedValue(1);

    const result = await listShadowDecisions(query({ teamId: "team_1" }));

    expect(result).toEqual({ rows: fakeRows, total: 1 });
    expect(prisma.shadowDecision.count).toHaveBeenCalledWith({ where: expect.objectContaining({ teamId: "team_1" }) });
  });
});
