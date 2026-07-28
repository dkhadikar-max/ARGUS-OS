import type { Evidence } from "@argus/database";
import { logger } from "../lib/logger.js";
import { RETRIEVER_CAPABILITIES, type CapabilityOutputsByStage, type ExecutionContext, type ExecutionIdentity } from "./reasoning-capability.js";
import { selectBestAdvisory } from "./advisory-scoring.js";

// Controller & Capability Specification v3.0 -- "shadow capability
// selection logging," narrowed to what's honest: nothing in ARGUS
// actually *selects* a capability today -- the pipeline is fixed, so all
// 4 real retriever capabilities (research/icp/intent/risk) always run,
// every time. This isn't a selection log; it's a real per-capability
// output log against a real (possibly empty) evidence pool. Gated by the
// same RECORD_DECISION_STATE flag as decision-state-shadow.ts; purely
// observational, never influences the real decision.

/**
 * Invokes all 4 real RETRIEVER_CAPABILITIES against a real evidence pool
 * (decision.repository.ts's getEvidenceForProspect -- empty for a
 * prospect with no prior decisions, non-empty for a repeat one; both are
 * honest, not a bug) and logs each one's real CapabilityOutput.
 */
export async function observeCapabilityOutputs(
  decisionId: string,
  evidencePool: Evidence[],
  identity: ExecutionIdentity,
): Promise<CapabilityOutputsByStage> {
  // Retrievers never consume ctx.budget (wrapRetrieverAsCapability's own
  // module comment: no per-retriever budget concept exists -- real cost is
  // always $0/0 tokens). "Unconstrained" here is an honest placeholder,
  // not a guessed real number -- same spirit as budget-manager.ts's own
  // NO_REAL_COMPLEXITY_SCORE_AVAILABLE. A real BudgetSnapshot isn't
  // cheaply available at this call site: every real example
  // (decision-state-shadow.ts, execution-runtime.ts) derives it from a
  // DecisionState, which recordDecisionStateShadow only builds AFTER this
  // function returns -- reordering that is out of scope for this
  // shadow-only observation path.
  const ctx: ExecutionContext = {
    identity,
    budget: { remainingReasoning: Number.POSITIVE_INFINITY, remainingLatency: Number.POSITIVE_INFINITY, remainingCost: Number.POSITIVE_INFINITY },
  };
  const entries = await Promise.all(
    Object.entries(RETRIEVER_CAPABILITIES).map(async ([stage, capability]) => {
      const output = await capability.invoke({ evidencePool }, ctx);
      return [stage, output] as const;
    }),
  );
  const outputsByStage = Object.fromEntries(entries) as CapabilityOutputsByStage;

  // Real aggregation across real CapabilityOutputs -- honestly null today,
  // since none of the 4 retriever capabilities emit an advisory (see
  // reasoning-capability.ts's wrapRetrieverAsCapability module comment).
  // Logged anyway, same as controllerAction/expectedUtility in
  // decision-state-shadow.ts, to prove the wiring against real data rather
  // than only against advisory-scoring.test.ts's synthetic fixtures.
  const bestAdvisory = selectBestAdvisory(Object.values(outputsByStage));

  logger.info(
    {
      decisionId,
      evidencePoolSize: evidencePool.length,
      capabilities: Object.fromEntries(
        Object.entries(outputsByStage).map(([stage, output]) => [
          stage,
          { confidence: output.confidence, evidenceCount: output.evidenceProduced.length, latencyMs: output.latencyMs },
        ]),
      ),
      bestAdvisory,
    },
    "Capability outputs shadow-recorded (Controller spec v3.0 -- real evidence pool, not a fabricated selection)",
  );

  return outputsByStage;
}
