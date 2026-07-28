import type { Evidence } from "@argus/database";
import {
  researchAgentOutputSchema,
  icpAgentOutputSchema,
  intentAgentOutputSchema,
  riskAgentOutputSchema,
  type ResearchAgentOutput,
  type IcpAgentOutput,
  type IntentAgentOutput,
  type RiskAgentOutput,
} from "@argus/shared";
import type { ZodType } from "zod";
import { RETRIEVER_REGISTRY } from "./retrievers/registry.js";
import type { Retriever } from "./retrievers/types.js";
import type { RawCost } from "./decision-state.js";
import {
  callAgent,
  buildStagePrompt,
  RESEARCH_TOOL,
  ICP_TOOL,
  INTENT_TOOL,
  RISK_TOOL,
  type DecisionAgentInput,
  type StageOutputs,
  type TokenUsageAccumulator,
} from "./orchestrator.js";
import type { LLMProvider } from "./providers/llm-provider.interface.js";
import type { ToolSchema } from "./providers/types.js";
import type { DecisionPack } from "./decision-pack.js";
import type { BudgetSnapshot } from "./budget-manager.js";

// Controller & Capability Specification v3.0 -- per the recommended
// migration order, this comes after Budget Manager (capabilities report
// costs; Budget Manager is what knows how to normalize them) and before
// Planning Policy / Controller (which will actually invoke capabilities
// and act on their advisories). Types only, plus concrete adapters proving
// the contract against something real -- nothing wired into orchestrator.ts
// or any live decision path. No Controller exists yet to invoke these.
//
// v5.0 scaffolding, Increment 1 (this session): extends the same
// unwired-scaffolding contract to the 4 real LLM agent stages
// (research/icp/intent/risk), not just evidence retrievers -- via
// wrapAgentStageAsCapability/AGENT_STAGE_CAPABILITIES below. Also adds
// ExecutionContext to ReasoningCapability.invoke() now, before a second
// capability kind existed, specifically to avoid a breaking interface
// change once one did.

/** Real identity fields a capability invocation happens under -- moved
 *  here (was execution-runtime.ts) because reasoning-capability.ts is the
 *  lower layer in the real dependency graph (execution-runtime.ts already
 *  imports CapabilityOutput/CapabilityOutputsByStage from here); defining
 *  it there and importing it here would have been circular. */
export interface ExecutionIdentity {
  teamId: string;
  userId: string;
  prospectId: string;
  prospectName: string;
}

/** Surrounding context every capability invocation carries, independent of
 *  its specific input -- real, already-existing types (ExecutionIdentity,
 *  BudgetSnapshot), not invented fields. Deliberately excludes the v5.0
 *  proposal's `prospect: SanitizedProspect` and `evidenceSoFar` -- neither
 *  has a real implementation yet (no PII sanitizer, no evidence graph
 *  wired to this layer), and fabricating those fields now would be exactly
 *  the kind of premature/inaccurate scaffolding this session has
 *  repeatedly avoided elsewhere. */
export interface ExecutionContext {
  identity: ExecutionIdentity;
  budget: BudgetSnapshot;
}

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

/** One CapabilityOutput per stage -- the real shape capability-shadow.ts's
 *  observeCapabilityOutputs() produces, and controller.ts's decide() reads
 *  (optionally) to identify a specific weak capability. Defined here, not
 *  in capability-shadow.ts, so controller.ts doesn't have to import from an
 *  observational/shadow-logging module to get a type it needs.
 *
 *  Widened to CapabilityOutput<unknown> (v5.0 scaffolding, Increment 2):
 *  was Evidence[]-specific, correct for retriever capabilities but wrong
 *  for agent-stage capabilities (CapabilityOutput<StageOutputMap[S]>).
 *  decide() only ever reads `.confidence` off each entry, never `.outputs`
 *  -- this was always meant to be capability-kind-agnostic, Evidence[] was
 *  just the only kind that existed when it was written. */
