import { describe, expect, it } from "vitest";
import { plan, topologicalBatches, type ExecutionPlan } from "./planner.js";
import { SALES_LEAD_QUALIFICATION_PACK } from "./decision-pack.js";

describe("plan", () => {
  it("derives the real dependency graph for SALES_LEAD_QUALIFICATION_PACK -- research has no deps, icp/intent depend only on research, risk depends on all three", () => {
    const executionPlan = plan(SALES_LEAD_QUALIFICATION_PACK);

    expect(executionPlan.packId).toBe(SALES_LEAD_QUALIFICATION_PACK.id);
    expect(executionPlan.nodes.map((n) => n.id).sort()).toEqual(["icp", "intent", "research", "risk"]);

    const edgesTo = (stage: string) => executionPlan.edges.filter((e) => e.to === stage).map((e) => e.from).sort();
    expect(edgesTo("research")).toEqual([]);
    expect(edgesTo("icp")).toEqual(["research"]);
    expect(edgesTo("intent")).toEqual(["research"]);
    expect(edgesTo("risk")).toEqual(["icp", "intent", "research"]);
  });

  it("every node's capabilityId matches its id", () => {
    const executionPlan = plan(SALES_LEAD_QUALIFICATION_PACK);
    for (const node of executionPlan.nodes) {
      expect(node.capabilityId).toBe(node.id);
    }
  });
});

describe("topologicalBatches", () => {
  it("produces the real Sales pack execution order: research, then icp+intent in parallel, then risk -- matching runStagesResearchThroughRisk exactly", () => {
    const batches = topologicalBatches(plan(SALES_LEAD_QUALIFICATION_PACK));

    expect(batches).toEqual([["research"], ["icp", "intent"], ["risk"]]);
  });

  it("returns one batch per node for a plan with no edges at all", () => {
    const noEdgePlan: ExecutionPlan = {
      packId: "test",
      nodes: [{ id: "research", capabilityId: "research" }],
      edges: [],
    };
    expect(topologicalBatches(noEdgePlan)).toEqual([["research"]]);
  });

  it("throws a clear error for a plan with a real cycle, rather than looping forever or returning a wrong order", () => {
    const cyclicPlan: ExecutionPlan = {
      packId: "test",
      nodes: [
        { id: "research", capabilityId: "research" },
        { id: "icp", capabilityId: "icp" },
      ],
      edges: [
        { from: "research", to: "icp" },
        { from: "icp", to: "research" },
      ],
    };
    expect(() => topologicalBatches(cyclicPlan)).toThrow(/cycle/);
  });
});
