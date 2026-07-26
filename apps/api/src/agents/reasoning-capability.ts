import type { Evidence } from "@argus/database";
import { RETRIEVER_REGISTRY } from "./retrievers/registry.js";
import type { Retriever } from "./retrievers/types.js";
import type { RawCost } from "./decision-state.js";

// Controller & Capability Specification v3.0 -- per the recommended
// migration order, this comes after Budget Manager (capabilities report
// costs; Budget Manager is what knows how to normalize them) and before
// Planning Policy / Controller (which will actually invoke capabilities
// and act on their advisories). Types only, plus one concrete adapter
// proving the contract against something real -- nothing wired into
// orchestrator.ts or any live decision path. No Controller exists yet to
// invoke these.

export type RecommendedActionKind = "invoke_capability" | "retrieve_evidence" | "stop" | "escalate";
export type RecommendedActionPriority = "critical" | "high" | "medium" | "low";

export interface RecommendedAction {
  action: RecommendedActionKind;
  capabilityId?: string;
  priority: RecommendedActionPriority;
  rationale: string;
  expectedConfidenceGain?: number;
}

export interface CapabilityAdvisory {
  recommendedNextActions: RecommendedAction[];
  reasoning: string;
  confidence: number;
}

export interface CapabilityOutput<TOutputs = unknown> {
  capabilityId: string;
  outputs: TOutputs;
  confidence: number;
  evidenceProduced: Evidence[];
  /** Free-text disagreement descriptions -- mirrors the Judge agent's real
   *  `conflicts: string[]` shape (orchestrator.ts), not a numerically
   *  scored structure ARGUS has anywhere today. */
  disagreements: string[];
  cost: RawCost;
  latencyMs: number;
  advisory?: CapabilityAdvisory;
}

/**
 * Capability isolation (Controller spec v3.0 Section 7.1 #3): a capability
 * never calls another capability. It receives an input, does its own
 * work, and returns evidence/disagreements/advisories -- the Controller
 * decides what happens next (Section 7.1 #5: advisories are non-binding).
 *
 * What a ReasoningCapability owns: producing a CapabilityOutput from an
 * input. What it explicitly does NOT own: deciding the next action
 * (advisory only, never binding on anything), normalizing its own cost
 * (Budget Manager's job -- see budget-manager.ts), or invoking another
 * capability.
 */
export interface ReasoningCapability<TInput = unknown, TOutputs = unknown> {
  readonly id: string;
  invoke(input: TInput): Promise<CapabilityOutput<TOutputs>>;
}

export interface RetrieverCapabilityInput {
  evidencePool: Evidence[];
  topK?: number;
}

/**
 * Wraps an existing Retriever (Phase 4, retrievers/types.ts) as a
 * ReasoningCapability -- proves the contract against something real
 * rather than only against invented types. Honest about what a Retriever
 * doesn't compute today, rather than fabricating values to fill the
 * shape:
 *   - confidence: retrievers rank items within a selection (scoring.ts)
 *     but never score the selection's own reliability. Uses a real,
 *     non-invented signal instead -- whether any evidence was actually
 *     found -- not a made-up relevance number.
 *   - disagreements: contradiction detection is evidence-graph.service.ts's
 *     job (getContradictions), which no Retriever calls today. Always [].
 *   - cost: retrievers make no LLM calls, so real cost is genuinely
 *     $0 / 0 tokens / 0 reasoning steps. latencyMs is real wall-clock
 *     time measured around the actual retrieve() call, not estimated.
 *   - advisory: omitted entirely -- a Retriever has no basis today for
 *     recommending a next action (that would need the contradiction
 *     detection this wrapper explicitly doesn't have).
 */
export function wrapRetrieverAsCapability(id: string, retriever: Retriever): ReasoningCapability<RetrieverCapabilityInput, Evidence[]> {
  return {
    id,
    async invoke({ evidencePool, topK }) {
      const startedAt = Date.now();
      const evidence = await retriever.retrieve(evidencePool, topK);
      const latencyMs = Date.now() - startedAt;
      return {
        capabilityId: id,
        outputs: evidence,
        confidence: evidence.length > 0 ? 100 : 0,
        evidenceProduced: evidence,
        disagreements: [],
        cost: { tokens: 0, latencyMs, costUsd: 0, reasoningDepth: 0 },
        latencyMs,
      };
    },
  };
}

/**
 * All 4 real retrievers wrapped as capabilities -- demonstrates the
 * "plug-in test" (Section 7.1 #6: a new capability can be registered and
 * used without modifying Controller code) using entirely real objects,
 * not a synthetic example. Standalone and unwired, same as
 * RETRIEVER_REGISTRY itself -- nothing calls this yet.
 */
export const RETRIEVER_CAPABILITIES: Record<
  keyof typeof RETRIEVER_REGISTRY,
  ReasoningCapability<RetrieverCapabilityInput, Evidence[]>
> = Object.fromEntries(
  Object.entries(RETRIEVER_REGISTRY).map(([stage, retriever]) => [stage, wrapRetrieverAsCapability(stage, retriever)]),
) as Record<keyof typeof RETRIEVER_REGISTRY, ReasoningCapability<RetrieverCapabilityInput, Evidence[]>>;
