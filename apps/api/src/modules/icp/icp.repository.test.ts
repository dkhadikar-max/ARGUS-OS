import { describe, expect, it, vi, beforeEach } from "vitest";

const prisma = { iCPDefinition: { upsert: vi.fn() } };
vi.mock("@argus/database", () => ({ prisma }));

const { upsertIcp } = await import("./icp.repository.js");

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
