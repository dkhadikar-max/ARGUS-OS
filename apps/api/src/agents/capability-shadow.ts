import type { Evidence } from "@argus/database";
import { logger } from "../lib/logger.js";
import { RETRIEVER_CAPABILITIES, type CapabilityOutput } from "./reasoning-capability.js";

// Controller & Capability Specification v3.0 -- "shadow capability
// selection logging," narrowed to what's honest: nothing in ARGUS
// actually *selects* a capability today -- the pipeline is fixed, so all
// 4 real retriever capabilities (research/icp/intent/risk) always run,
// every time. This isn't a selection log; it's a real per-capability
// output log against a real (possibly empty) evidence pool. Gated by the
// same RECORD_DECISION_STATE flag as decision-state-shadow.ts; purely
// observational, never influences the real decision.

export type CapabilityOutputsByStage = Record<string, CapabilityOutput<Evidence[]>>;

/**
 * Invokes all 4 real RETRIEVER_CAPABILITIES against a real evidence pool
 * (decision.repository.ts's getEvidenceForProspect -- empty for a
 * prospect with no prior decisions, non-empty for a repeat one; both are
 * honest, not a bug) and logs each one's real CapabilityOutput.
 */
export async function observeCapabilityOutputs(decisionId: string, evidencePool: Evidence[]): Promise<CapabilityOutputsByStage> {
  const entries = await Promise.all(
    Object.entries(RETRIEVER_CAPABILITIES).map(async ([stage, capability]) => {
      const output = await capability.invoke({ evidencePool });
      return [stage, output] as const;
    }),
  );
  const outputsByStage = Object.fromEntries(entries) as CapabilityOutputsByStage;

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
    },
    "Capability outputs shadow-recorded (Controller spec v3.0 -- real evidence pool, not a fabricated selection)",
  );

  return outputsByStage;
}
