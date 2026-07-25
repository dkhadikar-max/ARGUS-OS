import { describe, expect, it } from "vitest";
import { buildPromptCacheKey, hashPromptTemplate } from "./prompt-cache-key.js";
import { buildDecisionContext, hashKnowledgeFields, type DecisionSources } from "./decision-context-builder.js";

describe("hashPromptTemplate", () => {
  it("is deterministic for the same template", () => {
    expect(hashPromptTemplate("Analyze {{prospect_data}}.")).toBe(hashPromptTemplate("Analyze {{prospect_data}}."));
  });

  it("changes on any wording edit, including whitespace-only changes", () => {
    const original = hashPromptTemplate("Analyze {{prospect_data}}.");
    const edited = hashPromptTemplate("Analyze  {{prospect_data}}.");
    expect(original).not.toBe(edited);
  });
});

describe("buildPromptCacheKey", () => {
  const template = "Analyze {{prospect_data}} against {{team_icp}}.";
  const knowledgeHash = "deadbeef";

  it("has the prompt:{stage}:{promptHash}:{knowledgeHash} shape", () => {
    const key = buildPromptCacheKey("research", template, knowledgeHash);
    expect(key).toBe(`prompt:research:${hashPromptTemplate(template)}:${knowledgeHash}`);
  });

  it("changes when stageName changes, all else equal", () => {
    const researchKey = buildPromptCacheKey("research", template, knowledgeHash);
    const icpKey = buildPromptCacheKey("icp", template, knowledgeHash);
    expect(researchKey).not.toBe(icpKey);
  });

  it("changes when the prompt template's wording changes, all else equal", () => {
    const before = buildPromptCacheKey("research", template, knowledgeHash);
    const after = buildPromptCacheKey("research", template + " Extra sentence.", knowledgeHash);
    expect(before).not.toBe(after);
  });

  it("changes when knowledgeHash changes, all else equal", () => {
    const a = buildPromptCacheKey("research", template, "hash-a");
    const b = buildPromptCacheKey("research", template, "hash-b");
    expect(a).not.toBe(b);
  });

  it("composes with hashKnowledgeFields from decision-context-builder without either owning the other's hashing", () => {
    const sources: DecisionSources = {
      prospect: { id: "p1", name: "Jane", rawProfile: {}, enrichedData: {} } as unknown as DecisionSources["prospect"],
      icp: { criteria: { minSize: 50 } } as unknown as DecisionSources["icp"],
      companyMemory: null,
      userPreferences: null,
      prospectHistory: [] as unknown as DecisionSources["prospectHistory"],
      teamHistory: [] as unknown as DecisionSources["teamHistory"],
      team: null,
    };
    const input = buildDecisionContext(sources);
    const knowledge = hashKnowledgeFields(input);
    const key = buildPromptCacheKey("icp", template, knowledge);
    expect(key).toBe(`prompt:icp:${hashPromptTemplate(template)}:${knowledge}`);
  });
});
