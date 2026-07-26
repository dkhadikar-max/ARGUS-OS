import { describe, expect, it } from "vitest";
import { verdictSchema } from "@argus/shared";
import { SALES_LEAD_QUALIFICATION_PACK, deriveDecisionPack } from "./decision-pack.js";
import { RESEARCH_AGENT_PROMPT, JUDGE_AGENT_PROMPT } from "./prompts.js";
import { RESEARCH_TOOL, JUDGE_TOOL } from "./orchestrator.js";
import { AVG_DEAL_SIZE_USD, FP_REDUCTION_VALUE_USD, FN_REDUCTION_VALUE_USD } from "./decision-value.service.js";
import { RETRIEVER_CAPABILITIES } from "./reasoning-capability.js";

describe("SALES_LEAD_QUALIFICATION_PACK", () => {
  it("references the real stage prompts, not copies or fabricated content", () => {
    expect(SALES_LEAD_QUALIFICATION_PACK.stagePrompts.research).toBe(RESEARCH_AGENT_PROMPT);
    expect(SALES_LEAD_QUALIFICATION_PACK.stagePrompts.judge).toBe(JUDGE_AGENT_PROMPT);
  });

  it("references the real stage tool schemas", () => {
    expect(SALES_LEAD_QUALIFICATION_PACK.stageTools.research).toBe(RESEARCH_TOOL);
    expect(SALES_LEAD_QUALIFICATION_PACK.stageTools.judge).toBe(JUDGE_TOOL);
  });

  it("derives verdictLabels from the real verdictSchema, not a separately maintained list", () => {
    expect(SALES_LEAD_QUALIFICATION_PACK.verdictLabels).toEqual(verdictSchema.options);
  });

  it("reuses the real, already-exported Decision Value constants for objectiveDefaults", () => {
    expect(SALES_LEAD_QUALIFICATION_PACK.objectiveDefaults).toEqual({
      baseValue: AVG_DEAL_SIZE_USD,
      falsePositiveCost: FP_REDUCTION_VALUE_USD,
      falseNegativeCost: FN_REDUCTION_VALUE_USD,
    });
  });

  it("lists the real registered capability ids", () => {
    expect(SALES_LEAD_QUALIFICATION_PACK.capabilityIds.slice().sort()).toEqual(
      Object.keys(RETRIEVER_CAPABILITIES).sort(),
    );
  });
});

describe("deriveDecisionPack", () => {
  it("overrides only the given fields, keeping everything else from the base pack", () => {
    const derived = deriveDecisionPack(SALES_LEAD_QUALIFICATION_PACK, { id: "test-derived-v1", name: "Test Derived" });

    expect(derived.id).toBe("test-derived-v1");
    expect(derived.name).toBe("Test Derived");
    expect(derived.stagePrompts).toBe(SALES_LEAD_QUALIFICATION_PACK.stagePrompts);
    expect(derived.objectiveDefaults).toEqual(SALES_LEAD_QUALIFICATION_PACK.objectiveDefaults);
  });

  it("does not mutate the base pack", () => {
    const before = { ...SALES_LEAD_QUALIFICATION_PACK };
    deriveDecisionPack(SALES_LEAD_QUALIFICATION_PACK, { id: "test-derived-v2" });
    expect(SALES_LEAD_QUALIFICATION_PACK).toEqual(before);
  });

  it("can override just the objective defaults, proving the override mechanism works for nested fields too", () => {
    const derived = deriveDecisionPack(SALES_LEAD_QUALIFICATION_PACK, {
      objectiveDefaults: { baseValue: 1000, falsePositiveCost: 10, falseNegativeCost: 100 },
    });

    expect(derived.objectiveDefaults).toEqual({ baseValue: 1000, falsePositiveCost: 10, falseNegativeCost: 100 });
    expect(derived.stagePrompts).toBe(SALES_LEAD_QUALIFICATION_PACK.stagePrompts);
  });
});
