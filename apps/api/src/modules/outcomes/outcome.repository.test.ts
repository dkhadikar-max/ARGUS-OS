import { describe, expect, it, vi, beforeEach } from "vitest";

const tx = {
  $queryRaw: vi.fn(),
  companyMemory: { findUnique: vi.fn(), upsert: vi.fn() },
};
const prisma = {
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
};
vi.mock("@argus/database", () => ({ prisma }));

const { upsertCompanyMemoryPatternForVerdict } = await import("./outcome.repository.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertCompanyMemoryPatternForVerdict — race-condition fix", () => {
  it("row-locks before reading, so two concurrent calls for different verdicts can't clobber each other's pattern", async () => {
    tx.companyMemory.findUnique.mockResolvedValue({
      patterns: [{ verdict: "WAIT", description: "existing WAIT pattern" }],
    });

    await upsertCompanyMemoryPatternForVerdict("team_1", "STRONG_YES", {
      verdict: "STRONG_YES",
      description: "new STRONG_YES pattern",
    });

    // The lock must be acquired (or attempted) before the read, inside the
    // same transaction -- that's what serializes a concurrent call for a
    // different verdict against this one, instead of both reading the
    // same stale array.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.companyMemory.findUnique).toHaveBeenCalledWith({ where: { teamId: "team_1" } });

    // The other verdict's existing pattern must be preserved, not dropped,
    // when this verdict's entry is written.
    expect(tx.companyMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId: "team_1" },
        update: expect.objectContaining({
          patterns: [
            { verdict: "WAIT", description: "existing WAIT pattern" },
            { verdict: "STRONG_YES", description: "new STRONG_YES pattern" },
          ],
        }),
      }),
    );
  });

  it("replaces (not duplicates) an existing entry for the same verdict", async () => {
    tx.companyMemory.findUnique.mockResolvedValue({
      patterns: [{ verdict: "STRONG_YES", description: "stale STRONG_YES pattern" }],
    });

    await upsertCompanyMemoryPatternForVerdict("team_1", "STRONG_YES", {
      verdict: "STRONG_YES",
      description: "fresh STRONG_YES pattern",
    });

    expect(tx.companyMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          patterns: [{ verdict: "STRONG_YES", description: "fresh STRONG_YES pattern" }],
        }),
      }),
    );
  });

  it("handles a brand-new team with no CompanyMemory row yet", async () => {
    tx.companyMemory.findUnique.mockResolvedValue(null);

    await upsertCompanyMemoryPatternForVerdict("team_1", "YES", { verdict: "YES", description: "first pattern" });

    expect(tx.companyMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          teamId: "team_1",
          patterns: [{ verdict: "YES", description: "first pattern" }],
        }),
      }),
    );
  });
});
