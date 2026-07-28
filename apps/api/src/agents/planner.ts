import type { StageId } from "./orchestrator.js";
import type { DecisionPack } from "./decision-pack.js";

// v5.0 scaffolding, Increment 1 -- the one genuinely new piece (confirmed
// via full-tree grep before writing any of this: no Planner/ExecutionPlan
// concept existed anywhere in the codebase). Deterministic and pack-agnostic
// in principle, but only ever exercised against the real Sales pack today
// (capabilityIds: research/icp/intent/risk) -- represented as an explicit
// graph (nodes + edges) rather than an adjacency-list-per-node so a future
// pack with a genuinely different dependency shape (e.g. a Hiring pack)
// doesn't require redesigning the type, even though execution stays linear
// for now. Standalone and unwired -- nothing calls plan()/topologicalBatches()
// from any live path.

export interface PlanNode {
  id: StageId;
  capabilityId: StageId;
}

export interface PlanEdge {
  /** Dependency (must run first). */
  from: StageId;
  /** Dependent (runs after `from`). */
  to: StageId;
}

export interface ExecutionPlan {
  packId: string;
  nodes: PlanNode[];
  edges: PlanEdge[];
}

/** The real dependency graph already implemented and comment-documented in
 *  orchestrator.ts's runStagesResearchThroughRisk: Research has no
 *  dependencies; ICP and Intent each depend only on Research (not on each
 *  other); Risk depends on Research+ICP+Intent. Judge is intentionally
 *  absent -- see reasoning-capability.ts's module comment on why it isn't
 *  wrapped as a single-input capability in this increment. */
const KNOWN_STAGE_DEPENDENCIES: Record<"research" | "icp" | "intent" | "risk", StageId[]> = {
  research: [],
  icp: ["research"],
  intent: ["research"],
  risk: ["research", "icp", "intent"],
};

/** Derives an ExecutionPlan from a DecisionPack's real capabilityIds.
 *  Capability ids outside the known 4 agent stages (e.g. a future pack
 *  with a genuinely different capability set) are silently excluded from
 *  the graph rather than guessed at -- there is no real dependency
 *  structure to derive for a capability this planner doesn't know about
 *  yet. Today, for SALES_LEAD_QUALIFICATION_PACK, this excludes nothing:
 *  its capabilityIds are exactly the 4 known stages. */
export function plan(pack: DecisionPack): ExecutionPlan {
  const nodes: PlanNode[] = pack.capabilityIds
    .filter((id): id is keyof typeof KNOWN_STAGE_DEPENDENCIES => id in KNOWN_STAGE_DEPENDENCIES)
    .map((id) => ({ id: id as StageId, capabilityId: id as StageId }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: PlanEdge[] = [];
  for (const node of nodes) {
    const deps = KNOWN_STAGE_DEPENDENCIES[node.id as keyof typeof KNOWN_STAGE_DEPENDENCIES];
    for (const dep of deps) {
      if (nodeIds.has(dep)) edges.push({ from: dep, to: node.id });
    }
  }

  return { packId: pack.id, nodes, edges };
}

/** Derived from the graph (not stored redundantly on ExecutionPlan itself)
 *  -- groups nodes into sequential batches an executor could run in order,
 *  each batch internally parallelizable. Real precedent:
 *  [["research"], ["icp","intent"], ["risk"]] for the Sales pack, matching
 *  runStagesResearchThroughRisk exactly. No execution logic here -- this
 *  only describes order; nothing runs a plan yet. */
export function topologicalBatches(executionPlan: ExecutionPlan): StageId[][] {
  const remaining = new Set(executionPlan.nodes.map((n) => n.id));
  const batches: StageId[][] = [];

  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((id) => executionPlan.edges.every((edge) => edge.to !== id || !remaining.has(edge.from)))
      .sort();
    if (ready.length === 0) {
      throw new Error("ExecutionPlan has a cycle -- cannot compute topological batches");
    }
    for (const id of ready) remaining.delete(id);
    batches.push(ready);
  }

  return batches;
}
