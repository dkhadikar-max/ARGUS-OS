import { describe, expect, it, vi, beforeEach } from "vitest";

const prisma = {
  evidenceEdge: { upsert: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
};
vi.mock("@argus/database", () => ({ prisma }));

const {
  createEvidenceEdge,
  getEdgesForEvidence,
  getCorroborations,
  getContradictions,
  deleteEvidenceEdge,
} = await import("./evidence-graph.service.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createEvidenceEdge", () => {
  it("upserts on the (fromId, toId, relation) composite key, defaulting strength to 0.5", async () => {
    prisma.evidenceEdge.upsert.mockResolvedValue({ id: "edge_1" });

    await createEvidenceEdge({ fromId: "e5", toId: "e1", relation: "CORROBORATES" });

    expect(prisma.evidenceEdge.upsert).toHaveBeenCalledWith({
      where: { fromId_toId_relation: { fromId: "e5", toId: "e1", relation: "CORROBORATES" } },
      create: { fromId: "e5", toId: "e1", relation: "CORROBORATES", strength: 0.5 },
      update: { strength: 0.5 },
    });
  });

  it("passes through an explicit strength instead of the default", async () => {
    prisma.evidenceEdge.upsert.mockResolvedValue({ id: "edge_1" });

    await createEvidenceEdge({ fromId: "e2", toId: "e3", relation: "ENABLES", strength: 0.9 });

    expect(prisma.evidenceEdge.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { fromId: "e2", toId: "e3", relation: "ENABLES", strength: 0.9 },
        update: { strength: 0.9 },
      }),
    );
  });
});

describe("getEdgesForEvidence", () => {
  it("queries edges where the evidence is either the source or the target", async () => {
    prisma.evidenceEdge.findMany.mockResolvedValue([]);

    await getEdgesForEvidence("e1");

    expect(prisma.evidenceEdge.findMany).toHaveBeenCalledWith({
      where: { OR: [{ fromId: "e1" }, { toId: "e1" }] },
      include: { from: true, to: true },
    });
  });
});

describe("getCorroborations", () => {
  it("finds CORROBORATES edges where the given evidence is the target", async () => {
    prisma.evidenceEdge.findMany.mockResolvedValue([]);

    await getCorroborations("e1");

    expect(prisma.evidenceEdge.findMany).toHaveBeenCalledWith({
      where: { toId: "e1", relation: "CORROBORATES" },
      include: { from: true },
    });
  });
});

describe("getContradictions", () => {
  it("finds CONTRADICTS edges where the given evidence is the target", async () => {
    prisma.evidenceEdge.findMany.mockResolvedValue([]);

    await getContradictions("e1");

    expect(prisma.evidenceEdge.findMany).toHaveBeenCalledWith({
      where: { toId: "e1", relation: "CONTRADICTS" },
      include: { from: true },
    });
  });
});

describe("deleteEvidenceEdge", () => {
  it("deletes by id", async () => {
    prisma.evidenceEdge.delete.mockResolvedValue({ id: "edge_1" });

    await deleteEvidenceEdge("edge_1");

    expect(prisma.evidenceEdge.delete).toHaveBeenCalledWith({ where: { id: "edge_1" } });
  });
});
