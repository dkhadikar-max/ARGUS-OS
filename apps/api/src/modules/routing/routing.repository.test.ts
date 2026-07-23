import { describe, expect, it, vi, beforeEach } from "vitest";

const tx = {
  routingThresholdVersion: {
    updateMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};
const prisma = {
  routingThresholdVersion: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
};
vi.mock("@argus/database", () => ({ prisma }));

const {
  getActiveRoutingThresholdVersion,
  getPendingRoutingThresholdVersion,
  getRoutingThresholdVersionHistory,
  getRoutingThresholdVersionByNumber,
  createPendingRoutingThresholdVersion,
  approveRoutingThresholdVersion,
  rejectRoutingThresholdVersion,
} = await import("./routing.repository.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getActiveRoutingThresholdVersion", () => {
  it("queries for the ACTIVE row for the given team", async () => {
    prisma.routingThresholdVersion.findFirst.mockResolvedValue(null);
    await getActiveRoutingThresholdVersion("team_1");
    expect(prisma.routingThresholdVersion.findFirst).toHaveBeenCalledWith({
      where: { teamId: "team_1", status: "ACTIVE" },
    });
  });
});

describe("getPendingRoutingThresholdVersion", () => {
  it("queries for the newest PENDING row for the given team", async () => {
    prisma.routingThresholdVersion.findFirst.mockResolvedValue(null);
    await getPendingRoutingThresholdVersion("team_1");
    expect(prisma.routingThresholdVersion.findFirst).toHaveBeenCalledWith({
      where: { teamId: "team_1", status: "PENDING" },
      orderBy: { version: "desc" },
    });
  });
});

describe("getRoutingThresholdVersionHistory", () => {
  it("queries newest-version-first for the given team", async () => {
    prisma.routingThresholdVersion.findMany.mockResolvedValue([]);
    await getRoutingThresholdVersionHistory("team_1");
    expect(prisma.routingThresholdVersion.findMany).toHaveBeenCalledWith({
      where: { teamId: "team_1" },
      orderBy: { version: "desc" },
    });
  });
});

describe("getRoutingThresholdVersionByNumber", () => {
  it("looks up by the composite (teamId, version) key", async () => {
    prisma.routingThresholdVersion.findUnique.mockResolvedValue(null);
    await getRoutingThresholdVersionByNumber("team_1", 2);
    expect(prisma.routingThresholdVersion.findUnique).toHaveBeenCalledWith({
      where: { teamId_version: { teamId: "team_1", version: 2 } },
    });
  });
});

describe("createPendingRoutingThresholdVersion", () => {
  it("supersedes any existing PENDING row, then creates a new one at the next version number", async () => {
    prisma.routingThresholdVersion.findFirst.mockResolvedValue({ version: 3 });
    tx.routingThresholdVersion.create.mockResolvedValue({ id: "v4" });

    await createPendingRoutingThresholdVersion("team_1", { cvThreshold: 0.2, maxSurpriseThreshold: 0.6 }, "user_1");

    expect(tx.routingThresholdVersion.updateMany).toHaveBeenCalledWith({
      where: { teamId: "team_1", status: "PENDING" },
      data: { status: "SUPERSEDED" },
    });
    expect(tx.routingThresholdVersion.create).toHaveBeenCalledWith({
      data: {
        teamId: "team_1",
        version: 4,
        thresholds: { cvThreshold: 0.2, maxSurpriseThreshold: 0.6 },
        status: "PENDING",
        createdBy: "user_1",
      },
    });
  });

  it("starts at version 1 when the team has no existing versions", async () => {
    prisma.routingThresholdVersion.findFirst.mockResolvedValue(null);
    tx.routingThresholdVersion.create.mockResolvedValue({ id: "v1" });

    await createPendingRoutingThresholdVersion("team_1", { cvThreshold: 0.25, maxSurpriseThreshold: 0.7 }, "user_1");

    expect(tx.routingThresholdVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 1 }) }),
    );
  });
});

describe("approveRoutingThresholdVersion", () => {
  it("supersedes the current ACTIVE row, then marks the target version ACTIVE with approval metadata", async () => {
    tx.routingThresholdVersion.update.mockResolvedValue({ id: "v2", status: "ACTIVE" });

    await approveRoutingThresholdVersion("team_1", 2, "admin_1");

    expect(tx.routingThresholdVersion.updateMany).toHaveBeenCalledWith({
      where: { teamId: "team_1", status: "ACTIVE" },
      data: { status: "SUPERSEDED" },
    });
    expect(tx.routingThresholdVersion.update).toHaveBeenCalledWith({
      where: { teamId_version: { teamId: "team_1", version: 2 } },
      data: { status: "ACTIVE", approvedAt: expect.any(Date), approvedBy: "admin_1" },
    });
  });
});

describe("rejectRoutingThresholdVersion", () => {
  it("marks the target version REJECTED with resolution metadata", async () => {
    prisma.routingThresholdVersion.update.mockResolvedValue({ id: "v2", status: "REJECTED" });

    await rejectRoutingThresholdVersion("team_1", 2, "admin_1");

    expect(prisma.routingThresholdVersion.update).toHaveBeenCalledWith({
      where: { teamId_version: { teamId: "team_1", version: 2 } },
      data: { status: "REJECTED", approvedAt: expect.any(Date), approvedBy: "admin_1" },
    });
  });
});
