import { describe, expect, it, vi, beforeEach } from "vitest";

const prisma = {
  policyVersion: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
};
vi.mock("@argus/database", () => ({ prisma }));

const { recordPolicyVersion, getPolicyVersionHistory, getPolicyVersion } = await import("./policy.repository.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordPolicyVersion", () => {
  it("creates a snapshot row with the given version, rules, and creator", async () => {
    prisma.policyVersion.create.mockResolvedValue({ id: "v1" });
    const rules = [{ field: "verdict" as const, operator: "equals" as const, value: "PASS", action: "FLAG" as const, message: "m" }];

    await recordPolicyVersion("team_1", 2, rules, "user_1");

    expect(prisma.policyVersion.create).toHaveBeenCalledWith({
      data: { teamId: "team_1", version: 2, rules, createdBy: "user_1" },
    });
  });
});

describe("getPolicyVersionHistory", () => {
  it("queries newest-version-first for the given team", async () => {
    prisma.policyVersion.findMany.mockResolvedValue([]);

    await getPolicyVersionHistory("team_1");

    expect(prisma.policyVersion.findMany).toHaveBeenCalledWith({
      where: { teamId: "team_1" },
      orderBy: { version: "desc" },
    });
  });
});

describe("getPolicyVersion", () => {
  it("looks up one version by the composite (teamId, version) key", async () => {
    prisma.policyVersion.findUnique.mockResolvedValue(null);

    await getPolicyVersion("team_1", 3);

    expect(prisma.policyVersion.findUnique).toHaveBeenCalledWith({
      where: { teamId_version: { teamId: "team_1", version: 3 } },
    });
  });
});
