import type { Evidence } from "@argus/database";

/**
 * v4 roadmap Phase 4. One retriever per agent, each with its own ranking
 * formula over the same underlying Evidence pool for a prospect -- the
 * point being that Research/ICP/Intent/Risk don't all want the same
 * evidence prioritized the same way (Research wants recent+confident+
 * reliable-source firmographics; Risk wants corroborated derived signals).
 *
 * All retrieve() methods are async for interface consistency: Risk's own
 * ranking needs an EvidenceEdge lookup (Phase 2), so it must be async, and
 * having one shared signature is simpler than a sync/async split across
 * the registry.
 *
 * Standalone and unwired -- nothing in orchestrator.ts calls into this
 * yet, per this phase's "only retrieval, do not modify Decision Engine"
 * scope. The Decision Engine refactor (roadmap's deferred, benchmark-
 * gated orchestration phase) is what would actually wire these in.
 */
export interface Retriever {
  retrieve(evidencePool: Evidence[], topK?: number): Promise<Evidence[]>;
}
