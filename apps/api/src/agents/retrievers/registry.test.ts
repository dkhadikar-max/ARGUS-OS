import { describe, expect, it, vi } from "vitest";

vi.mock("@argus/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@argus/database")>();
  return { ...actual, prisma: { evidenceEdge: { findMany: vi.fn() } } };
});

const { RETRIEVER_REGISTRY } = await import("./registry.js");

describe("RETRIEVER_REGISTRY", () => {
  it("has exactly one retriever per pipeline stage", () => {
    expect(Object.keys(RETRIEVER_REGISTRY).sort()).toEqual(["icp", "intent", "research", "risk"]);
  });

  it("every entry implements retrieve()", () => {
    for (const retriever of Object.values(RETRIEVER_REGISTRY)) {
      expect(typeof retriever.retrieve).toBe("function");
    }
  });
});
