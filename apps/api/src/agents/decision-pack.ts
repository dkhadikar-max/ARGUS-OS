import { verdictSchema, type Verdict } from "@argus/shared";
import type { ToolSchema } from "./providers/types.js";
import {
  RESEARCH_TOOL,
  ICP_TOOL,
  INTENT_TOOL,
  RISK_TOOL,
  JUDGE_TOOL,
  type StageId,
} from "./orchestrator.js";
import { RESEARCH_AGENT_PROMPT, ICP_AGENT_PROMPT, INTENT_AGENT_PROMPT, RISK_AGENT_PROMPT, JUDGE_AGENT_PROMPT } from "./prompts.js";
import { AVG_DEAL_SIZE_USD, FP_REDUCTION_VALUE_USD, FN_REDUCTION_VALUE_USD } from "./decision-value.service.js";
import { RETRIEVER_CAPABILITIES, buildAgentStageCapabilities } from "./reasoning-capability.js";

// Controller & Capability Specification v3.0 -- Decision Pack, built as
// engineering scaffolding only (per explicit scoping): formalizes the ONE
// domain ARGUS actually implements today (sales lead qualification) as a
// DecisionPack, rather than inventing a second ("Candidate Evaluation" or
// similar) domain with fabricated prompts/schemas. Whether ARGUS ever
// supports a second real vertical is a product decision, not made here --
// this only proves the shape is real and derivable from what already
// exists, and that a second pack COULD be built by overriding it, without
// asserting one is.

export interface DecisionPackObjectiveDefaults {
  baseValue: number;
  falsePositiveCost: number;
  falseNegativeCost: number;
}

export interface DecisionPack {
  id: string;
  version: string;
  name: string;
  /** The real per-stage prompts this pack uses (prompts.ts). */
  stagePrompts: Record<StageId, string>;
  /** The real per-stage tool schemas each stage submits through
   *  (orchestrator.ts's RESEARCH_TOOL/ICP_TOOL/etc). */
  stageTools: Record<StageId, ToolSchema>;
  /** The real Verdict labels this pack's Judge stage can produce --
   *  derived from the real verdictSchema (packages/shared), not a
   *  separately maintained literal list. */
  verdictLabels: readonly Verdict[];
  /** Real objective/value defaults (decision-value.service.ts) used when
   *  building a DecisionState for a decision made under this pack. */
  objectiveDefaults: DecisionPackObjectiveDefaults;
  /** Real capability ids this pack's stages can draw on
   *  (reasoning-capability.ts's RETRIEVER_CAPABILITIES). */
  capabilityIds: readonly string[];
}

/**
 * The one real pack ARGUS implements today. Every field references an
 * already-real, already-exported value -- nothing here is new content;
 * it's the existing sales-lead-qualification configuration, named and
 * shaped as a DecisionPack for the first time. decision-state.ts's
 * SALES_LEAD_QUALIFICATION_PACK_ID literal is unified with this pack's
 * `id` rather than kept as a second, separately-maintained string.
 */
export const SALES_LEAD_QUALIFICATION_PACK: DecisionPack = {
  id: "sales-lead-qualification-v1",
  version: "1",
  name: "Sales Lead Qualification",
  stagePrompts: {
    research: RESEARCH_AGENT_PROMPT,
    icp: ICP_AGENT_PROMPT,
    intent: INTENT_AGENT_PROMPT,
    risk: RISK_AGENT_PROMPT,
    judge: JUDGE_AGENT_PROMPT,
  },
  stageTools: {
    research: RESEARCH_TOOL,
    icp: ICP_TOOL,
    intent: INTENT_TOOL,
    risk: RISK_TOOL,
    judge: JUDGE_TOOL,
  },
  verdictLabels: verdictSchema.options,
  objectiveDefaults: {
    baseValue: AVG_DEAL_SIZE_USD,
    falsePositiveCost: FP_REDUCTION_VALUE_USD,
    falseNegativeCost: FN_REDUCTION_VALUE_USD,
  },
  capabilityIds: Object.keys(RETRIEVER_CAPABILITIES),
};

/**
 * "Inheritance" as plain object override, not a class hierarchy: a future
 * pack starts from an existing one (today, only
 * SALES_LEAD_QUALIFICATION_PACK exists) and overrides only what differs
 * for its domain. Proven by test against a synthetic derived pack, not by
 * asserting a real second vertical exists -- see decision-pack.test.ts.
 */
export function deriveDecisionPack(base: DecisionPack, overrides: Partial<DecisionPack>): DecisionPack {
  return { ...base, ...overrides };
}

/**
 * The 4 real agent stages (research/icp/intent/risk) for
 * SALES_LEAD_QUALIFICATION_PACK, wrapped as ReasoningCapability via
 * reasoning-capability.ts's buildAgentStageCapabilities. Built here, not
 * in reasoning-capability.ts: that module already imports
 * RETRIEVER_CAPABILITIES from this one, so importing the real
 * SALES_LEAD_QUALIFICATION_PACK value back into reasoning-capability.ts
 * would be a circular module dependency. Standalone and unwired, same as
 * RETRIEVER_CAPABILITIES itself -- nothing calls this yet.
 */
export const AGENT_STAGE_CAPABILITIES = buildAgentStageCapabilities(SALES_LEAD_QUALIFICATION_PACK);
