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
//
// ExecutionPlan's internal representation (nodes/edges) is deliberately not
// exposed as public fields -- only through query methods (rootStages,
// dependencies, nextReadyStages) plus one explicit escape hatch (toGraph,
// for serialization/logging/testing). This means the internal shape can
// still change later without breaking every caller, before there IS a
// second caller to break.

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

export interface PlanGraph {
  nodes: PlanNode[];
  edges: PlanEdge[];
}

export interface ExecutionPlan {
  readonly packId: string;
  /** Stages with no dependencies -- the first real batch an executor could run. */
  rootStages(): StageId[];
  /** Direct dependencies of one stage (not transitive). */
  dependencies(stage: StageId): StageId[];
  /** Stages not yet in `completed` whose every dependency already is --
   *  the real primitive topologicalBatches (below) is built on. */
  nextReadyStages(completed: readonly StageId[]): StageId[];
  /** The one sanctioned way to inspect raw nodes/edges (serialization,
   *  logging, tests) -- not the primary way to query the plan. */
  toGraph(): PlanGraph;
  /** Throws if the graph references an unknown node, or contains a cycle. */
  validate(): void;
}

/** Exported so validate()'s dangling-edge/cycle checks are directly
 *  testable against a hand-built graph -- plan() itself can never actually
 *  produce a dangling edge (it derives edges from known dependencies
 *  filtered to nodes that exist), so that path is otherwise unreachable
 *  from the public API. */
export function buildExecutionPlan(packId: string, nodes: PlanNode[], edges: PlanEdge[]): ExecutionPlan {
  const nodeIds = new Set(nodes.map((n) => n.id));

  function dependencies(stage: StageId): StageId[] {
    return edges.filter((edge) => edge.to === stage).map((edge) => edge.from);
  }

  function rootStages(): StageId[] {
    return nodes
      .map((node) => node.id)
      .filter((id) => dependencies(id).length === 0)
      .sort();
  }

  function nextReadyStages(completed: readonly StageId[]): StageId[] {
    const completedSet = new Set(completed);
    return nodes
      .map((node) => node.id)
      .filter((id) => !completedSet.has(id) && dependencies(id).every((dep) => completedSet.has(dep)))
      .sort();
  }

  function validate(): void {
    for (const edge of edges) {
      if (!nodeIds.has(edge.from)) throw new Error(`ExecutionPlan edge references unknown node "${edge.from}"`);
      if (!nodeIds.has(edge.to)) throw new Error(`ExecutionPlan edge references unknown node "${edge.to}"`);
    }
    let completedCount = 0;
    const completed: StageId[] = [];
    while (completedCount < nodes.length) {
      const ready = nextReadyStages(completed).filter((id) => !completed.includes(id));
      if (ready.length === 0) throw new Error(`ExecutionPlan for pack "${packId}" has a cycle`);
      completed.push(...ready);
      completedCount += ready.length;
    }
  }

  return {
    packId,
    rootStages,
    dependencies,
    nextReadyStages,
    toGraph: () => ({ nodes, edges }),
    validate,
  };
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

  return buildExecutionPlan(pack.id, nodes, edges);
}

/** Groups an ExecutionPlan's stages into sequential batches an executor
 *  could run in order, each batch internally parallelizable -- built
 *  entirely on nextReadyStages, the same primitive any future real
 *  executor would use, rather than re-deriving order from raw nodes/edges.
 *  Real precedent: [["research"], ["icp","intent"], ["risk"]] for the
 *  Sales pack, matching runStagesResearchThroughRisk exactly. No execution
 *  logic here -- this only describes order; nothing runs a plan yet. */
export function topologicalBatches(executionPlan: ExecutionPlan): StageId[][] {
  const total = executionPlan.toGraph().nodes.length;
  const completed: StageId[] = [];
  const batches: StageId[][] = [];

  while (completed.length < total) {
    const ready = executionPlan.nextReadyStages(completed);
    if (ready.length === 0) {
      throw new Error(`ExecutionPlan for pack "${executionPlan.packId}" has a cycle -- cannot compute topological batches`);
    }
    completed.push(...ready);
    batches.push(ready);
  }

  return batches;
}
