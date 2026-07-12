import { describe, expect, it, vi, beforeEach } from "vitest";

const tx = {
  $queryRaw: vi.fn(),
  companyMemory: { findUnique: vi.fn(), upsert: vi.fn() },
};
const prisma = {
  iCPDefinition: { upsert: vi.fn() },
  decision: { findMany: vi.fn() },
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
};
vi.mock("@argus/database", () => ({ prisma }));

const { upsertIcp, getDecisionsSince, appendIcpHistoryEntry } = await import("./icp.repository.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertIcp — Bible §18 INF-4-adjacent correctness fix", () => {
  it("uses a single atomic upsert with version: { increment: 1 }, not a JS-computed value from a prior read", async () => {
    prisma.iCPDefinition.upsert.mockResolvedValue({ version: 6 });
    const criteria = [{ field: "companySize", operator: "gte" as const, value: 50, weight: 1 }];

    await upsertIcp("team_1", criteria);

    // The whole point of the fix: no separate findUnique-then-branch read
    // happens in this function anymore -- a single upsert call is the only
    // way version could ever be computed, which is what makes concurrent
    // saves safe (Postgres executes "version = version + 1" atomically,
    // immune to two callers reading the same prior value).
    expect(prisma.iCPDefinition.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.iCPDefinition.upsert).toHaveBeenCalledWith({
      where: { teamId: "team_1" },
      create: { teamId: "team_1", criteria, version: 1 },
      update: { criteria, version: { increment: 1 } },
    });
  });
});

describe("getDecisionsSince", () => {
  it("queries decisions created at or after the given timestamp", async () => {
    const since = new Date("2026-07-01T00:00:00Z");
    prisma.decision.findMany.mockResolvedValue([]);

    await getDecisionsSince("team_1", since);

    expect(prisma.decision.findMany).toHaveBeenCalledWith({
      where: { teamId: "team_1", createdAt: { gte: since } },
      select: { verdict: true, outcome: { select: { type: true } } },
    });
  });
});

describe("appendIcpHistoryEntry — Bible §10.5 icpAccuracy", () => {
  it("row-locks before reading, then appends the new entry to the existing icpHistory array", async () => {
    tx.companyMemory.findUnique.mockResolvedValue({
      icpHistory: [{ version: 1, accuracy: 0.6 }],
    });

    await appendIcpHistoryEntry("team_1", { version: 2, accuracy: 0.7 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.companyMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId: "team_1" },
        update: { icpHistory: [{ version: 1, accuracy: 0.6 }, { version: 2, accuracy: 0.7 }] },
      }),
    );
  });

  it("creates a new CompanyMemory row with empty patterns/riskFlags for a team's first-ever entry", async () => {
    tx.companyMemory.findUnique.mockResolvedValue(null);

    await appendIcpHistoryEntry("team_1", { version: 1, accuracy: null });

    expect(tx.companyMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { teamId: "team_1", patterns: [], riskFlags: [], icpHistory: [{ version: 1, accuracy: null }] },
      }),
    );
  });
});