export type CapabilityOutputsByStage = Record<string, CapabilityOutput<unknown>>;

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
  invoke(input: TInput, ctx: ExecutionContext): Promise<CapabilityOutput<TOutputs>>;
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
    // ctx unused: a retriever's real behavior doesn't depend on identity/
    // budget today (no per-team retriever variation, no cost to budget
    // against -- see the cost note below). Accepted, not ignored via `_`,
    // so the ReasoningCapability contract stays uniform across both
    // capability kinds without an `any`/optional-param escape hatch.
    async invoke({ evidencePool, topK }, ctx) {
      void ctx;
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

// --- Agent-stage capabilities (v5.0 scaffolding, Increment 1) ---
//
// Wraps the 4 real LLM agent stages (research/icp/intent/risk) as
// ReasoningCapability, the same contract RETRIEVER_CAPABILITIES already
// proves against evidence retrievers. Judge is excluded: it depends on
// all 4 prior stage outputs combined in a specific way (runAgentDebate's
// final step, orchestrator.ts), not a single-input capability in the same
// shape as the other 4 -- out of scope here, not fabricated into this
// shape to force a fifth entry.

/** The 4 stages this capability layer covers -- StageId minus "judge". */
export type AgentStageId = "research" | "icp" | "intent" | "risk";

/** Real per-stage output types (@argus/shared) -- TOutputs is never
 *  `unknown` for an agent-stage capability. */
export interface StageOutputMap {
  research: ResearchAgentOutput;
  icp: IcpAgentOutput;
  intent: IntentAgentOutput;
  risk: RiskAgentOutput;
}

const SCHEMA_BY_STAGE = {
  research: researchAgentOutputSchema,
  icp: icpAgentOutputSchema,
  intent: intentAgentOutputSchema,
  risk: riskAgentOutputSchema,
} satisfies Record<AgentStageId, ZodType<unknown>>;

// Real values, matching orchestrator.ts's runStagesResearchThroughRisk
// exactly (see that function's own comments for why each budget is sized
// the way it is -- not re-derived or guessed here).
const MAX_TOKENS_BY_STAGE: Record<AgentStageId, number> = {
  research: 2048,
  icp: 1536,
  intent: 1536,
  risk: 2560,
};

export interface AgentStageCapabilityInput {
  input: DecisionAgentInput;
  priorOutputs: StageOutputs;
}

export interface StageExecutionResult<T> {
  output: T;
  usage: TokenUsageAccumulator;
  durationMs: number;
}

/** Decouples wrapAgentStageAsCapability from calling callAgent directly --
 *  a test (or a future non-callAgent execution path) can swap the
 *  executor without touching the capability wrapper itself. */
export interface StageExecutor {
  execute<S extends AgentStageId>(
    stage: S,
    pack: DecisionPack,
    input: DecisionAgentInput,
    priorOutputs: StageOutputs,
  ): Promise<StageExecutionResult<StageOutputMap[S]>>;
}

/** The one real implementation: calls the exact same callAgent +
 *  buildStagePrompt + per-stage schema that orchestrator.ts's
 *  runStagesResearchThroughRisk already calls for that stage -- not a
 *  reimplementation. `provider` mirrors callAgent's own existing override
 *  parameter (defaults to the real Claude path via callAgent's own
 *  default), so this can be pointed at a non-Claude provider for eval
 *  purposes the same way eval/likelihood-harness.ts already does. */
export function createCallAgentStageExecutor(provider?: LLMProvider): StageExecutor {
  return {
    async execute<S extends AgentStageId>(stage: S, pack: DecisionPack, input: DecisionAgentInput, priorOutputs: StageOutputs) {
      const usage: TokenUsageAccumulator = { inputTokens: 0, outputTokens: 0 };
      const startedAt = Date.now();
      const prompt = buildStagePrompt(stage, pack.stagePrompts[stage], input, priorOutputs);
      const tool: ToolSchema = pack.stageTools[stage];
      // Cast, not a structural proof: SCHEMA_BY_STAGE's own satisfies-typed
      // literal keeps each entry's specific Zod type, so indexing with a
      // generic S produces a union callAgent's own generic can't unify --
      // safe by construction (the map is built correctly), same pattern as
      // the output cast below.
      const schema = SCHEMA_BY_STAGE[stage] as unknown as ZodType<StageOutputMap[S]>;
      const maxTokens = MAX_TOKENS_BY_STAGE[stage];
      const output = provider
        ? await callAgent(prompt.system, prompt.userPrompt, tool, schema, maxTokens, usage, undefined, provider)
        : await callAgent(prompt.system, prompt.userPrompt, tool, schema, maxTokens, usage);
      return { output: output as StageOutputMap[typeof stage], usage, durationMs: Date.now() - startedAt };
    },
  };
}

/** Wraps one real agent stage as a ReasoningCapability -- same contract as
 *  wrapRetrieverAsCapability, honest about what's real vs. not:
 *   - confidence: reads the real `.confidence` field every one of the 4
 *     stage schemas already returns (not a new signal).
 *   - disagreements: [] -- same honest gap as the retriever wrapper, no
 *     contradiction detection wired to this call either.
 *   - cost/latencyMs: real, from the real TokenUsageAccumulator and
 *     measured wall-clock time the executor returns -- costUsd is left at
 *     0 here (no pricing table wired to this layer yet; token counts are
 *     the real, non-fabricated signal) rather than guessing a $ figure. */
export function wrapAgentStageAsCapability<S extends AgentStageId>(
  stage: S,
  pack: DecisionPack,
  executor: StageExecutor = createCallAgentStageExecutor(),
): ReasoningCapability<AgentStageCapabilityInput, StageOutputMap[S]> {
  return {
    id: stage,
    async invoke({ input, priorOutputs }, ctx) {
      void ctx; // not yet consulted -- see ExecutionContext's own comment on scope
      const { output, usage, durationMs } = await executor.execute(stage, pack, input, priorOutputs);
      const confidence = (output as { confidence: number }).confidence;
      return {
        capabilityId: stage,
        outputs: output,
        confidence,
        evidenceProduced: [],
        disagreements: [],
        cost: { tokens: usage.inputTokens + usage.outputTokens, latencyMs: durationMs, costUsd: 0, reasoningDepth: 1 },
        latencyMs: durationMs,
      };
    },
  };
}

/** Builds all 4 real agent-stage capabilities for a given pack -- the
 *  concrete, pack-bound instantiation (e.g. AGENT_STAGE_CAPABILITIES for
 *  SALES_LEAD_QUALIFICATION_PACK) lives in decision-pack.ts, not here:
 *  that module already owns the real pack constant, and importing it here
 *  would be circular (decision-pack.ts already imports RETRIEVER_CAPABILITIES
 *  from this file). This function is the reusable, pack-agnostic piece;
 *  same "plug-in test" RETRIEVER_CAPABILITIES already proves, now against
 *  the real LLM stages. */
export function buildAgentStageCapabilities(
  pack: DecisionPack,
  executor?: StageExecutor,
): { [S in AgentStageId]: ReasoningCapability<AgentStageCapabilityInput, StageOutputMap[S]> } {
  return {
    research: wrapAgentStageAsCapability("research", pack, executor),
    icp: wrapAgentStageAsCapability("icp", pack, executor),
    intent: wrapAgentStageAsCapability("intent", pack, executor),
    risk: wrapAgentStageAsCapability("risk", pack, executor),
  };
}
