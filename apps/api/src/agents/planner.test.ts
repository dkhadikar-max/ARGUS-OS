import { describe, expect, it } from "vitest";
import { plan, topologicalBatches, buildExecutionPlan } from "./planner.js";
import { SALES_LEAD_QUALIFICATION_PACK } from "./decision-pack.js";

describe("plan", () => {
  it("derives the real dependency graph for SALES_LEAD_QUALIFICATION_PACK -- research has no deps, icp/intent depend only on research, risk depends on all three", () => {
    const executionPlan = plan(SALES_LEAD_QUALIFICATION_PACK);

    expect(executionPlan.packId).toBe(SALES_LEAD_QUALIFICATION_PACK.id);
    expect(executionPlan.dependencies("research")).toEqual([]);
    expect(executionPlan.dependencies("icp")).toEqual(["research"]);
    expect(executionPlan.dependencies("intent")).toEqual(["research"]);
    expect(executionPlan.dependencies("risk").sort()).toEqual(["icp", "intent", "research"]);
  });

  it("rootStages() returns exactly the stages with no dependencies", () => {
    const executionPlan = plan(SALES_LEAD_QUALIFICATION_PACK);
    expect(executionPlan.rootStages()).toEqual(["research"]);
  });

  it("nextReadyStages() returns icp+intent once research is completed, and risk once all three are", () => {
    const executionPlan = plan(SALES_LEAD_QUALIFICATION_PACK);
    expect(executionPlan.nextReadyStages([])).toEqual(["research"]);
    expect(executionPlan.nextReadyStages(["research"])).toEqual(["icp", "intent"]);
    expect(executionPlan.nextReadyStages(["research", "icp", "intent"])).toEqual(["risk"]);
    expect(executionPlan.nextReadyStages(["research", "icp", "intent", "risk"])).toEqual([]);
  });

  it("toGraph() exposes the real nodes/edges as the one sanctioned escape hatch -- every node's capabilityId matches its id", () => {
    const { nodes } = plan(SALES_LEAD_QUALIFICATION_PACK).toGraph();
    expect(nodes.map((n) => n.id).sort()).toEqual(["icp", "intent", "research", "risk"]);
    for (const node of nodes) expect(node.capabilityId).toBe(node.id);
  });

  it("validate() passes for the real Sales pack plan (no cycle, no dangling edge)", () => {
    expect(() => plan(SALES_LEAD_QUALIFICATION_PACK).validate()).not.toThrow();
  });

  it("validate() throws for a hand-built graph with a dangling edge reference -- unreachable via plan() itself, which never produces one", () => {
    const withDanglingEdge = buildExecutionPlan(
      "test",
      [{ id: "research", capabilityId: "research" }],
      [{ from: "research", to: "icp" }], // "icp" isn't a real node in this graph
    );
    expect(() => withDanglingEdge.validate()).toThrow(/unknown node "icp"/);
  });

  it("validate() throws for a hand-built graph with a real cycle", () => {
    const cyclic = buildExecutionPlan(
      "test",
      [
        { id: "research", capabilityId: "research" },
        { id: "icp", capabilityId: "icp" },
      ],
      [
        { from: "research", to: "icp" },
        { from: "icp", to: "research" },
      ],
    );
    expect(() => cyclic.validate()).toThrow(/cycle/);
  });
});

describe("topologicalBatches", () => {
  it("produces the real Sales pack execution order: research, then icp+intent in parallel, then risk -- matching runStagesResearchThroughRisk exactly", () => {
    const batches = topologicalBatches(plan(SALES_LEAD_QUALIFICATION_PACK));

    expect(batches).toEqual([["research"], ["icp", "intent"], ["risk"]]);
  });

  it("returns one batch per node for a plan with no edges at all", () => {
    const noEdgePlan = buildExecutionPlan("test", [{ id: "research", capabilityId: "research" }], []);
    expect(topologicalBatches(noEdgePlan)).toEqual([["research"]]);
  });

  it("throws a clear error for a plan with a real cycle, rather than looping forever or returning a wrong order", () => {
    const cyclicPlan = buildExecutionPlan(
      "test",
      [
        { id: "research", capabilityId: "research" },
        { id: "icp", capabilityId: "icp" },
      ],
      [
        { from: "research", to: "icp" },
        { from: "icp", to: "research" },
      ],
    );
    expect(() => topologicalBatches(cyclicPlan)).toThrow(/cycle/);
  });
});
